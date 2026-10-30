// Regras puras das telas de perdas PvP e de guilda (sem DOM; testadas em tests/losses.test.ts e tests/guild.test.ts).
import type { GuildSummary, LossItem } from '../../../shared/types';

const nf = new Intl.NumberFormat('pt-BR');

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

/** "30/10/2026" a partir de "2026-10-30" (dia sem fuso). */
export function fmtYmd(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Aviso de cobertura: "Coletando desde 30/10/2026; amostra de 1.234 mortes." (mesmo termo do bot e do MCP) */
export function coverageText(since: string | null, sampleKills?: number | null): string {
  const base = since ? `Coletando desde ${fmtYmd(since)}` : 'Coleta recém-iniciada';
  if (typeof sampleKills !== 'number') return `${base}.`;
  return `${base}; amostra de ${nf.format(sampleKills)} ${sampleKills === 1 ? 'morte' : 'mortes'}.`;
}

/** Rótulo do período da tela de perdas. */
export function periodLabel(days: number): string {
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
export function hourBands(hours: number[]): { label: string; total: number }[] {
  const sum = (a: number, b: number) => hours.slice(a, b).reduce((n, v) => n + (v || 0), 0);
  return [
    { label: 'Madrugada (0h–5h)', total: sum(0, 6) },
    { label: 'Manhã (6h–11h)', total: sum(6, 12) },
    { label: 'Tarde (12h–17h)', total: sum(12, 18) },
    { label: 'Noite (18h–23h)', total: sum(18, 24) },
  ];
}

/** Descrição do gráfico de horas para leitor de tela. */
export function hoursAria(hours: number[]): string {
  const total = hours.reduce((n, v) => n + (v || 0), 0);
  const peak = peakHours(hours);
  if (!total || !peak.length) return 'Sem kills registradas por hora.';
  const peakTxt = peak.slice(0, 3).map(hourLabel).join(', ');
  return `Kills por hora em Brasília: ${nf.format(total)} no total; pico às ${peakTxt}.`;
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

/** Endereço da página da guilda (nome com espaço vira %20). */
export function guildHref(name: string): string {
  return `/guilda/${encodeURIComponent(name.trim())}`;
}

/** Nome de guilda digitado: limpo e válido (3 a 64 caracteres). */
export function guildQuery(raw: string): { q: string; ok: boolean } {
  const q = raw.trim(); // espaços internos fazem parte do nome ("B A G R E")
  return { q, ok: q.length >= 3 && q.length <= 64 };
}
