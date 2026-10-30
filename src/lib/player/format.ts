// Formatação das telas de jogador e alertas: números pt-BR (ou espanhol latino), datas em Brasília, rótulos PT-BR/ES.
// Tudo puro (sem window): os testes em tests/player-ui.test.ts (e o espanhol em tests/player-i18n.test.ts) rodam em Node.
// Línguas: como em src/lib/format.ts, as funções com texto ou número aceitam `loc` no fim; sem ele, usam a língua
// atual do site (espelho não reativo em i18n/core.ts). Fora do navegador (testes, app de PC) é sempre pt.
import { minutesSince } from '../../../shared/market';
import type { Danger } from '../../../shared/types';
import { weaponLabelEsFromPt } from '../../../shared/weapons';
import { currentLocale, intlLocaleFor, type Locale } from '../i18n/core';

const TZ = 'America/Sao_Paulo';
type Nf = { int: Intl.NumberFormat; dec: Intl.NumberFormat; compact: Intl.NumberFormat };
const NF = new Map<Locale, Nf>();
function nf(loc: Locale): Nf {
  let f = NF.get(loc);
  if (!f) {
    const l = intlLocaleFor(loc);
    f = {
      int: new Intl.NumberFormat(l),
      dec: new Intl.NumberFormat(l, { maximumFractionDigits: 1 }),
      compact: new Intl.NumberFormat(l, { notation: 'compact', maximumFractionDigits: 1 }),
    };
    NF.set(loc, f);
  }
  return f;
}
// Datas: os dígitos são os mesmos nas duas línguas (dd/mm/aaaa, 24 h), como em src/lib/format.ts.
const dtf = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Inteiro com separador de milhar (12.345; es: 12,345); traço quando não há número. */
export function fmtNum(n: number | null | undefined, loc: Locale = currentLocale()): string {
  return isNum(n) ? nf(loc).int.format(Math.round(n)) : '—';
}

/** Número com até 1 casa decimal (1,5; es: 1.5). */
export function fmtDec(n: number | null | undefined, loc: Locale = currentLocale()): string {
  return isNum(n) ? nf(loc).dec.format(n) : '—';
}

/**
 * Número curto para fama e prata grandes (1,2 mi; 350 mil). Espanhol montado à mão, igual ao fmtSilver de
 * src/lib/format.ts ("1.2 M", "350 mil", "2 mil M"): o compacto do Intl em es-419 dá "350 k" e "2000 M".
 */
export function fmtCompact(n: number | null | undefined, loc: Locale = currentLocale()): string {
  if (!isNum(n)) return '—';
  const f = nf(loc);
  if (Math.abs(n) < 10000) return f.int.format(Math.round(n));
  if (loc !== 'es') return f.compact.format(n);
  const a = Math.abs(n);
  if (a >= 1e9) return `${f.dec.format(n / 1e9)} mil M`;
  if (a >= 1e6) return `${f.dec.format(n / 1e6)} M`;
  return `${f.dec.format(n / 1e3)} mil`;
}

/** Fração 0–1 em porcentagem inteira (0.42 → "42%"). */
export function fmtPct(f: number | null | undefined): string {
  return isNum(f) ? `${Math.round(f * 100)}%` : '—';
}

/** Data e hora em Brasília, formato brasileiro (29/10/2026 14:05). */
export function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : dtf.format(t).replace(',', '');
}

/** Minutos em texto curto: "agora", "há 5 min", "há 3 h", "há 2 dias" (es: "ahora", "hace 5 min"…). */
export function fmtAgoMin(min: number | null | undefined, loc: Locale = currentLocale()): string {
  const E = loc === 'es';
  if (!isNum(min)) return E ? 'sin fecha' : 'sem data';
  if (min < 1) return E ? 'ahora' : 'agora';
  const ago = E ? 'hace' : 'há';
  if (min < 60) return `${ago} ${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${ago} ${h} h`;
  const d = Math.floor(h / 24);
  if (E) return d < 60 ? `hace ${d} días` : `hace ${Math.floor(d / 30)} meses`;
  return d < 60 ? `há ${d} dias` : `há ${Math.floor(d / 30)} meses`;
}

/** "há X h" a partir de uma data ISO. */
export function fmtAgo(iso: string | null | undefined, now = Date.now(), loc: Locale = currentLocale()): string {
  return fmtAgoMin(minutesSince(iso ?? null, now), loc);
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
export function dangerHeadline(label: Danger['label'], loc: Locale = currentLocale()): string {
  const E = loc === 'es';
  switch (label) {
    case 'tranquilo': return 'Tranquilo';
    case 'atenção': return E ? 'Atención' : 'Atenção';
    case 'perigoso': return E ? 'Peligroso' : 'Perigoso';
    default: return E ? 'Sin datos suficientes' : 'Sem dado suficiente';
  }
}

export { QUALITY_LABEL, qualityLabel } from '../../../shared/quality';

const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');

const SLOT: Record<string, string> = {
  mainhand: 'Arma', offhand: 'Mão secundária', head: 'Cabeça', armor: 'Peitoral', shoes: 'Botas', bag: 'Bolsa',
  cape: 'Capa', mount: 'Montaria', potion: 'Poção', food: 'Comida', inventory: 'Inventário',
};
// Nomes dos espaços como o cliente em espanhol (glossário: peitoral = pecho, montaria = montura).
const SLOT_ES: Record<string, string> = {
  mainhand: 'Arma', offhand: 'Mano secundaria', head: 'Cabeza', armor: 'Pecho', shoes: 'Calzado', bag: 'Bolsa',
  cape: 'Capa', mount: 'Montura', potion: 'Poción', food: 'Comida', inventory: 'Inventario',
};
/** Rótulo do espaço de equipamento (aceita "MainHand", "mainhand", "main_hand"). */
export function slotLabel(slot: string, loc: Locale = currentLocale()): string {
  return (loc === 'es' ? SLOT_ES : SLOT)[norm(slot)] ?? slot;
}

const PVE: Record<string, string> = {
  total: 'Total', royal: 'Reinos Reais', outlands: 'Terras Distantes', avalon: 'Estradas de Avalon',
  hellgate: 'Portões Infernais', corrupteddungeon: 'Masmorras Corrompidas', mists: 'Névoas',
};
// Glossário: Continente Real, Tierras Lejanas, Caminos de Avalon, Hellgate, mazmorra corrupta, Nieblas (nunca "Brumas").
const PVE_ES: Record<string, string> = {
  total: 'Total', royal: 'Continente Real', outlands: 'Tierras Lejanas', avalon: 'Caminos de Avalon',
  hellgate: 'Hellgate', corrupteddungeon: 'Mazmorras corruptas', mists: 'Nieblas',
};
const GATHER: Record<string, string> = {
  all: 'Total', total: 'Total', fiber: 'Fibra', hide: 'Couro', ore: 'Minério', rock: 'Pedra', wood: 'Madeira',
  fish: 'Pesca', fishing: 'Pesca', farming: 'Plantação', crafting: 'Fabricação',
};
const GATHER_ES: Record<string, string> = {
  all: 'Total', total: 'Total', fiber: 'Fibra', hide: 'Piel', ore: 'Mineral', rock: 'Piedra', wood: 'Madera',
  fish: 'Pesca', fishing: 'Pesca', farming: 'Cultivo', crafting: 'Fabricación',
};
export const pveLabel = (k: string, loc: Locale = currentLocale()) => (loc === 'es' ? PVE_ES : PVE)[norm(k)] ?? k;
export const gatherLabel = (k: string, loc: Locale = currentLocale()) => (loc === 'es' ? GATHER_ES : GATHER)[norm(k)] ?? k;

// Família de arma em espanhol: tabela em shared/weapons.ts (o bot usa a mesma). A API manda só o rótulo PT (labelPt).
/** Rótulo da família de arma na língua atual, a partir do rótulo PT da API (desconhecido: devolve o PT). */
export function weaponLabel(labelPt: string, loc: Locale = currentLocale()): string {
  return loc === 'es' ? weaponLabelEsFromPt(labelPt) : labelPt;
}

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

/** Caminho interno da página de item (com a qualidade quando não é a normal). Sem língua: a tela passa por href(). */
export function itemHref(id: string, quality?: number): string {
  return `/item/${encodeURIComponent(id)}${quality && quality > 1 ? `?q=${quality}` : ''}`;
}

/** Caminho interno do dossiê. Sem língua: a tela passa por href(). */
export function playerHref(id: string): string {
  return `/jogador/${encodeURIComponent(id)}`;
}

/** Plural simples: plural(1, 'kill', 'kills'). */
export function plural(n: number, one: string, many: string, loc: Locale = currentLocale()): string {
  return `${fmtNum(n, loc)} ${n === 1 ? one : many}`;
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
