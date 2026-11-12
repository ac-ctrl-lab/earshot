"use client";

import { useRef } from "react";
import { fmtMonth } from "@/lib/model";

type Props = {
  months: string[];
  totals: number[];
  value: number;
  min: number;
  onChange: (i: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
};

/** Scrubber whose track is the company's own complaint volume. Drag, click, or use arrow keys. */
export default function Timeline({ months, totals, value, min, onChange, playing, onTogglePlay }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const peak = Math.max(1, ...totals);
  const n = months.length;

  const fromPointer = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    const i = Math.round(((clientX - rect.left) / rect.width) * n - 0.5);
    onChange(Math.max(min, Math.min(n - 1, i)));
  };

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={onTogglePlay}
        className="shrink-0 w-11 h-11 rounded-full bg-ink text-bg grid place-items-center hover:bg-accent transition-colors"
        aria-label={playing ? "Pause" : "Play how issues developed over time"}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="1" width="3" height="10" rx="1" fill="currentColor" /><rect x="7" y="1" width="3" height="10" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /></svg>
        )}
      </button>

      <div
        ref={track}
        className="relative flex-1 h-12 cursor-pointer touch-none"
        role="slider"
        tabIndex={0}
        aria-label="Month"
        aria-valuemin={min}
        aria-valuemax={n - 1}
        aria-valuenow={value}
        aria-valuetext={fmtMonth(months[value])}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onChange(Math.max(min, value - 1));
          if (e.key === "ArrowRight") onChange(Math.min(n - 1, value + 1));
          if (e.key === "Home") onChange(min);
          if (e.key === "End") onChange(n - 1);
        }}
      >
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {totals.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-[2px] transition-colors duration-300"
              style={{
                height: `${Math.max(6, (v / peak) * 100)}%`,
                background: i < min ? "var(--color-line)" : i <= value ? "var(--color-accent)" : "var(--color-raised)",
                opacity: i <= value ? 0.35 + 0.65 * (v / peak) : 1,
              }}
            />
          ))}
        </div>
        <div
          className="absolute -top-1 -bottom-1 w-[3px] -ml-[1.5px] rounded-full bg-ink transition-[left] duration-200"
          style={{ left: `${((value + 0.5) / n) * 100}%`, boxShadow: "0 0 12px rgba(233,237,248,0.8)" }}
        />
      </div>

      <span className="shrink-0 w-[5.5rem] text-right display text-[17px] font-semibold tabular-nums">{fmtMonth(months[value])}</span>
    </div>
  );
}
