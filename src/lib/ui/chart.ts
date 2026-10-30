// Matemática dos gráficos em SVG (Sparkline, HistoryChart). Sem DOM: testada em tests/format.test.ts.

/** Mínimo e máximo com folga de 6%; valores iguais ganham uma faixa artificial para a linha não colar na borda. */
export function extent(values: number[], pad = 0.06): [number, number] {
  const v = values.filter((n) => Number.isFinite(n));
  if (!v.length) return [0, 1];
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (lo === hi) {
    const d = Math.abs(lo) * 0.1 || 1;
    return [lo - d, hi + d];
  }
  const d = (hi - lo) * pad;
  lo -= d;
  hi += d;
  return [Math.max(0, lo), hi];
}

/** Escala linear [d0, d1] → [r0, r1]. */
export function scale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** Caminho "M x y L x y ..." de pontos já em pixels. Ponto null quebra a linha (dia sem dado). */
export function linePath(points: ([number, number] | null)[]): string {
  let out = '';
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    out += `${pen ? 'L' : 'M'}${round(p[0])} ${round(p[1])}`;
    pen = true;
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Até `count` marcas "redondas" entre lo e hi (1, 2, 2,5 ou 5 × 10^n). */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

/** União ordenada das datas (AAAA-MM-DD) de várias séries, limitada às últimas `maxDays`. */
export function dateDomain(series: { days: { date: string }[] }[], maxDays = 30): string[] {
  const all = new Set<string>();
  for (const s of series) for (const d of s.days) all.add(d.date.slice(0, 10));
  return [...all].sort().slice(-maxDays);
}
