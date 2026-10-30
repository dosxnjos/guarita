// Ferramentas do servidor MCP (módulo e da Fase 2): validação dos argumentos, chamada às funções de dado que a
// API e o bot já usam e resumo em texto PT-BR + structuredContent enxuto. Só dado público; nunca alertas, ids do
// Discord nem segredos. Item se resolve pelas fatias pequenas de worker/lib/acIndex.ts (o índice inteiro estoura a
// CPU do plano grátis).
import type { Env } from '../env';
import type { ClockResponse, CityQuote, Flip, ItemResponse, LossesResponse, PlayerDossier, PlayerHit, Quality, KillEvent } from '../../shared/types';
import { acLabel, acSearch } from '../lib/acIndex';
import { AodpError } from '../lib/aodp';
import { GameinfoError } from '../lib/gameinfo';
import { getItem } from '../api/market';
import { getClock } from '../api/clock';
import { getDossier, searchPlayers, MSG_GAMEINFO_DOWN, MSG_NOT_FOUND } from '../api/player';
import { getLosses } from '../api/insights';
import { minutesSince, PREMIUM_30D_GOLD } from '../../shared/market';
import { qualityLabel } from '../../shared/quality';
import { MCP_TOOLS, type McpToolDef } from './catalog';
import { getHoje, LIMITS as HOJE_LIMITS } from '../api/hoje';
import { HOJE_MINUTOS } from '../discord/commands';
import type { HojeResponse as HojeResponseX } from '../../shared/types';

export const SITE = 'https://guarita.pages.dev';

export interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Ferramenta inexistente: o servidor traduz em erro JSON-RPC -32602. */
export class UnknownToolError extends Error {
  constructor(readonly tool: string) {
    super(`Ferramenta desconhecida: ${tool}`);
    this.name = 'UnknownToolError';
  }
}

/** Erro com mensagem já pronta para o usuário (argumento inválido, item não achado). */
export class ToolUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolUserError';
  }
}

/** Definições como o tools/list devolve (sem os campos que só a página usa). */
export function listTools(): Omit<McpToolDef, 'example'>[] {
  return MCP_TOOLS.map(({ example: _example, ...def }) => def);
}

// ---------- formatação PT-BR (texto puro, sem marcação do Discord) ----------

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function fmtInt(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : intFmt.format(Math.round(n));
}
function fmtDec(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : decFmt.format(n);
}
function fmtPct(frac: number | null | undefined): string {
  return frac == null || !Number.isFinite(frac) ? '—' : pctFmt.format(frac);
}
/** "09/11/2026 08:00" em horário de Brasília. */
export function fmtDateBr(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return dateFmt.format(new Date(iso)).replace(',', '');
}
/** Idade em minutos → "agora", "há 12 min", "há 3 h", "há 2 dias". */
export function ageLabel(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return 'sem data';
  if (min < 1) return 'agora';
  if (min < 60) return `há ${Math.round(min)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(min / 1440)} dias`;
}
function ageOf(iso: string | null | undefined, now: number): string {
  return ageLabel(minutesSince(iso ?? null, now));
}

const VERDICT_TEXT = { barato: 'barato', normal: 'preço normal', caro: 'caro', 'sem dado': 'sem dado suficiente' } as const;
/** Preço com mais de 6 h: o texto pede para conferir no jogo. */
const STALE_MIN = 6 * 60;

function cheapest(cities: CityQuote[]): CityQuote | null {
  return cities.filter((c) => c.city !== 'Black Market' && c.sellMin != null).sort((a, b) => a.sellMin! - b.sellMin!)[0] ?? null;
}
function profitableFlips(flips: Flip[]): Flip[] {
  return flips.filter((f) => f.profitPremium > 0).sort((a, b) => b.profitPremium - a.profitPremium);
}
export function itemUrl(id: string, quality = 1): string {
  return `${SITE}/item/${encodeURIComponent(id)}${quality > 1 ? `?q=${quality}` : ''}`;
}
export function playerUrl(id: string): string {
  return `${SITE}/jogador/${encodeURIComponent(id)}`;
}

// ---------- resumos (puros, exportados para teste) ----------

export function summarizeSearch(query: string, hits: { id: string; label: string }[]): ToolResult {
  if (!hits.length) {
    return text(
      `Nenhum item encontrado para “${query}”. Tente outra grafia, o nome em inglês ou só a palavra principal (ex.: "bolsa", "espada larga").`,
      { consulta: query, itens: [] },
    );
  }
  const lines = hits.map((h) => `- ${h.label} · id ${h.id}`);
  return text(`Itens encontrados para “${query}” (${hits.length}):\n${lines.join('\n')}\n\nUse o id em preco_item para ver o preço.`, {
    consulta: query,
    itens: hits.map((h) => ({ id: h.id, nome: h.label })),
  });
}

/** structuredContent do preço: sem histórico diário nem livro de ofertas (pesados e pouco úteis para o modelo). */
export function slimItem(item: ItemResponse, label: string) {
  return {
    id: item.id,
    nome: label,
    qualidade: item.quality,
    qualidadeNome: qualityLabel(item.quality),
    consultadoEm: item.fetchedAt,
    mediana7d: item.median7d,
    faixaNormal: { p25: item.p25, p75: item.p75 },
    cidades: item.cities.map((c) => ({
      cidade: c.city,
      menorVenda: c.sellMin,
      menorVendaEm: c.sellMinAt,
      maiorCompra: c.buyMax,
      maiorCompraEm: c.buyMaxAt,
      idadeMin: c.ageMin,
      confianca: c.confidence.label,
      veredito: c.verdict,
    })),
    flips: profitableFlips(item.flips).slice(0, 3).map((f) => ({
      comprarEm: f.from,
      precoCompra: f.buyAt,
      venderNoBlackMarket: f.sellAt,
      lucroComPremium: f.profitPremium,
      lucroSemPremium: f.profitNoPremium,
      retorno: f.roi,
      idadeMin: f.ageMin,
    })),
    link: itemUrl(item.id, item.quality),
  };
}

export function summarizeItem(item: ItemResponse, label: string, now = Date.now()): ToolResult {
  const out: string[] = [`${label} (${item.id}) · qualidade ${qualityLabel(item.quality)} · servidor Americas`];
  const cheap = cheapest(item.cities);
  if (cheap) {
    out.push(`Mais barato para comprar: ${cheap.city}, ${fmtInt(cheap.sellMin)} prata (visto ${ageOf(cheap.sellMinAt, now)}).`);
    const age = minutesSince(cheap.sellMinAt, now) ?? cheap.ageMin;
    if (age != null && age > STALE_MIN) out.push('Atenção: o preço mais barato é antigo; confirme no jogo antes de comprar.');
    if (cheap.verdict !== 'sem dado') out.push(`Veredito em ${cheap.city}: ${VERDICT_TEXT[cheap.verdict]}, comparado aos últimos dias.`);
  } else {
    out.push('Nenhuma cidade com ordem de venda conhecida agora. O dado vem de jogadores que rodam o cliente do Albion Data Project.');
  }
  if (item.median7d != null) {
    const range = item.p25 != null && item.p75 != null ? ` (faixa normal de ${fmtInt(item.p25)} a ${fmtInt(item.p75)})` : '';
    out.push(`Mediana de 7 dias: ${fmtInt(item.median7d)} prata${range}.`);
  }
  const order = [...item.cities].sort((a, b) => {
    if (a.city === 'Black Market') return 1;
    if (b.city === 'Black Market') return -1;
    return (a.sellMin ?? Infinity) - (b.sellMin ?? Infinity);
  });
  out.push('', 'Por cidade:');
  for (const c of order) out.push(`- ${cityLine(c, now)}`);
  const flip = profitableFlips(item.flips)[0];
  out.push(
    '',
    flip
      ? `Melhor flip para o Black Market: comprar em ${flip.from} por ${fmtInt(flip.buyAt)} e vender por ${fmtInt(flip.sellAt)}; ` +
          `lucro de ${fmtInt(flip.profitPremium)} com Premium (${fmtInt(flip.profitNoPremium)} sem), retorno ${fmtPct(flip.roi)}, dado ${ageLabel(flip.ageMin)}.`
      : 'Nenhum flip lucrativo para o Black Market agora.',
  );
  out.push(`Consultado ${ageOf(item.fetchedAt, now)} · ${itemUrl(item.id, item.quality)}`);
  return text(out.join('\n'), slimItem(item, label));
}

function cityLine(c: CityQuote, now: number): string {
  const bm = c.city === 'Black Market';
  if (bm) {
    return c.buyMax == null
      ? 'Black Market: sem ordem de compra conhecida'
      : `Black Market (venda instantânea): ${fmtInt(c.buyMax)} prata, ${ageOf(c.buyMaxAt, now)}`;
  }
  const parts: string[] = [];
  parts.push(c.sellMin == null ? 'venda sem dado' : `venda ${fmtInt(c.sellMin)} (${ageOf(c.sellMinAt, now)})`);
  if (c.buyMax != null) parts.push(`compra ${fmtInt(c.buyMax)} (${ageOf(c.buyMaxAt, now)})`);
  if (c.sellMin != null) parts.push(`confiança ${c.confidence.label}`);
  return `${c.city}: ${parts.join(' · ')}`;
}

const SERVER_TEXT: Record<ClockResponse['server']['status'], string> = {
  online: 'online',
  offline: 'offline',
  manutenção: 'em manutenção',
  desconhecido: 'com status desconhecido',
};

export function summarizeClock(c: ClockResponse, now = Date.now()): ToolResult {
  const out: string[] = [`Agora: ${fmtDateBr(new Date(now).toISOString())} (horário de Brasília).`];
  const msg = c.server.message?.trim();
  out.push(`Servidor Americas: ${SERVER_TEXT[c.server.status] ?? SERVER_TEXT.desconhecido}${msg ? ` (${msg.slice(0, 200)})` : ''}, conferido ${ageOf(c.server.checkedAt, now)}.`);
  const active = c.festivities.filter((f) => Date.parse(f.start) <= now && Date.parse(f.end) > now);
  const next = c.festivities.filter((f) => Date.parse(f.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 5);
  out.push(active.length ? 'Bônus ativos:' : 'Nenhum bônus ativo agora.');
  for (const f of active.slice(0, 10)) out.push(`- ${f.labelPt || f.name}, até ${fmtDateBr(f.end)}`);
  if (next.length) {
    out.push('Próximas festividades:');
    for (const f of next) out.push(`- ${f.labelPt || f.name}, começa ${fmtDateBr(f.start)}`);
  }
  const g = c.gold;
  out.push(
    g.price != null
      ? `Ouro: ${fmtInt(g.price)} prata por ouro${g.trend !== 'sem dado' ? `, ${g.trend}` : ''}${g.p30 != null ? ` (média de 30 dias: ${fmtInt(g.p30)})` : ''}${g.at ? `, cotação ${ageOf(g.at, now)}` : ''}.`
      : 'Ouro: sem cotação agora.',
  );
  out.push(
    c.premiumSilver != null
      ? `Premium de 30 dias: ${fmtInt(PREMIUM_30D_GOLD)} ouro, cerca de ${fmtInt(c.premiumSilver)} prata.`
      : 'Premium: sem cotação do ouro para converter.',
  );
  out.push(`${c.season.name}: termina por volta de ${fmtDateBr(c.season.end)} (data aproximada, sem anúncio oficial confirmado).`);
  return text(out.join('\n'), c as unknown as Record<string, unknown>);
}

export function summarizePlayerList(query: string, players: PlayerHit[]): ToolResult {
  const top = players.slice(0, 10);
  const lines = top.map((p) => `- ${p.name}${p.guild ? ` · guilda ${p.guild}` : ' · sem guilda'} · fama de abate ${fmtInt(p.killFame)}`);
  const more = players.length > top.length ? `\n…e mais ${players.length - top.length}.` : '';
  return text(
    `Nenhum nome bate exatamente com “${query}”. Jogadores parecidos no Americas:\n${lines.join('\n')}${more}\n\nChame dossie_jogador de novo com o nome exato.`,
    {
      consulta: query,
      candidatos: top.map((p) => ({ nome: p.name, guilda: p.guild, alianca: p.alliance, famaAbate: p.killFame, famaMorte: p.deathFame })),
    },
  );
}

function eventLine(e: KillEvent, asKiller: boolean, now: number): string {
  const other = asKiller ? e.victim : e.killer;
  const verb = asKiller ? 'matou' : 'morreu para';
  const guild = other.guild ? ` [${other.guild}]` : '';
  const group = e.participants > 1 ? `grupo de ${e.participants}` : 'solo';
  const value = e.estValue != null ? ` · equipamento da vítima ~${fmtInt(e.estValue)} prata` : '';
  return `- ${verb} ${other.name}${guild} ${ageOf(e.time, now)} · ${fmtInt(e.totalFame)} de fama · ${group}${value}`;
}

function slimEvent(e: KillEvent) {
  return {
    quando: e.time,
    matador: { nome: e.killer.name, guilda: e.killer.guild, ip: e.killer.ip },
    vitima: { nome: e.victim.name, guilda: e.victim.guild, ip: e.victim.ip },
    participantes: e.participants,
    fama: e.totalFame,
    valorEstimado: e.estValue,
  };
}

export function summarizeDossier(d: PlayerDossier, now = Date.now()): ToolResult {
  const out: string[] = [`Dossiê de ${d.name} (Americas)`];
  out.push(d.guild ? `Guilda: ${d.guild}${d.alliance ? ` · aliança ${d.alliance}` : ''}` : 'Sem guilda.');
  out.push(`Fama de abate: ${fmtInt(d.killFame)} · fama de morte: ${fmtInt(d.deathFame)} · razão ${fmtDec(d.ratio)}`);
  const dg = d.danger;
  out.push(dg.label === 'sem dado' ? 'Perigo: sem dado suficiente para medir.' : `Perigo: ${dg.label} (${dg.score}/100)${dg.reasons.length ? `: ${dg.reasons.slice(0, 4).join('; ')}` : ''}.`);
  const style: string[] = [];
  if (d.soloRate != null) style.push(`solo em ${fmtPct(d.soloRate)} das kills recentes`);
  if (d.avgGroup != null) style.push(`grupo médio de ${fmtDec(d.avgGroup)}`);
  if (d.avgIp != null) style.push(`IP médio ${fmtInt(d.avgIp)}`);
  out.push(style.length ? `Estilo: ${style.join(', ')}.` : 'Estilo: sem lutas recentes no killboard.');
  if (d.weapons.length) out.push(`Armas mais usadas: ${d.weapons.slice(0, 3).map((w) => `${w.labelPt || w.type} (${w.count}×)`).join(', ')}.`);
  out.push('Últimas kills:');
  out.push(...(d.recentKills.length ? d.recentKills.slice(0, 5).map((e) => eventLine(e, true, now)) : ['- nenhuma no killboard recente']));
  out.push('Últimas mortes:');
  out.push(...(d.recentDeaths.length ? d.recentDeaths.slice(0, 5).map((e) => eventLine(e, false, now)) : ['- nenhuma no killboard recente']));
  out.push(`Dado público do killboard oficial, consultado ${ageOf(d.fetchedAt, now)}. Histórico, nunca a posição atual do jogador. ${playerUrl(d.id)}`);
  return text(out.join('\n'), {
    id: d.id,
    nome: d.name,
    guilda: d.guild,
    alianca: d.alliance,
    famaAbate: d.killFame,
    famaMorte: d.deathFame,
    razao: d.ratio,
    perigo: d.danger,
    armas: d.weapons.slice(0, 5),
    taxaSolo: d.soloRate,
    grupoMedio: d.avgGroup,
    ipMedio: d.avgIp,
    killsRecentes: d.recentKills.slice(0, 5).map(slimEvent),
    mortesRecentes: d.recentDeaths.slice(0, 5).map(slimEvent),
    consultadoEm: d.fetchedAt,
    link: playerUrl(d.id),
  });
}

export function summarizeLosses(r: LossesResponse, now = Date.now()): ToolResult {
  const window = r.days === 1 ? 'hoje (dia UTC)' : `nos últimos ${r.days} dias`;
  const out: string[] = [`Itens mais perdidos no PvP do Americas ${window}.`];
  out.push(
    `Amostra: ${fmtInt(r.sampleKills)} mortes coletadas pela Guarita${r.since ? ` (coleta desde ${r.since.split('-').reverse().join('/')})` : ''}. ` +
      'É uma amostra do killboard público, não o total do servidor.',
  );
  const items = r.items.slice(0, 15);
  if (!items.length) out.push('Ainda não há perdas registradas nessa janela.');
  items.forEach((it, i) => {
    const price = it.price != null ? `${fmtInt(it.price)} prata cada${it.ageMin != null ? ` (${ageLabel(it.ageMin)})` : ''}` : 'sem preço';
    const value = it.value != null ? ` · ${fmtInt(it.value)} prata em perdas` : '';
    out.push(`${i + 1}. ${it.name || it.id} (${it.id}): ${fmtInt(it.count)} perdidos · ${price}${value}`);
  });
  if (items.length) out.push('Volume perdido alto com preço bom costuma indicar demanda para craft e revenda.');
  out.push(`Consultado ${ageOf(r.fetchedAt, now)} · ${SITE}/perdas`);
  return text(out.join('\n'), {
    dias: r.days,
    desde: r.since,
    amostraKills: r.sampleKills,
    itens: r.items.slice(0, 20),
    consultadoEm: r.fetchedAt,
  });
}

const TRILHA_TEXTO = { flip: 'Flip para o Black Market', refino: 'Refino com bônus', transporte: 'Transporte entre cidades' } as const;

export function hojeLink(r: { prata: number; minutos: number; premium: boolean }): string {
  return `${SITE}/hoje?prata=${Math.round(r.prata)}&minutos=${r.minutos}&premium=${r.premium ? 1 : 0}`;
}

export function summarizeHoje(r: HojeResponseX, now = Date.now()): ToolResult {
  const out: string[] = [
    `O que fazer hoje com ${fmtInt(r.prata)} de prata, ${r.minutos} min e ${r.premium ? 'Premium' : 'sem Premium'} (servidor Americas).`,
    `Preços enviados por jogadores ao Albion Data Project, consultados ${ageOf(r.fetchedAt, now)}. Estimativa, não promessa de lucro; tempo de viagem é aproximado.`,
  ];
  for (const n of r.notas ?? []) out.push(`Nota: ${n}`);
  if (!r.opcoes.length) out.push('', 'Nenhuma opção dá lucro com esses valores agora.');
  r.opcoes.forEach((o, k) => {
    const c = o.conta;
    out.push('', `${k + 1}. [${TRILHA_TEXTO[o.trilha]}] ${o.titulo.replace(/^[^:]+:\s*/, '')} · confiança ${o.confianca}/100`);
    out.push(
      c
        ? `   Conta: compra ${fmtInt(c.compra)}, venda ${fmtInt(c.venda)}, taxas ${fmtInt(c.taxas)}, lucro estimado ${fmtInt(c.lucro)} (capital no ciclo ${fmtInt(o.capital)}).`
        : `   Lucro estimado ${fmtInt(o.lucro)} com ${fmtInt(o.capital)} investidos.`,
    );
    o.passos.forEach((p, j) => out.push(`   ${j + 1}) ${p}`));
    if (o.riscos.length) out.push(`   Riscos: ${o.riscos.join(' ')}`);
  });
  out.push('', hojeLink(r));
  return text(out.join('\n'), {
    prata: r.prata,
    minutos: r.minutos,
    premium: r.premium,
    consultadoEm: r.fetchedAt,
    notas: r.notas ?? [],
    opcoes: r.opcoes.map((o) => ({
      trilha: o.trilha, titulo: o.titulo, lucro: o.lucro, capital: o.capital, minutos: o.minutos, confianca: o.confianca,
      conta: o.conta ?? null, passos: o.passos, riscos: o.riscos, itens: o.itens,
    })),
    link: hojeLink(r),
  });
}

function text(t: string, structured?: Record<string, unknown>): ToolResult {
  const res: ToolResult = { content: [{ type: 'text', text: t }] };
  if (structured) res.structuredContent = structured;
  return res;
}

export function toolError(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Erro de fonte → mensagem amigável; nunca repassa String(err) desconhecido (pode carregar detalhe interno). */
export function friendlyError(err: unknown): string {
  if (err instanceof ToolUserError) return err.message;
  if (err instanceof GameinfoError) {
    if (err.kind === 'not_found') return MSG_NOT_FOUND;
    return `${MSG_GAMEINFO_DOWN}.`;
  }
  if (err instanceof AodpError) return `Albion Data Project indisponível agora: ${err.message}`;
  return 'Não consegui consultar esse dado agora. Tente de novo em instantes.';
}

// ---------- argumentos ----------

type Args = Record<string, unknown>;

function str(args: Args, key: string, min: number, max: number, label: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new ToolUserError(`Informe ${label} (argumento "${key}").`);
  const s = v.trim();
  if (s.length < min) throw new ToolUserError(`O argumento "${key}" precisa de pelo menos ${min} caracteres.`);
  if (s.length > max) throw new ToolUserError(`O argumento "${key}" aceita no máximo ${max} caracteres.`);
  return s;
}

function int(args: Args, key: string, min: number, max: number, fallback: number): number {
  const v = args[key];
  if (v === undefined || v === null || v === '') return fallback;
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new ToolUserError(`O argumento "${key}" precisa ser um número inteiro de ${min} a ${max}.`);
  }
  return n;
}

function bool(args: Args, key: string, fallback: boolean): boolean {
  const v = args[key];
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  throw new ToolUserError(`O argumento "${key}" precisa ser true ou false.`);
}

const ITEM_ID_RE = /^T\d_[A-Z0-9_]+(@[0-4])?$/i;

async function resolveItem(env: Env, raw: string): Promise<{ id: string; label: string }> {
  const q = raw.trim();
  if (ITEM_ID_RE.test(q)) {
    const label = await acLabel(env, q);
    if (label) return { id: q.toUpperCase(), label };
  }
  const hit = (await acSearch(env, q, 1))[0];
  if (!hit) throw new ToolUserError(`Não achei o item “${q.slice(0, 60)}”. Use buscar_item para encontrar o id certo.`);
  return hit;
}

// ---------- execução ----------

export interface ToolDeps {
  env: Env;
  ctx: ExecutionContext;
  now?: () => number;
}

/**
 * Executa uma ferramenta. Ferramenta inexistente lança UnknownToolError (o servidor responde -32602);
 * argumento inválido e falha de fonte voltam como resultado com isError, para o modelo poder corrigir.
 */
export async function callTool(name: string, rawArgs: unknown, deps: ToolDeps): Promise<ToolResult> {
  const def = MCP_TOOLS.find((t) => t.name === name);
  if (!def) throw new UnknownToolError(name);
  if (rawArgs != null && (typeof rawArgs !== 'object' || Array.isArray(rawArgs))) {
    return toolError('Os argumentos precisam ser um objeto JSON.');
  }
  const args = (rawArgs ?? {}) as Args;
  const { env, ctx } = deps;
  const now = deps.now ?? Date.now;
  try {
    switch (name) {
      case 'buscar_item': {
        const q = str(args, 'consulta', 3, 80, 'o nome do item');
        return summarizeSearch(q, await acSearch(env, q, 10));
      }
      case 'preco_item': {
        const raw = str(args, 'item', 2, 80, 'o item');
        const quality = int(args, 'qualidade', 1, 5, 1) as Quality;
        const it = await resolveItem(env, raw);
        return summarizeItem(await getItem(env, ctx, it.id, quality), it.label, now());
      }
      case 'relogio':
        return summarizeClock(await getClock(env, ctx), now());
      case 'dossie_jogador': {
        const nome = str(args, 'nome', 3, 32, 'o nome do jogador');
        const { players } = await searchPlayers(env, ctx, nome);
        if (!players.length) return toolError(`Nenhum jogador chamado “${nome}” no killboard do Americas.`);
        const exact = players.find((p) => p.name.toLowerCase() === nome.toLowerCase());
        const pick = exact ?? (players.length === 1 ? players[0] : null);
        if (!pick) return summarizePlayerList(nome, players);
        return summarizeDossier(await getDossier(env, ctx, pick.id), now());
      }
      case 'perdas_pvp': {
        const dias = int(args, 'dias', 1, 7, 1);
        return summarizeLosses(await getLosses(env, ctx, dias, 20), now());
      }
      case 'o_que_fazer': {
        const prata = int(args, 'prata', HOJE_LIMITS.prataMin, HOJE_LIMITS.prataMax, NaN);
        if (Number.isNaN(prata)) throw new ToolUserError('Informe a prata disponível (argumento "prata").');
        // Só as opções do site e do bot: com outro valor, o link "conta completa" abriria outra conta no site.
        const minutos = int(args, 'minutos', HOJE_LIMITS.minutosMin, HOJE_LIMITS.minutosMax, HOJE_LIMITS.minutosPadrao);
        if (!(HOJE_MINUTOS as readonly number[]).includes(minutos)) {
          throw new ToolUserError(`O argumento "minutos" precisa ser ${HOJE_MINUTOS.slice(0, -1).join(', ')} ou ${HOJE_MINUTOS[HOJE_MINUTOS.length - 1]}.`);
        }
        const premium = bool(args, 'premium', false);
        return summarizeHoje(await getHoje(env, ctx, { prata, minutos, premium }, now()), now());
      }
    }
  } catch (err) {
    if (!(err instanceof ToolUserError) && !(err instanceof GameinfoError) && !(err instanceof AodpError)) {
      console.error('mcp: erro inesperado na ferramenta', name, err);
    } else if (!(err instanceof ToolUserError)) {
      console.warn('mcp: fonte indisponível', name, String(err));
    }
    return toolError(friendlyError(err));
  }
  throw new UnknownToolError(name);
}
