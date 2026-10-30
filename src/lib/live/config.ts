// Painel de live para o OBS (/live): configuração lida da query string e regras puras dos blocos.
// Sem DOM: tudo aqui é testado em tests/live.test.ts.
//   /live?blocos=relogio,precos,guilda&itens=T4_BAG,T5_BAG&guilda=Nome&tema=escuro&tamanho=1.2&cidade=Caerleon
// Valor inválido é descartado em silêncio (a página no OBS não tem como mostrar erro de digitação a ninguém);
// a tela de configuração (?config) é quem monta a URL certa.
import type { City, CityQuote, Festivity, GuildSummary, ItemResponse } from '../../../shared/types';
import { ALL_CITIES } from '../../../shared/market';
import { festivityLabel } from '../../../shared/festivities';
import { cheapestReliable } from '../format';
import { currentLocale, localizePath, type Locale } from '../i18n/core';

export type LiveBlock = 'relogio' | 'precos' | 'guilda';
export type LiveTheme = 'escuro' | 'claro';

export interface LiveConfig {
  /** Blocos na ordem em que aparecem no painel. */
  blocks: LiveBlock[];
  /** Ids de item do AODP em maiúsculas (até LIVE_MAX_ITEMS). */
  items: string[];
  /** Nome exato da guilda ('' sem guilda). */
  guild: string;
  theme: LiveTheme;
  /** Escala da tipografia (1 = tamanho padrão). */
  scale: number;
  /** Cidade fixa para o preço; null = a mais barata com preço confiável. */
  city: City | null;
}

export const LIVE_BLOCKS: LiveBlock[] = ['relogio', 'precos', 'guilda'];
export const LIVE_BLOCK_LABEL: Record<LiveBlock, string> = {
  relogio: 'Relógio do servidor',
  precos: 'Preços dos itens',
  guilda: 'Histórico da guilda',
};
export const LIVE_BLOCK_LABEL_ES: Record<LiveBlock, string> = {
  relogio: 'Reloj del servidor',
  precos: 'Precios de los objetos',
  guilda: 'Historial del gremio',
};
/** Rótulo do bloco na língua pedida (padrão: a atual do site). */
export function liveBlockLabel(b: LiveBlock, loc: Locale = currentLocale()): string {
  return (loc === 'es' ? LIVE_BLOCK_LABEL_ES : LIVE_BLOCK_LABEL)[b];
}
/** Cada item é uma consulta de preço (até 9 chamadas no Worker): poucos itens por painel. */
export const LIVE_MAX_ITEMS = 6;
export const LIVE_SCALE_MIN = 0.6;
export const LIVE_SCALE_MAX = 3;
export const GUILD_MAX = 64;
/** Intervalos de atualização (o enunciado pede 60 a 120 s; a API já guarda em cache do lado dela). */
export const LIVE_REFRESH_MS = { clock: 120_000, prices: 90_000, guild: 120_000 } as const;

const ITEM_RE = /^T[1-8]_[A-Z0-9_]+(@[1-4])?$/;

function toSearch(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
}

/** Lista separada por vírgula, sem vazios. */
function list(v: string | null): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseBlocks(v: string | null): LiveBlock[] {
  const out: LiveBlock[] = [];
  for (const raw of list(v)) {
    const b = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') as LiveBlock;
    if (LIVE_BLOCKS.includes(b) && !out.includes(b)) out.push(b);
  }
  return out;
}

export function parseItems(v: string | null): string[] {
  const out: string[] = [];
  for (const raw of list(v)) {
    const id = raw.toUpperCase();
    if (ITEM_RE.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= LIVE_MAX_ITEMS) break;
  }
  return out;
}

export function parseGuild(v: string | null): string {
  const g = (v ?? '').trim();
  return g.length >= 3 && g.length <= GUILD_MAX ? g : '';
}

export function parseTheme(v: string | null): LiveTheme {
  return (v ?? '').trim().toLowerCase() === 'claro' ? 'claro' : 'escuro';
}

export function parseScale(v: string | null): number {
  const n = Number((v ?? '').trim().replace(',', '.'));
  if (!v || !Number.isFinite(n) || n <= 0) return 1;
  return Math.round(Math.min(LIVE_SCALE_MAX, Math.max(LIVE_SCALE_MIN, n)) * 100) / 100;
}

export function parseCity(v: string | null): City | null {
  const key = (v ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!key) return null;
  return ALL_CITIES.find((c) => c.toLowerCase() === key && c !== 'Black Market') ?? null;
}

/**
 * Lê a configuração do painel. Sem `blocos`, mostra o que faz sentido com o resto: relógio sempre, preços se houver
 * itens, guilda se houver nome. Bloco pedido sem o dado dele (preços sem itens, guilda sem nome) sai do painel.
 */
export function parseLiveConfig(search: string | URLSearchParams): LiveConfig {
  const p = toSearch(search);
  const items = parseItems(p.get('itens'));
  const guild = parseGuild(p.get('guilda'));
  const asked = p.has('blocos') ? parseBlocks(p.get('blocos')) : (['relogio', 'precos', 'guilda'] as LiveBlock[]);
  const blocks = asked.filter((b) => (b === 'precos' ? items.length > 0 : b === 'guilda' ? guild !== '' : true));
  return {
    blocks: blocks.length ? blocks : ['relogio'],
    items,
    guild,
    theme: parseTheme(p.get('tema')),
    scale: parseScale(p.get('tamanho')),
    city: parseCity(p.get('cidade')),
  };
}

/** Sem parâmetro nenhum, ou com `?config`, a página abre a configuração em vez do painel. */
export function isConfigMode(search: string | URLSearchParams): boolean {
  const p = toSearch(search);
  return p.has('config') || [...p.keys()].length === 0;
}

/** Query string do painel (sem o "?"), só com o que difere do padrão. Inverso de parseLiveConfig. */
export function buildLiveQuery(cfg: LiveConfig): string {
  const p = new URLSearchParams();
  const blocks = cfg.blocks.filter((b) => (b === 'precos' ? cfg.items.length > 0 : b === 'guilda' ? !!cfg.guild.trim() : true));
  p.set('blocos', (blocks.length ? blocks : ['relogio']).join(','));
  if (blocks.includes('precos')) p.set('itens', cfg.items.slice(0, LIVE_MAX_ITEMS).join(','));
  if (blocks.includes('guilda')) p.set('guilda', cfg.guild.trim());
  if (cfg.theme !== 'escuro') p.set('tema', cfg.theme);
  if (cfg.scale !== 1) p.set('tamanho', String(cfg.scale));
  if (cfg.city && blocks.includes('precos')) p.set('cidade', cfg.city);
  // Vírgula e @ legíveis na URL (o URLSearchParams escreveria %2C e %40); o parse aceita os dois.
  return p.toString().replace(/%2C/gi, ',').replace(/%40/g, '@');
}

/** Endereço do painel na língua pedida (padrão: a atual do site): em espanhol, /es/live, e o painel no OBS sai em espanhol. */
export function buildLiveUrl(cfg: LiveConfig, origin: string, loc: Locale = currentLocale()): string {
  return `${origin.replace(/\/+$/, '')}${localizePath('/live', loc)}?${buildLiveQuery(cfg)}`;
}

// ---------- blocos ----------

export interface LiveBonuses {
  /** Produção em bônus hoje (kind 2), sem o prefixo "Bônus de produção:". */
  production: string[];
  /** Milissegundos até o fim do primeiro bônus de produção a acabar. */
  productionMsLeft: number | null;
  /** Bônus de atividade (kind 1), ex.: "Pontos de facção em dobro". */
  activities: string[];
  /** Eventos sazonais (kind 0), ex.: "Halloween 2026". */
  seasonal: string[];
}

/** Festividades ativas agrupadas para caber em poucas linhas no painel (as encerradas e futuras ficam fora). */
export function liveBonuses(list: Festivity[], now = Date.now(), loc: Locale = currentLocale()): LiveBonuses {
  const out: LiveBonuses = { production: [], productionMsLeft: null, activities: [], seasonal: [] };
  for (const f of list) {
    const s = Date.parse(f.start);
    const e = Date.parse(f.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s > now || e <= now) continue;
    const add = (arr: string[], v: string) => { if (v && !arr.includes(v)) arr.push(v); };
    // Em espanhol o rótulo sai de festivityLabelEs (a API manda só o PT em labelPt).
    const label = festivityLabel(f, loc);
    if (f.kind === 2) {
      add(out.production, label.replace(/^b[oô]nus de produ[cç][aã]o:\s*/i, '').replace(/^bonificaci[oó]n de producci[oó]n:\s*/i, ''));
      out.productionMsLeft = out.productionMsLeft === null ? e - now : Math.min(out.productionMsLeft, e - now);
    } else if (f.kind === 0) add(out.seasonal, label);
    else add(out.activities, label);
  }
  return out;
}

export interface LivePrice {
  price: number | null;
  city: City | null;
  ageMin: number | null;
  /** false quando nenhuma cidade tem selo alta/média e a mais barata vai assim mesmo. */
  reliable: boolean;
}

/** Preço do item para o painel: a cidade escolhida ou a venda mais barata (fora o Black Market). */
export function livePrice(item: ItemResponse | null | undefined, city: City | null): LivePrice {
  const none: LivePrice = { price: null, city, ageMin: null, reliable: false };
  if (!item) return none;
  if (city) {
    const q: CityQuote | undefined = item.cities.find((c) => c.city === city);
    if (!q || q.sellMin === null || !(q.sellMin > 0)) return none;
    return { price: q.sellMin, city, ageMin: q.ageMin, reliable: q.confidence.label === 'alta' || q.confidence.label === 'média' };
  }
  const best = cheapestReliable(item.cities);
  if (!best) return none;
  return { price: best.quote.sellMin, city: best.quote.city, ageMin: best.quote.ageMin, reliable: best.reliable };
}

export interface LiveGuildStats {
  /** Dia do servidor (UTC, AAAA-MM-DD) de "hoje". */
  today: string;
  todayKills: number;
  todayDeaths: number;
  weekKills: number;
  weekDeaths: number;
  top: { name: string; kills: number }[];
}

/** Dia UTC (o KillLog agrupa por dia do servidor). */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Kills e mortes do dia do servidor, dos últimos 7 dias (contando hoje) e os 3 que mais mataram. */
export function liveGuildStats(g: GuildSummary, now = Date.now(), topN = 3): LiveGuildStats {
  const today = utcDay(now);
  const since = utcDay(now - 6 * 86_400_000);
  let weekKills = 0;
  let weekDeaths = 0;
  let todayKills = 0;
  let todayDeaths = 0;
  for (const d of g.days) {
    if (d.date < since || d.date > today) continue;
    weekKills += d.kills;
    weekDeaths += d.deaths;
    if (d.date === today) {
      todayKills += d.kills;
      todayDeaths += d.deaths;
    }
  }
  const top = [...g.topKillers].sort((a, b) => b.kills - a.kills).slice(0, topN).map((k) => ({ name: k.name, kills: k.kills }));
  return { today, todayKills, todayDeaths, weekKills, weekDeaths, top };
}
