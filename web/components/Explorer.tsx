"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IssueMap, { type Domain, FILL, PEER_TEXT } from "./IssueMap";
import TrendChart from "./TrendChart";
import { clampGrowth, fmtMoney, fmtMonth, fmtPct, issuesAt, peerClass, whatIf, type IssuePoint } from "@/lib/model";
import type { Assumptions, CompanyDoc, Meta } from "@/lib/types";

const SLIDERS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; fmt: (v: number) => string; help: string }[] = [
  { key: "contacts_per_complaint", label: "Support contacts per complaint", min: 5, max: 100, step: 5, fmt: (v) => `${v}`, help: "Most customers with a problem contact support but never file with the CFPB." },
  { key: "cost_per_contact", label: "Cost per support contact", min: 2, max: 30, step: 1, fmt: (v) => `$${v}`, help: "Blended cost of a phone, chat or email contact." },
  { key: "churn_rate", label: "Customers who leave", min: 0, max: 0.25, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, help: "Share of affected customers who close their account." },
  { key: "revenue_per_customer", label: "Annual revenue per customer", min: 20, max: 600, step: 10, fmt: (v) => `$${v}`, help: "What a lost customer would have been worth in a year." },
];

export default function Explorer({ meta, company }: { meta: Meta; company: CompanyDoc }) {
  const last = meta.months.length - 1;
  const first = Math.min(11, last);
  const [month, setMonth] = useState(last);
  const [assume, setAssume] = useState<Assumptions>(meta.assumptions);
  const [mode, setMode] = useState<"company" | "industry">("company");
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animate the time scrubber.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setMonth((m) => {
        if (m >= last) {
          setPlaying(false);
          return last;
        }
        return m + 1;
      });
    }, 650);
    return () => clearInterval(id);
  }, [playing, last]);

  const points = useMemo(() => issuesAt(meta, company, month, assume, mode), [meta, company, month, assume, mode]);
  const latest = useMemo(() => issuesAt(meta, company, last, assume, "company"), [meta, company, last, assume]);

  // Axis domains are fixed across all months so the animation shows real movement, not rescaling.
  const domain: Domain = useMemo(() => {
    let gMin = -0.4, gMax = 0.8, cMin = Infinity, cMax = 0, rMax = 1;
    for (let m = first; m <= last; m++) {
      for (const p of issuesAt(meta, company, m, assume, mode)) {
        if (p.t12 < 3) continue;
        gMin = Math.min(gMin, clampGrowth(p.growth));
        gMax = Math.max(gMax, clampGrowth(p.growth));
        cMin = Math.min(cMin, p.annualCost);
        cMax = Math.max(cMax, p.annualCost);
        rMax = Math.max(rMax, p.t12);
      }
    }
    if (!isFinite(cMin)) cMin = 1000;
    return { x: [gMin - 0.08, gMax + 0.12], y: [Math.max(500, cMin * 0.6), cMax * 1.6], rMax };
  }, [meta, company, assume, mode, first, last]);

  const ranked = [...latest].filter((p) => p.t12 > 0).sort((a, b) => b.projectedCost - a.projectedCost);
  const sel = selected === null ? null : latest.find((p) => p.id === selected) ?? null;
  const totalCost = latest.reduce((s, p) => s + p.annualCost, 0);
  const listing = meta.companies.find((c) => c.slug === company.slug)!;

  const select = (id: number) => {
    setSelected(id);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      {/* Header */}
      <section className="pt-12 pb-8 fade-in">
        <p className="text-[15px] text-ink-3">{meta.product}</p>
        <h1 className="text-[40px] sm:text-[56px] font-semibold tracking-tight leading-tight">{company.name}</h1>
        <div className="mt-6 grid grid-cols-3 gap-4 max-w-2xl">
          <Stat value={listing.complaints_12m.toLocaleString("en-US")} label="complaints, last 12 months" />
          <Stat value={fmtMoney(totalCost)} label="estimated annual cost" />
          <Stat value={listing.change_yoy === null ? "–" : fmtPct(listing.change_yoy)} label="vs prior 12 months" />
        </div>
      </section>

      {company.spikes.length > 0 && (
        <section className="mb-6 fade-in">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3 mb-3">Emerging in the last 3 months</h2>
          <div className="flex flex-wrap gap-2">
            {company.spikes.slice(0, 4).map((s) => (
              <button
                key={`${s.cluster_id}-${s.month}`}
                onClick={() => select(s.cluster_id)}
                className="card px-4 py-2.5 text-[14px] text-left hover:ring-2 ring-accent/30 transition"
              >
                <span className="text-worse font-semibold mr-1" aria-hidden>▲</span>
                <span className="font-medium">{s.label}</span>
                <span className="text-ink-3"> · {(s.n / Math.max(s.baseline, 1)).toFixed(1)}× usual volume in {fmtMonth(s.month)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* Issue Map */}
        <section className="card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight">Issue map</h2>
              <p className="text-[14px] text-ink-2 mt-1 max-w-md">
                Each bubble is one problem customers report. Bigger means more complaints. Start top right.
              </p>
            </div>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as "company" | "industry")}
              options={[["company", company.name], ["industry", "All peers"]]}
            />
          </div>

          <div className="flex flex-wrap gap-4 text-[12px] text-ink-2 mb-1">
            {mode === "company" ? (
              (["worse", "inline", "better"] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: FILL[k] }} />
                  {PEER_TEXT[k]}
                </span>
              ))
            ) : (
              <span>Whole peer group. Issues large here but small at {company.name} are industry-wide.</span>
            )}
          </div>

          <IssueMap points={points} domain={domain} mode={mode} selectedId={selected} onSelect={select} />

          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => {
                if (!playing && month >= last) setMonth(first);
                setPlaying((p) => !p);
              }}
              className="shrink-0 w-10 h-10 rounded-full bg-ink text-white grid place-items-center hover:opacity-85 transition"
              aria-label={playing ? "Pause" : "Play the last three years"}
            >
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="1" width="3" height="10" rx="1" fill="currentColor" /><rect x="7" y="1" width="3" height="10" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /></svg>
              )}
            </button>
            <input
              type="range"
              min={first}
              max={last}
              value={month}
              onChange={(e) => { setPlaying(false); setMonth(Number(e.target.value)); }}
              style={{ ["--fill" as string]: `${((month - first) / Math.max(1, last - first)) * 100}%` }}
              aria-label="Month"
            />
            <span className="shrink-0 w-24 text-right text-[14px] font-medium tabular-nums">{fmtMonth(meta.months[month])}</span>
          </div>
        </section>

        {/* Assumptions + suggestions */}
        <aside className="flex flex-col gap-5">
          <section className="card p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[17px] font-semibold">Your assumptions</h2>
              <button onClick={() => setAssume(meta.assumptions)} className="text-[13px] text-accent">Reset</button>
            </div>
            <div className="flex flex-col gap-5">
              {SLIDERS.map((s) => (
                <label key={s.key} className="block" title={s.help}>
                  <div className="flex justify-between text-[13px] mb-2">
                    <span className="text-ink-2">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.fmt(assume[s.key])}</span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={assume[s.key]}
                    onChange={(e) => setAssume({ ...assume, [s.key]: Number(e.target.value) })}
                    style={{ ["--fill" as string]: `${((assume[s.key] - s.min) / (s.max - s.min)) * 100}%` }}
                  />
                </label>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* Ranked suggestions */}
      <section className="mt-5">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-[22px] font-semibold tracking-tight">Where to act first</h2>
          <span className="text-[13px] text-ink-3">Ranked by projected cost over the next 12 months</span>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ranked.slice(0, 6).map((p, i) => (
            <Suggestion key={p.id} rank={i + 1} p={p} meta={meta} onOpen={() => select(p.id)} active={p.id === selected} />
          ))}
        </div>
      </section>

      {sel && (
        <div ref={panelRef} className="scroll-mt-16">
          <IssuePanel key={sel.id} p={sel} meta={meta} company={company} month={month} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[28px] sm:text-[34px] font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="text-[13px] text-ink-3 leading-snug">{label}</div>
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex bg-[#f0f0f3] rounded-full p-1 text-[13px]" role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`px-4 py-1.5 rounded-full transition ${value === v ? "bg-white shadow-sm font-medium" : "text-ink-2"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PeerBadge({ index }: { index: number }) {
  const cls = peerClass(index);
  const icon = cls === "worse" ? "▲" : cls === "better" ? "▼" : "●";
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
      <span style={{ color: FILL[cls] }} aria-hidden>{icon}</span>
      {PEER_TEXT[cls]} ({index.toFixed(1)}×)
    </span>
  );
}

function Suggestion({ rank, p, meta, onOpen, active }: { rank: number; p: IssuePoint; meta: Meta; onOpen: () => void; active: boolean }) {
  const c = meta.clusters.find((c) => c.id === p.id)!;
  return (
    <button onClick={onOpen} className={`card p-6 text-left flex flex-col gap-3 transition hover:-translate-y-0.5 ${active ? "ring-2 ring-accent" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-3 tabular-nums">{rank}</span>
        <span className="text-[12px] font-medium text-accent bg-accent-soft rounded-full px-2.5 py-1">{c.owner}</span>
      </div>
      <div className="text-[17px] font-semibold leading-snug">{p.label}</div>
      <p className="text-[14px] text-ink-2 leading-relaxed flex-1">{c.action}</p>
      <div className="flex items-end justify-between gap-2 pt-2 border-t border-line">
        <div>
          <div className="text-[22px] font-semibold tabular-nums tracking-tight">{fmtMoney(p.projectedCost)}</div>
          <div className="text-[12px] text-ink-3">projected, next 12 months · {fmtPct(p.growth)} trend</div>
        </div>
        <PeerBadge index={p.peerIndex} />
      </div>
    </button>
  );
}

function IssuePanel({ p, meta, company, month, onClose }: { p: IssuePoint; meta: Meta; company: CompanyDoc; month: number; onClose: () => void }) {
  const c = meta.clusters.find((c) => c.id === p.id)!;
  const bench = company.benchmark[p.id];
  const [cut, setCut] = useState(0.3);
  const [open, setOpen] = useState<number | null>(null);
  const w = whatIf(p, bench?.other_shares ?? [], cut);
  const examples = company.examples[p.id] ?? [];

  // Monthly line vs the volume this company would see at its peers' rate.
  const ids = meta.clusters.filter((k) => k.id !== 0).map((k) => k.id);
  const actual = company.monthly[p.id] ?? [];
  const expected = meta.months.map((_, m) => {
    const ownTot = ids.reduce((s, id) => s + (company.monthly[id]?.[m] ?? 0), 0);
    const indTot = ids.reduce((s, id) => s + (meta.industry_monthly[id]?.[m] ?? 0), 0);
    const others = (meta.industry_monthly[p.id]?.[m] ?? 0) - (actual[m] ?? 0);
    return indTot - ownTot > 0 ? (others / (indTot - ownTot)) * ownTot : 0;
  });

  return (
    <section className="card mt-5 p-6 sm:p-9 fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-[12px] font-medium text-accent bg-accent-soft rounded-full px-2.5 py-1">{c.owner}</span>
          <h2 className="mt-3 text-[28px] sm:text-[34px] font-semibold tracking-tight leading-tight">{p.label}</h2>
          <p className="mt-2 text-[17px] text-ink-2 max-w-2xl leading-relaxed">{c.summary}</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-[#f0f0f3] text-ink-2 hover:text-ink" aria-label="Close">✕</button>
      </div>

      <div className="mt-8 grid lg:grid-cols-[1.4fr_1fr] gap-8">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3 mb-3">Monthly complaints</h3>
          <TrendChart months={meta.months} actual={actual} expected={expected} current={month} />
          <div className="mt-6 grid grid-cols-3 gap-4">
            <Mini k="Last 12 months" v={p.t12.toLocaleString("en-US")} />
            <Mini k="Share of complaints" v={`${(p.share * 100).toFixed(1)}%`} sub={`peers ${(p.peerShare * 100).toFixed(1)}%`} />
            <Mini k="Peer rank" v={`#${p.peerRank} of ${p.peerCount}`} sub="1 = most affected" />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-page p-5">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3 mb-2">Suggested action</h3>
            <p className="text-[17px] font-medium leading-snug">{c.action}</p>
            {c.root_cause && (
              <p className="mt-3 text-[14px] text-ink-2 leading-relaxed">
                <span className="font-medium text-ink">Likely root cause (hypothesis): </span>{c.root_cause}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3 mb-4">What if you fix it?</h3>
            <div className="flex justify-between text-[13px] mb-2">
              <span className="text-ink-2">Reduce this issue by</span>
              <span className="font-semibold tabular-nums">{Math.round(cut * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={0.9} step={0.05} value={cut}
              onChange={(e) => setCut(Number(e.target.value))}
              style={{ ["--fill" as string]: `${(cut / 0.9) * 100}%` }}
              aria-label="Reduction"
            />
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Mini k="Estimated savings" v={fmtMoney(w.savings)} sub="next 12 months" />
              <Mini k="New peer rank" v={`#${w.newRank} of ${p.peerCount}`} sub={`index ${w.newIndex.toFixed(1)}× (now ${p.peerIndex.toFixed(1)}×)`} />
            </div>
            <div className="mt-4 text-[12px] text-ink-3 leading-relaxed">
              Cost now {fmtMoney(p.annualCost)} a year: {fmtMoney(p.supportCost)} support, {fmtMoney(p.churnCost)} churn.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3 mb-3">In customers&rsquo; words</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {examples.length === 0 && <p className="text-[14px] text-ink-3">No recent narratives for this issue.</p>}
          {examples.map((e) => (
            <figure key={e.id} className="rounded-2xl bg-page p-5 text-[14px] leading-relaxed">
              <blockquote className={open === e.id ? "" : "line-clamp-5"}>{e.text}</blockquote>
              <figcaption className="mt-3 flex justify-between text-[12px] text-ink-3">
                <span>{e.date} · {e.state} · {e.sub_product}</span>
                <button onClick={() => setOpen(open === e.id ? null : e.id)} className="text-accent">{open === e.id ? "Less" : "More"}</button>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-3">Representative complaints closest to the center of this issue cluster. Top terms: {c.top_terms.slice(0, 6).join(", ")}.</p>
      </div>
    </section>
  );
}

function Mini({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <div className="text-[12px] text-ink-3">{k}</div>
      <div className="text-[22px] font-semibold tabular-nums tracking-tight">{v}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
