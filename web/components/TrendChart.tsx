"use client";

import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { fmtMonth } from "@/lib/model";

const W = 640;
const H = 220;
const M = { top: 16, right: 16, bottom: 28, left: 40 };

type Props = { months: string[]; actual: number[]; expected: number[]; current: number };

/** Monthly complaints for one issue vs what the company would see at its peers' rate. */
export default function TrendChart({ months, actual, expected, current }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...actual, ...expected);
  const x = scaleLinear().domain([0, months.length - 1]).range([M.left, W - M.right]);
  const y = scaleLinear().domain([0, max * 1.1]).nice().range([H - M.bottom, M.top]);
  const path = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const yearTicks = months.map((m, i) => [m, i] as const).filter(([m]) => m.endsWith("-01"));

  return (
    <div>
      <div className="flex gap-5 text-[12px] text-ink-2 mb-2">
        <span className="flex items-center gap-2"><i className="inline-block w-4 h-[2px] bg-ink" />This company</span>
        <span className="flex items-center gap-2"><i className="inline-block w-4 border-t-2 border-dashed border-inline" />At peers&rsquo; rate</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            setHover(Math.max(0, Math.min(months.length - 1, Math.round(x.invert(px)))));
          }}
          role="img"
          aria-label="Monthly complaints for this issue compared with the peer rate"
        >
          {y.ticks(3).map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} className="fill-ink-3 tabular-nums">{t}</text>
            </g>
          ))}
          {yearTicks.map(([m, i]) => (
            <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} className="fill-ink-3">{m.slice(0, 4)}</text>
          ))}
          <line x1={x(current)} x2={x(current)} y1={M.top} y2={H - M.bottom} stroke="var(--color-accent)" strokeOpacity={0.35} strokeWidth={2} />
          <path d={path(expected)} fill="none" stroke="var(--color-inline)" strokeWidth={2} strokeDasharray="5 5" />
          <path d={path(actual)} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" />
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} stroke="#c7c7cc" />
              <circle cx={x(hover)} cy={y(actual[hover])} r={4.5} fill="var(--color-ink)" stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 card px-3 py-2 text-[12px] whitespace-nowrap"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > months.length * 0.6 ? "-110%" : "10px"})` }}
          >
            <div className="font-semibold mb-1">{fmtMonth(months[hover])}</div>
            <div>This company: <b className="tabular-nums">{actual[hover]}</b></div>
            <div className="text-ink-2">At peers&rsquo; rate: <span className="tabular-nums">{expected[hover].toFixed(1)}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
