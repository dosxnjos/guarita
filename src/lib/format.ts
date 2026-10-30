// Formatação para o usuário (pt-BR ou espanhol latino, sempre no horário de Brasília) e regras puras das telas de
// mercado e relógio. Sem DOM: tudo aqui é testado em tests/format.test.ts (e o espanhol em tests/i18n.test.ts).
// Línguas: as funções com texto ou número aceitam `loc` no fim; sem ele, usam a língua atual do site (espelho não
// reativo em i18n/core.ts; a tela remonta ao trocar de língua). Fora do navegador (testes, app de PC) é sempre pt.
import type { AlertCondition, City, CityQuote, Confidence, Danger, Festivity, Flip, Quality, Verdict, ClockResponse } from '../../shared/types';
import { QUALITY_LABEL as QUALITY_LABEL_PT } from '../../shared/quality';
import { currentLocale, intlLocaleFor, type Locale } from './i18n/core';

export const TZ_BR = 'America/Sao_Paulo';
const DASH = '—';

type NumFmt = { int: Intl.NumberFormat; f1: Intl.NumberFormat; f2: Intl.NumberFormat };
const NUM_CACHE = new Map<Locale, NumFmt>();
function nf(loc: Locale): NumFmt {
  let f = NUM_CACHE.get(loc);
  if (!f) {
    const l = intlLocaleFor(loc);
    f = {
      int: new Intl.NumberFormat(l, { maximumFractionDigits: 0 }),
      f1: new Intl.NumberFormat(l, { minimumFractionDigits: 0, maximumFractionDigits: 1 }),
      f2: new Intl.NumberFormat(l, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    };
    NUM_CACHE.set(loc, f);
  }
  return f;
}
const es = (loc: Locale) => loc === 'es';

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Inteiro com separador de milhar: 1234567 → "1.234.567" (es: "1,234,567"). */
export function fmtInt(n: number | null | undefined, loc: Locale = currentLocale()): string {
  return isNum(n) ? nf(loc).int.format(Math.round(n)) : DASH;
}

/**
 * Prata. compact: 12.345 → "12,3 mil", 1.250.000 → "1,25 mi", 2e9 → "2 bi".
 * Espanhol: "12.3 mil", "1.25 M", "2 mil M" (nunca "billón": em espanhol é 10^12).
 */
export function fmtSilver(n: number | null | undefined, compact = false, loc: Locale = currentLocale()): string {
  if (!isNum(n)) return DASH;
  const f = nf(loc);
  if (!compact) return f.int.format(Math.round(n));
  const a = Math.abs(n);
  if (a >= 1e9) return `${f.f2.format(n / 1e9)} ${es(loc) ? 'mil M' : 'bi'}`;
  if (a >= 1e6) return `${f.f2.format(n / 1e6)} ${es(loc) ? 'M' : 'mi'}`;
  if (a >= 1e4) return `${f.f1.format(n / 1e3)} mil`;
  return f.int.format(Math.round(n));
}

/** Fração em porcentagem: 0.123 → "12,3%". sign: põe "+" no positivo. */
export function fmtPct(frac: number | null | undefined, sign = false, loc: Locale = currentLocale()): string {
  if (!isNum(frac)) return DASH;
  const s = `${nf(loc).f1.format(frac * 100)}%`;
  return sign && frac > 0 ? `+${s}` : s;
}

// ---------- idade do preço ----------

/** Idade em minutos → "agora", "há 12 min", "há 2 h 5 min", "há 3 h", "há 2 dias" (es: "ahora", "hace 12 min"…). */
export function fmtAge(min: number | null | undefined, loc: Locale = currentLocale()): string {
  const E = es(loc);
  if (!isNum(min)) return E ? 'sin datos' : 'sem dado';
  const m = Math.max(0, Math.round(min));
  const ago = E ? 'hace' : 'há';
  if (m < 1) return E ? 'ahora' : 'agora';
  if (m < 60) return `${ago} ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 3) return m % 60 ? `${ago} ${h} h ${m % 60} min` : `${ago} ${h} h`;
  if (h < 48) return `${ago} ${h} h`;
  const d = Math.floor(h / 24);
  return E ? `hace ${d} días` : `há ${d} dias`;
}

export type AgeTone = 'fresh' | 'stale' | 'old' | 'none';

/** Mesma régua da bolinha .age do app.css: até 1 h verde, até 6 h âmbar, mais velho cinza. */
export function ageTone(min: number | null | undefined): AgeTone {
  if (!isNum(min)) return 'none';
  if (min <= 60) return 'fresh';
  if (min <= 360) return 'stale';
  return 'old';
}

export function ageToneLabel(t: AgeTone, loc: Locale = currentLocale()): string {
  if (es(loc)) return { fresh: 'precio reciente', stale: 'precio de hace unas horas', old: 'precio antiguo', none: 'sin datos' }[t];
  return { fresh: 'preço recente', stale: 'preço de algumas horas', old: 'preço velho', none: 'sem dado' }[t];
}

// ---------- datas e relógio ----------

// Os dígitos de data e hora são os mesmos nas duas línguas (dd/mm/aaaa, 24 h); o formato é montado à mão.
function parts(d: Date, tz: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('pt-BR', { timeZone: tz, ...opts }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

const toDate = (v: string | number | Date): Date => (v instanceof Date ? v : new Date(v));

/** "29/10/2026 14:05" (Brasília por padrão). short: "29/10 14:05". */
export function fmtDateTime(v: string | number | Date | null | undefined, tz = TZ_BR, short = false): string {
  if (v === null || v === undefined || v === '') return DASH;
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return DASH;
  const p = parts(d, tz, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return short ? `${p.day}/${p.month} ${p.hour}:${p.minute}` : `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "14:05:33" (ou "14:05" sem segundos). */
export function fmtTime(v: string | number | Date, tz = TZ_BR, seconds = true): string {
  const p = parts(toDate(v), tz, { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, hourCycle: 'h23' });
  return seconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`;
}

/** "quinta-feira, 29 de outubro" (es: "jueves, 29 de octubre"). */
export function fmtLongDate(v: string | number | Date, tz = TZ_BR, loc: Locale = currentLocale()): string {
  return new Intl.DateTimeFormat(intlLocaleFor(loc), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(v));
}

/** "29/10" a partir de "2026-10-29" (data do history, sem fuso). */
export function fmtDayMonth(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}/${m[2]}` : ymd;
}

/** Contagem regressiva: "2 d 3 h", "3 h 04 min", "4 min 05 s", "agora" (es: "ahora"). */
export function fmtCountdown(ms: number, loc: Locale = currentLocale()): string {
  if (!isNum(ms) || ms <= 0) return es(loc) ? 'ahora' : 'agora';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${p2(m)} min`;
  return `${m} min ${p2(sec)} s`;
}

// ---------- qualidade, tier, cidade ----------

export const QUALITIES: Quality[] = [1, 2, 3, 4, 5];
export { QUALITY_LABEL } from '../../shared/quality';

/**
 * Qualidade como o cliente oficial em espanhol mostra (@ITEMDETAILS_STATS_QUALITY_1..5, docs/glossario-es.md).
 * Pegadinha: Excepcional = Notable e Excelente = Sobresaliente (não "Excelente").
 */
export const QUALITY_LABEL_ES: Record<Quality, string> = { 1: 'Normal', 2: 'Bueno', 3: 'Notable', 4: 'Sobresaliente', 5: 'Obra maestra' };

/** Nome da qualidade na língua atual. */
export function qualityName(q: Quality, loc: Locale = currentLocale()): string {
  return (es(loc) ? QUALITY_LABEL_ES : QUALITY_LABEL_PT)[q] ?? String(q);
}

/** Nome da cidade para mostrar: igual ao jogo; só o Black Market vira "Mercado Negro" em espanhol. */
export function cityName(city: City | string, loc: Locale = currentLocale()): string {
  return es(loc) && city === 'Black Market' ? 'Mercado Negro' : city;
}

/** Rótulo do selo de confiança (o valor da API é pt: alta, média, baixa, sem dado). */
export function confidenceText(label: Confidence['label'], loc: Locale = currentLocale()): string {
  if (!es(loc)) return label;
  return { alta: 'alta', 'média': 'media', baixa: 'baja', 'sem dado': 'sin datos' }[label] ?? label;
}

/** Rótulo do veredito (o valor da API é pt: barato, normal, caro, sem dado). */
export function verdictText(v: Verdict, loc: Locale = currentLocale()): string {
  if (!es(loc)) return v;
  return { barato: 'barato', normal: 'normal', caro: 'caro', 'sem dado': 'sin datos' }[v] ?? v;
}

export function parseQuality(s: string | null | undefined): Quality {
  const n = Number(s);
  return (Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1) as Quality;
}

/** Tier e encantamento a partir do id ("T4_BAG@2" → {tier:4, ench:2}); 0 quando não tem. */
export function tierFromId(id: string): { tier: number; ench: number } {
  const t = /^T(\d)_/.exec(id);
  const e = /@(\d)$/.exec(id);
  return { tier: t ? Number(t[1]) : 0, ench: e ? Number(e[1]) : 0 };
}

/** Classe CSS da cor de cada cidade (variáveis --city-* do app.css). */
export function citySlug(city: City): string {
  return city.toLowerCase().replace(/\s+/g, '-');
}

// ---------- selo, veredito, status ----------

export type Tone = 'good' | 'warn' | 'bad' | 'info' | '';

export function confidenceTone(label: Confidence['label']): Tone {
  return label === 'alta' ? 'good' : label === 'média' ? 'warn' : label === 'baixa' ? 'bad' : '';
}

export function verdictTone(v: Verdict): Tone {
  return v === 'barato' ? 'good' : v === 'caro' ? 'bad' : v === 'normal' ? 'info' : '';
}

export function dangerTone(label: Danger['label']): Tone {
  return label === 'perigoso' ? 'bad' : label === 'atenção' ? 'warn' : label === 'tranquilo' ? 'good' : '';
}

export function serverTone(s: ClockResponse['server']['status']): Tone {
  return s === 'online' ? 'good' : s === 'offline' ? 'bad' : s === 'manutenção' ? 'warn' : '';
}

export function serverLabel(s: ClockResponse['server']['status'], loc: Locale = currentLocale()): string {
  if (es(loc)) return { online: 'En línea', offline: 'Fuera de línea', 'manutenção': 'En mantenimiento', desconhecido: 'Estado desconocido' }[s] ?? 'Estado desconocido';
  return { online: 'Online', offline: 'Offline', 'manutenção': 'Em manutenção', desconhecido: 'Status desconhecido' }[s] ?? 'Status desconhecido';
}

export function trendArrow(t: ClockResponse['gold']['trend']): string {
  return t === 'subindo' ? '↑' : t === 'caindo' ? '↓' : t === 'estável' ? '→' : '';
}

// ---------- mercado ----------

/** Há algum preço (venda ou compra) em alguma cidade? */
export function hasAnyPrice(cities: CityQuote[]): boolean {
  return cities.some((c) => c.sellMin !== null || c.buyMax !== null);
}

/**
 * Cidade mais barata para comprar (sell order), fora o Black Market (que só compra).
 * Prefere selo alta/média; se nenhuma for confiável, devolve a mais barata com reliable=false.
 */
export function cheapestReliable(cities: CityQuote[]): { quote: CityQuote; reliable: boolean } | null {
  const withSell = cities.filter((c) => c.city !== 'Black Market' && isNum(c.sellMin) && (c.sellMin as number) > 0);
  if (!withSell.length) return null;
  const byPrice = (a: CityQuote, b: CityQuote) =>
    (a.sellMin as number) - (b.sellMin as number) || b.confidence.score - a.confidence.score;
  const good = withSell.filter((c) => c.confidence.label === 'alta' || c.confidence.label === 'média').sort(byPrice);
  if (good.length) return { quote: good[0], reliable: true };
  return { quote: [...withSell].sort(byPrice)[0], reliable: false };
}

/** Ordem da tabela: com venda primeiro (mais barata no topo), depois só compra, Black Market no fim. */
export function sortCities(cities: CityQuote[]): CityQuote[] {
  const rank = (c: CityQuote) => (c.city === 'Black Market' ? 2 : c.sellMin !== null ? 0 : 1);
  return [...cities].sort((a, b) => rank(a) - rank(b) || (a.sellMin ?? Infinity) - (b.sellMin ?? Infinity) || a.city.localeCompare(b.city));
}

/** Lucro e ROI do flip conforme o Premium escolhido. */
export function flipView(f: Flip, premium: boolean): { profit: number; roi: number | null } {
  const profit = premium ? f.profitPremium : f.profitNoPremium;
  return { profit, roi: f.buyAt > 0 ? profit / f.buyAt : null };
}

/** Flips ordenados por lucro (com o Premium escolhido), maior primeiro. */
export function sortFlips(flips: Flip[], premium: boolean): Flip[] {
  return [...flips].sort((a, b) => flipView(b, premium).profit - flipView(a, premium).profit);
}

/** O Black Market muda rápido: acima de 30 min (ou sem idade) a tela avisa para conferir no jogo. */
export const FLIP_STALE_MIN = 30;
export function flipIsStale(f: Flip): boolean {
  return f.ageMin === null || f.ageMin > FLIP_STALE_MIN;
}

/** Posição (0 a 1) de um valor numa faixa; fora da faixa fica preso nas pontas. */
export function rangePos(v: number, lo: number, hi: number): number {
  if (!(hi > lo)) return 0.5;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

// ---------- festividades ----------

export interface FestivityView extends Festivity {
  state: 'ativa' | 'próxima';
  /** Milissegundos até o fim (ativa) ou até o começo (próxima). */
  msLeft: number;
}

/** Separa ativas (ordenadas pelo fim) e próximas (pelo começo); descarta as encerradas. */
export function splitFestivities(list: Festivity[], now = Date.now()): { active: FestivityView[]; upcoming: FestivityView[] } {
  const active: FestivityView[] = [];
  const upcoming: FestivityView[] = [];
  for (const f of list) {
    const s = Date.parse(f.start);
    const e = Date.parse(f.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= now) continue;
    if (s <= now) active.push({ ...f, state: 'ativa', msLeft: e - now });
    else upcoming.push({ ...f, state: 'próxima', msLeft: s - now });
  }
  active.sort((a, b) => a.msLeft - b.msLeft);
  upcoming.sort((a, b) => a.msLeft - b.msLeft);
  return { active, upcoming };
}

/** Condição do alerta em texto curto: "abaixo de 12.000", "15% abaixo da mediana de 7 dias da cidade". */
export function alertConditionText(c: AlertCondition, loc: Locale = currentLocale()): string {
  const E = es(loc);
  if (c.kind === 'below') return `${E ? 'por debajo de' : 'abaixo de'} ${fmtSilver(c.price, false, loc)}`;
  if (c.kind === 'above') return `${E ? 'por encima de' : 'acima de'} ${fmtSilver(c.price, false, loc)}`;
  const pct = nf(loc).f1.format(c.pct);
  return E ? `${pct}% por debajo de la mediana de 7 días de la ciudad` : `${pct}% abaixo da mediana de 7 dias da cidade`;
}

/** Dado velho: o selo de "pode estar desatualizado" aparece depois de N minutos. */
export function isStale(iso: string | null | undefined, maxMin: number, now = Date.now()): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  return !Number.isFinite(t) || now - t > maxMin * 60000;
}
