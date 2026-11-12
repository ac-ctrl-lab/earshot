import Link from "next/link";
import { getMeta } from "@/lib/data";
import { fmtPct } from "@/lib/model";

export default function Home() {
  const meta = getMeta();
  const issues = meta.clusters.filter((c) => c.id !== 0).length;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="pt-20 pb-16 sm:pt-28 sm:pb-20 text-center fade-in">
        <p className="text-[15px] font-medium text-accent mb-4">Complaint intelligence for fintech</p>
        <h1 className="text-[40px] sm:text-[64px] leading-[1.05] font-semibold tracking-tight max-w-4xl mx-auto">
          Your customers are telling regulators what&rsquo;s broken.
        </h1>
        <p className="mt-6 text-[19px] sm:text-[21px] text-ink-2 max-w-2xl mx-auto leading-relaxed">
          Earshot reads every public CFPB complaint, finds the specific problems behind them, and shows which ones
          cost you the most and are growing fastest, compared with your peers.
        </p>

        <div className="mt-12 inline-flex flex-col items-center">
          <span className="text-[56px] sm:text-[80px] font-semibold tracking-tight tabular-nums leading-none">
            {meta.total_12m.toLocaleString("en-US")}
          </span>
          <span className="mt-3 text-[15px] text-ink-3">
            complaints filed in the last 12 months across {meta.companies.length} companies, sorted into {issues} issues
          </span>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4 pb-20">
        {[
          ["The problem", "A company only sees its own tickets. It can't tell whether an issue is industry-wide, how it compares with competitors, or what it costs."],
          ["What Earshot does", "Clusters thousands of complaint narratives into specific root causes, flags spikes, and benchmarks every company against its peers."],
          ["What you get", "A ranked list of issues by estimated cost, each with a suggested fix and owner, and assumptions you can change."],
        ].map(([title, body]) => (
          <div key={title} className="card p-7">
            <h2 className="text-[17px] font-semibold mb-2">{title}</h2>
            <p className="text-[15px] leading-relaxed text-ink-2">{body}</p>
          </div>
        ))}
      </section>

      <section id="companies" className="pb-12 scroll-mt-16">
        <h2 className="text-[32px] sm:text-[40px] font-semibold tracking-tight text-center">Pick a company.</h2>
        <p className="text-center text-ink-3 text-[17px] mt-2 mb-10">{meta.product}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {meta.companies.map((c) => (
            <Link
              key={c.slug}
              href={`/company/${c.slug}/`}
              className="card p-6 group transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="text-[17px] font-semibold group-hover:text-accent transition-colors">{c.name}</div>
              <div className="mt-6 text-[28px] font-semibold tabular-nums tracking-tight">
                {c.complaints_12m.toLocaleString("en-US")}
              </div>
              <div className="text-[13px] text-ink-3">
                complaints, last 12 months
                {c.change_yoy !== null && (
                  <span className="text-ink-2"> · {fmtPct(c.change_yoy)} vs prior year</span>
                )}
              </div>
              <div className="mt-5 text-[13px] text-accent font-medium">Open issue map →</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
