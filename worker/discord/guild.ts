// Módulo (b) da Fase 2: guilda no Discord. Cliente das rotas /guild-feeds do Hub (binding de DO, como os
// alertas), busca da guilda na gameinfo, POST do bot num canal e a lista de regear de uma morte.
// O killfeed em si roda no cron do guarita-core (src/feed.ts); aqui só configuração e o botão "Pedir regear".
import type { Env } from '../env';
import type { PriceRow, RebuyLine } from '../../shared/types';
import { cachedJsonMeta } from '../lib/cache';
import { aodpPrices } from '../lib/aodp';
import { Budget, GameinfoError, GI_TTL, gameinfoCached, gameinfoFetch } from '../lib/gameinfo';
import { GEAR_CITIES, buildRebuy, idsForOneCall, normalizeEvents, type SlimEvent } from '../api/player';
import { commandName } from './commands';
import { tx, type Locale } from './i18n';

const API = 'https://discord.com/api/v10';
const UA = 'DiscordBot (https://guarita.pages.dev, 0.1)';

/** Permissões do Discord (bitfield em string no member.permissions). */
export const PERM = { ADMINISTRATOR: 8n, MANAGE_GUILD: 32n } as const;
/** Tipos de canal aceitos no feed: texto (0) e anúncios (5). */
export const FEED_CHANNEL_TYPES = [0, 5] as const;
/** Evento da gameinfo não muda depois de registrado: cache longo. */
export const EVENT_TTL_S = 7 * 24 * 3600;
/** /events/{id} levou 32 s numa medição (30/10/2026): uma tentativa só, para caber no prazo do followup (25 s). */
export const EVENT_TIMEOUT_MS = 20_000;
export const REGEAR_RE = /^regear:(\d{1,15}):([A-Za-z0-9_-]{6,64})$/;

/** Quem chamou tem Gerenciar Servidor (ou é administrador) no servidor? */
export function canManageGuild(permissions: string | undefined | null): boolean {
  if (!permissions || !/^\d{1,30}$/.test(permissions)) return false;
  const p = BigInt(permissions);
  return (p & PERM.ADMINISTRATOR) !== 0n || (p & PERM.MANAGE_GUILD) !== 0n;
}

// ---------- Hub ----------

/** Feed como o Hub devolve (guarita-core/src/guildFeeds.ts). */
export interface GuildFeed {
  id: string;
  guildIdDiscord: string;
  channelId: string;
  guildName: string;
  guildKey: string;
  albionGuildId: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  lastEventId: number;
  pending: number;
  lastPostAt: string | null;
  /** sem_permissao | canal_sumiu: o cron desligou o feed sozinho. */
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface NewGuildFeed {
  guildIdDiscord: string;
  channelId: string;
  guildName: string;
  albionGuildId: string | null;
  createdBy: string;
}

async function hubCall(env: Env, path: string, init?: RequestInit): Promise<{ status: number; data: any }> {
  const res = await env.HUB.get(env.HUB.idFromName('main')).fetch('https://hub' + path, init);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = { error: 'resposta inválida do hub' };
  }
  return { status: res.status, data };
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function getGuildFeed(env: Env, guildIdDiscord: string): Promise<GuildFeed | null> {
  const { status, data } = await hubCall(env, `/guild-feeds?guild=${encodeURIComponent(guildIdDiscord)}`);
  if (status !== 200) throw new Error(`hub: falha ao ler o feed (${status})`);
  return ((data?.feeds ?? []) as GuildFeed[])[0] ?? null;
}

export async function saveGuildFeed(env: Env, feed: NewGuildFeed): Promise<GuildFeed> {
  const { status, data } = await hubCall(env, '/guild-feeds', jsonInit('POST', feed));
  // O texto do Hub vem em português; em espanhol vale a versão fixa (o 503 do Hub só acontece com o feed cheio).
  if (status === 503) {
    throw new FeedError(
      data?.error ?? 'o killfeed de guildas está cheio agora; tente de novo mais tarde',
      'El killfeed de gremios está lleno ahora; inténtalo de nuevo más tarde.',
    );
  }
  if (status !== 200 && status !== 201) throw new Error(`hub: falha ao salvar o feed (${status})`);
  return data as GuildFeed;
}

export async function setGuildFeedEnabled(env: Env, feed: GuildFeed, enabled: boolean): Promise<GuildFeed> {
  const { status, data } = await hubCall(env, `/guild-feeds/${encodeURIComponent(feed.id)}`, jsonInit('PATCH', { guild: feed.guildIdDiscord, enabled }));
  if (status !== 200) throw new Error(`hub: falha ao ${enabled ? 'ligar' : 'desligar'} o feed (${status})`);
  return data as GuildFeed;
}

/** Erro com texto pronto para o usuário (o interactions.ts converte em UserError); `es` é o mesmo texto em espanhol. */
export class FeedError extends Error {
  constructor(
    message: string,
    readonly es?: string,
  ) {
    super(message);
  }

  /** Texto na língua de quem pediu (sem versão em espanhol, cai no português). */
  textFor(loc: Locale): string {
    return loc === 'es' && this.es ? this.es : this.message;
  }
}

// ---------- gameinfo: guilda ----------

export interface AlbionGuild {
  id: string;
  name: string;
  alliance: string;
  killFame: number | null;
  deathFame: number | null;
}

/** Lê `guilds[]` do /search da gameinfo. Pura. */
export function normalizeGuilds(raw: unknown): AlbionGuild[] {
  const list = raw && typeof raw === 'object' ? (raw as { guilds?: unknown }).guilds : null;
  if (!Array.isArray(list)) throw new GameinfoError('upstream', 'gameinfo: busca de guilda inválida');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return list
    .map((g) => (g && typeof g === 'object' ? (g as Record<string, unknown>) : {}))
    .filter((g) => typeof g.Id === 'string' && typeof g.Name === 'string')
    .map((g) => ({
      id: String(g.Id),
      name: String(g.Name),
      alliance: typeof g.AllianceName === 'string' ? g.AllianceName : '',
      killFame: num(g.KillFame),
      deathFame: num(g.DeathFame),
    }))
    .slice(0, 10);
}

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Nome exato (sem caixa) → a guilda; senão a lista de parecidas (pode ser vazia). Pura. */
export function pickGuild(guilds: AlbionGuild[], name: string): AlbionGuild | AlbionGuild[] {
  const k = key(name);
  return guilds.find((g) => key(g.name) === k) ?? guilds;
}

/**
 * Busca a guilda na gameinfo. Cache próprio (chave `gameinfo-guild/...`): o mesmo /search?q= já é cacheado pela
 * busca de jogador com outra forma normalizada, e dividir a chave envenenaria os dois.
 */
export async function findAlbionGuild(ctx: ExecutionContext, name: string, timeoutMs = 10_000): Promise<AlbionGuild | AlbionGuild[]> {
  const path = `/search?q=${encodeURIComponent(name.trim())}`;
  const res = await cachedJsonMeta(`gameinfo-guild${path}`, GI_TTL.search, ctx, async () =>
    normalizeGuilds(await gameinfoFetch(path, { ctx, budget: new Budget(2), timeoutMs })),
  );
  return pickGuild(res.data, name);
}

// ---------- Discord REST (token do bot) ----------

/** POST de mensagem num canal com o token do bot; devolve o status HTTP (0 em falha de rede). */
export async function botPost(env: Env, channelId: string, body: unknown): Promise<number> {
  return (await botPostMessage(env, channelId, body)).status;
}

/** Como botPost, mas devolve também o id da mensagem criada (para apagar se o passo seguinte falhar). */
export async function botPostMessage(env: Env, channelId: string, body: unknown): Promise<{ status: number; id: string | null }> {
  if (!env.DISCORD_BOT_TOKEN) return { status: 0, id: null };
  try {
    const res = await fetch(`${API}/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    let id: string | null = null;
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
      id = typeof data?.id === 'string' ? data.id : null;
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { status: res.status, id };
  } catch {
    return { status: 0, id: null };
  }
}

/** Apaga uma mensagem do próprio bot (melhor esforço). */
export async function botDelete(env: Env, channelId: string, messageId: string): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN) return;
  try {
    const res = await fetch(`${API}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN, 'User-Agent': UA },
      signal: AbortSignal.timeout(5_000),
    });
    await res.body?.cancel().catch(() => {});
  } catch (err) {
    console.warn('discord: não consegui apagar a mensagem de boas-vindas', String(err));
  }
}

/**
 * Canal do servidor? GET /channels/{id} com o token do bot e compara o guild_id. false só quando o canal é de
 * OUTRO servidor; null quando não deu para conferir (sem acesso, rede, 5xx): aí o POST de boas-vindas decide.
 */
export async function channelInGuild(env: Env, channelId: string, guildId: string): Promise<boolean | null> {
  if (!env.DISCORD_BOT_TOKEN) return null;
  try {
    const res = await fetch(`${API}/channels/${encodeURIComponent(channelId)}`, {
      headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN, 'User-Agent': UA },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const data = (await res.json().catch(() => null)) as { guild_id?: unknown } | null;
    return typeof data?.guild_id === 'string' ? data.guild_id === guildId : null;
  } catch {
    return null;
  }
}

/**
 * Texto para o servidor quando o bot não consegue escrever no canal (403/404 do Discord). Em espanhol, as permissões
 * com o nome que o cliente do Discord em espanhol mostra.
 */
export function channelProblem(status: number, channelId: string, loc: Locale = 'pt'): string | null {
  if (status === 403) {
    return tx(
      loc,
      `Não consegui escrever em <#${channelId}>. Confira se a Guarita está neste servidor e se tem, nesse canal, ` +
        'as permissões Ver canal, Enviar mensagens e Inserir links.',
      `No pude escribir en <#${channelId}>. Revisa si Guarita está en este servidor y si tiene, en ese canal, ` +
        'los permisos Ver canal, Enviar mensajes e Insertar enlaces.',
    );
  }
  if (status === 404) {
    return tx(
      loc,
      `Não achei o canal <#${channelId}>. Ele pode ter sido apagado ou a Guarita não o enxerga.`,
      `No encontré el canal <#${channelId}>. Puede que lo hayan borrado o que Guarita no lo vea.`,
    );
  }
  return null;
}

/** Aviso que o /guilda mostra quando o cron desligou o feed sozinho. */
export function feedWarning(feed: GuildFeed | null, loc: Locale = 'pt'): string | null {
  if (!feed || feed.enabled || !feed.lastError) return null;
  const where = `<#${feed.channelId}>`;
  if (feed.lastError === 'canal_sumiu') {
    return tx(
      loc,
      `⚠️ O killfeed foi desligado: o canal ${where} não existe mais ou a Guarita não o enxerga. Configure de novo com /guilda configurar.`,
      `⚠️ El killfeed se desactivó: el canal ${where} ya no existe o Guarita no lo ve. Configúralo otra vez con ${commandName('guilda configurar', loc)}.`,
    );
  }
  return tx(
    loc,
    `⚠️ O killfeed foi desligado: a Guarita perdeu a permissão de escrever em ${where} (ou saiu do servidor). ` +
      'Devolva as permissões Ver canal, Enviar mensagens e Inserir links e use /guilda feed ligar.',
    `⚠️ El killfeed se desactivó: Guarita perdió el permiso para escribir en ${where} (o salió del servidor). ` +
      `Devuelve los permisos Ver canal, Enviar mensajes e Insertar enlaces y usa ${commandName('guilda feed ligar', loc)}.`,
  );
}

/**
 * Componentes da mensagem com o botão "Pedir regear" desligado e com `label`; o resto fica igual. Vai na própria
 * resposta ao clique (UPDATE_MESSAGE, type 7), antes de qualquer espera: evita pedido repetido. Pura.
 */
export function disabledRegearComponents(components: unknown[], label: string): { type: 1; components: Record<string, unknown>[] }[] {
  return components.map((row) => {
    const r = row as { type?: number; components?: Record<string, unknown>[] };
    return {
      type: 1 as const,
      components: (r.components ?? []).map((c) =>
        typeof c.custom_id === 'string' && c.custom_id.startsWith('regear:')
          ? { type: 2, style: 2, custom_id: c.custom_id, label: label.slice(0, 80), disabled: true }
          : c,
      ),
    };
  });
}

// ---------- regear ----------

export interface RegearList {
  event: SlimEvent;
  rebuy: RebuyLine[];
  rebuyTotal: number | null;
}

export function parseRegearId(customId: string | undefined): { eventId: string; victimId: string } | null {
  const m = REGEAR_RE.exec(customId ?? '');
  return m ? { eventId: m[1], victimId: m[2] } : null;
}

/** Um evento da gameinfo (`/events/{id}` devolve o objeto sozinho, não lista). */
export function normalizeOneEvent(raw: unknown): SlimEvent {
  const e = normalizeEvents([raw])[0];
  if (!e) throw new GameinfoError('upstream', 'gameinfo: evento inválido');
  return e;
}

/**
 * Lista de recompra da morte do evento: equipamento da vítima (gameinfo /events/{id}) precificado em UM lote no
 * AODP (cidades reais + Caerleon, qualidade igual ou melhor). 2 subrequests + cache.
 */
export async function loadRegear(ctx: ExecutionContext, eventId: string, victimId: string): Promise<RegearList> {
  const res = await gameinfoCached(`/events/${encodeURIComponent(eventId)}`, EVENT_TTL_S, normalizeOneEvent, {
    ctx,
    budget: new Budget(1),
    retry: false,
    timeoutMs: EVENT_TIMEOUT_MS,
  });
  const event = res.data;
  if (event.victim.id !== victimId) {
    throw new FeedError('Este botão não corresponde à morte registrada no killboard.', 'Este botón no corresponde a la muerte registrada en el killboard.');
  }
  const gear = event.victim.gear;
  const ids = idsForOneCall(gear.map((g) => g.id));
  let rows: PriceRow[] = [];
  if (ids.length) {
    try {
      rows = await aodpPrices(ids, GEAR_CITIES, [1, 2, 3, 4, 5], ctx);
    } catch (err) {
      console.warn('regear: AODP falhou, lista sai sem preço', String(err));
    }
  }
  const { rebuy, rebuyTotal } = buildRebuy(gear, rows);
  return { event, rebuy, rebuyTotal };
}
