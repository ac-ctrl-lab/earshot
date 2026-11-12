"""Thin Postgres helpers."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import psycopg

from . import config


@contextmanager
def connect():
    with psycopg.connect(config.DATABASE_URL, autocommit=False) as conn:
        yield conn


def run_sql_file(conn: psycopg.Connection, path: Path) -> None:
    conn.execute(path.read_text())


def apply_schema(conn: psycopg.Connection) -> None:
    run_sql_file(conn, config.SQL_DIR / "schema.sql")


def apply_analysis(conn: psycopg.Connection) -> None:
    """(Re)build the analysis views in file order: 01_..., 02_..., ..."""
    for path in sorted((config.SQL_DIR / "analysis").glob("*.sql")):
        print(f"  sql  {path.name}")
        run_sql_file(conn, path)


def reset(conn: psycopg.Connection) -> None:
    conn.execute(
        """
        drop materialized view if exists mv_monthly_issue_counts cascade;
        drop table if exists complaint_clusters, clusters, complaints, companies, pipeline_runs cascade;
        """
    )
