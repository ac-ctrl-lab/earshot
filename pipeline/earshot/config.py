"""Settings, read from environment variables (or a .env file in the repo root)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

SQL_DIR = REPO_ROOT / "sql"
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
CACHE_DIR = REPO_ROOT / "pipeline" / ".cache"
LABELS_CACHE = REPO_ROOT / "pipeline" / "labels_cache.json"

# Postgres connection string, e.g. the "URI" from Supabase > Project Settings > Database.
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5432/earshot")

# Optional. Without it, issues get rule-based labels instead of Claude-written ones.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.getenv("EARSHOT_MODEL", "claude-sonnet-5-5")

# Prototype scope
PRODUCT = "Money transfer, virtual currency, or money service"
YEARS_OF_HISTORY = int(os.getenv("EARSHOT_YEARS", "3"))
TOP_COMPANIES = int(os.getenv("EARSHOT_TOP_COMPANIES", "8"))

CFPB_API = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"

# Teams a suggestion can be routed to.
OWNER_TEAMS = [
    "Payments product",
    "Fraud & trust",
    "Risk & compliance",
    "Customer support",
    "Identity & onboarding",
    "Engineering reliability",
    "Pricing & disclosures",
    "Crypto product",
]
