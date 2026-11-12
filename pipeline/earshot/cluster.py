"""Discover root-cause issues by clustering complaint narratives.

Approach
  1. Clean text (drop CFPB "XXXX" redactions, amounts, dates).
  2. Represent each narrative as a vector:
       default : TF-IDF (1-2 grams) -> TruncatedSVD (LSA, 100 dims)
       optional: sentence-transformer embeddings (--embeddings), better on real data
  3. HDBSCAN on a sample finds clusters of any shape and leaves outliers unassigned,
     so we never force a weird complaint into an issue.
  4. Every complaint is then assigned to the nearest cluster centroid (cosine);
     anything too far from all centroids goes to cluster 0, "Other".
  5. Clusters whose centroids are nearly identical are merged.
"""

from __future__ import annotations

import os
import re

import numpy as np
import pandas as pd
from sklearn.cluster import HDBSCAN
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

FIT_SAMPLE = 15_000
MIN_SIMILARITY = 0.20
MERGE_SIMILARITY = float(os.getenv("EARSHOT_MERGE_SIM", "0.45"))  # tune on real data
OTHER_ID = 0


def clean(text: str) -> str:
    text = text.lower()
    text = re.sub(r"x{2,}(/x{2,})*", " ", text)          # CFPB redactions: XXXX, XX/XX/XXXX
    text = re.sub(r"\$?\d[\d,\.]*", " ", text)            # amounts and numbers
    text = re.sub(r"[^a-z\s']", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _vectors(texts: list[str], use_embeddings: bool):
    tfidf = TfidfVectorizer(
        ngram_range=(1, 2), min_df=5, max_df=0.4, stop_words="english", sublinear_tf=True, max_features=60_000
    )
    X_tfidf = tfidf.fit_transform(texts)
    if use_embeddings:
        from sentence_transformers import SentenceTransformer  # optional dependency

        model = SentenceTransformer("all-MiniLM-L6-v2")
        V = model.encode(texts, batch_size=128, show_progress_bar=True, normalize_embeddings=True)
    else:
        svd = TruncatedSVD(n_components=min(100, X_tfidf.shape[1] - 1), random_state=0)
        V = normalize(svd.fit_transform(X_tfidf))
    return V, X_tfidf, tfidf


def _merge_close(centroids: np.ndarray, labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Union clusters whose centroids are nearly identical."""
    k = len(centroids)
    parent = list(range(k))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    sims = centroids @ centroids.T
    for i in range(k):
        for j in range(i + 1, k):
            if sims[i, j] >= MERGE_SIMILARITY:
                parent[find(i)] = find(j)
    roots = sorted({find(i) for i in range(k)})
    remap = {r: n for n, r in enumerate(roots)}
    new_labels = np.array([remap[find(l)] if l >= 0 else -1 for l in labels])
    return new_labels, len(roots)


def run(complaints: pd.DataFrame, use_embeddings: bool = False, seed: int = 0) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (assignments[complaint_id, cluster_id, similarity], clusters[cluster_id, size, top_terms])."""
    texts = complaints["narrative"].map(clean).tolist()
    V, X_tfidf, tfidf = _vectors(texts, use_embeddings)

    rng = np.random.default_rng(seed)
    n = len(texts)
    fit_idx = rng.choice(n, size=min(FIT_SAMPLE, n), replace=False)
    min_size = max(25, int(len(fit_idx) * 0.006))
    print(f"  hdbscan on {len(fit_idx):,} of {n:,} narratives (min_cluster_size={min_size})")
    hdb = HDBSCAN(min_cluster_size=min_size, min_samples=10, metric="euclidean", copy=True).fit(V[fit_idx])

    fit_labels = hdb.labels_
    k = fit_labels.max() + 1
    centroids = normalize(np.vstack([V[fit_idx][fit_labels == c].mean(axis=0) for c in range(k)]))
    fit_labels, k = _merge_close(centroids, fit_labels)
    centroids = normalize(np.vstack([V[fit_idx][fit_labels == c].mean(axis=0) for c in range(k)]))
    print(f"  found {k} issue clusters ({(fit_labels < 0).mean():.0%} of the sample left as outliers)")

    sims = V @ centroids.T
    best = sims.argmax(axis=1)
    best_sim = sims[np.arange(n), best]
    cluster_id = np.where(best_sim >= MIN_SIMILARITY, best + 1, OTHER_ID)  # 1-based; 0 = Other

    assignments = pd.DataFrame(
        {"complaint_id": complaints["complaint_id"].values, "cluster_id": cluster_id, "similarity": best_sim.round(4)}
    )

    # Distinctive terms per cluster: mean TF-IDF inside the cluster minus the overall mean.
    vocab = np.array(tfidf.get_feature_names_out())
    overall = np.asarray(X_tfidf.mean(axis=0)).ravel()
    rows = []
    for c in sorted(set(cluster_id)):
        mask = cluster_id == c
        inside = np.asarray(X_tfidf[mask].mean(axis=0)).ravel()
        top = vocab[np.argsort(inside - overall)[::-1][:10]].tolist()
        rows.append({"cluster_id": int(c), "size": int(mask.sum()), "top_terms": top})
    return assignments, pd.DataFrame(rows)


def save(conn, assignments: pd.DataFrame, clusters: pd.DataFrame, labels: dict[int, dict]) -> None:
    with conn.cursor() as cur:
        cur.execute("drop materialized view if exists mv_monthly_issue_counts cascade")
        cur.execute("truncate complaint_clusters, clusters")
        cur.executemany(
            """insert into clusters
               (cluster_id, label, summary, root_cause, suggested_action, owner_team, top_terms, size)
               values (%s, %s, %s, %s, %s, %s, %s, %s)""",
            [
                (
                    int(r.cluster_id),
                    labels[r.cluster_id]["label"],
                    labels[r.cluster_id].get("summary"),
                    labels[r.cluster_id].get("root_cause"),
                    labels[r.cluster_id].get("suggested_action"),
                    labels[r.cluster_id].get("owner_team"),
                    list(r.top_terms),
                    int(r.size),
                )
                for r in clusters.itertuples()
            ],
        )
        with cur.copy("copy complaint_clusters (complaint_id, cluster_id, similarity) from stdin") as copy:
            for rec in assignments.itertuples(index=False, name=None):
                copy.write_row((int(rec[0]), int(rec[1]), float(rec[2])))
    conn.commit()
