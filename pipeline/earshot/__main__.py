"""Earshot pipeline.

    python -m earshot run            # real CFPB data -> Postgres -> JSON for the site
    python -m earshot run --sample   # synthetic sample data (no internet needed)
    python -m earshot run --embeddings   # use sentence-transformer embeddings for clustering

Steps: schema -> ingest -> cluster -> label -> SQL analysis -> export.
"""

from __future__ import annotations

import argparse
import time

import pandas as pd

from . import cluster, db, export, ingest, label, sample_data


def step(name: str):
    print(f"\n== {name}")
    return time.perf_counter()


def main() -> None:
    ap = argparse.ArgumentParser(prog="earshot")
    ap.add_argument("command", choices=["run", "export"])
    ap.add_argument("--sample", action="store_true", help="use synthetic sample data instead of the CFPB API")
    ap.add_argument("--embeddings", action="store_true", help="cluster with sentence-transformer embeddings")
    ap.add_argument("--keep", action="store_true", help="keep existing tables instead of rebuilding")
    args = ap.parse_args()
    source = "sample" if args.sample else "cfpb"

    with db.connect() as conn:
        if args.command == "export":
            export.export(conn, source)
            return

        t = step("schema")
        if not args.keep:
            db.reset(conn)
        db.apply_schema(conn)
        conn.commit()

        t = step(f"ingest ({source})")
        df = sample_data.generate() if args.sample else ingest.fetch_cfpb()
        ingest.load(conn, df, source)

        t = step("cluster narratives")
        complaints = _read(conn)
        assignments, clusters = cluster.run(complaints, use_embeddings=args.embeddings)

        t = step("label issues")
        labels = label.label_clusters(complaints, assignments, clusters)
        cluster.save(conn, assignments, clusters, labels)

        t = step("sql analysis")
        db.apply_analysis(conn)
        conn.commit()

        t = step("export")
        export.export(conn, source)
    print("\ndone.")


def _read(conn) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute("select complaint_id, narrative, issue, sub_issue from complaints order by complaint_id")
        return pd.DataFrame(cur.fetchall(), columns=["complaint_id", "narrative", "issue", "sub_issue"])


if __name__ == "__main__":
    main()
