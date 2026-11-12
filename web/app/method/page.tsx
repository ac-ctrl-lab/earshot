import { getMeta, getSql } from "@/lib/data";

export const metadata = { title: "How it works · Earshot" };

const STEPS = [
  ["Ingest", "Python pulls every CFPB complaint for the product, one quarter at a time, and loads it into Postgres with COPY."],
  ["Cluster", "Narratives become vectors (TF-IDF + SVD, or sentence embeddings). HDBSCAN finds recurring issues and leaves outliers out."],
  ["Label", "Claude names each cluster and drafts a root-cause hypothesis, a suggested action and an owner. Results are cached."],
  ["Analyze", "SQL views compute zero-filled monthly counts, rolling growth, z-score spikes and peer benchmarks with window functions."],
  ["Explore", "A static site on Firebase. Costs, rankings and what-if scenarios recompute in the browser as assumptions change."],
];

export default function Method() {
  const meta = getMeta();
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-10">
      <section className="pt-16 pb-10 fade-in">
        <h1 className="text-[40px] sm:text-[56px] font-semibold tracking-tight leading-tight">How it works</h1>
        <p className="mt-4 text-[19px] text-ink-2 leading-relaxed max-w-2xl">
          From {meta.source === "sample" ? "sample" : "CFPB"} complaints to ranked actions in five steps. Every number on the
          site can be traced back to a SQL view or a formula on this page.
        </p>
      </section>

      <ol className="grid sm:grid-cols-5 gap-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="card p-5">
            <div className="text-[13px] font-semibold text-accent tabular-nums">{i + 1}</div>
            <div className="mt-1 text-[17px] font-semibold">{t}</div>
            <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{d}</p>
          </li>
        ))}
      </ol>

      <Block title="The cost model" body="All four inputs are sliders on each company page. Projected cost assumes the last six months' trend continues for a year, capped between −90% and +300%.">
        {`contacts       = complaints_12m × contacts_per_complaint
annual_cost    = contacts × cost_per_contact
               + contacts × churn_rate × revenue_per_customer
growth         = (last 6 months − prior 6 months) / max(prior 6 months, 3)
projected_cost = annual_cost × (1 + growth)`}
      </Block>

      <Block title="Spotting emerging issues" body="Each month is compared with the six months before it. A spike needs a z-score of at least 2.5, at least 8 complaints, and 1.5× the baseline.">
        {getSql("03_issue_spikes.sql")}
      </Block>

      <Block title="Benchmarking against peers" body="CFPB data has no customer counts, so volume alone would favor small companies. Earshot compares issue mix instead, against every other peer.">
        {getSql("04_peer_benchmark.sql")}
      </Block>

      <section className="mt-12 text-[14px] text-ink-2 leading-relaxed">
        <h2 className="text-[22px] font-semibold text-ink mb-2">Limits</h2>
        <p>
          CFPB complaints are a self-selected sample and are not verified. Cost figures are estimates that are only as good as
          the assumptions set on the page. Root causes are hypotheses for a team to test, not findings.
        </p>
      </section>
    </div>
  );
}

function Block({ title, body, children }: { title: string; body: string; children: string }) {
  return (
    <section className="mt-12">
      <h2 className="text-[22px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-[15px] text-ink-2 leading-relaxed max-w-2xl">{body}</p>
      <pre className="mt-4 card p-5 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-ink-2">{children.trim()}</pre>
    </section>
  );
}
