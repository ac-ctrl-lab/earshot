"use client";

import { scaleLinear, scaleLog, scaleSqrt } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import { clampGrowth, fmtMoney, fmtPct, peerClass, type IssuePoint } from "@/lib/model";

const M = { top: 24, right: 20, bottom: 48, left: 60 };

export const FILL = { worse: "var(--color-worse)", inline: "var(--color-inline)", better: "var(--color-better)" };
export const PEER_TEXT = { worse: "Worse than peers", inline: "In line with peers", better: "Better than peers" };
export const PEER_ICON = { worse: "▲", inline: "●", better: "▼" };

export type Domain = { x: [number, number]; y: [number, number]; rMax: number };

type Props = {
  points: IssuePoint[];
  domain: Domain;
  mode: "company" | "industry";
  selectedId: number | null;
  spiking: Set<number>;
  onSelect: (id: number) => void;
};

export default function IssueMap({ points, domain, mode, selectedId, spiking, onSelect }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(820);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = W < 600;
  const H = narrow ? Math.round(W * 1.1) : Math.round(Math.min(560, W * 0.62));

  const x = useMemo(() => scaleLinear().domain(domain.x).range([M.left, W - M.right]).clamp(true), [domain, W]);
  const y = useMemo(() => scaleLog().domain(domain.y).range([H - M.bottom, M.top]).clamp(true), [domain, H]);
  const r = useMemo(() => scaleSqrt().domain([0, domain.rMax]).range([0, narrow ? 30 : 46]), [domain, narrow]);

  const plotted = points.filter((p) => p.t12 >= 3);
  const medianCost = useMemo(() => {
    const c = plotted.map((p) => p.annualCost).sort((a, b) => a - b);
    return c.length ? c[Math.floor(c.length / 2)] : domain.y[0];
  }, [plotted, domain]);

  const pos = (p: IssuePoint) => ({ cx: x(clampGrowth(p.growth)), cy: y(Math.max(p.annualCost, domain.y[0])), rr: Math.max(r(p.t12), 6) });
  const yTicks = y.ticks(4).filter((t) => [1, 2, 5].includes(Number(String(t)[0])));
  const xTicks = x.ticks(narrow ? 3 : 6);
  const hovered = plotted.find((p) => p.id === hover);
  const order = [...plotted].sort((a, b) => b.t12 - a.t12);
  const labels = placeLabels(
    [...plotted].sort((a, b) => b.projectedCost - a.projectedCost).slice(0, 6),
    pos, W, H, narrow ? 2 : 4, selectedId, plotted,
  );
  const colorOf = (p: IssuePoint) => (mode === "industry" ? "var(--color-accent)" : FILL[peerClass(p.peerIndex)]);

  return (
    <div ref={wrap} className="relative w-full">
      <svg width={W} height={H} className="block select-none" role="img" aria-label="Issue map: each bubble is one issue, positioned by growth and estimated annual cost">
        <defs>
          <radialGradient id="hot" cx="100%" cy="0%" r="100%">
            <stop offset="0%" stopColor="var(--color-worse)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-worse)" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Hot zone: costly and rising */}
        <rect x={x(0)} y={M.top} width={W - M.right - x(0)} height={Math.max(0, y(medianCost) - M.top)} fill="url(#hot)" rx={12} />
        <text x={W - M.right - 10} y={M.top + 18} textAnchor="end" fontSize={12} fill="var(--color-worse)" fontWeight={600}>Costly and rising</text>
        {!narrow && <text x={W - M.right - 10} y={H - M.bottom - 10} textAnchor="end" fontSize={12} fill="var(--color-ink-3)">Small but rising</text>}
        {!narrow && <text x={M.left + 10} y={M.top + 18} fontSize={12} fill="var(--color-ink-3)">Costly but easing</text>}

        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray="2 4" />
            <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-ink-3)">{fmtMoney(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - M.bottom + 20} textAnchor="middle" fontSize={11} fill="var(--color-ink-3)">{fmtPct(t)}</text>
        ))}
        <line x1={x(0)} x2={x(0)} y1={M.top} y2={H - M.bottom} stroke="var(--color-ink-3)" strokeOpacity={0.5} />
        <text x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--color-ink-2)">Shrinking ← growth over 6 months → Rising</text>
        <text transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--color-ink-2)">Estimated annual cost</text>

        {order.map((p) => {
          const { cx, cy, rr } = pos(p);
          const selected = p.id === selectedId;
          const dim = selectedId !== null && !selected && hover !== p.id;
          const hot = mode === "company" && spiking.has(p.id);
          return (
            <g
              key={p.id}
              className="bubble cursor-pointer outline-none"
              style={{ transform: `translate(${cx}px, ${cy}px)`, opacity: dim ? 0.3 : 1 }}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.id)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect(p.id)}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}: ${fmtMoney(p.annualCost)} a year, ${fmtPct(p.growth)} growth`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(p.id))}
            >
              <circle r={rr + 8} fill="transparent" />
              {hot && <circle className="pulse" r={rr} fill="none" stroke="var(--color-heat-5)" strokeWidth={2} />}
              <circle r={rr} fill={colorOf(p)} fillOpacity={0.9} filter={hover === p.id || selected ? "url(#glow)" : undefined} />
              <circle r={rr} fill="none" stroke={selected ? "var(--color-ink)" : "var(--color-panel)"} strokeWidth={selected ? 2.5 : 2} />
            </g>
          );
        })}

        {labels.map(({ p, tx, ty, anchor }) => (
          <text
            key={`l${p.id}`}
            className="bubble pointer-events-none"
            style={{ transform: `translate(${tx}px, ${ty}px)` }}
            textAnchor={anchor}
            dy="0.32em"
            fontSize={13}
            fontWeight={600}
            fill="var(--color-ink)"
            paintOrder="stroke"
            stroke="var(--color-panel)"
            strokeWidth={5}
          >
            {p.label}
          </text>
        ))}
      </svg>

      {hovered && (() => {
        const { cx, cy } = pos(hovered);
        const cls = peerClass(hovered.peerIndex);
        return (
          <div
            className="pointer-events-none absolute z-10 panel bg-raised shadow-2xl px-4 py-3 text-[13px] w-64"
            style={{ left: cx, top: cy, transform: `translate(${cx > W * 0.55 ? "calc(-100% - 20px)" : "20px"}, -50%)` }}
          >
            <div className="font-semibold text-[14px] mb-2 leading-snug">{hovered.label}</div>
            <Row k="Complaints, 12 months" v={hovered.t12.toLocaleString("en-US")} />
            <Row k="Growth" v={fmtPct(hovered.growth)} />
            <Row k="Estimated annual cost" v={fmtMoney(hovered.annualCost)} />
            {mode === "company" && (
              <Row k={`${PEER_ICON[cls]} ${PEER_TEXT[cls]}`} v={`${hovered.peerIndex.toFixed(1)}×`} />
            )}
            <div className="mt-2 text-ink-3 text-[12px]">Click or press Enter for the full picture</div>
          </div>
        );
      })()}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-ink-2">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}

type Placed = { p: IssuePoint; tx: number; ty: number; anchor: "start" | "end" | "middle" };

/** Greedy label placement: right, left, above, below; skip a label if every spot collides. */
function placeLabels(
  pts: IssuePoint[],
  pos: (p: IssuePoint) => { cx: number; cy: number; rr: number },
  W: number,
  H: number,
  max: number,
  selectedId: number | null,
  all: IssuePoint[],
): Placed[] {
  const boxes: [number, number, number, number][] = [];
  const bubbles = all.map((b) => {
    const { cx, cy, rr } = pos(b);
    const k = rr * 0.8;
    return { id: b.id, box: [cx - k, cy - k, cx + k, cy + k] as [number, number, number, number] };
  });
  const sel = all.find((p) => p.id === selectedId);
  const ordered = sel && !pts.includes(sel) ? [sel, ...pts] : [...pts].sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0));
  const out: Placed[] = [];
  for (const p of ordered) {
    if (out.length >= max && p.id !== selectedId) break;
    const { cx, cy, rr } = pos(p);
    const w = p.label.length * 7.2;
    const h = 16;
    const candidates: [number, number, Placed["anchor"]][] = [
      [cx + rr + 8, cy, "start"],
      [cx - rr - 8, cy, "end"],
      [cx, cy - rr - 12, "middle"],
      [cx, cy + rr + 14, "middle"],
    ];
    for (const [tx, ty, anchor] of candidates) {
      const x0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
      const box: [number, number, number, number] = [x0, ty - h / 2, x0 + w, ty + h / 2];
      const inside = box[0] >= M.left && box[2] <= W - 4 && box[1] >= 4 && box[3] <= H - 40;
      const overlap = (b: [number, number, number, number]) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]);
      if (inside && !boxes.some(overlap) && !bubbles.some((b) => b.id !== p.id && overlap(b.box))) {
        boxes.push(box);
        out.push({ p, tx, ty, anchor });
        break;
      }
    }
  }
  return out;
}
