// Sequential heat ramp for the spectrogram, dark (quiet) to hot (loud).
const STOPS = ["#161f36", "#2c2a6e", "#5f2a8c", "#a8307f", "#e2535a", "#f8923a", "#ffd166"];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** t in 0..1 -> interpolated color */
export function heat(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex(STOPS[i]);
  const b = hex(STOPS[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const HEAT_STOPS = STOPS;
