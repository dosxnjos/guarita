// Selo de confiança (0 a 100) e veredito barato/normal/caro. Lógica pura e determinística: o front, a API e o
// bot usam a mesma régua. Nada aqui chama a rede nem lê o relógio sem receber `now`.
//
// Régua do selo: score = fator de idade × qualidade do preço.
//   - fator de idade: até 30 min 1,0 (ótimo); até 2 h 0,85 (bom); até 6 h 0,6 (fraco); até 24 h 0,35; acima 0,1.
//   - qualidade começa em 100 e perde pontos: livro raso (até +5% do melhor preço: <10 un −10, <3 un −20,
//     vazio −25), desvio contra a mediana de 7 dias (>15% −8, >30% −20, >50% −45: provável isca/outlier),
//     compra acima da venda na mesma cidade (−30), volume diário médio baixo (<5/dia −20).
//   Sinal ausente (sem livro, sem histórico) não pune: só não ajuda.
//
// Línguas: `lang` 'es' muda só o texto dos motivos (a régua, o score e o rótulo, que é código, são os mesmos).
import type { BookLevel, Confidence, Verdict } from './types';
import type { ApiLang } from './lang';

export interface ConfidenceInput {
  /** Preço mostrado (normalmente o sellMin; buyMax quando a cidade só tem compra). */
  price: number | null;
  /** Idade do preço em minutos. */
  ageMin: number | null;
  /** Unidades no livro até +5% do melhor preço do mesmo lado; null = livro desconhecido. */
  depth?: number | null;
  /** Mediana de 7 dias de referência; null = sem histórico. */
  median7d?: number | null;
  /** Para checar compra > venda na mesma cidade. */
  sellMin?: number | null;
  buyMax?: number | null;
  /** Média de unidades vendidas por dia no histórico; null = sem histórico. */
  avgDailyVolume?: number | null;
}

/** Fator multiplicador pela idade do preço. */
export function ageFactor(ageMin: number | null): number {
  if (ageMin === null || !Number.isFinite(ageMin)) return 0.1;
  if (ageMin <= 30) return 1;
  if (ageMin <= 120) return 0.85;
  if (ageMin <= 360) return 0.6;
  if (ageMin <= 1440) return 0.35;
  return 0.1;
}

/** "visto agora", "visto há 12 min", "visto há 3 h", "visto há 2 dias" (es: "visto ahora", "visto hace 12 min"…). */
export function ageLabel(ageMin: number | null, lang: ApiLang = 'pt'): string {
  const es = lang === 'es';
  if (ageMin === null || !Number.isFinite(ageMin)) return es ? 'sin fecha' : 'sem data';
  if (ageMin < 1) return es ? 'visto ahora' : 'visto agora';
  const ago = es ? 'visto hace' : 'visto há';
  if (ageMin < 60) return `${ago} ${Math.round(ageMin)} min`;
  if (ageMin < 48 * 60) return `${ago} ${Math.round(ageMin / 60)} h`;
  return `${ago} ${Math.round(ageMin / 1440)} ${es ? 'días' : 'dias'}`;
}

/** Motivos do selo em espanhol (espanhol neutro; "livro de ofertas" = libro de órdenes, como no mercado do jogo). */
const REASON_ES: Record<string, string> = {
  'sem preço registrado': 'sin precio registrado',
  'sem livro de ofertas': 'sin libro de órdenes',
  'livro raso': 'libro de órdenes escaso',
  'muito abaixo da mediana': 'muy por debajo de la mediana',
  'muito acima da mediana': 'muy por encima de la mediana',
  'bem abaixo da mediana': 'bastante por debajo de la mediana',
  'bem acima da mediana': 'bastante por encima de la mediana',
  'compra acima da venda (suspeito)': 'compra por encima de la venta (sospechoso)',
  'pouco volume': 'poco volumen',
};

/** Todos os motivos fixos do selo (sem a idade), pt → es. Exportado para o teste de cobertura. */
export const CONFIDENCE_REASONS_ES: Readonly<Record<string, string>> = REASON_ES;

export function confidence(input: ConfidenceInput, lang: ApiLang = 'pt'): Confidence {
  const { price, ageMin } = input;
  const r = (pt: string) => (lang === 'es' ? REASON_ES[pt] ?? pt : pt);
  if (price === null || !(price > 0)) return { score: 0, label: 'sem dado', reasons: [r('sem preço registrado')] };

  const reasons: string[] = [ageLabel(ageMin, lang)];
  let quality = 100;

  const depth = input.depth;
  if (depth !== null && depth !== undefined) {
    if (depth <= 0) { quality -= 25; reasons.push(r('sem livro de ofertas')); }
    else if (depth < 3) { quality -= 20; reasons.push(r('livro raso')); }
    else if (depth < 10) { quality -= 10; reasons.push(r('livro raso')); }
  }

  const med = input.median7d;
  if (med && med > 0) {
    const dev = price / med - 1;
    const abs = Math.abs(dev);
    if (abs > 0.5) { quality -= 45; reasons.push(r(dev < 0 ? 'muito abaixo da mediana' : 'muito acima da mediana')); }
    else if (abs > 0.3) { quality -= 20; reasons.push(r(dev < 0 ? 'bem abaixo da mediana' : 'bem acima da mediana')); }
    else if (abs > 0.15) { quality -= 8; }
  }

  if (input.sellMin && input.buyMax && input.buyMax > input.sellMin) {
    quality -= 30;
    reasons.push(r('compra acima da venda (suspeito)'));
  }

  const vol = input.avgDailyVolume;
  if (vol !== null && vol !== undefined && vol < 5) { quality -= 20; reasons.push(r('pouco volume')); }

  const score = Math.max(1, Math.min(100, Math.round(ageFactor(ageMin) * Math.max(0, quality))));
  return { score, label: scoreLabel(score), reasons };
}

export function scoreLabel(score: number): Confidence['label'] {
  if (score >= 70) return 'alta';
  if (score >= 40) return 'média';
  if (score > 0) return 'baixa';
  return 'sem dado';
}

/** Veredito do preço contra a faixa P25–P75. */
export function verdict(price: number | null, p25: number | null, p75: number | null): Verdict {
  if (price === null || !(price > 0) || p25 === null || p75 === null) return 'sem dado';
  if (price < p25) return 'barato';
  if (price > p75) return 'caro';
  return 'normal';
}

/** Unidades no livro até `pct` acima (venda) ou abaixo (compra) do melhor preço daquele lado. */
export function bookDepth(levels: BookLevel[], side: 'sell' | 'buy', pct = 0.05): number {
  if (!levels.length) return 0;
  const best = side === 'sell' ? Math.min(...levels.map((l) => l.price)) : Math.max(...levels.map((l) => l.price));
  const limit = side === 'sell' ? best * (1 + pct) : best * (1 - pct);
  let n = 0;
  for (const l of levels) if (side === 'sell' ? l.price <= limit : l.price >= limit) n += l.amount;
  return n;
}

/** Quantil ponderado (peso = quantidade vendida, por exemplo). q em [0,1]. Sem valores → null. */
export function weightedQuantile(values: { value: number; weight: number }[], q: number): number | null {
  const v = values.filter((x) => Number.isFinite(x.value) && x.weight > 0).sort((a, b) => a.value - b.value);
  if (!v.length) return null;
  const total = v.reduce((s, x) => s + x.weight, 0);
  const target = q * total;
  let acc = 0;
  for (const x of v) {
    acc += x.weight;
    if (acc >= target) return x.value;
  }
  return v[v.length - 1].value;
}

/** Mediana simples. Sem valores → null. */
export function median(values: number[]): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
