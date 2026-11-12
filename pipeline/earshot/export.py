"""Export the SQL analysis views as static JSON for the website.

The site is static (Firebase Hosting), so all heavy lifting happens here, once per run.
Cost and ranking math stays in the browser, because it depends on the user's sliders.
"""

from __future__ import annotations

import json
import shutil
from collections import defaultdict
from datetime import datetime, timezone

from . import config

DEFAULT_ASSUMPTIONS = {
    "contacts_per_complaint": 25,   # support contacts per CFPB complaint on the same issue
    "cost_per_contact": 9,          # USD, blended phone/chat/email handling cost
    "churn_rate": 0.06,             # share of affected customers who leave
    "revenue_per_customer": 140,    # USD per year
}


def _rows(cur, sql: str, params=None) -> list[dict]:
    cur.execute(sql, params)
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _num(v):
    return None if v is None else float(v)


def export(conn, source: str) -> None:
    out = config.WEB_DATA_DIR
    if out.exists():
        shutil.rmtree(out)
    (out / "companies").mkdir(parents=True)

    with conn.cursor() as cur:
        months = [r["month"] for r in _rows(cur, "select distinct month from mv_monthly_issue_counts order by 1")]
        month_keys = [m.strftime("%Y-%m") for m in months]
        idx = {m: i for i, m in enumerate(months)}

        clusters = _rows(cur, "select * from clusters order by size desc")
        companies = _rows(cur, "select * from v_company_summary order by complaints_12m desc")

        monthly = _rows(cur, "select company_id, cluster_id, month, n from mv_monthly_issue_counts")
        series: dict[int, dict[int, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0] * len(months)))
        industry: dict[int, list[int]] = defaultdict(lambda: [0] * len(months))
        for r in monthly:
            series[r["company_id"]][r["cluster_id"]][idx[r["month"]]] = r["n"]
            industry[r["cluster_id"]][idx[r["month"]]] += r["n"]

        bench = _rows(cur, "select * from v_peer_benchmark")
        shares_by_cluster: dict[int, list[tuple[int, float]]] = defaultdict(list)
        for b in bench:
            shares_by_cluster[b["cluster_id"]].append((b["company_id"], _num(b["share"]) or 0.0))

        spikes = _rows(
            cur,
            """select company_id, cluster_id, month, n, base_mean, z from v_issue_spikes
               where is_spike and month > (select max(month) from mv_monthly_issue_counts) - interval '3 months'
               order by z desc""",
        )
        examples = _rows(cur, "select * from v_issue_examples order by date_received desc")
        run = _rows(cur, "select * from pipeline_runs order by run_id desc limit 1")[0]

    label_by_id = {c["cluster_id"]: c["label"] for c in clusters}

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "product": config.PRODUCT,
        "date_min": run["date_min"].isoformat(),
        "date_max": run["date_max"].isoformat(),
        "months": month_keys,
        "assumptions": DEFAULT_ASSUMPTIONS,
        "clusters": [
            {
                "id": c["cluster_id"],
                "label": c["label"],
                "summary": c["summary"],
                "root_cause": c["root_cause"],
                "action": c["suggested_action"],
                "owner": c["owner_team"],
                "top_terms": c["top_terms"],
                "size": c["size"],
            }
            for c in clusters
        ],
        "companies": [
            {
                "slug": c["slug"],
                "name": c["name"],
                "complaints_12m": c["complaints_12m"],
                "change_yoy": (
                    round(c["complaints_12m"] / c["complaints_prior_12m"] - 1, 3) if c["complaints_prior_12m"] else None
                ),
                "timely_rate": _num(c["timely_rate_12m"]),
            }
            for c in companies
        ],
        "industry_monthly": {str(k): v for k, v in industry.items()},
        "total_12m": sum(c["complaints_12m"] for c in companies),
    }
    (out / "meta.json").write_text(json.dumps(meta, separators=(",", ":")))

    by_company_bench = defaultdict(dict)
    for b in bench:
        others = [s for cid, s in shares_by_cluster[b["cluster_id"]] if cid != b["company_id"]]
        by_company_bench[b["company_id"]][str(b["cluster_id"])] = {
            "n12": int(b["n12"]),
            "share": _num(b["share"]),
            "peer_share": _num(b["peer_share"]),
            "index": _num(b["peer_index"]),
            "rank": int(b["share_rank"]),
            "peer_count": int(b["peer_count"]),
            "other_shares": sorted(others, reverse=True),
        }

    by_company_examples = defaultdict(lambda: defaultdict(list))
    seen = set()
    for e in examples:
        sig = (e["company_id"], e["cluster_id"], e["narrative"][:60])
        if sig in seen:  # skip near-identical narratives
            continue
        seen.add(sig)
        bucket = by_company_examples[e["company_id"]][str(e["cluster_id"])]
        if len(bucket) >= 3:
            continue
        bucket.append(
            {
                "id": e["complaint_id"],
                "date": e["date_received"].isoformat(),
                "sub_product": e["sub_product"],
                "state": e["state"],
                "text": e["narrative"],
            }
        )

    for c in companies:
        cid = c["company_id"]
        doc = {
            "slug": c["slug"],
            "name": c["name"],
            "monthly": {str(k): v for k, v in series[cid].items()},
            "benchmark": by_company_bench[cid],
            "spikes": [
                {
                    "cluster_id": s["cluster_id"],
                    "label": label_by_id.get(s["cluster_id"]),
                    "month": s["month"].strftime("%Y-%m"),
                    "n": s["n"],
                    "baseline": _num(s["base_mean"]),
                    "z": _num(s["z"]),
                }
                for s in spikes
                if s["company_id"] == cid and s["cluster_id"] != 0
            ],
            "examples": by_company_examples[cid],
        }
        (out / "companies" / f"{c['slug']}.json").write_text(json.dumps(doc, separators=(",", ":")))

    print(f"  wrote {out.relative_to(config.REPO_ROOT)}/ ({len(companies)} companies, {len(clusters)} issues, {len(months)} months)")
