// Embeds do bot (funções puras: recebem os dados do contrato e devolvem JSON da API do Discord).
// Datas para o usuário em horário de Brasília; números no formato da língua (pt-BR ou es-419). Limites do Discord
// aplicados em finalize(). Língua: todo render recebe `loc` no fim (padrão 'pt', texto idêntico ao de antes); o texto
// visível é tx(loc, 'pt', 'es') inline e os links passam por siteUrl(loc, ...) (/es/... em espanhol). Ver ./i18n.ts.
import type {
  AlertCondition,
  AlertRule,
  AutopsyResponse,
  ClockResponse,
  City,
  CityQuote,
  Flip,
  GuildSummary,
  ItemResponse,
  KillEvent,
  LossesResponse,
  PlayerDossier,
  PlayerHit,
  Verdict,
  HojeTrilha,
} from '../../shared/types';
import type { HojeOpcao as HojeOpcaoX, HojeResponse as HojeResponseX } from '../../shared/types';
import { PREMIUM_30D_GOLD, RENDER_BASE, minutesSince } from '../../shared/market';
import { festivityLabelEs } from '../../shared/festivities';
import { weaponLabelEsFromPt } from '../../shared/weapons';
import { QUALITY_NAMES, QUALITY_NAMES_ES, commandName } from './commands';
import { SITE, intlLocale, siteUrl, tx, type Locale } from './i18n';

export { SITE } from './i18n';

/** Família de arma do embed: em português o rótulo da API como sempre; em espanhol o termo do cliente (shared/weapons). */
function weaponText(w: { type: string; labelPt: string }, loc: Locale): string {
  return loc === 'es' ? weaponLabelEsFromPt(w.labelPt) || w.type : w.labelPt || w.type;
}
export const AMBER = 0xe3a84c;
export const FOOTER = 'Guarita · não afiliado à Sandbox Interactive';
export const FOOTER_ES = 'Guarita · no afiliado a Sandbox Interactive';
/** Acima disto (minutos) o preço é tratado como velho e o embed avisa. */
export const STALE_MIN = 6 * 60;

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}
export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  thumbnail?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}
export interface LinkButton {
  type: 2;
  style: 5;
  label: string;
  url: string;
}
export interface MessageData {
  content?: string;
  embeds?: Embed[];
  components?: { type: 1; components: LinkButton[] }[];
  flags?: number;
  allowed_mentions?: { parse: string[] };
}

export type NameOf = (id: string) => string;

// ---------- formatação ----------

interface Fmts {
  int: Intl.NumberFormat;
  dec: Intl.NumberFormat;
  pct: Intl.NumberFormat;
  date: Intl.DateTimeFormat;
  short: Intl.DateTimeFormat;
}
const fmtCache = new Map<Locale, Fmts>();
/** Formatadores da língua (criados uma vez por isolate). hourCycle h23: o es-419 usaria "6:00 p.m.". */
function fmts(loc: Locale): Fmts {
  let f = fmtCache.get(loc);
  if (!f) {
    const l = intlLocale(loc);
    const when = { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;
    f = {
      int: new Intl.NumberFormat(l, { maximumFractionDigits: 0 }),
      dec: new Intl.NumberFormat(l, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      pct: new Intl.NumberFormat(l, { style: 'percent', maximumFractionDigits: 1 }),
      date: new Intl.DateTimeFormat(l, { ...when, year: 'numeric' }),
      short: new Intl.DateTimeFormat(l, when),
    };
    fmtCache.set(loc, f);
  }
  return f;
}

export function fmtInt(n: number | null | undefined, loc: Locale = 'pt'): string {
  return n == null || !Number.isFinite(n) ? '—' : fmts(loc).int.format(Math.round(n));
}
export function fmtDec(n: number | null | undefined, loc: Locale = 'pt'): string {
  return n == null || !Number.isFinite(n) ? '—' : fmts(loc).dec.format(n);
}
export function fmtPct(frac: number | null | undefined, loc: Locale = 'pt'): string {
  return frac == null || !Number.isFinite(frac) ? '—' : fmts(loc).pct.format(frac);
}
/** "09/11/2026 08:00" em horário de Brasília. */
export function fmtDateBr(iso: string | null | undefined, loc: Locale = 'pt'): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return fmts(loc).date.format(new Date(iso)).replace(',', '');
}
/** "09/11 08:00" em horário de Brasília. */
export function fmtShortBr(iso: string | null | undefined, loc: Locale = 'pt'): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return fmts(loc).short.format(new Date(iso)).replace(',', '');
}
/** Marcação de tempo relativo do Discord ("em 3 dias"), localizada no cliente de quem lê. */
export function discordRelative(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : `<t:${Math.floor(t / 1000)}:R>`;
}
/** Idade em minutos → "agora", "há 12 min", "há 3 h", "há 2 dias" ("ahora", "hace 12 min"... em espanhol). */
export function ageLabel(min: number | null | undefined, loc: Locale = 'pt'): string {
  if (min == null || !Number.isFinite(min)) return tx(loc, 'sem data', 'sin fecha');
  if (min < 1) return tx(loc, 'agora', 'ahora');
  if (min < 60) return tx(loc, `há ${Math.round(min)} min`, `hace ${Math.round(min)} min`);
  const h = Math.round(min / 60);
  if (h < 48) return tx(loc, `há ${h} h`, `hace ${h} h`);
  return tx(loc, `há ${Math.round(min / 1440)} dias`, `hace ${Math.round(min / 1440)} días`);
}
export function ageOf(iso: string | null | undefined, now = Date.now(), loc: Locale = 'pt'): string {
  return ageLabel(minutesSince(iso ?? null, now), loc);
}
export function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}
/** Escapa a marcação do Discord em texto vindo de fora (nome de jogador, guilda). */
export function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/([\\*_~`|>#\[\]()-])/g, '\\$1').replace(/@/g, '@\u200b');
}
export function qualityName(q: number, loc: Locale = 'pt'): string {
  return (loc === 'es' ? QUALITY_NAMES_ES : QUALITY_NAMES)[q] ?? tx(loc, `Qualidade ${q}`, `Calidad ${q}`);
}
/** Cidade como o jogo mostra: igual nas duas línguas, só o Black Market vira "Mercado Negro" em espanhol. */
export function cityName(city: string, loc: Locale = 'pt'): string {
  return loc === 'es' && city === 'Black Market' ? 'Mercado Negro' : city;
}
export function itemIcon(id: string, quality = 1): string {
  return `${RENDER_BASE}/${encodeURIComponent(id)}.png?quality=${quality}&size=64`;
}

/** Aplica os limites do Discord (título 256, descrição 4096, 25 campos, valor 1024, total 6000). */
export function finalize(e: Embed, loc: Locale = 'pt'): Embed {
  const out: Embed = { color: AMBER, footer: { text: tx(loc, FOOTER, FOOTER_ES) }, ...e };
  if (out.title) out.title = clamp(out.title, 256);
  if (out.description) out.description = clamp(out.description, 4096);
  let fields = (out.fields ?? [])
    .filter((f) => f.name && f.value)
    .slice(0, 25)
    .map((f) => ({ ...f, name: clamp(f.name, 256), value: clamp(f.value, 1024) }));
  const size = () =>
    (out.title?.length ?? 0) + (out.description?.length ?? 0) + (out.footer?.text.length ?? 0) +
    fields.reduce((s, f) => s + f.name.length + f.value.length, 0);
  while (fields.length && size() > 6000) fields = fields.slice(0, -1);
  if (size() > 6000 && out.description) out.description = clamp(out.description, Math.max(1, out.description.length - (size() - 6000)));
  out.fields = fields.length ? fields : undefined;
  if (!out.fields) delete out.fields;
  return out;
}

export function message(
  embed: Embed,
  opts: { link?: { label: string; url: string }; ephemeral?: boolean; loc?: Locale } = {},
): MessageData {
  const m: MessageData = { embeds: [finalize(embed, opts.loc)], allowed_mentions: { parse: [] } };
  if (opts.link) m.components = [{ type: 1, components: [{ type: 2, style: 5, label: opts.link.label, url: opts.link.url }] }];
  if (opts.ephemeral) m.flags = 64;
  return m;
}

/** Mensagem simples (erro, aviso). Efêmera por padrão. */
export function notice(text: string, ephemeral = true): MessageData {
  const m: MessageData = { content: clamp(text, 2000), allowed_mentions: { parse: [] } };
  if (ephemeral) m.flags = 64;
  return m;
}

// ---------- /preco ----------

const VERDICT_TEXT: Record<Verdict, string> = {
  barato: 'barato',
  normal: 'preço normal',
  caro: 'caro',
  'sem dado': 'sem dado suficiente',
};
const VERDICT_TEXT_ES: Record<Verdict, string> = {
  barato: 'barato',
  normal: 'precio normal',
  caro: 'caro',
  'sem dado': 'sin datos suficientes',
};
function verdictText(v: Verdict, loc: Locale): string {
  return (loc === 'es' ? VERDICT_TEXT_ES : VERDICT_TEXT)[v];
}
/** Rótulo do selo de confiança (a API manda em português: alta, média, baixa, sem dado). */
function confidenceText(label: string, loc: Locale): string {
  if (loc !== 'es') return label;
  return ({ alta: 'alta', média: 'media', baixa: 'baja', 'sem dado': 'sin datos' } as Record<string, string>)[label] ?? label;
}

function quoteLine(q: CityQuote, bm: boolean, loc: Locale): string {
  const price = bm ? q.buyMax : q.sellMin;
  if (price == null) return tx(loc, 'sem dado', 'sin datos');
  const at = bm ? q.buyMaxAt : q.sellMinAt;
  const age = at ? ageOf(at, undefined, loc) : ageLabel(q.ageMin, loc);
  const conf = confidenceText(q.confidence.label, loc);
  const lines = [
    tx(loc, `**${fmtInt(price)}** prata`, `**${fmtInt(price, loc)}** de plata`),
    tx(loc, `${age} · selo ${q.confidence.score} (${conf})`, `${age} · confianza ${q.confidence.score} (${conf})`),
  ];
  if (!bm && q.verdict !== 'sem dado') lines.push(verdictText(q.verdict, loc));
  return lines.join('\n');
}

/** Melhor flip com Premium (só os lucrativos). */
export function bestFlip(flips: Flip[]): Flip | null {
  return flips.filter((f) => f.profitPremium > 0).sort((a, b) => b.profitPremium - a.profitPremium)[0] ?? null;
}

/** Cidade mais barata para comprar (sell order), fora o Black Market. */
export function cheapest(cities: CityQuote[]): CityQuote | null {
  return cities.filter((c) => c.city !== 'Black Market' && c.sellMin != null).sort((a, b) => a.sellMin! - b.sellMin!)[0] ?? null;
}

export function itemUrl(id: string, quality = 1, loc: Locale = 'pt'): string {
  return siteUrl(loc, `/item/${encodeURIComponent(id)}${quality > 1 ? `?q=${quality}` : ''}`);
}

export function renderPreco(item: ItemResponse, label: string, now = Date.now(), loc: Locale = 'pt'): MessageData {
  const url = itemUrl(item.id, item.quality, loc);
  const cheap = cheapest(item.cities);
  const desc: string[] = [];
  if (cheap) {
    const age = ageOf(cheap.sellMinAt, now, loc);
    desc.push(
      tx(
        loc,
        `Mais barato: **${cheap.city}** por **${fmtInt(cheap.sellMin)}** prata (${age}).`,
        `Más barato: **${cityName(cheap.city, loc)}** por **${fmtInt(cheap.sellMin, loc)}** de plata (${age}).`,
      ),
    );
  } else {
    desc.push(
      tx(
        loc,
        'Nenhuma cidade com ordem de venda conhecida. O dado vem de jogadores que rodam o cliente do Albion Data Project.',
        'Ninguna ciudad con orden de venta conocida. El dato viene de jugadores que usan el cliente de Albion Data Project.',
      ),
    );
  }
  if (item.median7d != null) {
    const range =
      item.p25 != null && item.p75 != null
        ? tx(loc, ` · faixa normal ${fmtInt(item.p25)} a ${fmtInt(item.p75)}`, ` · rango normal de ${fmtInt(item.p25, loc)} a ${fmtInt(item.p75, loc)}`)
        : '';
    desc.push(tx(loc, `Mediana de 7 dias: ${fmtInt(item.median7d)}${range}.`, `Mediana de 7 días: ${fmtInt(item.median7d, loc)}${range}.`));
  }
  const cheapAge = cheap ? minutesSince(cheap.sellMinAt, now) ?? cheap.ageMin : null;
  if (cheapAge != null && cheapAge > STALE_MIN) {
    desc.push(tx(loc, '⚠️ Dado velho: confirme o preço no jogo antes de comprar.', '⚠️ Dato antiguo: confirma el precio en el juego antes de comprar.'));
  }

  // Cidades com dado primeiro, Black Market por último (preço de venda instantânea).
  const order = [...item.cities].sort((a, b) => {
    if (a.city === 'Black Market') return 1;
    if (b.city === 'Black Market') return -1;
    return (a.sellMin ?? Infinity) - (b.sellMin ?? Infinity);
  });
  const fields: EmbedField[] = order.map((q) => ({
    name: q.city === 'Black Market' ? tx(loc, 'Black Market (compra)', 'Mercado Negro (compra)') : q.city,
    value: quoteLine(q, q.city === 'Black Market', loc),
    inline: true,
  }));

  const verdict: Verdict = cheap?.verdict ?? 'sem dado';
  fields.push({
    name: tx(loc, 'Veredito', 'Veredicto'),
    value: cheap
      ? tx(
          loc,
          `${cap(VERDICT_TEXT[verdict])} em ${cheap.city}${verdict === 'sem dado' ? ' (pouco histórico para comparar)' : ', comparado aos últimos dias'}.`,
          `${cap(VERDICT_TEXT_ES[verdict])} en ${cityName(cheap.city, loc)}${verdict === 'sem dado' ? ' (poco historial para comparar)' : ', comparado con los últimos días'}.`,
        )
      : tx(loc, 'Sem dado para dar veredito.', 'Sin datos para dar un veredicto.'),
  });

  const flip = bestFlip(item.flips);
  fields.push({
    name: tx(loc, 'Melhor flip para o Black Market', 'Mejor reventa al Mercado Negro'),
    value: flip
      ? tx(
          loc,
          `Compre em **${flip.from}** por ${fmtInt(flip.buyAt)} e venda no Black Market por ${fmtInt(flip.sellAt)}.\n` +
            `Lucro **${fmtInt(flip.profitPremium)}** com Premium (${fmtInt(flip.profitNoPremium)} sem) · retorno ${fmtPct(flip.roi)} · dado ${ageLabel(flip.ageMin)}.`,
          `Compra en **${cityName(flip.from, loc)}** por ${fmtInt(flip.buyAt, loc)} y vende en el Mercado Negro por ${fmtInt(flip.sellAt, loc)}.\n` +
            `Ganancia de **${fmtInt(flip.profitPremium, loc)}** con Premium (${fmtInt(flip.profitNoPremium, loc)} sin) · retorno ${fmtPct(flip.roi, loc)} · dato ${ageLabel(flip.ageMin, loc)}.`,
        )
      : tx(loc, 'Nenhum flip lucrativo para o Black Market agora.', 'Ningún flip rentable al Mercado Negro ahora.'),
  });

  return message(
    {
      title: `${label} · ${qualityName(item.quality, loc)}`,
      url,
      description: desc.join('\n'),
      thumbnail: { url: itemIcon(item.id, item.quality) },
      fields,
      timestamp: item.fetchedAt,
    },
    { link: { label: tx(loc, 'Ver na Guarita', 'Ver en Guarita'), url }, loc },
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- /relogio ----------

const SERVER_TEXT: Record<ClockResponse['server']['status'], string> = {
  online: '🟢 Online',
  offline: '🔴 Offline',
  manutenção: '🟠 Em manutenção',
  desconhecido: '⚪ Desconhecido',
};
const SERVER_TEXT_ES: Record<ClockResponse['server']['status'], string> = {
  online: '🟢 En línea',
  offline: '🔴 Fuera de línea',
  manutenção: '🟠 En mantenimiento',
  desconhecido: '⚪ Desconocido',
};
/** Tendência do ouro (a API manda em português). */
function trendText(t: string, loc: Locale): string {
  if (loc !== 'es') return t;
  return ({ subindo: 'subiendo', caindo: 'bajando', estável: 'estable' } as Record<string, string>)[t] ?? t;
}

export function renderClock(c: ClockResponse, now = Date.now(), loc: Locale = 'pt'): MessageData {
  const fields: EmbedField[] = [];
  const msg = c.server.message?.trim();
  const st = loc === 'es' ? SERVER_TEXT_ES : SERVER_TEXT;
  const checked = ageOf(c.server.checkedAt, now, loc);
  fields.push({
    name: tx(loc, 'Servidor Americas', 'Servidor Americas'),
    value: `${st[c.server.status] ?? st.desconhecido}${msg ? `\n${clamp(esc(msg), 300)}` : ''}\n${tx(loc, `conferido ${checked}`, `revisado ${checked}`)}`,
  });

  const active = c.festivities.filter((f) => Date.parse(f.start) <= now && Date.parse(f.end) > now);
  const next = c.festivities
    .filter((f) => Date.parse(f.start) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, 5);
  fields.push({
    name: tx(loc, 'Bônus ativos agora', 'Bonificaciones activas ahora'),
    value: active.length
      ? active
          .slice(0, 10)
          .map((f) => tx(loc, `• ${f.labelPt || f.name} · até ${fmtShortBr(f.end)}`, `• ${festivityLabelEs(f.kind, f.category, f.name)} · hasta ${fmtShortBr(f.end, loc)}`))
          .join('\n')
      : tx(loc, 'Nenhum bônus ativo agora.', 'Ninguna bonificación activa ahora.'),
  });
  if (next.length) {
    fields.push({
      name: tx(loc, 'Próximas festividades', 'Próximas festividades'),
      value: next
        .map((f) => tx(loc, `• ${f.labelPt || f.name} · começa ${fmtShortBr(f.start)}`, `• ${festivityLabelEs(f.kind, f.category, f.name)} · empieza ${fmtShortBr(f.start, loc)}`))
        .join('\n'),
    });
  }

  const g = c.gold;
  const trend = g.trend === 'sem dado' ? '' : ` · ${trendText(g.trend, loc)}`;
  fields.push({
    name: tx(loc, 'Ouro', 'Oro'),
    value:
      g.price != null
        ? tx(loc, `**${fmtInt(g.price)}** prata por ouro${trend}`, `**${fmtInt(g.price, loc)}** de plata por oro${trend}`) +
          (g.p30 != null ? tx(loc, `\nmédia de 30 dias: ${fmtInt(g.p30)}`, `\npromedio de 30 días: ${fmtInt(g.p30, loc)}`) : '') +
          (g.at ? tx(loc, `\ncotação ${ageOf(g.at, now)}`, `\ncotización ${ageOf(g.at, now, loc)}`) : '')
        : tx(loc, 'Sem cotação agora.', 'Sin cotización ahora.'),
    inline: true,
  });
  fields.push({
    name: tx(loc, 'Premium (30 dias)', 'Premium (30 días)'),
    value:
      c.premiumSilver != null
        ? tx(
            loc,
            `${fmtInt(PREMIUM_30D_GOLD)} ouro ≈ **${fmtInt(c.premiumSilver)}** prata`,
            `${fmtInt(PREMIUM_30D_GOLD, loc)} de oro ≈ **${fmtInt(c.premiumSilver, loc)}** de plata`,
          )
        : tx(loc, 'Sem cotação do ouro.', 'Sin cotización del oro.'),
    inline: true,
  });
  fields.push({
    name: c.season.name,
    value: tx(
      loc,
      `Termina por volta de **${fmtDateBr(c.season.end)}** ${discordRelative(c.season.end)}\n(data aproximada, sem anúncio oficial confirmado)`,
      `Termina alrededor del **${fmtDateBr(c.season.end, loc)}** ${discordRelative(c.season.end)}\n(fecha aproximada, sin anuncio oficial confirmado)`,
    ),
  });

  const url = siteUrl(loc, '/relogio');
  return message(
    {
      title: tx(loc, 'Relógio do Americas', 'Reloj de Americas'),
      url,
      description: tx(
        loc,
        `Agora: ${fmtDateBr(new Date(now).toISOString())} (horário de Brasília).`,
        `Ahora: ${fmtDateBr(new Date(now).toISOString(), loc)} (hora de Brasilia).`,
      ),
      fields,
    },
    { link: { label: tx(loc, 'Abrir o relógio', 'Abrir el reloj'), url }, loc },
  );
}

// ---------- jogadores ----------

export function playerUrl(id: string, loc: Locale = 'pt'): string {
  return siteUrl(loc, `/jogador/${encodeURIComponent(id)}`);
}

function guildLine(guild: string, alliance: string, loc: Locale): string {
  if (!guild) return tx(loc, 'Sem guilda', 'Sin gremio');
  return tx(
    loc,
    `Guilda **${esc(guild)}**${alliance ? ` · aliança **${esc(alliance)}**` : ''}`,
    `Gremio **${esc(guild)}**${alliance ? ` · alianza **${esc(alliance)}**` : ''}`,
  );
}

/** Rótulo de perigo (a API manda em português; os motivos seguem em português até a API mandar códigos). */
function dangerText(label: string, loc: Locale): string {
  if (loc !== 'es') return label;
  return ({ tranquilo: 'tranquilo', atenção: 'precaución', perigoso: 'peligroso', 'sem dado': 'sin datos' } as Record<string, string>)[label] ?? label;
}

/** Vários jogadores com nome parecido: mostra os 5 primeiros com link. */
export function renderPlayerList(players: PlayerHit[], query: string, loc: Locale = 'pt'): MessageData {
  const top = players.slice(0, 5);
  const lines = top.map((p) =>
    tx(
      loc,
      `• [${esc(p.name)}](${playerUrl(p.id)})${p.guild ? ` · ${esc(p.guild)}` : ''} · fama de abate ${fmtInt(p.killFame)}`,
      `• [${esc(p.name)}](${playerUrl(p.id, loc)})${p.guild ? ` · ${esc(p.guild)}` : ''} · fama por asesinatos ${fmtInt(p.killFame, loc)}`,
    ),
  );
  const more =
    players.length > 5
      ? tx(
          loc,
          `\n…e mais ${players.length - 5}. Digite o nome completo para afunilar.`,
          `\n…y ${players.length - 5} más. Escribe el nombre completo para acotar la búsqueda.`,
        )
      : '';
  return message(
    {
      title: tx(loc, `Jogadores encontrados para “${clamp(query, 40)}”`, `Jugadores encontrados para “${clamp(query, 40)}”`),
      description: tx(
        loc,
        `Nenhum nome bate exatamente. Repita o comando com o nome exato:\n\n${lines.join('\n')}${more}`,
        `Ningún nombre coincide exactamente. Repite el comando con el nombre exacto:\n\n${lines.join('\n')}${more}`,
      ),
    },
    { loc },
  );
}

function eventLine(e: KillEvent, asKiller: boolean, now: number, loc: Locale): string {
  const other = asKiller ? e.victim : e.killer;
  const verb = asKiller ? tx(loc, 'matou', 'mató a') : tx(loc, 'morto por', 'muerto por');
  const guild = other.guild ? ` [${esc(other.guild)}]` : '';
  const group = e.participants > 1 ? tx(loc, ` · grupo de ${e.participants}`, ` · grupo de ${e.participants}`) : tx(loc, ' · solo', ' · en solitario');
  return tx(
    loc,
    `• ${verb} **${esc(other.name)}**${guild} ${ageOf(e.time, now)} · ${fmtInt(e.totalFame)} fama${group}`,
    `• ${verb} **${esc(other.name)}**${guild} ${ageOf(e.time, now, loc)} · ${fmtInt(e.totalFame, loc)} de fama${group}`,
  );
}

export function renderDossier(d: PlayerDossier, now = Date.now(), loc: Locale = 'pt'): MessageData {
  const url = playerUrl(d.id, loc);
  const fields: EmbedField[] = [];
  const dg = d.danger;
  fields.push({
    name: tx(loc, 'Perigo', 'Peligro'),
    value:
      dg.label === 'sem dado'
        ? tx(loc, 'Sem dado suficiente para medir.', 'Sin datos suficientes para medirlo.')
        : `**${dangerText(dg.label, loc)}** (${dg.score}/100)${dg.reasons.length ? '\n' + dg.reasons.slice(0, 4).map((r) => `• ${r}`).join('\n') : ''}`,
  });
  fields.push({
    name: tx(loc, 'Fama', 'Fama'),
    value: tx(
      loc,
      `Abates: ${fmtInt(d.killFame)}\nMortes: ${fmtInt(d.deathFame)}\nRazão: ${fmtDec(d.ratio)}`,
      `Asesinatos: ${fmtInt(d.killFame, loc)}\nMuertes: ${fmtInt(d.deathFame, loc)}\nProporción: ${fmtDec(d.ratio, loc)}`,
    ),
    inline: true,
  });
  const style: string[] = [];
  if (d.soloRate != null) style.push(tx(loc, `Solo em ${fmtPct(d.soloRate)} das kills recentes`, `En solitario en el ${fmtPct(d.soloRate, loc)} de los asesinatos recientes`));
  if (d.avgGroup != null) style.push(tx(loc, `Grupo médio: ${fmtDec(d.avgGroup)}`, `Grupo promedio: ${fmtDec(d.avgGroup, loc)}`));
  if (d.avgIp != null) style.push(tx(loc, `IP médio: ${fmtInt(d.avgIp)}`, `IP medio: ${fmtInt(d.avgIp, loc)}`));
  fields.push({ name: tx(loc, 'Estilo', 'Estilo'), value: style.length ? style.join('\n') : tx(loc, 'Sem lutas recentes.', 'Sin combates recientes.'), inline: true });
  if (d.weapons.length) {
    fields.push({
      name: tx(loc, 'Armas mais usadas', 'Armas más usadas'),
      value: d.weapons.slice(0, 3).map((w) => `• ${weaponText(w, loc)} (${w.count}×)`).join('\n'),
      inline: true,
    });
  }
  const none = tx(loc, 'Nenhuma no killboard recente.', 'Ninguna en el killboard reciente.');
  fields.push({
    name: tx(loc, 'Últimas kills', 'Últimos asesinatos'),
    value: d.recentKills.length ? d.recentKills.slice(0, 3).map((e) => eventLine(e, true, now, loc)).join('\n') : none,
  });
  fields.push({
    name: tx(loc, 'Últimas mortes', 'Últimas muertes'),
    value: d.recentDeaths.length ? d.recentDeaths.slice(0, 3).map((e) => eventLine(e, false, now, loc)).join('\n') : none,
  });
  return message(
    {
      title: tx(loc, `Dossiê: ${d.name}`, `Dosier: ${d.name}`),
      url,
      description: tx(
        loc,
        `${guildLine(d.guild, d.alliance, loc)}\nDado público do killboard oficial, ${ageOf(d.fetchedAt, now)}.`,
        `${guildLine(d.guild, d.alliance, loc)}\nDato público del killboard oficial, ${ageOf(d.fetchedAt, now, loc)}.`,
      ),
      fields,
      timestamp: d.fetchedAt,
    },
    { link: { label: tx(loc, 'Dossiê completo', 'Dosier completo'), url }, loc },
  );
}

export function renderAutopsy(player: { id: string; name: string }, a: AutopsyResponse, nameOf: NameOf, now = Date.now(), loc: Locale = 'pt'): MessageData {
  const url = `${playerUrl(player.id, loc)}/morte`;
  const title = tx(loc, `Autópsia: ${player.name}`, `Autopsia: ${player.name}`);
  const d = a.death;
  if (!d) {
    return message(
      { title, url, description: tx(loc, 'Nenhuma morte recente no killboard público.', 'Ninguna muerte reciente en el killboard público.') },
      { link: { label: tx(loc, 'Abrir na Guarita', 'Abrir en Guarita'), url }, loc },
    );
  }
  const k = d.killer;
  const killer = `**${esc(k.name)}**${k.guild ? ` [${esc(k.guild)}]` : ''}`;
  const desc = [
    tx(loc, `Morto por ${killer}${k.ip ? ` (IP ${fmtInt(k.ip)})` : ''}`, `Muerto por ${killer}${k.ip ? ` (IP ${fmtInt(k.ip, loc)})` : ''}`),
    tx(loc, `${fmtDateBr(d.time)} (Brasília), ${ageOf(d.time, now)}.`, `${fmtDateBr(d.time, loc)} (hora de Brasilia), ${ageOf(d.time, now, loc)}.`),
    tx(
      loc,
      `${d.participants > 1 ? `${d.participants} participantes` : 'Luta solo'} · fama total ${fmtInt(d.totalFame)}`,
      `${d.participants > 1 ? `${d.participants} participantes` : 'Combate en solitario'} · fama total ${fmtInt(d.totalFame, loc)}`,
    ),
  ];
  const fields: EmbedField[] = [];
  fields.push({
    name: tx(loc, 'Equipamento perdido (estimado)', 'Equipo perdido (estimado)'),
    value:
      d.estValue != null
        ? tx(loc, `≈ **${fmtInt(d.estValue)}** prata`, `≈ **${fmtInt(d.estValue, loc)}** de plata`)
        : tx(loc, 'Sem preço suficiente para estimar.', 'Sin precios suficientes para estimarlo.'),
    inline: true,
  });
  if (a.killerDossier) {
    const kd = a.killerDossier;
    const w = kd.weapons[0];
    fields.push({
      name: tx(loc, 'Quem matou', 'Quién lo mató'),
      value: [
        kd.danger.label !== 'sem dado'
          ? tx(loc, `Perigo: **${kd.danger.label}** (${kd.danger.score}/100)`, `Peligro: **${dangerText(kd.danger.label, loc)}** (${kd.danger.score}/100)`)
          : null,
        tx(loc, `Razão abate/morte: ${fmtDec(kd.ratio)}`, `Proporción asesinatos/muertes: ${fmtDec(kd.ratio, loc)}`),
        w ? `Arma favorita: ${weaponText(w, loc)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      inline: true,
    });
  }
  if (a.lessons.length) fields.push({ name: tx(loc, 'Lições', 'Lecciones'), value: a.lessons.slice(0, 5).map((l) => `• ${l}`).join('\n') });
  if (a.rebuy.length) {
    const lines = a.rebuy.slice(0, 10).map((r) => {
      const where =
        r.price != null && r.cheapestCity
          ? tx(loc, `${fmtInt(r.price)} em ${r.cheapestCity}`, `${fmtInt(r.price, loc)} en ${cityName(r.cheapestCity, loc)}`)
          : tx(loc, 'sem preço', 'sin precio');
      return `• ${nameOf(r.id)} (${qualityName(r.quality, loc)}): ${where}`;
    });
    const total =
      a.rebuyTotal != null
        ? tx(loc, `\n**Total para repor: ${fmtInt(a.rebuyTotal)} prata**`, `\n**Total para reponer: ${fmtInt(a.rebuyTotal, loc)} de plata**`)
        : '';
    fields.push({ name: tx(loc, 'Para repor o equipamento', 'Para reponer el equipo'), value: lines.join('\n') + total });
  }
  return message(
    { title, url, description: desc.join('\n'), fields, timestamp: d.time },
    { link: { label: tx(loc, 'Autópsia completa', 'Autopsia completa'), url }, loc },
  );
}

// ---------- /alerta ----------

export function conditionText(c: AlertCondition, loc: Locale = 'pt'): string {
  switch (c.kind) {
    case 'below':
      return tx(loc, `abaixo de ${fmtInt(c.price)} prata`, `por debajo de ${fmtInt(c.price, loc)} de plata`);
    case 'above':
      return tx(loc, `acima de ${fmtInt(c.price)} prata`, `por encima de ${fmtInt(c.price, loc)} de plata`);
    case 'belowMedianPct':
      return tx(
        loc,
        `${fmtInt(c.pct)}% abaixo da mediana de 7 dias da cidade`,
        `${fmtInt(c.pct, loc)} % por debajo de la mediana de 7 días de la ciudad`,
      );
  }
}

function citiesText(cities: City[], loc: Locale): string {
  return cities.length ? cities.map((c) => cityName(c, loc)).join(', ') : tx(loc, 'todas as cidades', 'todas las ciudades');
}

export function renderAlertCreated(rule: AlertRule, label: string, loc: Locale = 'pt'): MessageData {
  return message(
    {
      title: tx(loc, 'Alerta criado', 'Alerta creada'),
      description: tx(
        loc,
        `**${label}** (${qualityName(rule.quality)}) em ${citiesText(rule.cities, loc)}: aviso quando o preço de ` +
          `${rule.side === 'buy' ? 'compra' : 'venda'} ficar ${conditionText(rule.condition)}.\n\n` +
          `Checagem a cada 5 minutos; depois de um aviso, a mesma regra espera ${fmtInt(rule.cooldownMin)} min. ` +
          'O aviso chega por mensagem direta: deixe as DMs de membros deste servidor liberadas.',
        `**${label}** (${qualityName(rule.quality, loc)}) en ${citiesText(rule.cities, loc)}: aviso cuando el precio de ` +
          `${rule.side === 'buy' ? 'compra' : 'venta'} esté ${conditionText(rule.condition, loc)}.\n\n` +
          `Revisión cada 5 minutos; después de un aviso, la misma regla espera ${fmtInt(rule.cooldownMin, loc)} min. ` +
          'El aviso llega por mensaje directo: permite los mensajes directos de miembros de este servidor.',
      ),
      fields: [{ name: tx(loc, 'Identificador', 'Identificador'), value: `\`${rule.id}\`` }],
    },
    { ephemeral: true, loc },
  );
}

export function renderAlertList(rules: AlertRule[], nameOf: NameOf, now = Date.now(), loc: Locale = 'pt'): MessageData {
  if (!rules.length) {
    return message(
      {
        title: tx(loc, 'Seus alertas', 'Tus alertas'),
        description: tx(
          loc,
          'Você ainda não tem alertas. Crie um com `/alerta criar`.',
          `Todavía no tienes alertas. Crea una con \`${commandName('alerta criar', loc)}\`.`,
        ),
      },
      { ephemeral: true, loc },
    );
  }
  const lines = rules.slice(0, 25).map((r) => {
    const fired = r.lastFiredAt
      ? tx(loc, `último aviso ${ageOf(r.lastFiredAt, now)}`, `último aviso ${ageOf(r.lastFiredAt, now, loc)}`)
      : tx(loc, 'ainda sem aviso', 'todavía sin avisos');
    return `\`${r.id}\` · **${nameOf(r.itemId)}** (${qualityName(r.quality, loc)}) · ${citiesText(r.cities, loc)} · ${conditionText(r.condition, loc)} · ${fired}`;
  });
  const more = rules.length > 25 ? tx(loc, `\n…e mais ${rules.length - 25}.`, `\n…y ${rules.length - 25} más.`) : '';
  return message(
    {
      title: tx(loc, `Seus alertas (${rules.length})`, `Tus alertas (${rules.length})`),
      description:
        lines.join('\n') +
        more +
        tx(
          loc,
          '\n\nPara apagar: `/alerta apagar id:<identificador>`.',
          `\n\nPara borrar: \`${commandName('alerta apagar', loc)} id:<identificador>\`.`,
        ),
    },
    { ephemeral: true, loc },
  );
}

/** Rótulo de uma regra nas opções do autocomplete de /alerta apagar (até 100 caracteres). */
export function alertChoiceLabel(r: AlertRule, nameOf: NameOf, loc: Locale = 'pt'): string {
  return clamp(`${nameOf(r.itemId)} · ${citiesText(r.cities, loc)} · ${conditionText(r.condition, loc)}`, 100);
}

// ---------- /ajuda ----------

export function renderHelp(loc: Locale = 'pt'): MessageData {
  const c = (path: string) => commandName(path, loc);
  const permitido = siteUrl(loc, '/permitido');
  const home = siteUrl(loc, '/');
  if (loc === 'es') {
    return message(
      {
        title: 'Guarita en Discord',
        url: home,
        description:
          'Compañero en español para Albion Online (servidor Americas). Solo usa datos públicos: ' +
          'Albion Online Data Project y el killboard oficial. Nada de esto toca el juego.',
        fields: [
          { name: `${c('preco')} objeto calidad`, value: 'Precio en cada ciudad con antigüedad del dato, confianza, veredicto y mejor reventa al Mercado Negro.' },
          { name: c('relogio'), value: 'Servidor, bonificaciones activas, festividades, oro, Premium en plata y fin de la temporada (hora de Brasilia).' },
          { name: `${c('dossie')} nombre`, value: 'Dosier público de un jugador: peligro, gremio, fama, armas, en solitario o en grupo y últimos combates.' },
          { name: `${c('morte')} nombre`, value: 'Autopsia de la última muerte: quién lo mató, lecciones y cuánto cuesta reponer el equipo.' },
          { name: `${c('alerta')} crear · listar · borrar`, value: 'Alerta de precio por mensaje directo, revisada cada 5 minutos.' },
          { name: `${c('perdas')} periodo`, value: 'Objetos más perdidos en el PvP (hoy o 7 días) con precio actual y valor perdido.' },
          { name: `${c('hoje')} plata minutos premium`, value: 'Qué hacer con tu plata y tu tiempo: reventa al Mercado Negro, refinado con bonificación y transporte, con el cálculo a la vista y los riesgos.' },
          {
            name: `${c('guilda')} configurar · feed · resumen`,
            value:
              'Killfeed del gremio en un canal (asesinatos y muertes del killboard, con minutos de retraso), botón “Pedir regear” en las muertes ' +
              'y resumen de los últimos días. Configurar y activar/desactivar requieren Gestionar servidor.',
          },
          { name: '¿Esto está permitido?', value: `Mira cómo Guarita respeta los Términos del juego: ${permitido}` },
        ],
      },
      { ephemeral: true, link: { label: 'Abrir Guarita', url: home }, loc },
    );
  }
  return message(
    {
      title: 'Guarita no Discord',
      url: SITE,
      description:
        'Companheiro em português para o Albion Online (servidor Americas). Usa só dados públicos: ' +
        'Albion Online Data Project e o killboard oficial. Nada aqui toca no jogo.',
      fields: [
        { name: '/preco item qualidade', value: 'Preço em cada cidade com idade do dado, selo de confiança, veredito e melhor flip para o Black Market.' },
        { name: '/relogio', value: 'Servidor, bônus ativos, festividades, ouro, Premium em prata e fim da temporada (horário de Brasília).' },
        { name: '/dossie nome', value: 'Dossiê público de um jogador: perigo, guilda, fama, armas, solo ou grupo e últimas lutas.' },
        { name: '/morte nome', value: 'Autópsia da última morte: quem matou, lições e quanto custa repor o equipamento.' },
        { name: '/alerta criar · listar · apagar', value: 'Alerta de preço por mensagem direta, checado a cada 5 minutos.' },
        { name: '/perdas dias', value: 'Itens mais perdidos no PvP (hoje ou 7 dias) com preço atual e valor perdido.' },
        { name: '/hoje prata minutos premium', value: 'O que fazer com a sua prata e o seu tempo: flip para o Black Market, refino com bônus e transporte, com a conta aberta e os riscos.' },
        {
          name: '/guilda configurar · feed · resumo',
          value:
            'Killfeed da guilda num canal (kills e mortes do killboard, com minutos de atraso), botão “Pedir regear” nas mortes ' +
            'e resumo dos últimos dias. Configurar e ligar/desligar exigem Gerenciar Servidor.',
        },
        { name: 'Isso é permitido?', value: `Veja como a Guarita respeita os Termos do jogo: ${permitido}` },
      ],
    },
    { ephemeral: true, link: { label: 'Abrir a Guarita', url: SITE } },
  );
}

// ---------- Fase 2: /perdas ----------

/** "2026-10-30" → "30/10" (dia UTC do jogo, sem conversão de fuso). */
export function fmtDay(day: string | null | undefined): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(day ?? '');
  return m ? `${m[3]}/${m[2]}` : '—';
}

export function renderLosses(r: LossesResponse, nameOf: NameOf, loc: Locale = 'pt'): MessageData {
  const url = siteUrl(loc, `/perdas${r.days > 1 ? `?dias=${r.days}` : ''}`);
  const janela = r.days <= 1 ? tx(loc, 'hoje', 'hoy') : tx(loc, `últimos ${r.days} dias`, `últimos ${r.days} días`);
  const lines = r.items.slice(0, 10).map((it, k) => {
    // Em espanhol o nome vem das fatias names-es (nameOf); o `name` da API é o português.
    const own = it.name && it.name !== it.id ? it.name : null;
    const name = loc === 'es' ? (nameOf(it.id) !== it.id ? nameOf(it.id) : own ?? it.id) : own ?? nameOf(it.id);
    const price = it.price != null ? tx(loc, `${fmtInt(it.price)} cada`, `${fmtInt(it.price, loc)} c/u`) : tx(loc, 'sem preço', 'sin precio');
    const value = it.value != null ? tx(loc, ` · **${fmtInt(it.value)}** prata`, ` · **${fmtInt(it.value, loc)}** de plata`) : '';
    // Nome vem do dump de itens (nosso), não de jogador: sem escape, igual à autópsia.
    return tx(loc, `${k + 1}. **${name}** · perdido ${fmtInt(it.count)}× · ${price}${value}`, `${k + 1}. **${name}** · perdido ${fmtInt(it.count, loc)}× · ${price}${value}`);
  });
  const since = r.since ? tx(loc, ` desde ${fmtDay(r.since)}`, ` desde el ${fmtDay(r.since)}`) : '';
  const coverage = tx(
    loc,
    `Amostra de ${fmtInt(r.sampleKills)} mortes do killboard do Americas, coletadas pela Guarita` +
      since +
      (r.days <= 1 ? '. “Hoje” é o dia do jogo, que vira às 21:00 de Brasília.' : '.'),
    `Muestra de ${fmtInt(r.sampleKills, loc)} muertes del killboard de Americas, recopiladas por Guarita` +
      since +
      (r.days <= 1 ? '. “Hoy” es el día del juego, que cambia a las 21:00 de Brasilia.' : '.'),
  );
  return message(
    {
      title: tx(loc, `Itens mais perdidos no PvP · ${janela}`, `Objetos más perdidos en el PvP · ${janela}`),
      url,
      description: [
        lines.length ? lines.join('\n') : tx(loc, 'Ainda não há mortes coletadas nessa janela.', 'Todavía no hay muertes recopiladas en ese período.'),
        '',
        coverage,
        tx(
          loc,
          'Valor = vezes perdido × preço atual (menor venda nas cidades reais e Caerleon): quanto as mortes colocaram em jogo. Parte do que cai é saqueada e volta ao mercado.',
          'Valor = veces perdido × precio actual (venta más baja en las ciudades reales y Caerleon): cuánto pusieron en juego las muertes. Parte de lo que cae se lleva como botín y vuelve al mercado.',
        ),
      ].join('\n'),
      timestamp: r.fetchedAt,
    },
    { link: { label: tx(loc, 'Ver na Guarita', 'Ver en Guarita'), url }, loc },
  );
}

// ---------- Fase 2: /guilda ----------

export function guildUrl(name: string, loc: Locale = 'pt'): string {
  return siteUrl(loc, `/guilda/${encodeURIComponent(name)}`);
}

/** As `n` horas com mais kills (horário de Brasília), ex.: "21h (14), 22h (9)". */
export function peakHours(hoursBrt: number[], n = 3, loc: Locale = 'pt'): string | null {
  const top = hoursBrt
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, n);
  return top.length ? top.map((h) => `${h.hour}h (${fmtInt(h.count, loc)})`).join(', ') : null;
}

export function renderGuildSummary(g: GuildSummary, warning: string | null = null, loc: Locale = 'pt'): MessageData {
  const url = guildUrl(g.name, loc);
  const head: string[] = [g.alliance ? tx(loc, `Aliança **${esc(g.alliance)}**`, `Alianza **${esc(g.alliance)}**`) : tx(loc, 'Sem aliança', 'Sin alianza')];
  if (g.members != null) head.push(tx(loc, `${fmtInt(g.members)} membros`, `${fmtInt(g.members, loc)} miembros`));
  const fame: string[] = [];
  if (g.killFame != null) fame.push(tx(loc, `fama de abate ${fmtInt(g.killFame)}`, `fama por asesinatos ${fmtInt(g.killFame, loc)}`));
  if (g.deathFame != null) fame.push(tx(loc, `fama de morte ${fmtInt(g.deathFame)}`, `fama por muertes ${fmtInt(g.deathFame, loc)}`));
  const desc = [head.join(' · ')];
  if (fame.length) desc.push(cap(fame.join(' · ')) + '.');
  if (warning) desc.push('', warning);

  const fields: EmbedField[] = [];
  const days = [...g.days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  if (days.length) {
    const k = days.reduce((s, d) => s + d.kills, 0);
    const d = days.reduce((s, x) => s + x.deaths, 0);
    fields.push({
      name: tx(
        loc,
        `Últimos ${days.length} ${days.length === 1 ? 'dia' : 'dias'}: ${fmtInt(k)} kills, ${fmtInt(d)} mortes`,
        `${days.length === 1 ? 'Último día' : `Últimos ${days.length} días`}: ${fmtInt(k, loc)} asesinatos, ${fmtInt(d, loc)} muertes`,
      ),
      value: days
        .map((x) =>
          tx(
            loc,
            `${fmtDay(x.date)}: ${fmtInt(x.kills)} kills · ${fmtInt(x.deaths)} mortes`,
            `${fmtDay(x.date)}: ${fmtInt(x.kills, loc)} asesinatos · ${fmtInt(x.deaths, loc)} muertes`,
          ),
        )
        .join('\n'),
    });
  } else {
    fields.push({
      name: tx(loc, 'Últimos dias', 'Últimos días'),
      value: tx(loc, 'Nenhuma kill ou morte da guilda na amostra coletada.', 'Ningún asesinato ni muerte del gremio en la muestra recopilada.'),
    });
  }
  if (g.topKillers.length) {
    fields.push({
      name: tx(loc, 'Quem mais mata', 'Quién mata más'),
      value: g.topKillers
        .slice(0, 5)
        .map((p) =>
          tx(
            loc,
            `• [${esc(p.name)}](${playerUrl(p.id)}) · ${fmtInt(p.kills)} kills`,
            `• [${esc(p.name)}](${playerUrl(p.id, loc)}) · ${fmtInt(p.kills, loc)} asesinatos`,
          ),
        )
        .join('\n'),
      inline: true,
    });
  }
  if (g.weapons.length) {
    fields.push({
      name: tx(loc, 'Armas mais usadas', 'Armas más usadas'),
      value: g.weapons.slice(0, 5).map((w) => `• ${weaponText(w, loc)} (${fmtInt(w.count, loc)}×)`).join('\n'),
      inline: true,
    });
  }
  const peak = peakHours(g.hoursBrt, 3, loc);
  if (peak) fields.push({ name: tx(loc, 'Horários com mais kills (Brasília)', 'Horarios con más asesinatos (hora de Brasilia)'), value: peak });
  const since = g.coverageSince ? tx(loc, ` desde ${fmtDay(g.coverageSince)}`, ` desde el ${fmtDay(g.coverageSince)}`) : '';
  fields.push({
    name: tx(loc, 'De onde vem', 'De dónde viene'),
    value: tx(
      loc,
      'Amostra do killboard público do Americas coletada pela Guarita' + since + '; membros e fama pela API oficial.',
      'Muestra del killboard público de Americas recopilada por Guarita' + since + '; miembros y fama por la API oficial.',
    ),
  });
  return message(
    { title: tx(loc, `Guilda ${g.name}`, `Gremio ${g.name}`), url, description: desc.join('\n'), fields, timestamp: g.fetchedAt },
    { link: { label: tx(loc, 'Página da guilda', 'Página del gremio'), url }, loc },
  );
}

/** Nome sem correspondência exata: lista as parecidas (ou diz que não achou). Efêmera. */
export function renderGuildChoices(guilds: { name: string; alliance: string }[], query: string, loc: Locale = 'pt'): MessageData {
  const q = clamp(query, 40);
  if (!guilds.length) {
    return notice(
      tx(
        loc,
        `Nenhuma guilda chamada “${q}” no killboard do Americas. Confira o nome exato, com os espaços.`,
        `Ningún gremio llamado “${q}” en el killboard de Americas. Revisa el nombre exacto, con los espacios.`,
      ),
    );
  }
  const lines = guilds
    .slice(0, 5)
    .map((g) => `• ${esc(g.name)}${g.alliance ? tx(loc, ` · aliança ${esc(g.alliance)}`, ` · alianza ${esc(g.alliance)}`) : ''}`);
  return notice(
    tx(
      loc,
      `Nenhuma guilda com o nome exato “${q}”. Repita o comando com um destes nomes:\n${lines.join('\n')}`,
      `Ningún gremio con el nombre exacto “${q}”. Repite el comando con uno de estos nombres:\n${lines.join('\n')}`,
    ),
  );
}

/** Mensagem postada no canal ao configurar (também prova que o bot consegue escrever ali). */
export function renderFeedWelcome(guildName: string, userId: string, loc: Locale = 'pt'): MessageData {
  return message(
    {
      title: tx(loc, `Killfeed da guilda ${guildName} ligado neste canal`, `Killfeed del gremio ${guildName} activado en este canal`),
      url: guildUrl(guildName, loc),
      description: tx(
        loc,
        'As kills e mortes da guilda registradas no killboard oficial aparecem aqui com alguns minutos de atraso. ' +
          'É histórico, não aviso de inimigo por perto.\n\n' +
          'Em cada morte, o botão “Pedir regear” monta a lista de recompra do equipamento para os oficiais. ' +
          'A Guarita não paga nem transfere prata: aprovação e pagamento ficam com a guilda.\n\n' +
          `Configurado por <@${userId}>.`,
        'Los asesinatos y las muertes del gremio registrados en el killboard oficial aparecen aquí con unos minutos de retraso. ' +
          'Es un historial, no un aviso de enemigos cerca.\n\n' +
          'En cada muerte, el botón “Pedir regear” arma la lista de recompra del equipo para los oficiales. ' +
          'Guarita no paga ni transfiere plata: la aprobación y el pago quedan a cargo del gremio.\n\n' +
          `Configurado por <@${userId}>.`,
      ),
    },
    { loc },
  );
}

export function renderFeedConfigured(guild: { name: string; alliance: string }, channelId: string, loc: Locale = 'pt'): MessageData {
  return message(
    {
      title: tx(loc, 'Killfeed configurado', 'Killfeed configurado'),
      url: guildUrl(guild.name, loc),
      description: tx(
        loc,
        `Guilda **${esc(guild.name)}**${guild.alliance ? ` (aliança ${esc(guild.alliance)})` : ''} no canal <#${channelId}>.\n\n` +
          'A coleta roda a cada 5 minutos, com o atraso do próprio killboard, e guarda uma amostra das mortes do Americas: ' +
          'nem toda luta da guilda aparece. Em rodadas cheias, parte dos eventos vira um resumo “+N eventos” para não lotar o canal.\n\n' +
          'Para pausar: `/guilda feed desligar`. Para trocar de guilda ou de canal, use `/guilda configurar` de novo.',
        `Gremio **${esc(guild.name)}**${guild.alliance ? ` (alianza ${esc(guild.alliance)})` : ''} en el canal <#${channelId}>.\n\n` +
          'La recopilación corre cada 5 minutos, con el retraso del propio killboard, y guarda una muestra de las muertes de Americas: ' +
          'no aparecen todos los combates del gremio. En rondas con mucho movimiento, parte de los eventos se resume como “+N eventos” para no llenar el canal.\n\n' +
          `Para pausar: \`${commandName('guilda feed desligar', loc)}\`. Para cambiar de gremio o de canal, usa \`${commandName('guilda configurar', loc)}\` otra vez.`,
      ),
    },
    { ephemeral: true, loc },
  );
}

export function renderFeedToggled(guildName: string, channelId: string, enabled: boolean, loc: Locale = 'pt'): MessageData {
  return notice(
    enabled
      ? tx(loc, `Killfeed da guilda **${esc(guildName)}** ligado em <#${channelId}>.`, `Killfeed del gremio **${esc(guildName)}** activado en <#${channelId}>.`)
      : tx(
          loc,
          `Killfeed da guilda **${esc(guildName)}** desligado. Para voltar: \`/guilda feed ligar\`.`,
          `Killfeed del gremio **${esc(guildName)}** desactivado. Para reactivarlo: \`${commandName('guilda feed ligar', loc)}\`.`,
        ),
  );
}

// ---------- Fase 2: regear ----------

export interface RegearView {
  time: string;
  victim: { id: string; name: string; guild: string };
  killer: { name: string; guild: string };
  rebuy: { id: string; quality: number; price: number | null; cheapestCity: string | null; count?: number }[];
  rebuyTotal: number | null;
}

/** Pedido de regear postado no canal, mencionando quem clicou (a menção não notifica ninguém). */
export function renderRegear(r: RegearView, clickerId: string, nameOf: NameOf, loc: Locale = 'pt'): MessageData {
  const total = r.rebuyTotal != null ? tx(loc, `${fmtInt(r.rebuyTotal)} prata`, `${fmtInt(r.rebuyTotal, loc)} de plata`) : tx(loc, 'sem preço suficiente', 'sin precios suficientes');
  const lines = r.rebuy.slice(0, 12).map((x) => {
    const qty = (x.count ?? 1) > 1 ? ` ×${fmtInt(x.count, loc)}` : '';
    const where =
      x.price != null && x.cheapestCity
        ? tx(loc, `${fmtInt(x.price)} em ${x.cheapestCity}`, `${fmtInt(x.price, loc)} en ${cityName(x.cheapestCity, loc)}`)
        : tx(loc, 'sem preço', 'sin precio');
    return tx(
      loc,
      `• ${nameOf(x.id)}${qty} (${qualityName(Math.max(1, x.quality))} ou melhor): ${where}`,
      `• ${nameOf(x.id)}${qty} (${qualityName(Math.max(1, x.quality), loc)} o mejor): ${where}`,
    );
  });
  const missing = r.rebuy.filter((x) => x.price == null).length;
  const notes = [
    tx(
      loc,
      'Menor preço de venda nas cidades reais e Caerleon (Albion Online Data Project); confira no jogo antes de comprar.',
      'Precio de venta más bajo en las ciudades reales y Caerleon (Albion Online Data Project); confírmalo en el juego antes de comprar.',
    ),
  ];
  if (missing) {
    notes.push(
      tx(
        loc,
        `${missing} ${missing === 1 ? 'item ficou' : 'itens ficaram'} sem preço e fora do total.`,
        `${missing} ${missing === 1 ? 'objeto quedó' : 'objetos quedaron'} sin precio y fuera del total.`,
      ),
    );
  }
  notes.push(tx(loc, 'A Guarita só monta a lista: aprovação e pagamento ficam com a guilda.', 'Guarita solo arma la lista: la aprobación y el pago quedan a cargo del gremio.'));
  const victim = `**${esc(r.victim.name)}**${r.victim.guild ? ` [${esc(r.victim.guild)}]` : ''}`;
  const killer = `**${esc(r.killer.name)}**${r.killer.guild ? ` [${esc(r.killer.guild)}]` : ''}`;
  const m = message(
    {
      title: tx(loc, `Pedido de regear de ${r.victim.name}: total ${total}`, `Solicitud de regear de ${r.victim.name}: total ${total}`),
      url: playerUrl(r.victim.id, loc),
      description: tx(
        loc,
        `${victim} morreu para ${killer} em ${fmtDateBr(r.time)} (horário de Brasília).`,
        `${victim} murió a manos de ${killer} el ${fmtDateBr(r.time, loc)} (hora de Brasilia).`,
      ),
      color: 0xe74c3c,
      fields: [
        {
          name: tx(loc, 'Lista de recompra', 'Lista de recompra'),
          value: lines.length ? lines.join('\n') : tx(loc, 'A vítima não tinha equipamento registrado.', 'La víctima no tenía equipo registrado.'),
        },
        { name: tx(loc, 'Observações', 'Observaciones'), value: notes.join('\n') },
      ],
      timestamp: r.time,
    },
    { loc },
  );
  return { ...m, content: tx(loc, `<@${clickerId}> pediu regear.`, `<@${clickerId}> pidió regear.`) };
}

// ---------- Fase 3: /hoje (módulo c) ----------

const TRILHA_NOME: Record<HojeTrilha, string> = { flip: 'Flip para o Black Market', refino: 'Refino com bônus', transporte: 'Transporte' };
const TRILHA_NOME_ES: Record<HojeTrilha, string> = { flip: 'Reventa al Mercado Negro', refino: 'Refinado con bonificación', transporte: 'Transporte' };

export function hojeUrl(r: { prata: number; minutos: number; premium: boolean }, loc: Locale = 'pt'): string {
  return siteUrl(loc, `/hoje?prata=${Math.round(r.prata)}&minutos=${r.minutos}&premium=${r.premium ? 1 : 0}`);
}

/**
 * Até 2 opções por trilha, cada uma com a conta aberta, os passos, o selo e o principal risco. Título, passos, riscos e
 * notas vêm prontos da API (getHoje): em espanhol, só saem em espanhol se o getHoje for chamado com a língua.
 */
export function renderHoje(r: HojeResponseX, now = Date.now(), loc: Locale = 'pt'): MessageData {
  const shown: HojeOpcaoX[] = [];
  for (const t of ['flip', 'refino', 'transporte'] as HojeTrilha[]) shown.push(...r.opcoes.filter((o) => o.trilha === t).slice(0, 2));
  const fields: EmbedField[] = shown.map((o) => {
    const c = o.conta;
    const conta = c
      ? tx(
          loc,
          `Compra ${fmtInt(c.compra)} · venda ${fmtInt(c.venda)} · taxas ${fmtInt(c.taxas)} → **lucro estimado ${fmtInt(c.lucro)}**`,
          `Compra ${fmtInt(c.compra, loc)} · venta ${fmtInt(c.venda, loc)} · impuestos ${fmtInt(c.taxas, loc)} → **ganancia estimada ${fmtInt(c.lucro, loc)}**`,
        )
      : tx(
          loc,
          `**Lucro estimado ${fmtInt(o.lucro)}** com ${fmtInt(o.capital)} investidos`,
          `**Ganancia estimada ${fmtInt(o.lucro, loc)}** con ${fmtInt(o.capital, loc)} invertidos`,
        );
    const passos = o.passos.slice(0, 5).map((p, k) => `${k + 1}. ${p}`).join('\n');
    const risco = o.riscos[0] ? `\n⚠️ ${o.riscos[0]}` : '';
    return {
      name: clamp(
        tx(loc, `${TRILHA_NOME[o.trilha]} · confiança ${o.confianca}/100`, `${TRILHA_NOME_ES[o.trilha]} · confianza ${o.confianca}/100`),
        256,
      ),
      value: clamp(`${esc(o.titulo.replace(/^[^:]+:\s*/, ''))}\n${conta}\n${passos}${risco}`, 1024),
    };
  });
  const notas = (r.notas ?? []).slice(0, 4);
  const age = ageOf(r.fetchedAt, now, loc);
  const description = [
    tx(
      loc,
      `Com **${fmtInt(r.prata)} de prata**, ${r.minutos} min e ${r.premium ? 'Premium' : 'sem Premium'}.`,
      `Con **${fmtInt(r.prata, loc)} de plata**, ${r.minutos} min y ${r.premium ? 'Premium' : 'sin Premium'}.`,
    ),
    shown.length ? '' : tx(loc, 'Nenhuma opção dá lucro com esses valores agora.', 'Ninguna opción da ganancia con esos valores ahora.'),
    ...notas.map((n) => `• ${n}`),
    tx(
      loc,
      `Preços enviados por jogadores (Albion Data Project), consultados ${age}: mudam rápido e não são promessa de lucro. Tempo de viagem é estimativa.`,
      `Precios enviados por jugadores (Albion Data Project), consultados ${age}: cambian rápido y no son una promesa de ganancia. El tiempo de viaje es una estimación.`,
    ),
  ]
    .filter(Boolean)
    .join('\n');
  const url = hojeUrl(r, loc);
  return message(
    { title: tx(loc, 'O que fazer hoje', 'Qué hacer hoy'), url, description, fields, timestamp: r.fetchedAt },
    { link: { label: tx(loc, 'Ver a conta completa no site', 'Ver el cálculo completo en el sitio'), url }, loc },
  );
}
