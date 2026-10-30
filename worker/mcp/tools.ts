// Ferramentas do servidor MCP (módulo e da Fase 2): validação dos argumentos, chamada às funções de dado que a
// API e o bot já usam e resumo em texto + structuredContent enxuto. Só dado público; nunca alertas, ids do
// Discord nem segredos. Item se resolve pelas fatias pequenas de worker/lib/acIndex.ts (o índice inteiro estoura a
// CPU do plano grátis).
//
// Línguas: toda ferramenta aceita `lingua` ('pt' | 'es', padrão 'pt'). Em português, texto, chamadas às funções de
// dado e structuredContent são os de antes; em espanhol, o texto (e as mensagens de erro) sai em espanhol neutro
// latino com os termos do cliente (docs/glossario-es.md), as funções de dado recebem 'es' (motivos do perigo, nomes
// nas perdas, passos do "o que fazer") e os links apontam para /es/... As chaves do structuredContent não mudam.
import type { Env } from '../env';
import type { ClockResponse, CityQuote, Flip, ItemResponse, LossesResponse, PlayerDossier, PlayerHit, Quality, KillEvent } from '../../shared/types';
import { acLabel, acSearch } from '../lib/acIndex';
import { AodpError } from '../lib/aodp';
import { GameinfoError } from '../lib/gameinfo';
import { getItem } from '../api/market';
import { getClock } from '../api/clock';
import { getDossier, searchPlayers, MSG_GAMEINFO_DOWN, MSG_GAMEINFO_DOWN_ES, MSG_NOT_FOUND, MSG_NOT_FOUND_ES } from '../api/player';
import { getLosses } from '../api/insights';
import { aodpMessageEs } from '../api/langErrors';
import { minutesSince, PREMIUM_30D_GOLD } from '../../shared/market';
import { qualityLabelFor } from '../../shared/quality';
import { festivityLabel } from '../../shared/festivities';
import { weaponLabelEsFromPt } from '../../shared/weapons';
import { tl, type ApiLang } from '../../shared/lang';
import { localizePath } from '../../src/lib/i18n/core';
import { MCP_TOOLS, type McpLingua, type McpToolDef } from './catalog';
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

/**
 * Definições como o tools/list devolve: sem os campos que só a página usa (example, descriptionEs) e com a
 * descrição bilíngue "português / español".
 */
export function listTools(): Omit<McpToolDef, 'example' | 'descriptionEs'>[] {
  return MCP_TOOLS.map(({ example: _example, descriptionEs, ...def }) => ({ ...def, description: `${def.description} / ${descriptionEs}` }));
}

// ---------- língua ----------

type L = ApiLang;
const t = (lang: L, pt: string, es: string) => tl(lang, pt, es);

/**
 * Lê o argumento `lingua`. Ausente ou vazio = 'pt'. Aceita "pt"/"es" sem diferenciar maiúsculas, e "pt-BR",
 * "es-419", "es-ES"… pela raiz. Outro valor (ex.: "en") também vira 'pt', sem erro: antes do argumento existir,
 * um `lingua` qualquer era ignorado e a resposta saía em português; o cliente que já mandava continua igual.
 */
export function parseLingua(args: Record<string, unknown>): McpLingua {
  const v = args.lingua;
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'es' || s.startsWith('es-') ? 'es' : 'pt';
}

/** Língua pedida a partir dos argumentos crus (para mensagens do servidor antes de chamar a ferramenta). */
export function linguaOf(rawArgs: unknown): McpLingua {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) return 'pt';
  return parseLingua(rawArgs as Record<string, unknown>);
}

/** Endereço completo no site na língua pedida ('/x' → '/es/x' em espanhol). */
function siteUrl(path: string, lang: L): string {
  return SITE + localizePath(path, lang);
}

// ---------- formatação (texto puro, sem marcação do Discord) ----------

const FMT = {
  pt: {
    int: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }),
    dec: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    pct: new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }),
  },
  es: {
    int: new Intl.NumberFormat('es-419', { maximumFractionDigits: 0 }),
    dec: new Intl.NumberFormat('es-419', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    pct: new Intl.NumberFormat('es-419', { style: 'percent', maximumFractionDigits: 1 }),
  },
};
// Datas: os mesmos dígitos (dd/mm/aaaa, 24 h) nas duas línguas, como no site.
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function fmtInt(n: number | null | undefined, lang: L = 'pt'): string {
  return n == null || !Number.isFinite(n) ? '—' : FMT[lang].int.format(Math.round(n));
}
function fmtDec(n: number | null | undefined, lang: L = 'pt'): string {
  return n == null || !Number.isFinite(n) ? '—' : FMT[lang].dec.format(n);
}
function fmtPct(frac: number | null | undefined, lang: L = 'pt'): string {
  return frac == null || !Number.isFinite(frac) ? '—' : FMT[lang].pct.format(frac);
}
/** "09/11/2026 08:00" em horário de Brasília. */
export function fmtDateBr(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return dateFmt.format(new Date(iso)).replace(',', '');
}
/** Idade em minutos → "agora", "há 12 min", "há 3 h", "há 2 dias" (es: "ahora", "hace 12 min"…). */
export function ageLabel(min: number | null | undefined, lang: L = 'pt'): string {
  const es = lang === 'es';
  if (min == null || !Number.isFinite(min)) return es ? 'sin fecha' : 'sem data';
  if (min < 1) return es ? 'ahora' : 'agora';
  const ago = es ? 'hace' : 'há';
  if (min < 60) return `${ago} ${Math.round(min)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${ago} ${h} h`;
  return `${ago} ${Math.round(min / 1440)} ${es ? 'días' : 'dias'}`;
}
function ageOf(iso: string | null | undefined, now: number, lang: L = 'pt'): string {
  return ageLabel(minutesSince(iso ?? null, now), lang);
}

const VERDICT_TEXT = { barato: 'barato', normal: 'preço normal', caro: 'caro', 'sem dado': 'sem dado suficiente' } as const;
const VERDICT_TEXT_ES = { barato: 'barato', normal: 'precio normal', caro: 'caro', 'sem dado': 'sin datos suficientes' } as const;
/** Rótulo do selo (código em PT na API) em espanhol: confianza alta/media/baja. */
const CONF_ES: Record<string, string> = { alta: 'alta', média: 'media', baixa: 'baja', 'sem dado': 'sin datos' };
/** Rótulo do perigo (código em PT na API) em espanhol, como o medidor do site. */
export const DANGER_ES: Record<string, string> = { tranquilo: 'tranquilo', atenção: 'atención', perigoso: 'peligroso', 'sem dado': 'sin datos' };
const TREND_ES: Record<string, string> = { subindo: 'subiendo', caindo: 'bajando', estável: 'estable', 'sem dado': 'sin datos' };
/** Preço com mais de 6 h: o texto pede para conferir no jogo. */
const STALE_MIN = 6 * 60;

/** "Black Market" é o nome que o AODP usa; o cliente em espanhol diz Mercado Negro. */
function cityName(city: string, lang: L): string {
  return lang === 'es' && city === 'Black Market' ? 'Mercado Negro' : city;
}
function cheapest(cities: CityQuote[]): CityQuote | null {
  return cities.filter((c) => c.city !== 'Black Market' && c.sellMin != null).sort((a, b) => a.sellMin! - b.sellMin!)[0] ?? null;
}
function profitableFlips(flips: Flip[]): Flip[] {
  return flips.filter((f) => f.profitPremium > 0).sort((a, b) => b.profitPremium - a.profitPremium);
}
export function itemUrl(id: string, quality = 1, lang: L = 'pt'): string {
  return siteUrl(`/item/${encodeURIComponent(id)}${quality > 1 ? `?q=${quality}` : ''}`, lang);
}
export function playerUrl(id: string, lang: L = 'pt'): string {
  return siteUrl(`/jogador/${encodeURIComponent(id)}`, lang);
}

// ---------- resumos (puros, exportados para teste) ----------

export function summarizeSearch(query: string, hits: { id: string; label: string }[], lang: L = 'pt'): ToolResult {
  if (!hits.length) {
    return text(
      t(
        lang,
        `Nenhum item encontrado para “${query}”. Tente outra grafia, o nome em inglês ou só a palavra principal (ex.: "bolsa", "espada larga").`,
        `No encontré ningún objeto para “${query}”. Prueba otra grafía, el nombre en inglés o solo la palabra principal (ej.: "bolsa", "espada ancha").`,
      ),
      { consulta: query, itens: [] },
    );
  }
  const lines = hits.map((h) => `- ${h.label} · id ${h.id}`);
  return text(
    t(
      lang,
      `Itens encontrados para “${query}” (${hits.length}):\n${lines.join('\n')}\n\nUse o id em preco_item para ver o preço.`,
      `Objetos encontrados para “${query}” (${hits.length}):\n${lines.join('\n')}\n\nUsa el id en preco_item para ver el precio.`,
    ),
    { consulta: query, itens: hits.map((h) => ({ id: h.id, nome: h.label })) },
  );
}

/** structuredContent do preço: sem histórico diário nem livro de ofertas (pesados e pouco úteis para o modelo). */
export function slimItem(item: ItemResponse, label: string, lang: L = 'pt') {
  return {
    id: item.id,
    nome: label,
    qualidade: item.quality,
    qualidadeNome: qualityLabelFor(item.quality, lang),
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
    link: itemUrl(item.id, item.quality, lang),
  };
}

export function summarizeItem(item: ItemResponse, label: string, now = Date.now(), lang: L = 'pt'): ToolResult {
  const n = (x: number | null | undefined) => fmtInt(x, lang);
  const out: string[] = [
    t(lang, `${label} (${item.id}) · qualidade ${qualityLabelFor(item.quality)} · servidor Americas`, `${label} (${item.id}) · calidad ${qualityLabelFor(item.quality, 'es')} · servidor Americas`),
  ];
  const cheap = cheapest(item.cities);
  if (cheap) {
    out.push(t(
      lang,
      `Mais barato para comprar: ${cheap.city}, ${n(cheap.sellMin)} prata (visto ${ageOf(cheap.sellMinAt, now)}).`,
      `Más barato para comprar: ${cheap.city}, ${n(cheap.sellMin)} de plata (visto ${ageOf(cheap.sellMinAt, now, 'es')}).`,
    ));
    const age = minutesSince(cheap.sellMinAt, now) ?? cheap.ageMin;
    if (age != null && age > STALE_MIN) {
      out.push(t(lang, 'Atenção: o preço mais barato é antigo; confirme no jogo antes de comprar.', 'Atención: el precio más barato es antiguo; confírmalo en el juego antes de comprar.'));
    }
    if (cheap.verdict !== 'sem dado') {
      out.push(t(
        lang,
        `Veredito em ${cheap.city}: ${VERDICT_TEXT[cheap.verdict]}, comparado aos últimos dias.`,
        `Veredicto en ${cheap.city}: ${VERDICT_TEXT_ES[cheap.verdict]}, comparado con los últimos días.`,
      ));
    }
  } else {
    out.push(t(
      lang,
      'Nenhuma cidade com ordem de venda conhecida agora. O dado vem de jogadores que rodam o cliente do Albion Data Project.',
      'Ninguna ciudad con orden de venta conocida ahora. Los datos vienen de jugadores que usan el cliente del Albion Data Project.',
    ));
  }
  if (item.median7d != null) {
    const range = item.p25 != null && item.p75 != null
      ? t(lang, ` (faixa normal de ${n(item.p25)} a ${n(item.p75)})`, ` (rango normal de ${n(item.p25)} a ${n(item.p75)})`)
      : '';
    out.push(t(lang, `Mediana de 7 dias: ${n(item.median7d)} prata${range}.`, `Mediana de 7 días: ${n(item.median7d)} de plata${range}.`));
  }
  const order = [...item.cities].sort((a, b) => {
    if (a.city === 'Black Market') return 1;
    if (b.city === 'Black Market') return -1;
    return (a.sellMin ?? Infinity) - (b.sellMin ?? Infinity);
  });
  out.push('', t(lang, 'Por cidade:', 'Por ciudad:'));
  for (const c of order) out.push(`- ${cityLine(c, now, lang)}`);
  const flip = profitableFlips(item.flips)[0];
  out.push(
    '',
    flip
      ? t(
          lang,
          `Melhor flip para o Black Market: comprar em ${flip.from} por ${n(flip.buyAt)} e vender por ${n(flip.sellAt)}; ` +
            `lucro de ${n(flip.profitPremium)} com Premium (${n(flip.profitNoPremium)} sem), retorno ${fmtPct(flip.roi)}, dado ${ageLabel(flip.ageMin)}.`,
          `Mejor reventa al Mercado Negro: comprar en ${flip.from} por ${n(flip.buyAt)} y vender por ${n(flip.sellAt)}; ` +
            `ganancia de ${n(flip.profitPremium)} con Premium (${n(flip.profitNoPremium)} sin), retorno ${fmtPct(flip.roi, 'es')}, dato ${ageLabel(flip.ageMin, 'es')}.`,
        )
      : t(lang, 'Nenhum flip lucrativo para o Black Market agora.', 'Ninguna reventa rentable al Mercado Negro ahora.'),
  );
  out.push(t(lang, `Consultado ${ageOf(item.fetchedAt, now)}`, `Consultado ${ageOf(item.fetchedAt, now, 'es')}`) + ` · ${itemUrl(item.id, item.quality, lang)}`);
  return text(out.join('\n'), slimItem(item, label, lang));
}

function cityLine(c: CityQuote, now: number, lang: L): string {
  const n = (x: number | null | undefined) => fmtInt(x, lang);
  const bm = c.city === 'Black Market';
  if (bm) {
    if (lang === 'es') {
      return c.buyMax == null
        ? 'Mercado Negro: sin orden de compra conocida'
        : `Mercado Negro (venta inmediata): ${n(c.buyMax)} de plata, ${ageOf(c.buyMaxAt, now, 'es')}`;
    }
    return c.buyMax == null
      ? 'Black Market: sem ordem de compra conhecida'
      : `Black Market (venda instantânea): ${fmtInt(c.buyMax)} prata, ${ageOf(c.buyMaxAt, now)}`;
  }
  const parts: string[] = [];
  if (lang === 'es') {
    parts.push(c.sellMin == null ? 'venta sin datos' : `venta ${n(c.sellMin)} (${ageOf(c.sellMinAt, now, 'es')})`);
    if (c.buyMax != null) parts.push(`compra ${n(c.buyMax)} (${ageOf(c.buyMaxAt, now, 'es')})`);
    if (c.sellMin != null) parts.push(`confianza ${CONF_ES[c.confidence.label] ?? c.confidence.label}`);
  } else {
    parts.push(c.sellMin == null ? 'venda sem dado' : `venda ${fmtInt(c.sellMin)} (${ageOf(c.sellMinAt, now)})`);
    if (c.buyMax != null) parts.push(`compra ${fmtInt(c.buyMax)} (${ageOf(c.buyMaxAt, now)})`);
    if (c.sellMin != null) parts.push(`confiança ${c.confidence.label}`);
  }
  return `${cityName(c.city, lang)}: ${parts.join(' · ')}`;
}

const SERVER_TEXT: Record<ClockResponse['server']['status'], string> = {
  online: 'online',
  offline: 'offline',
  manutenção: 'em manutenção',
  desconhecido: 'com status desconhecido',
};
const SERVER_TEXT_ES: Record<ClockResponse['server']['status'], string> = {
  online: 'en línea',
  offline: 'fuera de línea',
  manutenção: 'en mantenimiento',
  desconhecido: 'con estado desconocido',
};

export function summarizeClock(c: ClockResponse, now = Date.now(), lang: L = 'pt'): ToolResult {
  if (lang === 'es') return summarizeClockEs(c, now);
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

function summarizeClockEs(c: ClockResponse, now: number): ToolResult {
  const n = (x: number | null | undefined) => fmtInt(x, 'es');
  const fest = (f: ClockResponse['festivities'][number]) => f.label || festivityLabel(f, 'es');
  const out: string[] = [`Ahora: ${fmtDateBr(new Date(now).toISOString())} (hora de Brasilia).`];
  const msg = c.server.message?.trim();
  out.push(`Servidor Americas: ${SERVER_TEXT_ES[c.server.status] ?? SERVER_TEXT_ES.desconhecido}${msg ? ` (${msg.slice(0, 200)})` : ''}, revisado ${ageOf(c.server.checkedAt, now, 'es')}.`);
  const active = c.festivities.filter((f) => Date.parse(f.start) <= now && Date.parse(f.end) > now);
  const next = c.festivities.filter((f) => Date.parse(f.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 5);
  out.push(active.length ? 'Bonificaciones activas:' : 'Ninguna bonificación activa ahora.');
  for (const f of active.slice(0, 10)) out.push(`- ${fest(f)}, hasta ${fmtDateBr(f.end)}`);
  if (next.length) {
    out.push('Próximas festividades:');
    for (const f of next) out.push(`- ${fest(f)}, empieza ${fmtDateBr(f.start)}`);
  }
  const g = c.gold;
  out.push(
    g.price != null
      ? `Oro: ${n(g.price)} de plata por oro${g.trend !== 'sem dado' ? `, ${TREND_ES[g.trend] ?? g.trend}` : ''}${g.p30 != null ? ` (promedio de 30 días: ${n(g.p30)})` : ''}${g.at ? `, cotización ${ageOf(g.at, now, 'es')}` : ''}.`
      : 'Oro: sin cotización ahora.',
  );
  out.push(
    c.premiumSilver != null
      ? `Premium de 30 días: ${n(PREMIUM_30D_GOLD)} de oro, cerca de ${n(c.premiumSilver)} de plata.`
      : 'Premium: sin cotización del oro para convertir.',
  );
  out.push(`${c.season.name}: termina alrededor del ${fmtDateBr(c.season.end)} (fecha aproximada, sin anuncio oficial confirmado).`);
  return text(out.join('\n'), c as unknown as Record<string, unknown>);
}

export function summarizePlayerList(query: string, players: PlayerHit[], lang: L = 'pt'): ToolResult {
  const top = players.slice(0, 10);
  const lines = top.map((p) =>
    lang === 'es'
      ? `- ${p.name}${p.guild ? ` · gremio ${p.guild}` : ' · sin gremio'} · fama por asesinatos ${fmtInt(p.killFame, 'es')}`
      : `- ${p.name}${p.guild ? ` · guilda ${p.guild}` : ' · sem guilda'} · fama de abate ${fmtInt(p.killFame)}`,
  );
  const extra = players.length - top.length;
  const more = extra > 0 ? t(lang, `\n…e mais ${extra}.`, `\n…y ${extra} más.`) : '';
  return text(
    t(
      lang,
      `Nenhum nome bate exatamente com “${query}”. Jogadores parecidos no Americas:\n${lines.join('\n')}${more}\n\nChame dossie_jogador de novo com o nome exato.`,
      `Ningún nombre coincide exactamente con “${query}”. Jugadores parecidos en Americas:\n${lines.join('\n')}${more}\n\nLlama a dossie_jogador de nuevo con el nombre exacto.`,
    ),
    {
      consulta: query,
      candidatos: top.map((p) => ({ nome: p.name, guilda: p.guild, alianca: p.alliance, famaAbate: p.killFame, famaMorte: p.deathFame })),
    },
  );
}

function eventLine(e: KillEvent, asKiller: boolean, now: number, lang: L): string {
  const other = asKiller ? e.victim : e.killer;
  const guild = other.guild ? ` [${other.guild}]` : '';
  if (lang === 'es') {
    const verb = asKiller ? 'mató a' : 'murió ante';
    const group = e.participants > 1 ? `grupo de ${e.participants}` : 'en solitario';
    const value = e.estValue != null ? ` · equipo de la víctima ~${fmtInt(e.estValue, 'es')} de plata` : '';
    return `- ${verb} ${other.name}${guild} ${ageOf(e.time, now, 'es')} · ${fmtInt(e.totalFame, 'es')} de fama · ${group}${value}`;
  }
  const verb = asKiller ? 'matou' : 'morreu para';
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

export function summarizeDossier(d: PlayerDossier, now = Date.now(), lang: L = 'pt'): ToolResult {
  const es = lang === 'es';
  const dg = d.danger;
  const out: string[] = [];
  if (es) {
    out.push(`Dosier de ${d.name} (Americas)`);
    out.push(d.guild ? `Gremio: ${d.guild}${d.alliance ? ` · alianza ${d.alliance}` : ''}` : 'Sin gremio.');
    out.push(`Fama por asesinatos: ${fmtInt(d.killFame, 'es')} · fama por muertes: ${fmtInt(d.deathFame, 'es')} · asesinatos/muertes ${fmtDec(d.ratio, 'es')}`);
    out.push(dg.label === 'sem dado'
      ? 'Peligro: sin datos suficientes para medirlo.'
      : `Peligro: ${DANGER_ES[dg.label] ?? dg.label} (${dg.score}/100)${dg.reasons.length ? `: ${dg.reasons.slice(0, 4).join('; ')}` : ''}.`);
    const style: string[] = [];
    if (d.soloRate != null) style.push(`en solitario en el ${fmtPct(d.soloRate, 'es')} de los asesinatos recientes`);
    if (d.avgGroup != null) style.push(`grupo medio de ${fmtDec(d.avgGroup, 'es')}`);
    if (d.avgIp != null) style.push(`IP medio ${fmtInt(d.avgIp, 'es')}`);
    out.push(style.length ? `Estilo: ${style.join(', ')}.` : 'Estilo: sin peleas recientes en el killboard.');
    if (d.weapons.length) {
      out.push(`Armas más usadas: ${d.weapons.slice(0, 3).map((w) => `${(w.labelPt && weaponLabelEsFromPt(w.labelPt)) || w.type} (${w.count}×)`).join(', ')}.`);
    }
    out.push('Últimos asesinatos:');
    out.push(...(d.recentKills.length ? d.recentKills.slice(0, 5).map((e) => eventLine(e, true, now, 'es')) : ['- ninguno en el killboard reciente']));
    out.push('Últimas muertes:');
    out.push(...(d.recentDeaths.length ? d.recentDeaths.slice(0, 5).map((e) => eventLine(e, false, now, 'es')) : ['- ninguna en el killboard reciente']));
    out.push(`Datos públicos del killboard oficial, consultados ${ageOf(d.fetchedAt, now, 'es')}. Historial, nunca la posición actual del jugador. ${playerUrl(d.id, 'es')}`);
  } else {
    out.push(`Dossiê de ${d.name} (Americas)`);
    out.push(d.guild ? `Guilda: ${d.guild}${d.alliance ? ` · aliança ${d.alliance}` : ''}` : 'Sem guilda.');
    out.push(`Fama de abate: ${fmtInt(d.killFame)} · fama de morte: ${fmtInt(d.deathFame)} · razão ${fmtDec(d.ratio)}`);
    out.push(dg.label === 'sem dado' ? 'Perigo: sem dado suficiente para medir.' : `Perigo: ${dg.label} (${dg.score}/100)${dg.reasons.length ? `: ${dg.reasons.slice(0, 4).join('; ')}` : ''}.`);
    const style: string[] = [];
    if (d.soloRate != null) style.push(`solo em ${fmtPct(d.soloRate)} das kills recentes`);
    if (d.avgGroup != null) style.push(`grupo médio de ${fmtDec(d.avgGroup)}`);
    if (d.avgIp != null) style.push(`IP médio ${fmtInt(d.avgIp)}`);
    out.push(style.length ? `Estilo: ${style.join(', ')}.` : 'Estilo: sem lutas recentes no killboard.');
    if (d.weapons.length) out.push(`Armas mais usadas: ${d.weapons.slice(0, 3).map((w) => `${w.labelPt || w.type} (${w.count}×)`).join(', ')}.`);
    out.push('Últimas kills:');
    out.push(...(d.recentKills.length ? d.recentKills.slice(0, 5).map((e) => eventLine(e, true, now, 'pt')) : ['- nenhuma no killboard recente']));
    out.push('Últimas mortes:');
    out.push(...(d.recentDeaths.length ? d.recentDeaths.slice(0, 5).map((e) => eventLine(e, false, now, 'pt')) : ['- nenhuma no killboard recente']));
    out.push(`Dado público do killboard oficial, consultado ${ageOf(d.fetchedAt, now)}. Histórico, nunca a posição atual do jogador. ${playerUrl(d.id)}`);
  }
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
    link: playerUrl(d.id, lang),
  });
}

export function summarizeLosses(r: LossesResponse, now = Date.now(), lang: L = 'pt'): ToolResult {
  const es = lang === 'es';
  const n = (x: number | null | undefined) => fmtInt(x, lang);
  const window = es
    ? (r.days === 1 ? 'hoy (día UTC)' : `en los últimos ${r.days} días`)
    : (r.days === 1 ? 'hoje (dia UTC)' : `nos últimos ${r.days} dias`);
  const since = r.since ? r.since.split('-').reverse().join('/') : null;
  const out: string[] = [t(lang, `Itens mais perdidos no PvP do Americas ${window}.`, `Objetos más perdidos en PvP en Americas ${window}.`)];
  out.push(t(
    lang,
    `Amostra: ${n(r.sampleKills)} mortes coletadas pela Guarita${since ? ` (coleta desde ${since})` : ''}. É uma amostra do killboard público, não o total do servidor.`,
    `Muestra: ${n(r.sampleKills)} muertes recopiladas por Guarita${since ? ` (recopilación desde el ${since})` : ''}. Es una muestra del killboard público, no el total del servidor.`,
  ));
  const items = r.items.slice(0, 15);
  if (!items.length) out.push(t(lang, 'Ainda não há perdas registradas nessa janela.', 'Todavía no hay pérdidas registradas en esa ventana.'));
  items.forEach((it, i) => {
    if (es) {
      const price = it.price != null ? `${n(it.price)} de plata c/u${it.ageMin != null ? ` (${ageLabel(it.ageMin, 'es')})` : ''}` : 'sin precio';
      const value = it.value != null ? ` · ${n(it.value)} de plata en pérdidas` : '';
      out.push(`${i + 1}. ${it.name || it.id} (${it.id}): ${n(it.count)} perdidos · ${price}${value}`);
    } else {
      const price = it.price != null ? `${fmtInt(it.price)} prata cada${it.ageMin != null ? ` (${ageLabel(it.ageMin)})` : ''}` : 'sem preço';
      const value = it.value != null ? ` · ${fmtInt(it.value)} prata em perdas` : '';
      out.push(`${i + 1}. ${it.name || it.id} (${it.id}): ${fmtInt(it.count)} perdidos · ${price}${value}`);
    }
  });
  if (items.length) {
    out.push(t(
      lang,
      'Volume perdido alto com preço bom costuma indicar demanda para craft e revenda.',
      'Mucho volumen perdido con buen precio suele indicar demanda para fabricar y revender.',
    ));
  }
  out.push(t(lang, `Consultado ${ageOf(r.fetchedAt, now)}`, `Consultado ${ageOf(r.fetchedAt, now, 'es')}`) + ` · ${siteUrl('/perdas', lang)}`);
  return text(out.join('\n'), {
    dias: r.days,
    desde: r.since,
    amostraKills: r.sampleKills,
    itens: r.items.slice(0, 20),
    consultadoEm: r.fetchedAt,
  });
}

const TRILHA_TEXTO = { flip: 'Flip para o Black Market', refino: 'Refino com bônus', transporte: 'Transporte entre cidades' } as const;
// Iguais aos do site (src/lib/hoje/view.ts, TRILHA_ES) e do bot.
export const TRILHA_TEXTO_ES = { flip: 'Reventa al Mercado Negro', refino: 'Refinado con bonificación', transporte: 'Transporte entre ciudades' } as const;

export function hojeLink(r: { prata: number; minutos: number; premium: boolean }, lang: L = 'pt'): string {
  return siteUrl(`/hoje?prata=${Math.round(r.prata)}&minutos=${r.minutos}&premium=${r.premium ? 1 : 0}`, lang);
}

export function summarizeHoje(r: HojeResponseX, now = Date.now(), lang: L = 'pt'): ToolResult {
  const es = lang === 'es';
  const n = (x: number | null | undefined) => fmtInt(x, lang);
  const out: string[] = es
    ? [
        `Qué hacer hoy con ${n(r.prata)} de plata, ${r.minutos} min y ${r.premium ? 'Premium' : 'sin Premium'} (servidor Americas).`,
        `Precios enviados por jugadores al Albion Data Project, consultados ${ageOf(r.fetchedAt, now, 'es')}. Es una estimación, no una promesa de ganancia; el tiempo de viaje es aproximado.`,
      ]
    : [
        `O que fazer hoje com ${fmtInt(r.prata)} de prata, ${r.minutos} min e ${r.premium ? 'Premium' : 'sem Premium'} (servidor Americas).`,
        `Preços enviados por jogadores ao Albion Data Project, consultados ${ageOf(r.fetchedAt, now)}. Estimativa, não promessa de lucro; tempo de viagem é aproximado.`,
      ];
  for (const note of r.notas ?? []) out.push(`${t(lang, 'Nota', 'Nota')}: ${note}`);
  if (!r.opcoes.length) out.push('', t(lang, 'Nenhuma opção dá lucro com esses valores agora.', 'Ninguna opción da ganancia con esos valores ahora.'));
  r.opcoes.forEach((o, k) => {
    const c = o.conta;
    const trilha = (es ? TRILHA_TEXTO_ES : TRILHA_TEXTO)[o.trilha];
    out.push('', `${k + 1}. [${trilha}] ${o.titulo.replace(/^[^:]+:\s*/, '')} · ${t(lang, 'confiança', 'confianza')} ${o.confianca}/100`);
    if (es) {
      out.push(
        c
          ? `   Cálculo: compra ${n(c.compra)}, venta ${n(c.venda)}, impuestos ${n(c.taxas)}, ganancia estimada ${n(c.lucro)} (capital en el ciclo ${n(o.capital)}).`
          : `   Ganancia estimada ${n(o.lucro)} con ${n(o.capital)} invertidos.`,
      );
    } else {
      out.push(
        c
          ? `   Conta: compra ${fmtInt(c.compra)}, venda ${fmtInt(c.venda)}, taxas ${fmtInt(c.taxas)}, lucro estimado ${fmtInt(c.lucro)} (capital no ciclo ${fmtInt(o.capital)}).`
          : `   Lucro estimado ${fmtInt(o.lucro)} com ${fmtInt(o.capital)} investidos.`,
      );
    }
    o.passos.forEach((p, j) => out.push(`   ${j + 1}) ${p}`));
    if (o.riscos.length) out.push(`   ${t(lang, 'Riscos', 'Riesgos')}: ${o.riscos.join(' ')}`);
  });
  out.push('', hojeLink(r, lang));
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
    link: hojeLink(r, lang),
  });
}

function text(s: string, structured?: Record<string, unknown>): ToolResult {
  const res: ToolResult = { content: [{ type: 'text', text: s }] };
  if (structured) res.structuredContent = structured;
  return res;
}

export function toolError(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Erro de fonte → mensagem amigável na língua pedida; nunca repassa String(err) desconhecido (pode ter detalhe interno). */
export function friendlyError(err: unknown, lang: L = 'pt'): string {
  if (err instanceof ToolUserError) return err.message;
  if (err instanceof GameinfoError) {
    if (err.kind === 'not_found') return t(lang, MSG_NOT_FOUND, MSG_NOT_FOUND_ES);
    return `${t(lang, MSG_GAMEINFO_DOWN, MSG_GAMEINFO_DOWN_ES)}.`;
  }
  if (err instanceof AodpError) {
    return lang === 'es' ? `Albion Data Project no disponible ahora: ${aodpMessageEs(err)}` : `Albion Data Project indisponível agora: ${err.message}`;
  }
  return t(lang, 'Não consegui consultar esse dado agora. Tente de novo em instantes.', 'No pude consultar ese dato ahora. Inténtalo de nuevo en unos instantes.');
}

// ---------- argumentos ----------

type Args = Record<string, unknown>;

function str(args: Args, key: string, min: number, max: number, label: string, lang: L, labelEs: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new ToolUserError(t(lang, `Informe ${label} (argumento "${key}").`, `Indica ${labelEs} (argumento "${key}").`));
  const s = v.trim();
  if (s.length < min) throw new ToolUserError(t(lang, `O argumento "${key}" precisa de pelo menos ${min} caracteres.`, `El argumento "${key}" necesita al menos ${min} caracteres.`));
  if (s.length > max) throw new ToolUserError(t(lang, `O argumento "${key}" aceita no máximo ${max} caracteres.`, `El argumento "${key}" acepta como máximo ${max} caracteres.`));
  return s;
}

function int(args: Args, key: string, min: number, max: number, fallback: number, lang: L): number {
  const v = args[key];
  if (v === undefined || v === null || v === '') return fallback;
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new ToolUserError(t(lang, `O argumento "${key}" precisa ser um número inteiro de ${min} a ${max}.`, `El argumento "${key}" debe ser un número entero de ${min} a ${max}.`));
  }
  return n;
}

function bool(args: Args, key: string, fallback: boolean, lang: L): boolean {
  const v = args[key];
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  throw new ToolUserError(t(lang, `O argumento "${key}" precisa ser true ou false.`, `El argumento "${key}" debe ser true o false.`));
}

const ITEM_ID_RE = /^T\d_[A-Z0-9_]+(@[0-4])?$/i;

// Em português as chamadas às fatias são as de antes (sem o argumento de língua); em espanhol, as fatias ES.
function acLabelIn(env: Env, id: string, lang: L) {
  return lang === 'es' ? acLabel(env, id, 'es') : acLabel(env, id);
}
function acSearchIn(env: Env, q: string, limit: number, lang: L) {
  return lang === 'es' ? acSearch(env, q, limit, 'es') : acSearch(env, q, limit);
}

async function resolveItem(env: Env, raw: string, lang: L): Promise<{ id: string; label: string }> {
  const q = raw.trim();
  if (ITEM_ID_RE.test(q)) {
    const label = await acLabelIn(env, q, lang);
    if (label) return { id: q.toUpperCase(), label };
  }
  const hit = (await acSearchIn(env, q, 1, lang))[0];
  if (!hit) {
    throw new ToolUserError(t(
      lang,
      `Não achei o item “${q.slice(0, 60)}”. Use buscar_item para encontrar o id certo.`,
      `No encontré el objeto “${q.slice(0, 60)}”. Usa buscar_item para encontrar el id correcto.`,
    ));
  }
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
  const def = MCP_TOOLS.find((d) => d.name === name);
  if (!def) throw new UnknownToolError(name);
  if (rawArgs != null && (typeof rawArgs !== 'object' || Array.isArray(rawArgs))) {
    // Sem objeto não há `lingua` para ler: a mensagem fica a de sempre, em português.
    return toolError('Os argumentos precisam ser um objeto JSON.');
  }
  const args = (rawArgs ?? {}) as Args;
  const { env, ctx } = deps;
  const now = deps.now ?? Date.now;
  let lang: L = 'pt';
  try {
    lang = parseLingua(args);
    const es = lang === 'es';
    switch (name) {
      case 'buscar_item': {
        const q = str(args, 'consulta', 3, 80, 'o nome do item', lang, 'el nombre del objeto');
        return summarizeSearch(q, await acSearchIn(env, q, 10, lang), lang);
      }
      case 'preco_item': {
        const raw = str(args, 'item', 2, 80, 'o item', lang, 'el objeto');
        const quality = int(args, 'qualidade', 1, 5, 1, lang) as Quality;
        const it = await resolveItem(env, raw, lang);
        // O resumo não cita os motivos do selo, só o rótulo (código): a mesma chamada serve às duas línguas.
        return summarizeItem(await getItem(env, ctx, it.id, quality), it.label, now(), lang);
      }
      case 'relogio': {
        const c = es ? await getClock(env, ctx, 'es') : await getClock(env, ctx);
        return summarizeClock(c, now(), lang);
      }
      case 'dossie_jogador': {
        const nome = str(args, 'nome', 3, 32, 'o nome do jogador', lang, 'el nombre del jugador');
        const { players } = await searchPlayers(env, ctx, nome);
        if (!players.length) {
          return toolError(t(lang, `Nenhum jogador chamado “${nome}” no killboard do Americas.`, `Ningún jugador llamado “${nome}” en el killboard de Americas.`));
        }
        const exact = players.find((p) => p.name.toLowerCase() === nome.toLowerCase());
        const pick = exact ?? (players.length === 1 ? players[0] : null);
        if (!pick) return summarizePlayerList(nome, players, lang);
        const d = es ? await getDossier(env, ctx, pick.id, 'es') : await getDossier(env, ctx, pick.id);
        return summarizeDossier(d, now(), lang);
      }
      case 'perdas_pvp': {
        const dias = int(args, 'dias', 1, 7, 1, lang);
        const r = es ? await getLosses(env, ctx, dias, 20, 'es') : await getLosses(env, ctx, dias, 20);
        return summarizeLosses(r, now(), lang);
      }
      case 'o_que_fazer': {
        const prata = int(args, 'prata', HOJE_LIMITS.prataMin, HOJE_LIMITS.prataMax, NaN, lang);
        if (Number.isNaN(prata)) throw new ToolUserError(t(lang, 'Informe a prata disponível (argumento "prata").', 'Indica la plata disponible (argumento "prata").'));
        // Só as opções do site e do bot: com outro valor, o link "conta completa" abriria outra conta no site.
        const minutos = int(args, 'minutos', HOJE_LIMITS.minutosMin, HOJE_LIMITS.minutosMax, HOJE_LIMITS.minutosPadrao, lang);
        if (!(HOJE_MINUTOS as readonly number[]).includes(minutos)) {
          const list = `${HOJE_MINUTOS.slice(0, -1).join(', ')}`;
          const last = HOJE_MINUTOS[HOJE_MINUTOS.length - 1];
          throw new ToolUserError(t(lang, `O argumento "minutos" precisa ser ${list} ou ${last}.`, `El argumento "minutos" debe ser ${list} o ${last}.`));
        }
        const premium = bool(args, 'premium', false, lang);
        const params = es ? { prata, minutos, premium, lang: 'es' as const } : { prata, minutos, premium };
        return summarizeHoje(await getHoje(env, ctx, params, now()), now(), lang);
      }
    }
  } catch (err) {
    if (!(err instanceof ToolUserError) && !(err instanceof GameinfoError) && !(err instanceof AodpError)) {
      console.error('mcp: erro inesperado na ferramenta', name, err);
    } else if (!(err instanceof ToolUserError)) {
      console.warn('mcp: fonte indisponível', name, String(err));
    }
    return toolError(friendlyError(err, lang));
  }
  throw new UnknownToolError(name);
}
