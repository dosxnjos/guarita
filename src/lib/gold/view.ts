// Regras puras das telas Ouro e Saúde do dado (sem DOM; testadas em tests/gold.test.ts e tests/datahealth.test.ts).
// Textos nas duas línguas: `loc` no fim (padrão: a língua atual do site, como em format.ts).
import type { City, DataHealthCity, GoldResponse } from '../../../shared/types';
import { TZ_BR } from '../format';
import { currentLocale, type Locale } from '../i18n/core';

// ---------- ouro ----------

/** Fração das horas da janela com preço ABAIXO do atual (0 a 1). null sem dado. */
export function cheaperThanShare(points: GoldResponse['points'], current: number | null): number | null {
  if (current === null || !points.length) return null;
  let below = 0;
  for (const p of points) if (p.price < current) below++;
  return below / points.length;
}

/**
 * Quantos dias a série cobre de fato (arredondado). O AODP corta `gold.json?count=` em 720 pontos (30 dias) quando
 * a chamada não leva `date=` (o `getGold` já manda); a tela usa isto como rede para não chamar de "90 dias" uma
 * série que veio curta (buraco na fonte, reserva do cache).
 */
export function coveredDays(points: GoldResponse['points']): number {
  if (points.length < 2) return 0;
  const t0 = Date.parse(points[0].at);
  const t1 = Date.parse(points[points.length - 1].at);
  return Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0, Math.round(Math.abs(t1 - t0) / 86_400_000)) : 0;
}

/** Dia de Brasília (AAAA-MM-DD) de um instante ISO. */
export function dayBr(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

export interface GoldDay { date: string; min: number; max: number; avg: number; last: number }

/** Resumo por dia de Brasília (mais recente primeiro) para a tabela acessível do gráfico. */
export function goldDaily(points: GoldResponse['points']): GoldDay[] {
  const map = new Map<string, { min: number; max: number; sum: number; n: number; last: number; lastAt: string }>();
  for (const p of points) {
    const d = dayBr(p.at);
    const a = map.get(d);
    if (!a) map.set(d, { min: p.price, max: p.price, sum: p.price, n: 1, last: p.price, lastAt: p.at });
    else {
      a.min = Math.min(a.min, p.price);
      a.max = Math.max(a.max, p.price);
      a.sum += p.price;
      a.n++;
      if (p.at > a.lastAt) {
        a.last = p.price;
        a.lastAt = p.at;
      }
    }
  }
  return [...map]
    .map(([date, a]) => ({ date, min: a.min, max: a.max, avg: Math.round(a.sum / a.n), last: a.last }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Reduz a série para no máximo `max` pontos (mantém o primeiro e o último), para o caminho do SVG ficar leve. */
export function thin<T>(points: T[], max = 400): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

export function goldVerdictText(v: GoldResponse['verdict'], days: number, loc: Locale = currentLocale()): string {
  if (loc === 'es') {
    if (v === 'barato') return `Barato: por debajo del 1.er cuartil de los últimos ${days} días.`;
    if (v === 'caro') return `Caro: por encima del 3.er cuartil de los últimos ${days} días.`;
    if (v === 'normal') return `Normal: entre el 1.er y el 3.er cuartil de los últimos ${days} días.`;
    return 'No hay datos suficientes para comparar.';
  }
  if (v === 'barato') return `Barato: abaixo do 1º quartil dos últimos ${days} dias.`;
  if (v === 'caro') return `Caro: acima do 3º quartil dos últimos ${days} dias.`;
  if (v === 'normal') return `Normal: entre o 1º e o 3º quartil dos últimos ${days} dias.`;
  return 'Sem dado suficiente para comparar.';
}

// ---------- saúde do dado ----------

export type HealthTone = 'good' | 'warn' | 'bad';

/**
 * Nota da cidade: boa com idade mediana até 1 h e no máximo 25% da cesta sem preço; ruim com mediana acima de
 * 6 h, sem mediana ou mais da metade sem preço; atenção no meio.
 */
export function cityTone(c: DataHealthCity, basket: number): HealthTone {
  const missShare = basket > 0 ? c.missing / basket : 1;
  if (c.medianAgeMin === null || c.medianAgeMin > 360 || missShare > 0.5) return 'bad';
  if (c.medianAgeMin <= 60 && missShare <= 0.25) return 'good';
  return 'warn';
}

export function cityToneLabel(t: HealthTone, loc: Locale = currentLocale()): string {
  if (loc === 'es') return { good: 'Precios recientes', warn: 'Precios de hace unas horas', bad: 'Faltan escaneos' }[t];
  return { good: 'Preços frescos', warn: 'Preços de algumas horas', bad: 'Faltam scans' }[t];
}

/**
 * "Onde falta scan agora": as cidades em pior estado (sem preço + velhas, depois idade mediana), só as que não
 * estão boas. Até `max` cidades.
 */
export function needsScan(cities: DataHealthCity[], basket: number, max = 3): City[] {
  return cities
    .filter((c) => cityTone(c, basket) !== 'good')
    .sort((a, b) => b.missing + b.stale24h - (a.missing + a.stale24h) || (b.medianAgeMin ?? Infinity) - (a.medianAgeMin ?? Infinity))
    .slice(0, max)
    .map((c) => c.city);
}

/** Ordem da tabela: cidades reais primeiro (ordem do contrato), Black Market por último. */
export function sortHealth(cities: DataHealthCity[]): DataHealthCity[] {
  return [...cities].sort((a, b) => Number(a.city === 'Black Market') - Number(b.city === 'Black Market'));
}

/** Largura de barra em % (0 a 100). */
export function barPct(n: number, total: number): number {
  if (!(total > 0) || !(n > 0)) return 0;
  return Math.min(100, Math.round((n / total) * 100));
}

/** Lista "A, B e C" (es: "A, B y C"). */
export function joinPt(items: string[], loc: Locale = currentLocale()): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${loc === 'es' ? 'y' : 'e'} ${items[items.length - 1]}`;
}
