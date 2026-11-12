"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Spectrogram, { type SpectroRow } from "./Spectrogram";

type Props = {
  rows: SpectroRow[];
  months: string[];
  loudest: Record<number, { slug: string; name: string; index: number }>;
};

/** Industry-wide spectrogram. Picking an issue shows which company is hit hardest and links straight to it. */
export default function HeroSpectrogram({ rows, months, loudest }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const router = useRouter();
  const pick = sel !== null ? loudest[sel] : null;
  const row = rows.find((r) => r.id === sel);

  return (
    <div>
      <Spectrogram rows={rows} months={months} sweep selectedId={sel} onSelectRow={(id) => setSel(id === sel ? null : id)} />
      <div className="mt-4 min-h-[52px] flex flex-wrap items-center gap-x-4 gap-y-2 border-t hairline pt-4">
        {pick && row ? (
          <>
            <p className="text-[14px] text-ink-2">
              <span className="text-ink font-medium">{row.label}</span> is hitting{" "}
              <span className="text-ink font-medium">{pick.name}</span> hardest, at {pick.index.toFixed(1)}× its peers&rsquo; share.
            </p>
            <button
              onClick={() => router.push(`/company/${pick.slug}/?issue=${sel}`)}
              className="rounded-full bg-ink text-bg px-4 h-9 text-[13px] font-semibold hover:bg-accent transition-colors"
            >
              Open {pick.name}
            </button>
          </>
        ) : (
          <p className="text-[14px] text-ink-3">Pick any issue to see which company it hits hardest. Orange dots mark issues spiking this quarter.</p>
        )}
      </div>
    </div>
  );
}
