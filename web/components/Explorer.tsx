"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IssueMap, { type Domain, FILL, PEER_ICON, PEER_TEXT } from "./IssueMap";
import Spectrogram from "./Spectrogram";
import Timeline from "./Timeline";
import TrendChart from "./TrendChart";
import { clampGrowth, fmtMoney, fmtMonth, fmtPct, issuesAt, peerClass, whatIf, type IssuePoint } from "@/lib/model";
import type { Assumptions, CompanyDoc, Meta } from "@/lib/types";

const SLIDERS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; fmt: (v: number) => string; help: string }[] = [
  { key: "contacts_per_complaint", label: "Support contacts per complaint", min: 5, max: 100, step: 5, fmt: (v) => `${v}`, help: "Most customers with a problem contact support and never file with the CFPB." },
  { key: "cost_per_contact", label: "Cost per support contact", min: 2, max: 30, step: 1, fmt: (v) => `$${v}`, help: "Blended cost of a phone, chat or email contact." },
  { key: "churn_rate", label: "Affected customers who leave", min: 0, max: 0.25, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, help: "Share of affected customers who close their account." },
  { key: "revenue_per_customer", label: "Annual revenue per customer", min: 20, max: 600, step: 10, fmt: (v) => `$${v}`, help: "What a lost customer would have been worth in a year." },
];

export default function Explorer({ meta, company }: { meta: Meta; company: CompanyDoc }) {
  const last = meta.months.length - 1;
  const first = Math.min(11, last);
  const [month, setMonth] = useState(last);
  const [assume, setAssume] = useState<Assumptions>(meta.assumptions);
  const [mode, setMode] = useState<"company" | "industry">("company");
  const [selected, setSelected] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState<"global" | "row">("row");

  // Deep link: /company/x/?issue=5 opens that issue
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("issue"));
    if (id) open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    }, 600);
    return () => clearInterval(id);
  }, [playing, last]);

  const togglePlay = () => {
    if (!playing && month >= last) setMonth(first);
    setPlaying((p) => !p);
  };

  // Global keys: space plays, escape closes the drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") setDrawer(false);
      if (e.key === " " && !drawer && tag !== "BUTTON" && !(e.target as HTMLElement).getAttribute("role")) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const points = useMemo(() => issuesAt(meta, company, month, assume, mode), [meta, company, month, assume, mode]);
  const latest = useMemo(() => issuesAt(meta, company, last, assume, "company"), [meta, company, last, assume]);

  // Axis domains fixed across months so playback shows real movement, not rescaling.
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
    return { x: [gMin - 0.08, gMax + 0.15], y: [Math.max(500, cMin * 0.6), cMax * 1.7], rMax };
  }, [meta, company, assume, mode, first, last]);

  const ranked = useMemo(() => [...latest].filter((p) => p.t12 > 0).sort((a, b) => b.projectedCost - a.projectedCost), [latest]);
  const totalCost = latest.reduce((s, p) => s + p.annualCost, 0);
  const supportCost = latest.reduce((s, p) => s + p.supportCost, 0);
  const listing = meta.companies.find((c) => c.slug === company.slug)!;
  const spiking = useMemo(() => new Set(company.spikes.map((s) => s.cluster_id)), [company]);
  const clusters = meta.clusters.filter((c) => c.id !== 0);
  const totals = meta.months.map((_, m) => clusters.reduce((s, c) => s + (company.monthly[c.id]?.[m] ?? 0), 0));
  const rankOf = (id: number) => {
    const i = ranked.findIndex((r) => r.id === id);
    return i < 0 ? 99 : i;
  };
  const spectroRows = [...clusters]
    .sort((a, b) => rankOf(a.id) - rankOf(b.id))
    .map((c) => ({ id: c.id, label: c.label, values: company.monthly[c.id] ?? [], flag: spiking.has(c.id) }));

  function open(id: number) {
    setSelected(id);
    setDrawer(true);
    setPlaying(false);
  }

  const sel = selected === null ? null : latest.find((p) => p.id === selected) ?? null;
  const step = (dir: 1 | -1) => {
    const i = ranked.findIndex((p) => p.id === selected);
    const next = ranked[(i + dir + ranked.length) % ranked.length];
    if (next) setSelected(next.id);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-8">
      {/* Header */}
      <section className="pt-10 pb-8 grid lg:grid-cols-[1fr_auto] gap-8 items-end">
        <div>
          <button
            onClick={() => window.dispatchEvent(new Event("earshot:search"))}
            className="text-[13px] text-ink-3 hover:text-ink-2 transition-colors"
          >
            {meta.product}. Switch company <kbd className="ml-1">⌘K</kbd>
          </button>
          <h1 className="display display-xl text-[44px] sm:text-[80px] leading-[0.95] font-bold mt-3">{company.name}</h1>
        </div>
        <dl className="grid grid-cols-3 gap-4 sm:gap-10">
          <Stat label="Complaints, 12 months" value={listing.complaints_12m.toLocaleString("en-US")} />
          <Stat label="Estimated annual cost" value={<Ticker value={totalCost} />} accent />
          <Stat label="vs prior 12 months" value={listing.change_yoy === null ? "n/a" : fmtPct(listing.change_yoy)} />
        </dl>
      </section>

      {company.spikes.length > 0 && (
        <section className="mb-5 flex flex-wrap items-center gap-2" aria-label="Spiking now">
          <span className="text-[13px] text-ink-3 mr-1">Spiking now</span>
          {company.spikes.slice(0, 4).map((s) => (
            <button
              key={`${s.cluster_id}-${s.month}`}
              onClick={() => open(s.cluster_id)}
              className="group flex items-center gap-2 rounded-full border border-heat-5/40 bg-heat-5/10 pl-2.5 pr-3.5 h-9 text-[13px] hover:border-heat-5 transition-colors"
            >
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-heat-5 animate-ping opacity-60" />
                <span className="relative w-2 h-2 rounded-full bg-heat-5" />
              </span>
              <span className="font-medium">{s.label}</span>
              <span className="text-ink-2 tabular-nums">{(s.n / Math.max(s.baseline, 1)).toFixed(1)}× normal in {fmtMonth(s.month)}</span>
            </button>
          ))}
        </section>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Issue Map */}
        <section className="panel p-4 sm:p-6 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="display text-[24px] font-semibold">Issue map</h2>
              <p className="text-[14px] text-ink-2 mt-1 max-w-md">
                Each bubble is one problem customers report, sized by complaints. Look top right first.
              </p>
            </div>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as "company" | "industry")}
              options={[["company", company.name], ["industry", "Whole industry"]]}
            />
          </div>
          <Legend mode={mode} />
          <IssueMap points={points} domain={domain} mode={mode} selectedId={drawer ? selected : null} spiking={spiking} onSelect={open} />
          <div className="mt-3">
            <Timeline months={meta.months} totals={totals} value={month} min={first} onChange={(i) => { setPlaying(false); setMonth(i); }} playing={playing} onTogglePlay={togglePlay} />
            <p className="mt-2 text-[12px] text-ink-3 hidden sm:block">
              Press <kbd>space</kbd> to play three years of complaints. Drag the timeline to scrub.
            </p>
          </div>
        </section>

        {/* Model controls */}
        <aside className="panel p-6 lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="display text-[20px] font-semibold">Tune the cost model</h2>
            <button onClick={() => setAssume(meta.assumptions)} className="text-[13px] text-accent hover:underline">Reset</button>
          </div>
          <p className="text-[13px] text-ink-3 mb-6">Use your own numbers. Every cost and ranking updates live.</p>
          <div className="flex flex-col gap-6">
            {SLIDERS.map((s) => (
              <label key={s.key} className="block">
                <div className="flex justify-between items-baseline text-[13px] mb-2.5">
                  <span className="text-ink-2">{s.label}</span>
                  <span className="display text-[17px] font-semibold tabular-nums text-ink">{s.fmt(assume[s.key])}</span>
                </div>
                <input
                  type="range" min={s.min} max={s.max} step={s.step} value={assume[s.key]}
                  onChange={(e) => setAssume({ ...assume, [s.key]: Number(e.target.value) })}
                  style={{ ["--fill" as string]: `${((assume[s.key] - s.min) / (s.max - s.min)) * 100}%` }}
                  aria-describedby={`help-${s.key}`}
                />
                <span id={`help-${s.key}`} className="block mt-1.5 text-[12px] text-ink-3 leading-snug">{s.help}</span>
              </label>
            ))}
          </div>
          <div className="mt-7 pt-5 border-t hairline">
            <div className="flex justify-between text-[12px] text-ink-3 mb-2">
              <span>Support {fmtMoney(supportCost)}</span>
              <span>Lost customers {fmtMoney(totalCost - supportCost)}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-[2px]">
              <div className="bg-accent transition-all duration-500" style={{ width: `${(supportCost / Math.max(totalCost, 1)) * 100}%` }} />
              <div className="bg-heat-4 flex-1" />
            </div>
          </div>
        </aside>
      </div>

      {/* Ranked actions */}
      <section className="mt-5 panel overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-6 pb-4">
          <h2 className="display text-[24px] font-semibold">Where to act first</h2>
          <span className="text-[13px] text-ink-3">Ranked by projected cost over the next 12 months</span>
        </div>
        <ol>
          {ranked.slice(0, 8).map((p, i) => (
            <ActionRow key={p.id} rank={i + 1} p={p} meta={meta} max={ranked[0].projectedCost} hot={spiking.has(p.id)} onOpen={() => open(p.id)} />
          ))}
        </ol>
      </section>

      {/* Company spectrogram */}
      <section className="mt-5 panel p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="display text-[24px] font-semibold">Every issue, every month</h2>
            <p className="text-[14px] text-ink-2 mt-1">Brighter means more complaints. The white line follows the timeline above.</p>
          </div>
          <Segmented value={scale} onChange={(v) => setScale(v as "global" | "row")} options={[["row", "Spot changes"], ["global", "Compare sizes"]]} />
        </div>
        <Spectrogram
          rows={spectroRows}
          months={meta.months}
          cursor={month}
          scale={scale}
          selectedId={drawer ? selected : null}
          onSelectRow={open}
          onSelectMonth={(i) => setMonth(Math.max(first, i))}
        />
      </section>

      {drawer && sel && (
        <Drawer onClose={() => setDrawer(false)} onStep={step} label={sel.label}>
          <IssueDetail key={sel.id} p={sel} meta={meta} company={company} month={month} rank={ranked.findIndex((r) => r.id === sel.id) + 1} />
        </Drawer>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3 leading-snug">{label}</dt>
      <dd className={`display text-[24px] sm:text-[40px] font-semibold tabular-nums leading-tight ${accent ? "text-heat-6" : ""}`}>{value}</dd>
    </div>
  );
}

/** Animates a dollar figure toward its new value when sliders move. */
function Ticker({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 450);
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtMoney(shown)}</>;
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex rounded-full bg-bg border hairline p-1 text-[13px]" role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`px-3.5 h-8 rounded-full transition-colors whitespace-nowrap ${value === v ? "bg-raised text-ink font-medium" : "text-ink-3 hover:text-ink-2"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Legend({ mode }: { mode: "company" | "industry" }) {
  if (mode === "industry") return <p className="text-[12px] text-ink-3 mb-1">The whole peer group. An issue large here but small for this company is industry-wide.</p>;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-2 mb-1">
      {(["worse", "inline", "better"] as const).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: FILL[k] }} />
          {PEER_TEXT[k]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <i className="inline-block w-2.5 h-2.5 rounded-full border-2 border-heat-5" />
        Spiking now
      </span>
    </div>
  );
}

function PeerTag({ index }: { index: number }) {
  const cls = peerClass(index);
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 whitespace-nowrap">
      <span style={{ color: FILL[cls] }} aria-hidden>{PEER_ICON[cls]}</span>
      {PEER_TEXT[cls]} <span className="tabular-nums text-ink-3">{index.toFixed(1)}×</span>
    </span>
  );
}

function ActionRow({ rank, p, meta, max, hot, onOpen }: { rank: number; p: IssuePoint; meta: Meta; max: number; hot: boolean; onOpen: () => void }) {
  const c = meta.clusters.find((c) => c.id === p.id)!;
  return (
    <li className="border-t hairline">
      <button onClick={onOpen} className="group w-full text-left grid grid-cols-[2rem_1fr] md:grid-cols-[2.5rem_1.6fr_1fr_11rem] gap-x-4 gap-y-3 items-center px-6 py-5 hover:bg-raised transition-colors">
        <span className="display text-[22px] font-semibold text-ink-3 tabular-nums">{rank}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {hot && <span className="w-2 h-2 rounded-full bg-heat-5 shrink-0" aria-label="spiking" />}
            <span className="display text-[18px] font-semibold group-hover:text-accent transition-colors">{p.label}</span>
          </div>
          <p className="text-[14px] text-ink-2 mt-1 leading-snug">{c.action}</p>
        </div>
        <div className="col-start-2 md:col-start-auto">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="display text-[20px] font-semibold tabular-nums">{fmtMoney(p.projectedCost)}</span>
            <span className={`text-[12px] tabular-nums ${p.growth > 0.1 ? "text-heat-5" : "text-ink-3"}`}>{fmtPct(p.growth)} trend</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(p.projectedCost / max) * 100}%`, background: "linear-gradient(90deg, var(--color-heat-3), var(--color-heat-5))" }} />
          </div>
        </div>
        <div className="col-start-2 md:col-start-auto flex md:flex-col md:items-end gap-x-4 gap-y-1.5 flex-wrap">
          <span className="text-[12px] text-accent border border-accent/30 rounded-full px-2.5 py-0.5 whitespace-nowrap">{c.owner}</span>
          <PeerTag index={p.peerIndex} />
        </div>
      </button>
    </li>
  );
}

function Drawer({ children, onClose, onStep, label }: { children: React.ReactNode; onClose: () => void; onStep: (d: 1 | -1) => void; label: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onStep]);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-bg/60 backdrop-blur-sm scrim-enter" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="absolute right-0 top-0 h-full w-full max-w-[720px] bg-panel border-l hairline overflow-y-auto drawer-enter outline-none focus-visible:outline-none">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 h-14 bg-panel/90 backdrop-blur border-b hairline">
          <div className="flex items-center gap-1">
            <IconBtn onClick={() => onStep(-1)} label="Previous issue">‹</IconBtn>
            <IconBtn onClick={() => onStep(1)} label="Next issue">›</IconBtn>
            <span className="ml-2 text-[12px] text-ink-3 hidden sm:inline">
              <kbd>←</kbd> <kbd>→</kbd> to move between issues
            </span>
          </div>
          <IconBtn onClick={onClose} label="Close">✕</IconBtn>
        </div>
        {children}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="w-9 h-9 rounded-full grid place-items-center text-[18px] text-ink-2 hover:text-ink hover:bg-raised transition-colors">
      {children}
    </button>
  );
}

function IssueDetail({ p, meta, company, month, rank }: { p: IssuePoint; meta: Meta; company: CompanyDoc; month: number; rank: number }) {
  const c = meta.clusters.find((c) => c.id === p.id)!;
  const bench = company.benchmark[p.id];
  const [cut, setCut] = useState(0.3);
  const [openEx, setOpenEx] = useState<number | null>(null);
  const w = whatIf(p, bench?.other_shares ?? [], cut);
  const examples = company.examples[p.id] ?? [];
  const cls = peerClass(p.peerIndex);

  const ids = meta.clusters.filter((k) => k.id !== 0).map((k) => k.id);
  const actual = company.monthly[p.id] ?? [];
  const expected = meta.months.map((_, m) => {
    const ownTot = ids.reduce((s, id) => s + (company.monthly[id]?.[m] ?? 0), 0);
    const indTot = ids.reduce((s, id) => s + (meta.industry_monthly[id]?.[m] ?? 0), 0);
    const others = (meta.industry_monthly[p.id]?.[m] ?? 0) - (actual[m] ?? 0);
    return indTot - ownTot > 0 ? (others / (indTot - ownTot)) * ownTot : 0;
  });

  return (
    <div className="px-6 sm:px-8 py-8">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-ink-3">Priority {rank}</span>
        <span className="text-accent border border-accent/30 rounded-full px-2.5 py-0.5">{c.owner}</span>
      </div>
      <h2 className="display text-[34px] sm:text-[42px] font-bold leading-[1.02] mt-3">{p.label}</h2>
      <p className="mt-3 text-[16px] text-ink-2 leading-relaxed max-w-[38em]">{c.summary}</p>

      <dl className="mt-7 grid grid-cols-3 gap-4">
        <Mini k="Last 12 months" v={p.t12.toLocaleString("en-US")} sub="complaints" />
        <Mini k="Annual cost" v={fmtMoney(p.annualCost)} sub={`${fmtPct(p.growth)} trend`} />
        <Mini k="Peer rank" v={`#${p.peerRank} of ${p.peerCount}`} sub={<span style={{ color: FILL[cls] }}>{PEER_ICON[cls]} <span className="text-ink-3">{PEER_TEXT[cls].toLowerCase()}</span></span>} />
      </dl>

      <section className="mt-8">
        <h3 className="text-[14px] font-semibold text-ink mb-3">Monthly complaints against the peer rate</h3>
        <TrendChart months={meta.months} actual={actual} expected={expected} current={month} />
      </section>

      <section className="mt-8 rounded-2xl p-6 border border-heat-5/30" style={{ background: "linear-gradient(135deg, rgba(248,146,58,0.10), rgba(168,48,127,0.08))" }}>
        <h3 className="text-[14px] font-semibold text-heat-6">Suggested action</h3>
        <p className="display text-[22px] font-semibold leading-snug mt-2">{c.action}</p>
        {c.root_cause && (
          <p className="mt-3 text-[14px] text-ink-2 leading-relaxed">
            <span className="text-ink">Likely cause, to verify: </span>{c.root_cause}
          </p>
        )}
      </section>

      <section className="mt-5 rounded-2xl p-6 bg-bg border hairline">
        <h3 className="text-[14px] font-semibold">What if you fix it?</h3>
        <div className="mt-4 flex justify-between items-baseline text-[13px] mb-2.5">
          <span className="text-ink-2">Cut complaints on this issue by</span>
          <span className="display text-[20px] font-semibold tabular-nums">{Math.round(cut * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={0.9} step={0.05} value={cut}
          onChange={(e) => setCut(Number(e.target.value))}
          style={{ ["--fill" as string]: `${(cut / 0.9) * 100}%` }}
          aria-label="Reduction"
        />
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[12px] text-ink-3">Estimated savings, next 12 months</div>
            <div className="display text-[36px] font-bold tabular-nums text-heat-6 leading-tight">{fmtMoney(w.savings)}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-3">Peer rank after the fix</div>
            <div className="display text-[36px] font-bold tabular-nums leading-tight">
              #{w.newRank}<span className="text-[16px] text-ink-3 font-medium"> of {p.peerCount}</span>
            </div>
            <div className="text-[12px] text-ink-3">now #{p.peerRank}, {p.peerIndex.toFixed(1)}× peers, then {w.newIndex.toFixed(1)}×</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-[14px] font-semibold mb-3">In customers&rsquo; own words</h3>
        <div className="flex flex-col gap-3">
          {examples.length === 0 && <p className="text-[14px] text-ink-3">No recent written complaints for this issue.</p>}
          {examples.map((e) => (
            <figure key={e.id} className="rounded-2xl bg-bg border hairline p-5">
              <blockquote className={`text-[15px] leading-relaxed text-ink-2 ${openEx === e.id ? "" : "line-clamp-3"}`}>{e.text}</blockquote>
              <figcaption className="mt-3 flex justify-between gap-3 text-[12px] text-ink-3">
                <span>{e.date}, {e.state}, {e.sub_product}</span>
                <button onClick={() => setOpenEx(openEx === e.id ? null : e.id)} className="text-accent shrink-0">{openEx === e.id ? "Show less" : "Read all"}</button>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-3">Complaints closest to the center of this issue. Words that set it apart: {c.top_terms.slice(0, 6).join(", ")}.</p>
      </section>
    </div>
  );
}

function Mini({ k, v, sub }: { k: string; v: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg border hairline p-4">
      <dt className="text-[12px] text-ink-3">{k}</dt>
      <dd className="display text-[24px] font-semibold tabular-nums leading-tight mt-1">{v}</dd>
      {sub && <dd className="text-[12px] text-ink-3 mt-0.5">{sub}</dd>}
    </div>
  );
}
