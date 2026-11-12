/** Earshot wordmark: a small waveform glyph that gets louder, then the name. */
export default function Wordmark({ size = 18 }: { size?: number }) {
  const bars = [3, 6, 4, 9, 6, 12, 8, 15];
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size * 1.3} height={size} viewBox="0 0 26 18" aria-hidden>
        {bars.map((h, i) => (
          <rect key={i} x={i * 3.3} y={(18 - h) / 2} width={2} height={h} rx={1} fill={i > 5 ? "var(--color-heat-5)" : "var(--color-accent)"} opacity={0.45 + i * 0.07} />
        ))}
      </svg>
      <span className="display font-semibold" style={{ fontSize: size, letterSpacing: "-0.02em" }}>earshot</span>
    </span>
  );
}
