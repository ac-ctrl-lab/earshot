"""Download CFPB complaints, normalize them and load them into Postgres.

The CFPB export ignores `size` when `format` is set and returns every matching row,
so we request one quarter at a time to keep each download small and resumable.
Downloads are cached under pipeline/.cache, so re-runs only fetch what is missing.
"""

from __future__ import annotations

import io
import re
from datetime import date, timedelta

import pandas as pd
import requests

from . import config

COLUMNS = [
    "complaint_id",
    "date_received",
    "company",
    "product",
    "sub_product",
    "issue",
    "sub_issue",
    "narrative",
    "state",
    "submitted_via",
    "company_response",
    "timely",
]

# The CSV export uses human headers ("Date received"); the JSON API uses snake_case.
# Normalize both to one vocabulary.
ALIASES = {
    "consumer_complaint_narrative": "narrative",
    "complaint_what_happened": "narrative",
    "company_response_to_consumer": "company_response",
    "timely_response": "timely",
    "sub_product": "sub_product",
    "sub_issue": "sub_issue",
}


def _snake(name: str) -> str:
    name = re.sub(r"[^0-9a-zA-Z]+", "_", name.strip().lower())
    return name.strip("_")


def _quarters(start: date, end: date):
    cur = date(start.year, 3 * ((start.month - 1) // 3) + 1, 1)
    while cur <= end:
        nxt_month = cur.month + 3
        nxt = date(cur.year + (nxt_month - 1) // 12, (nxt_month - 1) % 12 + 1, 1)
        yield cur, min(nxt, end + timedelta(days=1))
        cur = nxt


def fetch_quarter(q_start: date, q_end: date) -> pd.DataFrame:
    cache = config.CACHE_DIR / f"cfpb_{q_start:%Y%m%d}_{q_end:%Y%m%d}.csv"
    if cache.exists() and q_end < date.today() - timedelta(days=7):
        return pd.read_csv(cache, dtype=str)

    params = {
        "product": config.PRODUCT,
        "date_received_min": q_start.isoformat(),
        "date_received_max": q_end.isoformat(),  # exclusive
        "has_narrative": "true",
        "format": "csv",
        "no_aggs": "true",
    }
    print(f"  fetch {q_start} .. {q_end}")
    resp = requests.get(config.CFPB_API, params=params, timeout=300)
    resp.raise_for_status()
    df = pd.read_csv(io.StringIO(resp.text), dtype=str)
    config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(cache, index=False)
    return df


def normalize(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.rename(columns=lambda c: ALIASES.get(_snake(c), _snake(c)))
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"CFPB export is missing expected columns: {missing}. Got: {list(df.columns)}")
    df = df[COLUMNS].copy()
    df["complaint_id"] = pd.to_numeric(df["complaint_id"], errors="coerce")
    df["date_received"] = pd.to_datetime(df["date_received"], errors="coerce").dt.date
    df["timely"] = df["timely"].astype(str).str.lower().map({"yes": True, "no": False, "true": True, "false": False})
    df["narrative"] = df["narrative"].fillna("").str.strip()
    df = df.dropna(subset=["complaint_id", "date_received", "company"])
    df = df[df["narrative"].str.len() >= 40]
    df["complaint_id"] = df["complaint_id"].astype("int64")
    return df.drop_duplicates("complaint_id")


def fetch_cfpb() -> pd.DataFrame:
    end = date.today()
    start = date(end.year - config.YEARS_OF_HISTORY, end.month, 1)
    frames = [fetch_quarter(a, b) for a, b in _quarters(start, end)]
    df = normalize(pd.concat(frames, ignore_index=True))
    top = df["company"].value_counts().head(config.TOP_COMPANIES).index
    print("  top companies by volume:")
    for name in top:
        print(f"    {name}: {int((df['company'] == name).sum()):,}")
    return df[df["company"].isin(top)].reset_index(drop=True)


def slugify(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def load(conn, df: pd.DataFrame, source: str) -> None:
    """Load a normalized frame. Uses COPY for the complaints table (fast for 100k+ rows)."""
    companies = sorted(df["company"].unique())
    with conn.cursor() as cur:
        cur.executemany(
            "insert into companies (name, slug) values (%s, %s) on conflict (name) do nothing",
            [(n, slugify(n)) for n in companies],
        )
        cur.execute("select name, company_id from companies")
        ids = dict(cur.fetchall())

        rows = df.assign(company_id=df["company"].map(ids))
        cols = [c for c in COLUMNS if c != "company"] + ["company_id"]
        cur.execute("create temp table staging (like complaints including defaults) on commit drop")
        with cur.copy(f"copy staging ({', '.join(cols)}) from stdin") as copy:
            for rec in rows[cols].itertuples(index=False, name=None):
                copy.write_row([None if (isinstance(v, float) and pd.isna(v)) else v for v in rec])
        cur.execute(
            f"""
            insert into complaints ({', '.join(cols)})
            select {', '.join(cols)} from staging
            on conflict (complaint_id) do update set
                narrative = excluded.narrative,
                company_response = excluded.company_response,
                timely = excluded.timely
            """
        )
        cur.execute(
            "insert into pipeline_runs (source, rows_loaded, date_min, date_max) values (%s, %s, %s, %s)",
            (source, len(rows), min(rows["date_received"]), max(rows["date_received"])),
        )
    conn.commit()
    print(f"  loaded {len(df):,} complaints for {len(companies)} companies")
