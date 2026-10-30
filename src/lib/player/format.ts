// Formatação das telas de jogador e alertas: números pt-BR, datas em Brasília, rótulos PT-BR.
// Tudo puro (sem window): os testes em tests/player-ui.test.ts rodam em Node.
import { minutesSince } from '../../../shared/market';
import type { Danger } from '../../../shared/types';

const TZ = 'America/Sao_Paulo';
const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nfCompact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const dtf = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Inteiro com separador de milhar (12.345); traço quando não há número. */
export function fmtNum(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? nf.format(Math.round(n)) : '—';
}

/** Número com até 1 casa decimal (1,5). */
export function fmtDec(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? nf1.format(n) : '—';
}

/** Número curto para fama e prata grandes (1,2 mi; 350 mil). */
export function fmtCompact(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return Math.abs(n) < 10000 ? nf.format(Math.round(n)) : nfCompact.format(n);
}

/** Fração 0–1 em porcentagem inteira (0.42 → "42%"). */
export function fmtPct(f: number | null | undefined): string {
  return typeof f === 'number' && Number.isFinite(f) ? `${Math.round(f * 100)}%` : '—';
}

/** Data e hora em Brasília, formato brasileiro (29/10/2026 14:05). */
export function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : dtf.format(t).replace(',', '');
}

/** Minutos em texto curto: "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function fmtAgoMin(min: number | null | undefined): string {
  if (typeof min !== 'number' || !Number.isFinite(min)) return 'sem data';
  if (min < 1) return 'agora';
  if (min < 60) return `há ${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `há ${d} dias` : `há ${Math.floor(d / 30)} meses`;
}

/** "há X h" a partir de uma data ISO. */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  return fmtAgoMin(minutesSince(iso ?? null, now));
}

/** Classe da bolinha de idade (app.css): até 1 h fresh, até 6 h stale, mais velho cinza. */
export function ageClass(min: number | null | undefined): '' | 'fresh' | 'stale' {
  if (typeof min !== 'number') return '';
  if (min <= 60) return 'fresh';
  if (min <= 360) return 'stale';
  return '';
}

/** Tom visual do rótulo de perigo (classes tag good/warn/bad). */
export function dangerTone(label: Danger['label']): 'good' | 'warn' | 'bad' | '' {
  return label === 'tranquilo' ? 'good' : label === 'atenção' ? 'warn' : label === 'perigoso' ? 'bad' : '';
}

/** Frase de abertura do medidor de perigo. */
export function dangerHeadline(label: Danger['label']): string {
  switch (label) {
    case 'tranquilo': return 'Tranquilo';
    case 'atenção': return 'Atenção';
    case 'perigoso': return 'Perigoso';
    default: return 'Sem dado suficiente';
  }
}

export { QUALITY_LABEL, qualityLabel } from '../../../shared/quality';

const SLOT: Record<string, string> = {
  mainhand: 'Arma', offhand: 'Mão secundária', head: 'Cabeça', armor: 'Peitoral', shoes: 'Botas', bag: 'Bolsa',
  cape: 'Capa', mount: 'Montaria', potion: 'Poção', food: 'Comida', inventory: 'Inventário',
};
/** Rótulo PT-BR do espaço de equipamento (aceita "MainHand", "mainhand", "main_hand"). */
export function slotLabel(slot: string): string {
  return SLOT[slot.toLowerCase().replace(/[^a-z]/g, '')] ?? slot;
}

const PVE: Record<string, string> = {
  total: 'Total', royal: 'Reinos Reais', outlands: 'Terras Distantes', avalon: 'Estradas de Avalon',
  hellgate: 'Portões Infernais', corrupteddungeon: 'Masmorras Corrompidas', mists: 'Névoas',
};
const GATHER: Record<string, string> = {
  all: 'Total', total: 'Total', fiber: 'Fibra', hide: 'Couro', ore: 'Minério', rock: 'Pedra', wood: 'Madeira',
  fish: 'Pesca', fishing: 'Pesca', farming: 'Plantação', crafting: 'Fabricação',
};
const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');
export const pveLabel = (k: string) => PVE[norm(k)] ?? k;
export const gatherLabel = (k: string) => GATHER[norm(k)] ?? k;

export interface Bar {
  key: string;
  label: string;
  value: number;
}

/**
 * Transforma um Record de fama em barras ordenadas (maior primeiro), separando o total.
 * Ignora valores não numéricos, zerados e as chaves de total; o total cai para a soma se não vier.
 */
export function famBars(rec: Record<string, unknown> | null | undefined, label: (k: string) => string): { total: number; bars: Bar[] } {
  let total: number | null = null;
  const bars: Bar[] = [];
  for (const [key, v] of Object.entries(rec ?? {})) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const n = norm(key);
    if (n === 'total' || n === 'all') { total = v; continue; }
    if (v > 0) bars.push({ key, label: label(key), value: v });
  }
  bars.sort((a, b) => b.value - a.value);
  return { total: total ?? bars.reduce((s, b) => s + b.value, 0), bars };
}

/** Link do ícone oficial do item (render.albiononline.com). */
export function iconUrl(id: string, quality?: number, size = 64): string {
  const q = quality && quality > 1 ? `&quality=${quality}` : '';
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?size=${size}${q}`;
}

/** Caminho interno da página de item (com a qualidade quando não é a normal). */
export function itemHref(id: string, quality?: number): string {
  return `/item/${encodeURIComponent(id)}${quality && quality > 1 ? `?q=${quality}` : ''}`;
}

export function playerHref(id: string): string {
  return `/jogador/${encodeURIComponent(id)}`;
}

/** Plural simples: plural(1, 'kill', 'kills'). */
export function plural(n: number, one: string, many: string): string {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

/** Dado velho: o dossiê vem de cache; mais de 30 min já merece aviso. */
export function isStale(fetchedAt: string | null | undefined, now = Date.now(), limitMin = 30): boolean {
  const m = minutesSince(fetchedAt ?? null, now);
  return m !== null && m > limitMin;
}

/** Normaliza o termo de busca de jogador (sem espaço sobrando) e diz se dá para buscar. */
export function playerQuery(raw: string): { q: string; ok: boolean } {
  const q = raw.trim().replace(/\s+/g, ' ');
  return { q, ok: q.length >= 3 };
}

/** iPhone/iPad (inclusive iPad que se diz Mac com tela de toque). */
export function isIosUA(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}
