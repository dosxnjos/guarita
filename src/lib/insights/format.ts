// Regras puras das telas de perdas PvP e de guilda (sem DOM; testadas em tests/losses.test.ts e tests/guild.test.ts;
// o espanhol em tests/player-i18n.test.ts). Línguas: as funções com texto aceitam `loc` no fim; sem ele, usam a língua
// atual do site (espelho em i18n/core.ts). Fora do navegador (testes, bot, app de PC) é sempre pt.
import type { GuildSummary, LossItem } from '../../../shared/types';
import { currentLocale, intlLocaleFor, type Locale } from '../i18n/core';

const NF = new Map<Locale, Intl.NumberFormat>();
function nf(loc: Locale): Intl.NumberFormat {
  let f = NF.get(loc);
  if (!f) NF.set(loc, (f = new Intl.NumberFormat(intlLocaleFor(loc))));
  return f;
}

export type LossSort = 'count' | 'value';

/** Ordena por vezes perdido ou por valor perdido (sem preço vai para o fim no modo valor). */
export function sortLosses(items: LossItem[], by: LossSort): LossItem[] {
  if (by === 'count') return [...items].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return [...items].sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.count - a.count);
}

/** Soma do valor perdido dos itens com preço e quantos ficaram sem preço. */
export function lossTotals(items: LossItem[]): { value: number; priced: number; unpriced: number } {
  let value = 0;
  let priced = 0;
  for (const i of items) {
    if (i.value !== null) {
      value += i.value;
      priced++;
    }
  }
  return { value, priced, unpriced: items.length - priced };
}

/** "30/10/2026" a partir de "2026-10-30" (dia sem fuso; mesmo formato nas duas línguas). */
export function fmtYmd(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/**
 * Aviso de cobertura: "Coletando desde 30/10/2026; amostra de 1.234 mortes." (mesmo termo do bot e do MCP)
 * es: "Recopilando desde 30/10/2026; muestra de 1,234 muertes."
 */
export function coverageText(since: string | null, sampleKills?: number | null, loc: Locale = currentLocale()): string {
  const E = loc === 'es';
  const base = since
    ? `${E ? 'Recopilando desde' : 'Coletando desde'} ${fmtYmd(since)}`
    : E ? 'Recopilación recién iniciada' : 'Coleta recém-iniciada';
  if (typeof sampleKills !== 'number') return `${base}.`;
  if (E) return `${base}; muestra de ${nf(loc).format(sampleKills)} ${sampleKills === 1 ? 'muerte' : 'muertes'}.`;
  return `${base}; amostra de ${nf(loc).format(sampleKills)} ${sampleKills === 1 ? 'morte' : 'mortes'}.`;
}

/** Rótulo do período da tela de perdas. */
export function periodLabel(days: number, loc: Locale = currentLocale()): string {
  if (loc === 'es') return days <= 1 ? 'hoy' : `últimos ${days} días`;
  return days <= 1 ? 'hoje' : `últimos ${days} dias`;
}

/** Hora do dia em texto: 0 → "0h", 21 → "21h". */
export function hourLabel(h: number): string {
  return `${h}h`;
}

/** Horas de pico (as de maior contagem; empate devolve todas) ou [] sem nada. */
export function peakHours(hours: number[]): number[] {
  const max = Math.max(0, ...hours);
  if (max <= 0) return [];
  return hours.flatMap((v, i) => (v === max ? [i] : []));
}

/** Faixas de 6 h somadas (madrugada, manhã, tarde, noite), em Brasília. */
export function hourBands(hours: number[], loc: Locale = currentLocale()): { label: string; total: number }[] {
  const sum = (a: number, b: number) => hours.slice(a, b).reduce((n, v) => n + (v || 0), 0);
  const E = loc === 'es';
  return [
    { label: E ? 'Madrugada (0h–5h)' : 'Madrugada (0h–5h)', total: sum(0, 6) },
    { label: E ? 'Mañana (6h–11h)' : 'Manhã (6h–11h)', total: sum(6, 12) },
    { label: E ? 'Tarde (12h–17h)' : 'Tarde (12h–17h)', total: sum(12, 18) },
    { label: E ? 'Noche (18h–23h)' : 'Noite (18h–23h)', total: sum(18, 24) },
  ];
}

/** Descrição do gráfico de horas para leitor de tela. */
export function hoursAria(hours: number[], loc: Locale = currentLocale()): string {
  const E = loc === 'es';
  const total = hours.reduce((n, v) => n + (v || 0), 0);
  const peak = peakHours(hours);
  if (!total || !peak.length) return E ? 'Sin asesinatos registrados por hora.' : 'Sem kills registradas por hora.';
  const peakTxt = peak.slice(0, 3).map(hourLabel).join(', ');
  if (E) return `Asesinatos por hora en horario de Brasilia: ${nf(loc).format(total)} en total; pico a las ${peakTxt}.`;
  return `Kills por hora em Brasília: ${nf(loc).format(total)} no total; pico às ${peakTxt}.`;
}

/** Últimos `n` dias da série, mais antigo primeiro, com o maior valor para a escala das barras. */
export function lastDays(days: GuildSummary['days'], n = 14): { rows: GuildSummary['days']; max: number } {
  const rows = [...days].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-n);
  const max = Math.max(1, ...rows.map((d) => Math.max(d.kills, d.deaths)));
  return { rows, max };
}

/** Totais e razão kill/morte da série por dia. */
export function guildTotals(days: GuildSummary['days']): { kills: number; deaths: number; ratio: number | null } {
  const kills = days.reduce((n, d) => n + d.kills, 0);
  const deaths = days.reduce((n, d) => n + d.deaths, 0);
  return { kills, deaths, ratio: deaths > 0 ? kills / deaths : null };
}

/** Endereço da página da guilda (nome com espaço vira %20). Sem língua: a tela passa por href(). */
export function guildHref(name: string): string {
  return `/guilda/${encodeURIComponent(name.trim())}`;
}

/** Nome de guilda digitado: limpo e válido (3 a 64 caracteres). */
export function guildQuery(raw: string): { q: string; ok: boolean } {
  const q = raw.trim(); // espaços internos fazem parte do nome ("B A G R E")
  return { q, ok: q.length >= 3 && q.length <= 64 };
}
