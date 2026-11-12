# Earshot

**Your customers are telling regulators what's broken. Earshot shows you what, what it costs, and where to act first.**

Earshot turns public CFPB consumer complaints into an interactive, cost-ranked map of the specific problems behind them, benchmarked against peers, with a suggested action and owner for each.

> The repo ships with **demo data** (fictional companies, generated complaints) so the site runs immediately. One command loads real CFPB data instead.

## What it does

| | |
|---|---|
| **Finds root causes** | Clusters complaint narratives into specific issues ("account takeovers via contact changes"), finer than the CFPB's own categories. |
| **Spots emerging issues** | Flags months where an issue jumps well above its own six-month baseline (rolling z-score in SQL). |
| **Benchmarks peers** | Compares each company's issue mix with every other peer, so it's clear whether a problem is yours or industry-wide. |
| **Puts a price on it** | Estimates the annual and projected cost of every issue from four assumptions the user controls with sliders. |
| **Suggests what to do** | Each issue comes with a root-cause hypothesis, a suggested action and an owning team, ranked by projected cost. |
| **Lets you test it** | A what-if slider shows the savings and new peer rank if an issue is cut by a chosen percentage. |

## Architecture

```
CFPB API ──► Python ingest ──► Postgres (Supabase)
                                   │
                    clustering (TF-IDF/SVD or embeddings + HDBSCAN)
                    labeling (Claude, cached)
                                   │
                    SQL views: monthly counts, trends, spikes, peer benchmark
                                   │
                         static JSON export
                                   │
             Next.js static site on Firebase Hosting
             (cost model + rankings recompute in the browser)
```

```
pipeline/earshot/
  ingest.py       CFPB download (quarterly chunks, cached), normalization, COPY into Postgres
  sample_data.py  synthetic CFPB-shaped data with built-in patterns
  cluster.py      text vectors, HDBSCAN, centroid assignment, cluster merging
  label.py        Claude labels + suggested actions, cached in labels_cache.json
  export.py       SQL views -> web/public/data/*.json
sql/
  schema.sql
  analysis/01..05 zero-filled monthly counts, rolling windows, spike z-scores, peer benchmark, evidence
web/              Next.js + Tailwind + d3-scale, static export
```

## Run it

### 1. The website with demo data

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

### 2. Real CFPB data

You need a Postgres database (a free Supabase project works) and, optionally, an Anthropic API key.

```bash
cp .env.example .env            # then fill in DATABASE_URL and ANTHROPIC_API_KEY
cd pipeline
pip install -r requirements.txt
python -m earshot run           # real data; add --sample for demo data
cd ../web && npm run build
```

The first real run downloads three years of complaints for the product and picks the 8 largest companies. Clustering parameters were tuned on the demo data; check the printed cluster count and adjust `EARSHOT_MERGE_SIM` in `.env` if issues look over- or under-merged.

### 3. Deploy to Firebase

```bash
npm install -g firebase-tools
firebase login
firebase use --add               # pick or create your project
cd web && npm run build && cd ..
firebase deploy --only hosting
```

`.github/workflows/refresh.yml` refreshes the data and redeploys weekly once the repo secrets it lists are set.

## The cost model

```
contacts       = complaints_12m × contacts_per_complaint
annual_cost    = contacts × cost_per_contact + contacts × churn_rate × revenue_per_customer
growth         = (last 6 months − prior 6 months) / max(prior 6 months, 3)
projected_cost = annual_cost × (1 + growth)
```

Defaults: 25 contacts per complaint, $9 per contact, 6% churn, $140 revenue per customer. All four are sliders on the site.

## Limits

- CFPB complaints are self-selected and unverified; they show what customers report, not how often problems happen.
- There are no customer counts, so peer comparisons use issue mix rather than complaint rates.
- Costs are estimates driven entirely by the assumptions. Root causes are hypotheses to test.
- Demo-data labels were written during development; on real data, Claude writes them.

## Roadmap

- Ask the data: plain-English questions translated to SQL, with the query shown
- All CFPB products, and a weekly emailed briefing per company
- Backtest: how many weeks earlier Earshot would have flagged past issues
