"use client";

import { useState } from "react";
import { heat, HEAT_STOPS } from "@/lib/heat";
import { fmtMonth } from "@/lib/model";

export type SpectroRow = { id: number; label: string; values: number[]; flag?: boolean };

type Props = {
  rows: SpectroRow[];
  months: string[];
  cursor?: number;
  selectedId?: number | null;
  onSelectRow?: (id: number) => void;
  onSelectMonth?: (i: number) => void;
  sweep?: boolean;
  scale?: "global" | "row";
  compact?: boolean;
};

/**
 * Issue x month heat strip. Each row is one issue, each column one month.
 * Brighter = more complaints. Reads like a spectrogram: a spike is a sound getting louder.
 */
export default function Spectrogram({ rows, months, cursor, selectedId, onSelectRow, onSelectMonth, sweep, scale = "global", compact }: Props) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const globalMax = Math.max(1, ...rows.flatMap((r) => r.values));
  const n = months.length;
  const years = months.map((m, i) => [m, i] as const).filter(([m]) => m.endsWith("-01"));
  const cellH = compact ? 16 : 22;

  return (
    <div className={`relative ${sweep ? "sweep" : ""}`} onMouseLeave={() => setHover(null)}>
      <div className="flex gap-3">
        {/* Labels */}
        <div className="shrink-0 w-[118px] sm:w-[15rem] flex flex-col gap-[2px] py-[1px]">
          {rows.map((row) => {
            const active = selectedId === row.id;
            return (
              <button
                key={row.id}
                onClick={() => onSelectRow?.(row.id)}
                className={`text-left truncate text-[12px] sm:text-[13px] leading-none transition-colors ${active ? "text-ink font-semibold" : "text-ink-2 hover:text-ink"}`}
                style={{ height: cellH }}
                title={row.label}
              >
                {row.flag && <span className="inline-block w-1.5 h-1.5 rounded-full bg-heat-5 mr-1.5 align-middle" aria-label="spiking" />}
                {row.label}
              </button>
            );
          })}
        </div>

        {/* Cells */}
        <div className="relative flex-1 min-w-0">
          <div className="flex flex-col gap-[2px] py-[1px]">
            {rows.map((row, r) => {
              const max = scale === "row" ? Math.max(1, ...row.values) : globalMax;
              const active = selectedId === row.id;
              return (
                <div
                  key={row.id}
                  className={`grid gap-[2px] rounded-[3px] ${active ? "outline outline-1 outline-accent/70 outline-offset-1" : ""}`}
                  style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
                >
                  {row.values.map((v, c) => (
                    <div
                      key={c}
                      className="cell rounded-[2px] cursor-pointer origin-bottom"
                      style={{
                        height: cellH,
                        background: heat(Math.sqrt(v / max)),
                        ["--c" as string]: c,
                        opacity: cursor !== undefined && c > cursor ? 0.22 : 1,
                        transition: "opacity 300ms ease",
                      }}
                      onMouseEnter={() => setHover({ r, c })}
                      onClick={() => {
                        onSelectRow?.(row.id);
                        onSelectMonth?.(c);
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="relative h-5 mt-1.5">
            {years.map(([m, i]) => (
              <span key={m} className="absolute text-[11px] text-ink-3" style={{ left: `${(i / n) * 100}%` }}>
                {m.slice(0, 4)}
              </span>
            ))}
          </div>
          {cursor !== undefined && (
            <div
              className="pointer-events-none absolute top-[-4px] bottom-6 w-[2px] -ml-px bg-ink rounded-full transition-[left] duration-300"
              style={{ left: `${((cursor + 0.5) / n) * 100}%`, boxShadow: "0 0 10px rgba(233,237,248,0.7)" }}
            />
          )}
        </div>
      </div>

      {hover && (
        <div className="pointer-events-none absolute z-20 -top-2 right-0 panel bg-raised px-3 py-2 text-[12px] shadow-xl">
          <span className="text-ink font-medium">{rows[hover.r].label}</span>
          <span className="text-ink-3"> in </span>
          <span className="text-ink-2">{fmtMonth(months[hover.c])}</span>
          <span className="text-ink font-semibold ml-2 tabular-nums">{rows[hover.r].values[hover.c]}</span>
          <span className="text-ink-3"> complaints</span>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 text-[11px] text-ink-3">
        <span>Quiet</span>
        <span className="h-1.5 w-28 rounded-full" style={{ background: `linear-gradient(to right, ${HEAT_STOPS.join(",")})` }} />
        <span>Loud</span>
        <span className="ml-2">{scale === "row" ? "relative to each issue's own peak" : "same scale for every issue"}</span>
      </div>
    </div>
  );
}
