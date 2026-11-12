export type Assumptions = {
  contacts_per_complaint: number;
  cost_per_contact: number;
  churn_rate: number;
  revenue_per_customer: number;
};

export type Cluster = {
  id: number;
  label: string;
  summary: string | null;
  root_cause: string | null;
  action: string | null;
  owner: string | null;
  top_terms: string[];
  size: number;
};

export type CompanyListing = {
  slug: string;
  name: string;
  complaints_12m: number;
  change_yoy: number | null;
  timely_rate: number | null;
};

export type Meta = {
  generated_at: string;
  source: "sample" | "cfpb";
  product: string;
  date_min: string;
  date_max: string;
  months: string[];
  assumptions: Assumptions;
  clusters: Cluster[];
  companies: CompanyListing[];
  industry_monthly: Record<string, number[]>;
  total_12m: number;
};

export type Benchmark = {
  n12: number;
  share: number | null;
  peer_share: number | null;
  index: number | null;
  rank: number;
  peer_count: number;
  other_shares: number[];
};

export type Example = { id: number; date: string; sub_product: string; state: string; text: string };

export type Spike = { cluster_id: number; label: string; month: string; n: number; baseline: number; z: number };

export type CompanyDoc = {
  slug: string;
  name: string;
  monthly: Record<string, number[]>;
  benchmark: Record<string, Benchmark>;
  spikes: Spike[];
  examples: Record<string, Example[]>;
};
