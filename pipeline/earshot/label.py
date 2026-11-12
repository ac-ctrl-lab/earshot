"""Turn raw clusters into named issues with a suggested action and owner.

Order of preference for each cluster:
  1. labels_cache.json   (results are cached by the cluster's top terms, so re-runs cost nothing)
  2. Claude via the Anthropic API, if ANTHROPIC_API_KEY is set
  3. a rule-based fallback built from the CFPB issue taxonomy
"""

from __future__ import annotations

import hashlib
import json

import pandas as pd

from . import config

PROMPT = """You are analyzing consumer complaints filed with the CFPB about {product} companies.
All complaints below belong to ONE cluster found by an unsupervised model.

Distinctive terms: {terms}
Most common CFPB sub-issues: {sub_issues}
Cluster size: {size} complaints

Representative complaints:
{examples}

Return ONLY a JSON object with these keys:
  "label": the specific root-cause issue in at most 6 words, plain English, no company names
  "summary": one sentence describing what customers experience
  "root_cause": one sentence on the likely operational root cause (a hypothesis, stated as such)
  "suggested_action": one concrete action a company could take, starting with a verb, max 20 words
  "owner_team": exactly one of {teams}
"""

FALLBACK_OWNERS = {
    "Fraud or scam": ("Fraud & trust", "Review fraud claim decisions and add warnings before high-risk payments."),
    "Managing an account": ("Customer support", "Audit account holds and closures and give customers a clear reason and timeline."),
    "Money was not available when promised": ("Payments product", "Publish realistic delivery times and alert customers when a transfer is delayed."),
    "Fees or interest": ("Pricing & disclosures", "Show the full fee and exchange rate on the confirmation screen."),
    "Other transaction problem": ("Engineering reliability", "Find the failure point in the transaction flow and refund fees on failed transactions."),
    "Problem with a purchase or transfer": ("Risk & compliance", "Review dispute decisions against the evidence customers submit."),
    "Wrong amount charged or received": ("Payments product", "Show the recipient's full name before sending and offer a recall window."),
}


def _key(top_terms: list[str]) -> str:
    return hashlib.sha1("|".join(sorted(top_terms[:8])).encode()).hexdigest()[:12]


def _load_cache() -> dict:
    if config.LABELS_CACHE.exists():
        return json.loads(config.LABELS_CACHE.read_text())
    return {}


def _fallback(sub_issues: pd.Series, issues: pd.Series, top_terms: list[str]) -> dict:
    issue = issues.mode().iat[0] if len(issues) else "Other"
    sub = sub_issues.mode().iat[0] if len(sub_issues.dropna()) else issue
    owner, action = FALLBACK_OWNERS.get(issue, ("Customer support", "Investigate this complaint pattern and assign an owner."))
    return {
        "label": f"{sub} ({', '.join(top_terms[:2])})",
        "summary": f"Complaints mostly filed as '{sub}', frequently mentioning {', '.join(top_terms[:4])}.",
        "root_cause": None,
        "suggested_action": action,
        "owner_team": owner,
        "source": "rules",
    }


def _ask_claude(prompt: str) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text
    start, end = text.find("{"), text.rfind("}")
    data = json.loads(text[start : end + 1])
    if data.get("owner_team") not in config.OWNER_TEAMS:
        data["owner_team"] = "Customer support"
    data["source"] = "claude"
    return data


def label_clusters(complaints: pd.DataFrame, assignments: pd.DataFrame, clusters: pd.DataFrame) -> dict[int, dict]:
    cache = _load_cache()
    merged = complaints.merge(assignments, on="complaint_id")
    out: dict[int, dict] = {}
    for row in clusters.itertuples():
        cid = int(row.cluster_id)
        if cid == 0:
            out[cid] = {"label": "Other / unclear", "summary": "Complaints that do not match any recurring issue.",
                        "suggested_action": None, "owner_team": None, "source": "rules"}
            continue
        members = merged[merged["cluster_id"] == cid]
        key = _key(row.top_terms)
        if key in cache:
            out[cid] = cache[key]
            continue
        if config.ANTHROPIC_API_KEY:
            examples = members.nlargest(8, "similarity")["narrative"].str.slice(0, 600)
            prompt = PROMPT.format(
                product=config.PRODUCT,
                terms=", ".join(row.top_terms),
                sub_issues=", ".join(members["sub_issue"].value_counts().head(3).index.astype(str)),
                size=row.size,
                examples="\n".join(f"- {e}" for e in examples),
                teams=config.OWNER_TEAMS,
            )
            try:
                out[cid] = _ask_claude(prompt)
                print(f"  claude  #{cid}: {out[cid]['label']}")
            except Exception as exc:  # never let labeling break the pipeline
                print(f"  claude failed for #{cid} ({exc}); using rules")
                out[cid] = _fallback(members["sub_issue"], members["issue"], row.top_terms)
        else:
            out[cid] = _fallback(members["sub_issue"], members["issue"], row.top_terms)
        if out[cid].get("source") == "claude":
            cache[key] = out[cid]
    config.LABELS_CACHE.write_text(json.dumps(cache, indent=2, sort_keys=True))
    return out
