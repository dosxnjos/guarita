// Embeds do bot em PT-BR (funções puras: recebem os dados do contrato e devolvem JSON da API do Discord).
// Datas para o usuário em horário de Brasília; números com milhar pt-BR. Limites do Discord aplicados em finalize().
import type {
  AlertCondition,
  AlertRule,
  AutopsyResponse,
  ClockResponse,
  City,
  CityQuote,
  Flip,
  ItemResponse,
  KillEvent,
  PlayerDossier,
  PlayerHit,
  Verdict,
} from '../../shared/types';
import { PREMIUM_30D_GOLD, RENDER_BASE, minutesSince } from '../../shared/market';
import { QUALITY_NAMES } from './commands';

export const SITE = 'https://guarita.pages.dev';
export const AMBER = 0xe3a84c;
export const FOOTER = 'Guarita · não afiliado à Sandbox Interactive';
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

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const shortDateFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function fmtInt(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : intFmt.format(Math.round(n));
}
export function fmtDec(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : decFmt.format(n);
}
export function fmtPct(frac: number | null | undefined): string {
  return frac == null || !Number.isFinite(frac) ? '—' : pctFmt.format(frac);
}
/** "09/11/2026 08:00" em horário de Brasília. */
export function fmtDateBr(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return dateFmt.format(new Date(iso)).replace(',', '');
}
/** "09/11 08:00" em horário de Brasília. */
export function fmtShortBr(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return shortDateFmt.format(new Date(iso)).replace(',', '');
}
/** Marcação de tempo relativo do Discord ("em 3 dias"), localizada no cliente de quem lê. */
export function discordRelative(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : `<t:${Math.floor(t / 1000)}:R>`;
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
export function ageOf(iso: string | null | undefined, now = Date.now()): string {
  return ageLabel(minutesSince(iso ?? null, now));
}
export function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}
/** Escapa a marcação do Discord em texto vindo de fora (nome de jogador, guilda). */
export function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/([\\*_~`|>#\[\]()-])/g, '\\$1').replace(/@/g, '@\u200b');
}
export function qualityName(q: number): string {
  return QUALITY_NAMES[q] ?? `Qualidade ${q}`;
}
export function itemIcon(id: string, quality = 1): string {
  return `${RENDER_BASE}/${encodeURIComponent(id)}.png?quality=${quality}&size=64`;
}

/** Aplica os limites do Discord (título 256, descrição 4096, 25 campos, valor 1024, total 6000). */
export function finalize(e: Embed): Embed {
  const out: Embed = { color: AMBER, footer: { text: FOOTER }, ...e };
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

export function message(embed: Embed, opts: { link?: { label: string; url: string }; ephemeral?: boolean } = {}): MessageData {
  const m: MessageData = { embeds: [finalize(embed)], allowed_mentions: { parse: [] } };
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

function quoteLine(q: CityQuote, bm: boolean): string {
  const price = bm ? q.buyMax : q.sellMin;
  if (price == null) return 'sem dado';
  const at = bm ? q.buyMaxAt : q.sellMinAt;
  const age = at ? ageOf(at) : ageLabel(q.ageMin);
  const lines = [`**${fmtInt(price)}** prata`, `${age} · selo ${q.confidence.score} (${q.confidence.label})`];
  if (!bm && q.verdict !== 'sem dado') lines.push(VERDICT_TEXT[q.verdict]);
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

export function itemUrl(id: string, quality = 1): string {
  return `${SITE}/item/${encodeURIComponent(id)}${quality > 1 ? `?q=${quality}` : ''}`;
}

export function renderPreco(item: ItemResponse, label: string, now = Date.now()): MessageData {
  const url = itemUrl(item.id, item.quality);
  const cheap = cheapest(item.cities);
  const desc: string[] = [];
  if (cheap) {
    desc.push(`Mais barato: **${cheap.city}** por **${fmtInt(cheap.sellMin)}** prata (${ageOf(cheap.sellMinAt, now)}).`);
  } else {
    desc.push('Nenhuma cidade com ordem de venda conhecida. O dado vem de jogadores que rodam o cliente do Albion Data Project.');
  }
  if (item.median7d != null) {
    const range = item.p25 != null && item.p75 != null ? ` · faixa normal ${fmtInt(item.p25)} a ${fmtInt(item.p75)}` : '';
    desc.push(`Mediana de 7 dias: ${fmtInt(item.median7d)}${range}.`);
  }
  const cheapAge = cheap ? minutesSince(cheap.sellMinAt, now) ?? cheap.ageMin : null;
  if (cheapAge != null && cheapAge > STALE_MIN) desc.push('⚠️ Dado velho: confirme o preço no jogo antes de comprar.');

  // Cidades com dado primeiro, Black Market por último (preço de venda instantânea).
  const order = [...item.cities].sort((a, b) => {
    if (a.city === 'Black Market') return 1;
    if (b.city === 'Black Market') return -1;
    return (a.sellMin ?? Infinity) - (b.sellMin ?? Infinity);
  });
  const fields: EmbedField[] = order.map((q) => ({
    name: q.city === 'Black Market' ? 'Black Market (compra)' : q.city,
    value: quoteLine(q, q.city === 'Black Market'),
    inline: true,
  }));

  const verdict: Verdict = cheap?.verdict ?? 'sem dado';
  fields.push({
    name: 'Veredito',
    value: cheap
      ? `${cap(VERDICT_TEXT[verdict])} em ${cheap.city}${verdict === 'sem dado' ? ' (pouco histórico para comparar)' : ', comparado aos últimos dias'}.`
      : 'Sem dado para dar veredito.',
  });

  const flip = bestFlip(item.flips);
  fields.push({
    name: 'Melhor flip para o Black Market',
    value: flip
      ? `Compre em **${flip.from}** por ${fmtInt(flip.buyAt)} e venda no Black Market por ${fmtInt(flip.sellAt)}.\n` +
        `Lucro **${fmtInt(flip.profitPremium)}** com Premium (${fmtInt(flip.profitNoPremium)} sem) · retorno ${fmtPct(flip.roi)} · dado ${ageLabel(flip.ageMin)}.`
      : 'Nenhum flip lucrativo para o Black Market agora.',
  });

  return message(
    {
      title: `${label} · ${qualityName(item.quality)}`,
      url,
      description: desc.join('\n'),
      thumbnail: { url: itemIcon(item.id, item.quality) },
      fields,
      timestamp: item.fetchedAt,
    },
    { link: { label: 'Ver na Guarita', url } },
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

export function renderClock(c: ClockResponse, now = Date.now()): MessageData {
  const fields: EmbedField[] = [];
  const msg = c.server.message?.trim();
  fields.push({
    name: 'Servidor Americas',
    value: `${SERVER_TEXT[c.server.status] ?? SERVER_TEXT.desconhecido}${msg ? `\n${clamp(esc(msg), 300)}` : ''}\nconferido ${ageOf(c.server.checkedAt, now)}`,
  });

  const active = c.festivities.filter((f) => Date.parse(f.start) <= now && Date.parse(f.end) > now);
  const next = c.festivities
    .filter((f) => Date.parse(f.start) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, 5);
  fields.push({
    name: 'Bônus ativos agora',
    value: active.length
      ? active.slice(0, 10).map((f) => `• ${f.labelPt || f.name} · até ${fmtShortBr(f.end)}`).join('\n')
      : 'Nenhum bônus ativo agora.',
  });
  if (next.length) {
    fields.push({
      name: 'Próximas festividades',
      value: next.map((f) => `• ${f.labelPt || f.name} · começa ${fmtShortBr(f.start)}`).join('\n'),
    });
  }

  const g = c.gold;
  const trend = g.trend === 'sem dado' ? '' : ` · ${g.trend}`;
  fields.push({
    name: 'Ouro',
    value:
      g.price != null
        ? `**${fmtInt(g.price)}** prata por ouro${trend}` +
          (g.p30 != null ? `\nmédia de 30 dias: ${fmtInt(g.p30)}` : '') +
          (g.at ? `\ncotação ${ageOf(g.at, now)}` : '')
        : 'Sem cotação agora.',
    inline: true,
  });
  fields.push({
    name: 'Premium (30 dias)',
    value: c.premiumSilver != null ? `${fmtInt(PREMIUM_30D_GOLD)} ouro ≈ **${fmtInt(c.premiumSilver)}** prata` : 'Sem cotação do ouro.',
    inline: true,
  });
  fields.push({
    name: c.season.name,
    value: `Termina por volta de **${fmtDateBr(c.season.end)}** ${discordRelative(c.season.end)}\n(data aproximada, sem anúncio oficial confirmado)`,
  });

  return message(
    {
      title: 'Relógio do Americas',
      url: `${SITE}/relogio`,
      description: `Agora: ${fmtDateBr(new Date(now).toISOString())} (horário de Brasília).`,
      fields,
    },
    { link: { label: 'Abrir o relógio', url: `${SITE}/relogio` } },
  );
}

// ---------- jogadores ----------

export function playerUrl(id: string): string {
  return `${SITE}/jogador/${encodeURIComponent(id)}`;
}

function guildLine(guild: string, alliance: string): string {
  if (!guild) return 'Sem guilda';
  return `Guilda **${esc(guild)}**${alliance ? ` · aliança **${esc(alliance)}**` : ''}`;
}

/** Vários jogadores com nome parecido: mostra os 5 primeiros com link. */
export function renderPlayerList(players: PlayerHit[], query: string): MessageData {
  const top = players.slice(0, 5);
  const lines = top.map(
    (p) => `• [${esc(p.name)}](${playerUrl(p.id)})${p.guild ? ` · ${esc(p.guild)}` : ''} · fama de abate ${fmtInt(p.killFame)}`,
  );
  const more = players.length > 5 ? `\n…e mais ${players.length - 5}. Digite o nome completo para afunilar.` : '';
  return message({
    title: `Jogadores encontrados para “${clamp(query, 40)}”`,
    description: `Nenhum nome bate exatamente. Repita o comando com o nome exato:\n\n${lines.join('\n')}${more}`,
  });
}

function eventLine(e: KillEvent, asKiller: boolean, now: number): string {
  const other = asKiller ? e.victim : e.killer;
  const verb = asKiller ? 'matou' : 'morto por';
  const guild = other.guild ? ` [${esc(other.guild)}]` : '';
  const group = e.participants > 1 ? ` · grupo de ${e.participants}` : ' · solo';
  return `• ${verb} **${esc(other.name)}**${guild} ${ageOf(e.time, now)} · ${fmtInt(e.totalFame)} fama${group}`;
}

export function renderDossier(d: PlayerDossier, now = Date.now()): MessageData {
  const url = playerUrl(d.id);
  const fields: EmbedField[] = [];
  const dg = d.danger;
  fields.push({
    name: 'Perigo',
    value:
      dg.label === 'sem dado'
        ? 'Sem dado suficiente para medir.'
        : `**${dg.label}** (${dg.score}/100)${dg.reasons.length ? '\n' + dg.reasons.slice(0, 4).map((r) => `• ${r}`).join('\n') : ''}`,
  });
  fields.push({
    name: 'Fama',
    value: `Abates: ${fmtInt(d.killFame)}\nMortes: ${fmtInt(d.deathFame)}\nRazão: ${fmtDec(d.ratio)}`,
    inline: true,
  });
  const style: string[] = [];
  if (d.soloRate != null) style.push(`Solo em ${fmtPct(d.soloRate)} das kills recentes`);
  if (d.avgGroup != null) style.push(`Grupo médio: ${fmtDec(d.avgGroup)}`);
  if (d.avgIp != null) style.push(`IP médio: ${fmtInt(d.avgIp)}`);
  fields.push({ name: 'Estilo', value: style.length ? style.join('\n') : 'Sem lutas recentes.', inline: true });
  if (d.weapons.length) {
    fields.push({
      name: 'Armas mais usadas',
      value: d.weapons.slice(0, 3).map((w) => `• ${w.labelPt || w.type} (${w.count}×)`).join('\n'),
      inline: true,
    });
  }
  fields.push({
    name: 'Últimas kills',
    value: d.recentKills.length ? d.recentKills.slice(0, 3).map((e) => eventLine(e, true, now)).join('\n') : 'Nenhuma no killboard recente.',
  });
  fields.push({
    name: 'Últimas mortes',
    value: d.recentDeaths.length ? d.recentDeaths.slice(0, 3).map((e) => eventLine(e, false, now)).join('\n') : 'Nenhuma no killboard recente.',
  });
  return message(
    {
      title: `Dossiê: ${d.name}`,
      url,
      description: `${guildLine(d.guild, d.alliance)}\nDado público do killboard oficial, ${ageOf(d.fetchedAt, now)}.`,
      fields,
      timestamp: d.fetchedAt,
    },
    { link: { label: 'Dossiê completo', url } },
  );
}

export function renderAutopsy(player: { id: string; name: string }, a: AutopsyResponse, nameOf: NameOf, now = Date.now()): MessageData {
  const url = `${playerUrl(player.id)}/morte`;
  const d = a.death;
  if (!d) {
    return message(
      { title: `Autópsia: ${player.name}`, url, description: 'Nenhuma morte recente no killboard público.' },
      { link: { label: 'Abrir na Guarita', url } },
    );
  }
  const k = d.killer;
  const desc = [
    `Morto por **${esc(k.name)}**${k.guild ? ` [${esc(k.guild)}]` : ''}${k.ip ? ` (IP ${fmtInt(k.ip)})` : ''}`,
    `${fmtDateBr(d.time)} (Brasília), ${ageOf(d.time, now)}.`,
    `${d.participants > 1 ? `${d.participants} participantes` : 'Luta solo'} · fama total ${fmtInt(d.totalFame)}`,
  ];
  const fields: EmbedField[] = [];
  fields.push({
    name: 'Equipamento perdido (estimado)',
    value: d.estValue != null ? `≈ **${fmtInt(d.estValue)}** prata` : 'Sem preço suficiente para estimar.',
    inline: true,
  });
  if (a.killerDossier) {
    const kd = a.killerDossier;
    const w = kd.weapons[0];
    fields.push({
      name: 'Quem matou',
      value: [
        kd.danger.label !== 'sem dado' ? `Perigo: **${kd.danger.label}** (${kd.danger.score}/100)` : null,
        `Razão abate/morte: ${fmtDec(kd.ratio)}`,
        w ? `Arma favorita: ${w.labelPt || w.type}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      inline: true,
    });
  }
  if (a.lessons.length) fields.push({ name: 'Lições', value: a.lessons.slice(0, 5).map((l) => `• ${l}`).join('\n') });
  if (a.rebuy.length) {
    const lines = a.rebuy.slice(0, 10).map((r) => {
      const where = r.price != null && r.cheapestCity ? `${fmtInt(r.price)} em ${r.cheapestCity}` : 'sem preço';
      return `• ${nameOf(r.id)} (${qualityName(r.quality)}): ${where}`;
    });
    const total = a.rebuyTotal != null ? `\n**Total para repor: ${fmtInt(a.rebuyTotal)} prata**` : '';
    fields.push({ name: 'Para repor o equipamento', value: lines.join('\n') + total });
  }
  return message(
    { title: `Autópsia: ${player.name}`, url, description: desc.join('\n'), fields, timestamp: d.time },
    { link: { label: 'Autópsia completa', url } },
  );
}

// ---------- /alerta ----------

export function conditionText(c: AlertCondition): string {
  switch (c.kind) {
    case 'below':
      return `abaixo de ${fmtInt(c.price)} prata`;
    case 'above':
      return `acima de ${fmtInt(c.price)} prata`;
    case 'belowMedianPct':
      return `${fmtInt(c.pct)}% abaixo da mediana de 7 dias da cidade`;
  }
}

function citiesText(cities: City[]): string {
  return cities.length ? cities.join(', ') : 'todas as cidades';
}

export function renderAlertCreated(rule: AlertRule, label: string): MessageData {
  return message(
    {
      title: 'Alerta criado',
      description:
        `**${label}** (${qualityName(rule.quality)}) em ${citiesText(rule.cities)}: aviso quando o preço de ` +
        `${rule.side === 'buy' ? 'compra' : 'venda'} ficar ${conditionText(rule.condition)}.\n\n` +
        `Checagem a cada 5 minutos; depois de um aviso, a mesma regra espera ${fmtInt(rule.cooldownMin)} min. ` +
        'O aviso chega por mensagem direta: deixe as DMs de membros deste servidor liberadas.',
      fields: [{ name: 'Identificador', value: `\`${rule.id}\`` }],
    },
    { ephemeral: true },
  );
}

export function renderAlertList(rules: AlertRule[], nameOf: NameOf, now = Date.now()): MessageData {
  if (!rules.length) {
    return message(
      { title: 'Seus alertas', description: 'Você ainda não tem alertas. Crie um com `/alerta criar`.' },
      { ephemeral: true },
    );
  }
  const lines = rules.slice(0, 25).map((r) => {
    const fired = r.lastFiredAt ? `último aviso ${ageOf(r.lastFiredAt, now)}` : 'ainda sem aviso';
    return `\`${r.id}\` · **${nameOf(r.itemId)}** (${qualityName(r.quality)}) · ${citiesText(r.cities)} · ${conditionText(r.condition)} · ${fired}`;
  });
  const more = rules.length > 25 ? `\n…e mais ${rules.length - 25}.` : '';
  return message(
    {
      title: `Seus alertas (${rules.length})`,
      description: lines.join('\n') + more + '\n\nPara apagar: `/alerta apagar id:<identificador>`.',
    },
    { ephemeral: true },
  );
}

/** Rótulo de uma regra nas opções do autocomplete de /alerta apagar (até 100 caracteres). */
export function alertChoiceLabel(r: AlertRule, nameOf: NameOf): string {
  return clamp(`${nameOf(r.itemId)} · ${citiesText(r.cities)} · ${conditionText(r.condition)}`, 100);
}

// ---------- /ajuda ----------

export function renderHelp(): MessageData {
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
        { name: 'Isso é permitido?', value: `Veja como a Guarita respeita os Termos do jogo: ${SITE}/permitido` },
      ],
    },
    { ephemeral: true, link: { label: 'Abrir a Guarita', url: SITE } },
  );
}
