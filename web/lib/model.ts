// The cost and ranking model. Runs in the browser so every slider updates instantly.
// Formulas mirror sql/analysis/02_issue_trends.sql and 04_peer_benchmark.sql.
import type { Assumptions, Cluster, CompanyDoc, Meta } from "./types";

export type IssuePoint = {
  id: number;
  label: string;
  t12: number;          // complaints in the trailing 12 months
  growth: number;       // trailing 6 vs prior 6 months
  annualCost: number;   // support + churn cost at current volume
  projectedCost: number;// next 12 months if the trend continues
  supportCost: number;
  churnCost: number;
  share: number;        // share of this company's complaints
  peerShare: number;    // same share across all other peers
  peerIndex: number;    // share / peerShare
  peerRank: number;     // 1 = highest share in the peer group
  peerCount: number;
};

const sum = (a: number[], from: number, to: number) => {
  let s = 0;
  for (let i = Math.max(0, from); i <= to; i++) s += a[i] ?? 0;
  return s;
};

export const clampGrowth = (g: number) => Math.max(-0.9, Math.min(3, g));

export function windowAt(series: number[], end: number) {
  const t12 = sum(series, end - 11, end);
  const t6 = sum(series, end - 5, end);
  const p6 = sum(series, end - 11, end - 6);
  return { t12, t6, p6, growth: (t6 - p6) / Math.max(p6, 3) };
}

export function costOf(t12: number, a: Assumptions) {
  const contacts = t12 * a.contacts_per_complaint;
  const supportCost = contacts * a.cost_per_contact;
  const churnCost = contacts * a.churn_rate * a.revenue_per_customer;
  return { contacts, supportCost, churnCost, annualCost: supportCost + churnCost };
}

export function peerClass(index: number): "worse" | "inline" | "better" {
  if (index >= 1.25) return "worse";
  if (index <= 0.8) return "better";
  return "inline";
}

/** Every issue for one company at month index `end`. Peer stats are computed live from the industry series. */
export function issuesAt(
  meta: Meta,
  company: CompanyDoc,
  end: number,
  a: Assumptions,
  mode: "company" | "industry" = "company",
): IssuePoint[] {
  const clusters = meta.clusters.filter((c) => c.id !== 0);
  const companyTotal = clusters.reduce((s, c) => s + sum(company.monthly[c.id] ?? [], end - 11, end), 0);
  const industryTotal = clusters.reduce((s, c) => s + sum(meta.industry_monthly[c.id] ?? [], end - 11, end), 0);

  return clusters.map((c: Cluster) => {
    const own = company.monthly[c.id] ?? [];
    const ind = meta.industry_monthly[c.id] ?? [];
    const series = mode === "company" ? own : ind;
    const w = windowAt(series, end);
    const cost = costOf(w.t12, a);

    const ownT12 = sum(own, end - 11, end);
    const share = companyTotal ? ownT12 / companyTotal : 0;
    const peerShare = industryTotal - companyTotal > 0 ? (sum(ind, end - 11, end) - ownT12) / (industryTotal - companyTotal) : 0;
    const bench = company.benchmark[c.id];
    const others = bench?.other_shares ?? [];
    const peerRank = 1 + others.filter((s) => s > share).length;

    return {
      id: c.id,
      label: c.label,
      t12: w.t12,
      growth: w.growth,
      ...cost,
      projectedCost: cost.annualCost * (1 + clampGrowth(w.growth)),
      share,
      peerShare,
      peerIndex: peerShare ? share / peerShare : 1,
      peerRank,
      peerCount: others.length + 1,
    };
  });
}

/** What-if: cut one issue by `cut` (0..1). Rank uses the latest exported peer shares. */
export function whatIf(p: IssuePoint, othersShares: number[], cut: number) {
  const newShare = p.share * (1 - cut);
  return {
    savings: p.projectedCost * cut,
    newIndex: p.peerShare ? newShare / p.peerShare : 1,
    newRank: 1 + othersShares.filter((s) => s > newShare).length,
  };
}

export const fmtMoney = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
};

export const fmtPct = (v: number, signed = true) => `${signed && v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

export const fmtMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};
