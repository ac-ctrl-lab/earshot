import Link from "next/link";
import CommandPalette from "@/components/CommandPalette";
import HeroSpectrogram from "@/components/HeroSpectrogram";
import { getCompany, getMeta } from "@/lib/data";
import { fmtPct, windowAt } from "@/lib/model";

export default function Home() {
  const meta = getMeta();
  const clusters = meta.clusters.filter((c) => c.id !== 0);
  const last = meta.months.length - 1;
  const docs = meta.companies.map((c) => ({ listing: c, doc: getCompany(c.slug) }));

  // Industry spectrogram rows, loudest issue first
  const spiking = new Set(docs.flatMap(({ doc }) => doc.spikes.map((s) => s.cluster_id)));
  const rows = clusters
    .map((c) => ({ id: c.id, label: c.label, values: meta.industry_monthly[c.id] ?? [], flag: spiking.has(c.id) }))
    .sort((a, b) => b.values.slice(-12).reduce((s, v) => s + v, 0) - a.values.slice(-12).reduce((s, v) => s + v, 0));

  // For each issue, the company most over-exposed to it vs peers
  const loudest: Record<number, { slug: string; name: string; index: number }> = {};
  for (const c of clusters) {
    let best = { slug: "", name: "", index: -1 };
    for (const { listing, doc } of docs) {
      const b = doc.benchmark[c.id];
      if (b?.index != null && b.n12 >= 10 && b.index > best.index) best = { slug: listing.slug, name: listing.name, index: b.index };
    }
    if (best.index > 0) loudest[c.id] = best;
  }

  // Company rows: monthly volume + fastest-rising sizable issue
  const companyRows = docs.map(({ listing, doc }) => {
    const total = meta.months.map((_, m) => clusters.reduce((s, c) => s + (doc.monthly[c.id]?.[m] ?? 0), 0));
    const rising = clusters
      .map((c) => ({ label: c.label, ...windowAt(doc.monthly[c.id] ?? [], last) }))
      .filter((r) => r.t12 >= 20)
      .sort((a, b) => b.growth - a.growth)[0];
    return { ...listing, total, rising };
  });
  const peak = Math.max(...companyRows.flatMap((r) => r.total));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="pt-14 sm:pt-20 pb-10 grid lg:grid-cols-[1.25fr_1fr] gap-10 items-end">
        <div>
          <h1 className="display display-xl text-[44px] sm:text-[72px] leading-[0.98] font-bold">
            Hear the problem before it gets loud.
          </h1>
          <p className="mt-6 text-[17px] sm:text-[19px] text-ink-2 leading-relaxed max-w-[34em]">
            Earshot reads every public complaint filed with the CFPB about payment apps and money transfer, groups them
            into the specific problems behind them, and shows which ones are growing, what they cost and who should fix them.
          </p>
        </div>
        <div className="flex flex-col gap-4 lg:items-end">
          <CommandPalette variant="hero" items={[]} />
          <p className="text-[13px] text-ink-3 lg:text-right">
            {meta.total_12m.toLocaleString("en-US")} complaints in the last 12 months, {meta.companies.length} companies, {clusters.length} issues
          </p>
        </div>
      </section>

      <section className="panel p-4 sm:p-7" aria-label="Industry spectrogram">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
          <h2 className="display text-[22px] sm:text-[26px] font-semibold">What the whole industry is hearing</h2>
          <span className="text-[13px] text-ink-3">Every issue, every month, all {meta.companies.length} companies</span>
        </div>
        <HeroSpectrogram rows={rows} months={meta.months} loudest={loudest} />
      </section>

      <section className="grid md:grid-cols-3 gap-8 md:gap-0 py-16 md:divide-x divide-line">
        {[
          ["A company only sees its own support tickets.", "It can't tell whether a problem is industry-wide, how it compares with competitors, or what it is costing."],
          ["Earshot listens to everyone at once.", "It clusters complaint narratives into specific root causes, flags spikes the month they start, and benchmarks each company."],
          ["You get a ranked list of what to fix.", "Each issue comes priced, with a suggested action and an owner. Change the assumptions and the ranking moves with you."],
        ].map(([t, d]) => (
          <div key={t} className="md:px-8 first:md:pl-0 last:md:pr-0">
            <p className="display text-[20px] font-semibold leading-snug">{t}</p>
            <p className="mt-2 text-[15px] text-ink-2 leading-relaxed">{d}</p>
          </div>
        ))}
      </section>

      <section id="companies" className="scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="display text-[30px] sm:text-[40px] font-bold">Pick a company</h2>
          <span className="text-[13px] text-ink-3">{meta.product}</span>
        </div>
        <div className="panel overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.2fr_2fr_0.7fr_0.7fr_1.6fr] gap-6 px-6 py-3 text-[12px] text-ink-3 border-b hairline">
            <span>Company</span><span>Complaints per month, 3 years</span><span className="text-right">Last 12 months</span><span className="text-right">vs prior year</span><span>Fastest-rising issue</span>
          </div>
          {companyRows.map((c) => (
            <Link
              key={c.slug}
              href={`/company/${c.slug}/`}
              className="group grid grid-cols-2 md:grid-cols-[1.2fr_2fr_0.7fr_0.7fr_1.6fr] gap-x-6 gap-y-2 items-center px-6 py-4 border-b hairline last:border-b-0 hover:bg-raised transition-colors"
            >
              <span className="display text-[18px] font-semibold group-hover:text-accent transition-colors">{c.name}</span>
              <Wave values={c.total} peak={peak} />
              <span className="text-right text-[18px] font-medium tabular-nums">{c.complaints_12m.toLocaleString("en-US")}</span>
              <span className="text-right text-[14px] tabular-nums text-ink-2">{c.change_yoy === null ? "n/a" : fmtPct(c.change_yoy)}</span>
              <span className="col-span-2 md:col-span-1 text-[13px] text-ink-2 truncate">
                {c.rising ? (
                  <>
                    <span className="text-heat-5 font-semibold tabular-nums mr-2">{fmtPct(c.rising.growth)}</span>
                    {c.rising.label}
                  </>
                ) : (
                  "No issue rising"
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Mirrored bar waveform of monthly volume: louder months are taller and hotter. */
function Wave({ values, peak }: { values: number[]; peak: number }) {
  const w = 3;
  const gap = 2;
  const h = 34;
  return (
    <svg viewBox={`0 0 ${values.length * (w + gap)} ${h}`} className="w-full h-[34px] col-span-2 md:col-span-1 order-last md:order-none" preserveAspectRatio="none" aria-hidden>
      {values.map((v, i) => {
        const bh = Math.max(2, (v / peak) * (h - 2));
        const recent = i >= values.length - 6;
        return <rect key={i} x={i * (w + gap)} y={(h - bh) / 2} width={w} height={bh} rx={1.5} fill={recent ? "var(--color-heat-5)" : "var(--color-accent)"} opacity={recent ? 0.95 : 0.5} />;
      })}
    </svg>
  );
}
