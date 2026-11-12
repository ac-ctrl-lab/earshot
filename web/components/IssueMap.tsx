"use client";

import { scaleLinear, scaleLog, scaleSqrt } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import { clampGrowth, fmtMoney, fmtPct, peerClass, type IssuePoint } from "@/lib/model";

const M = { top: 28, right: 20, bottom: 52, left: 64 };

const FILL = { worse: "var(--color-worse)", inline: "var(--color-inline)", better: "var(--color-better)" };
const PEER_TEXT = { worse: "Worse than peers", inline: "In line with peers", better: "Better than peers" };

export type Domain = { x: [number, number]; y: [number, number]; rMax: number };

type Props = {
  points: IssuePoint[];
  domain: Domain;
  mode: "company" | "industry";
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export default function IssueMap({ points, domain, mode, selectedId, onSelect }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // Draw in real pixels so text stays 13px on every screen size.
  const [W, setW] = useState(820);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 600 ? Math.round(W * 1.05) : Math.round(W * 0.6);
  const narrow = W < 600;

  const x = useMemo(() => scaleLinear().domain(domain.x).range([M.left, W - M.right]).clamp(true), [domain, W]);
  const y = useMemo(() => scaleLog().domain(domain.y).range([H - M.bottom, M.top]).clamp(true), [domain, H]);
  const r = useMemo(() => scaleSqrt().domain([0, domain.rMax]).range([0, narrow ? 30 : 44]), [domain, narrow]);

  const plotted = points.filter((p) => p.t12 >= 3);
  const medianCost = useMemo(() => {
    const c = plotted.map((p) => p.annualCost).sort((a, b) => a - b);
    return c.length ? c[Math.floor(c.length / 2)] : domain.y[0];
  }, [plotted, domain]);

  // Selective direct labels: the most expensive issues plus the selected one, skipped if they would collide.
  const labelled = new Set(
    [...plotted].sort((a, b) => b.projectedCost - a.projectedCost).slice(0, 6).map((p) => p.id).concat(selectedId ?? []),
  );

  const yTicks = y.ticks(4).filter((t) => [1, 2, 5].includes(Number(String(t)[0])));
  const xTicks = x.ticks(narrow ? 3 : 6);
  const hovered = plotted.find((p) => p.id === hover);

  // Draw big bubbles first so small ones stay clickable on top.
  const order = [...plotted].sort((a, b) => b.t12 - a.t12);

  return (
    <div ref={wrap} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Issue map: each bubble is one issue, positioned by growth and estimated annual cost">
        {/* Quadrant guide: costly and rising is top right */}
        <rect x={x(0)} y={M.top} width={W - M.right - x(0)} height={y(medianCost) - M.top} fill="var(--color-worse)" opacity={0.045} rx={10} />
        <text x={W - M.right - 12} y={M.top + 22} textAnchor="end" className="fill-ink-3" fontSize={13} fontWeight={600}>
          Costly and rising
        </text>
        {!narrow && (
          <>
            <text x={M.left + 12} y={M.top + 22} className="fill-ink-3" fontSize={13}>Costly, easing</text>
            <text x={W - M.right - 12} y={H - M.bottom - 12} textAnchor="end" className="fill-ink-3" fontSize={13}>Small, rising</text>
            <text x={M.left + 12} y={H - M.bottom - 12} className="fill-ink-3" fontSize={13}>Small, easing</text>
          </>
        )}

        {/* Grid and axes, kept recessive */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} className="fill-ink-3 tabular-nums">
              {fmtMoney(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - M.bottom + 22} textAnchor="middle" fontSize={12} className="fill-ink-3 tabular-nums">
            {fmtPct(t)}
          </text>
        ))}
        <line x1={x(0)} x2={x(0)} y1={M.top} y2={H - M.bottom} stroke="#c7c7cc" strokeDasharray="3 4" />
        <text x={(M.left + W - M.right) / 2} y={H - 8} textAnchor="middle" fontSize={13} className="fill-ink-2">
          Growth, last 6 months vs the 6 before →
        </text>
        <text transform={`translate(16 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={13} className="fill-ink-2">
          Estimated annual cost →
        </text>

        {order.map((p) => {
          const cls = mode === "industry" ? "inline" : peerClass(p.peerIndex);
          const selected = p.id === selectedId;
          const dim = selectedId !== null && !selected && hover !== p.id;
          const cx = x(clampGrowth(p.growth));
          const cy = y(Math.max(p.annualCost, domain.y[0]));
          return (
            <g
              key={p.id}
              className="bubble cursor-pointer"
              style={{ transform: `translate(${cx}px, ${cy}px)`, opacity: dim ? 0.35 : 1 }}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(p.id)}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}: ${fmtMoney(p.annualCost)} a year, ${fmtPct(p.growth)} growth`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(p.id)}
            >
              <circle r={Math.max(r(p.t12), 6) + 6} fill="transparent" />
              <circle
                r={Math.max(r(p.t12), 6)}
                fill={mode === "industry" ? "var(--color-better)" : FILL[cls]}
                fillOpacity={0.82}
                stroke={selected ? "var(--color-ink)" : "#fff"}
                strokeWidth={selected ? 2.5 : 2}
              />
            </g>
          );
        })}

        {placeLabels(order.filter((p) => labelled.has(p.id)), (p) => ({
          cx: x(clampGrowth(p.growth)),
          cy: y(Math.max(p.annualCost, domain.y[0])),
          rr: Math.max(r(p.t12), 6),
        }), W, H, narrow ? 2 : 4, selectedId, plotted).map(({ p, tx, ty, anchor }) => (
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
            stroke="var(--color-card)"
            strokeWidth={4}
          >
            {p.label}
          </text>
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 card px-4 py-3 text-[13px] w-64"
          style={{
            left: `${(x(clampGrowth(hovered.growth)) / W) * 100}%`,
            top: `${(y(Math.max(hovered.annualCost, domain.y[0])) / H) * 100}%`,
            transform: `translate(${x(clampGrowth(hovered.growth)) > W * 0.6 ? "-105%" : "16px"}, -50%)`,
          }}
        >
          <div className="font-semibold text-[14px] mb-2 leading-snug">{hovered.label}</div>
          <Row k="Complaints, 12 months" v={hovered.t12.toLocaleString("en-US")} />
          <Row k="Growth" v={fmtPct(hovered.growth)} />
          <Row k="Estimated annual cost" v={fmtMoney(hovered.annualCost)} />
          {mode === "company" && <Row k={PEER_TEXT[peerClass(hovered.peerIndex)]} v={`${hovered.peerIndex.toFixed(1)}×`} />}
          <div className="mt-2 text-ink-3">Click for details</div>
        </div>
      )}
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

export { PEER_TEXT, FILL };

type Placed = { p: IssuePoint; tx: number; ty: number; anchor: "start" | "end" | "middle" };

/** Greedy label placement: try right, left, above, below; drop a label if every spot collides. */
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
  // Bubbles are obstacles too (shrunk a little, so labels may touch an edge but not cover a bubble).
  const bubbles = all.map((b) => {
    const { cx, cy, rr } = pos(b);
    const k = rr * 0.8;
    return { id: b.id, box: [cx - k, cy - k, cx + k, cy + k] as [number, number, number, number] };
  });
  const out: Placed[] = [];
  const ordered = [...pts].sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : b.projectedCost - a.projectedCost));
  for (const p of ordered) {
    if (out.length >= max && p.id !== selectedId) break;
    const { cx, cy, rr } = pos(p);
    const w = p.label.length * 7.1;
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
      const inside = box[0] >= 4 && box[2] <= W - 4 && box[1] >= 4 && box[3] <= H - 40;
      const overlap = (b: [number, number, number, number]) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]);
      const hits = boxes.some(overlap) || bubbles.some((b) => b.id !== p.id && overlap(b.box));
      if (inside && !hits) {
        boxes.push(box);
        out.push({ p, tx, ty, anchor });
        break;
      }
    }
  }
  return out;
}
