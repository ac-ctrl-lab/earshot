import { getMeta, getSql } from "@/lib/data";

export const metadata = { title: "How it works: Earshot" };

const STEPS = [
  ["Ingest", "Python pulls every CFPB complaint for the product, one quarter at a time, and loads it into Postgres with COPY."],
  ["Cluster", "Each narrative becomes a vector (TF-IDF and SVD, or sentence embeddings). HDBSCAN finds recurring issues and leaves outliers out."],
  ["Label", "Claude names each cluster and drafts a likely cause, a suggested action and an owning team. Results are cached."],
  ["Analyze", "SQL views compute zero-filled monthly counts, rolling growth, z-score spikes and peer benchmarks with window functions."],
  ["Explore", "A static site on GitHub Pages. Costs, rankings and what-if scenarios recompute in the browser as you change assumptions."],
];

export default function Method() {
  const meta = getMeta();
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pb-10">
      <section className="pt-14 pb-10">
        <h1 className="display display-xl text-[40px] sm:text-[64px] leading-[0.98] font-bold">From complaint to action in five steps</h1>
        <p className="mt-5 text-[18px] text-ink-2 leading-relaxed max-w-[36em]">
          Every number on the site traces back to a SQL view or a formula on this page. Running on{" "}
          {meta.source === "sample" ? "demo data" : "CFPB data"} through {meta.date_max}.
        </p>
      </section>

      <ol className="relative grid sm:grid-cols-5 gap-px rounded-2xl overflow-hidden border hairline bg-line">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="bg-panel p-5">
            <span className="display text-[32px] font-bold text-heat-5 tabular-nums leading-none">{i + 1}</span>
            <div className="display mt-3 text-[19px] font-semibold">{t}</div>
            <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{d}</p>
          </li>
        ))}
      </ol>

      <Block title="The cost model" body="All four inputs are sliders on each company page. Projected cost assumes the last six months' trend holds for a year, capped between minus 90% and plus 300%.">
        {`contacts       = complaints_12m × contacts_per_complaint
annual_cost    = contacts × cost_per_contact
               + contacts × churn_rate × revenue_per_customer
growth         = (last 6 months − prior 6 months) / max(prior 6 months, 3)
projected_cost = annual_cost × (1 + growth)`}
      </Block>

      <Block title="Spotting issues the month they start" body="Each month is compared with the six before it. A spike needs a z-score of at least 2.5, at least 8 complaints, and 1.5 times the baseline.">
        {getSql("03_issue_spikes.sql")}
      </Block>

      <Block title="Benchmarking against peers" body="The CFPB publishes no customer counts, so raw volume would make small companies look good. Earshot compares issue mix instead, against every other peer.">
        {getSql("04_peer_benchmark.sql")}
      </Block>

      <section className="mt-14 max-w-[40em]">
        <h2 className="display text-[26px] font-semibold">What this can and cannot tell you</h2>
        <p className="mt-3 text-[15px] text-ink-2 leading-relaxed">
          CFPB complaints are a self-selected sample and are not verified. They show what customers report, not how often
          problems happen. Cost figures are only as good as the assumptions you set, and likely causes are hypotheses for a
          team to test.
        </p>
      </section>
    </div>
  );
}

function Block({ title, body, children }: { title: string; body: string; children: string }) {
  return (
    <section className="mt-14">
      <h2 className="display text-[26px] font-semibold">{title}</h2>
      <p className="mt-2 text-[15px] text-ink-2 leading-relaxed max-w-[40em]">{body}</p>
      <pre className="mt-5 panel p-5 overflow-x-auto text-[12.5px] leading-relaxed text-ink-2" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{children.trim()}</pre>
    </section>
  );
}
