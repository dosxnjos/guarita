// Endpoint de interações do Discord (HTTP, sem gateway). Fluxo: verifica Ed25519 → roteia por tipo:
// PING (1) → PONG; comando (2) → resposta rápida ou adiada (5) com followup via ctx.waitUntil;
// autocomplete (4) → opções (8). Erros viram mensagem efêmera em PT-BR; nada de stack para o usuário.
import type { Env } from '../env';
import type { AlertCondition, AlertRule, City, Quality } from '../../shared/types';
import {
  searchItems,
  quickSearch,
  isSearchReady,
  warmItemsIndex,
  tierLabel,
  type ItemHit,
  type ItemsIndex,
  type ItemTuple,
} from '../../shared/items';
import { acLabel, acSearch } from '../lib/acIndex';
import { GameinfoError } from '../lib/gameinfo';
import { getItem } from '../api/market';
import { getClock } from '../api/clock';
import { searchPlayers, getDossier, getAutopsy } from '../api/player';
import { createAlert, listAlerts, deleteAlert, type NewAlert } from '../api/alerts';
import { getGuild, getLosses } from '../api/insights';
import { CoreError, GuildNotFound } from '../api/insightsA';
import {
  FEED_CHANNEL_TYPES,
  FeedError,
  botPost,
  canManageGuild,
  channelProblem,
  channelInGuild,
  disabledRegearComponents,
  botDelete,
  botPostMessage,
  feedWarning,
  findAlbionGuild,
  getGuildFeed,
  loadRegear,
  parseRegearId,
  saveGuildFeed,
  setGuildFeedEnabled,
  type GuildFeed,
} from './guild';
import { MEDIAN_PCT_MAX, MEDIAN_PCT_MIN } from '../../shared/alertLimits';
import { verifyDiscordRequest } from './verify';
import { ALERT_CITIES, CONDITIONS, type ConditionKey } from './commands';
import {
  alertChoiceLabel,
  clamp,
  notice,
  renderAlertCreated,
  renderAlertList,
  renderAutopsy,
  renderClock,
  renderDossier,
  renderFeedConfigured,
  renderFeedToggled,
  renderFeedWelcome,
  renderGuildChoices,
  renderGuildSummary,
  renderHelp,
  renderLosses,
  renderPlayerList,
  renderPreco,
  renderRegear,
  type MessageData,
  type NameOf,
} from './render';

const API = 'https://discord.com/api/v10';
const UA = 'DiscordBot (https://guarita.pages.dev, 0.1)';
/** Prazo para responder direto; o Discord exige resposta em 3 s, o resto vira adiado. */
export const FAST_BUDGET_MS = 2200;
/** Alerta disparado só depois de um intervalo (min) entre dois avisos da mesma regra. */
export const DEFAULT_COOLDOWN_MIN = 60;
/** Teto do trabalho adiado (o ctx.waitUntil do Cloudflare corta em ~30 s depois da resposta). */
export const DELIVER_DEADLINE_MS = 25_000;
/** Timeout de cada tentativa da busca de guilda no /guilda configurar (2 × 7 s + POST de 8 s cabem nos 25 s). */
export const CONFIGURE_SEARCH_TIMEOUT_MS = 7_000;

const IT = { PING: 1, COMMAND: 2, COMPONENT: 3, AUTOCOMPLETE: 4 } as const;
const R = { PONG: 1, MESSAGE: 4, DEFERRED: 5, UPDATE_MESSAGE: 7, AUTOCOMPLETE: 8 } as const;
const EPHEMERAL = 64;

// ---------- tipos mínimos da interação ----------

export interface InteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  focused?: boolean;
  options?: InteractionOption[];
}
export interface Interaction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  data?: {
    name?: string;
    options?: InteractionOption[];
    /** Componente (type 3): id do botão e tipo do componente. */
    custom_id?: string;
    component_type?: number;
    /** Canais escolhidos em opção CHANNEL (tipo do canal vem aqui). */
    resolved?: { channels?: Record<string, { id: string; type: number; name?: string }> };
  };
  /** Servidor onde a interação aconteceu (ausente em DM). */
  guild_id?: string;
  channel_id?: string;
  /** permissions: bitfield em string com as permissões do membro no canal. */
  member?: { user?: { id: string; username?: string; global_name?: string | null }; nick?: string | null; permissions?: string };
  user?: { id: string; username?: string; global_name?: string | null };
  /** Mensagem do botão clicado (type 3). */
  message?: { id: string; channel_id?: string; components?: unknown[] };
}
export interface InteractionResponse {
  type: number;
  /** `{ components }`: UPDATE_MESSAGE (7) do botão de regear, que troca só os componentes da mensagem clicada. */
  data?: MessageData | { choices: { name: string; value: string }[] } | { flags: number } | { components: unknown[] };
}

/** Erro com mensagem pronta para o usuário (validação, nada encontrado). */
export class UserError extends Error {}

// ---------- entrada ----------

export async function handleDiscord(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') return new Response('método não permitido', { status: 405, headers: { Allow: 'POST' } });
  const v = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
  if (!v.ok) {
    console.warn('discord: requisição rejeitada:', v.reason);
    return new Response('assinatura inválida', { status: 401 });
  }
  let interaction: Interaction;
  try {
    interaction = JSON.parse(v.body) as Interaction;
  } catch {
    return new Response('corpo inválido', { status: 400 });
  }
  return Response.json(await dispatch(interaction, env, ctx));
}

export async function dispatch(i: Interaction, env: Env, ctx: ExecutionContext): Promise<InteractionResponse> {
  switch (i.type) {
    case IT.PING:
      return { type: R.PONG };
    case IT.AUTOCOMPLETE:
      return { type: R.AUTOCOMPLETE, data: { choices: await autocomplete(i, env, ctx).catch(logEmpty) } };
    case IT.COMMAND:
      try {
        return await command(i, env, ctx);
      } catch (err) {
        return { type: R.MESSAGE, data: notice(friendly(err)) };
      }
    case IT.COMPONENT:
      try {
        return component(i, env, ctx);
      } catch (err) {
        return { type: R.MESSAGE, data: notice(friendly(err)) };
      }
    default:
      return { type: R.MESSAGE, data: notice('Interação não suportada por este bot.') };
  }
}

function logEmpty(err: unknown): [] {
  console.error('discord: autocomplete falhou', err);
  return [];
}

// ---------- opções ----------

/**
 * Subcomando escolhido (ex.: "criar" em /alerta criar) e as opções efetivas. Em grupo de subcomandos, `sub` vem
 * com o grupo na frente (ex.: "feed ligar" em /guilda feed ligar).
 */
export function readOptions(i: Interaction): { sub: string | null; opts: InteractionOption[] } {
  const top = i.data?.options ?? [];
  const group = top.find((o) => o.type === 2);
  if (group) {
    const inner = (group.options ?? []).find((o) => o.type === 1);
    return { sub: inner ? `${group.name} ${inner.name}` : group.name, opts: inner?.options ?? [] };
  }
  const sub = top.find((o) => o.type === 1);
  return sub ? { sub: sub.name, opts: sub.options ?? [] } : { sub: null, opts: top };
}
export function opt<T extends string | number>(opts: InteractionOption[], name: string): T | undefined {
  return opts.find((o) => o.name === name)?.value as T | undefined;
}
export function focusedOption(i: Interaction): InteractionOption | null {
  return readOptions(i).opts.find((o) => o.focused) ?? null;
}
/** Dono do pedido: member.user.id no servidor, user.id em DM. */
export function ownerOf(i: Interaction): string | null {
  return i.member?.user?.id ?? i.user?.id ?? null;
}

// ---------- itens ----------

const byIdCache = new WeakMap<ItemsIndex, Map<string, ItemTuple>>();
function byId(index: ItemsIndex): Map<string, ItemTuple> {
  let m = byIdCache.get(index);
  if (!m) {
    m = new Map(index.items.map((t) => [t[0].toUpperCase(), t]));
    byIdCache.set(index, m);
  }
  return m;
}

/** "Bolsa do Adepto (T4.1)", até 100 caracteres (limite de opção do Discord). */
export function itemLabel(t: ItemTuple | { pt: string; en: string; id: string; tier: number; ench: number }): string {
  const [id, pt, en, tier, ench] = Array.isArray(t) ? t : [t.id, t.pt, t.en, t.tier, t.ench];
  const tl = tierLabel(tier, ench);
  return clamp(`${pt || en || id}${tl ? ` (${tl})` : ''}`, 100);
}

/** Resolve de antemão os rótulos dos ids pelas fatias names/ (barato) e devolve a função síncrona que o render usa. */
async function labelsFor(env: Env, ids: string[]): Promise<NameOf> {
  const uniq = [...new Set(ids.filter(Boolean).map((id) => id.toUpperCase()))].slice(0, 60);
  const pairs = await Promise.all(uniq.map(async (id) => [id, await acLabel(env, id).catch(() => null)] as const));
  const map = new Map(pairs);
  return (id) => map.get(id.toUpperCase()) ?? id;
}

/**
 * Liga/desliga o preparo da busca completa em segundo plano (~50–80 ms de CPU, uma vez por isolate). Se o painel
 * mostrar "exceeded CPU" depois de um autocomplete, troque para false: o bot segue só com quickSearch.
 */
export const WARM_SEARCH_IN_WORKER = true;

/**
 * Busca de item no Worker sem estourar os 10 ms de CPU do plano grátis: com o isolate frio usa quickSearch
 * (barata) e agenda o preparo da busca completa depois da resposta; já preparado, usa searchItems.
 */
export function workerSearch(index: ItemsIndex, q: string, limit: number, ctx?: Pick<ExecutionContext, 'waitUntil'>): ItemHit[] {
  if (isSearchReady(index)) return searchItems(index, q, limit);
  // setTimeout (macrotarefa), não Promise.resolve: microtarefa rodaria antes de a resposta sair.
  if (WARM_SEARCH_IN_WORKER && ctx) ctx.waitUntil(new Promise<void>((r) => setTimeout(r, 0)).then(() => warmItemsIndex(index)));
  return quickSearch(index, q, limit);
}

/** Valor da opção item: o id escolhido no autocomplete ou texto livre (busca o melhor resultado). */
export async function resolveItem(env: Env, raw: string, ctx?: Pick<ExecutionContext, 'waitUntil'>): Promise<{ id: string; label: string }> {
  const q = raw.trim();
  if (!q) throw new UserError('Informe o item. Escolha uma opção da lista que aparece enquanto você digita.');
  // Só fatias pequenas (worker/lib/acIndex.ts): o índice inteiro estoura a CPU do plano grátis com isolate frio.
  void ctx;
  const label = await acLabel(env, q);
  if (label) return { id: q.toUpperCase(), label };
  const hit = (await acSearch(env, q, 1))[0];
  if (!hit) throw new UserError(`Não achei o item “${clamp(q, 60)}”. Escolha uma opção da lista que aparece enquanto você digita.`);
  return { id: hit.id, label: hit.label };
}

// ---------- autocomplete ----------

async function autocomplete(i: Interaction, env: Env, ctx?: Pick<ExecutionContext, 'waitUntil'>): Promise<{ name: string; value: string }[]> {
  const f = focusedOption(i);
  if (!f) return [];
  const value = String(f.value ?? '');
  const cmd = i.data?.name;
  if (f.name === 'item' && (cmd === 'preco' || cmd === 'alerta')) {
    if (!value.trim()) return [];
    return (await acSearch(env, value, 25)).map((h) => ({ name: clamp(h.label, 100), value: h.id.slice(0, 100) }));
  }
  if (cmd === 'alerta' && f.name === 'id') {
    const owner = ownerOf(i);
    if (!owner) return [];
    const rules = await listAlerts(env, owner);
    const nameOf = await labelsFor(env, rules.map((r) => r.itemId));
    const needle = value.trim().toLowerCase();
    return rules
      .map((r) => ({ name: alertChoiceLabel(r, nameOf), value: r.id.slice(0, 100) }))
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.value.toLowerCase().includes(needle))
      .slice(0, 25);
  }
  return [];
}

// ---------- comandos ----------

async function command(i: Interaction, env: Env, ctx: ExecutionContext): Promise<InteractionResponse> {
  const { sub, opts } = readOptions(i);
  switch (i.data?.name) {
    case 'preco': {
      const raw = String(opt<string>(opts, 'item') ?? '');
      const quality = parseQuality(opt<number>(opts, 'qualidade'));
      return fastOrDeferred(i, ctx, async () => {
        const it = await resolveItem(env, raw, ctx);
        return renderPreco(await getItem(env, ctx, it.id, quality), it.label);
      });
    }
    case 'relogio':
      return fastOrDeferred(i, ctx, async () => renderClock(await getClock(env, ctx)));
    case 'dossie': {
      const name = playerQuery(opt<string>(opts, 'nome'));
      return deferred(i, ctx, async () => {
        const found = await resolvePlayer(env, ctx, name);
        if ('list' in found) return found.list;
        return renderDossier(await getDossier(env, ctx, found.id));
      });
    }
    case 'morte': {
      const name = playerQuery(opt<string>(opts, 'nome'));
      return deferred(i, ctx, async () => {
        const found = await resolvePlayer(env, ctx, name);
        if ('list' in found) return found.list;
        const autopsy = await getAutopsy(env, ctx, found.id);
        return renderAutopsy(found, autopsy, await labelsFor(env, autopsy.rebuy.map((r) => r.id)));
      });
    }
    case 'alerta':
      return alertCommand(i, sub, opts, env, ctx);
    case 'perdas': {
      const days = Number(opt<number>(opts, 'dias') ?? 1) === 7 ? 7 : 1;
      return fastOrDeferred(i, ctx, async () => {
        const r = await getLosses(env, ctx, days, 10);
        const needNames = r.items.slice(0, 10).filter((it) => !it.name || it.name === it.id).map((it) => it.id);
        return renderLosses(r, await labelsFor(env, needNames));
      });
    }
    case 'guilda':
      return guildCommand(i, sub, opts, env, ctx);
    case 'ajuda':
      return { type: R.MESSAGE, data: renderHelp() };
    default:
      return { type: R.MESSAGE, data: notice('Comando desconhecido. Use /ajuda para ver a lista.') };
  }
}

export function parseQuality(v: unknown): Quality {
  const n = Number(v ?? 1);
  return (Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1) as Quality;
}

function playerQuery(v: unknown): string {
  const q = String(v ?? '').trim();
  // Nomes do Albion têm de 3 a 16 caracteres; a busca do killboard não aceita menos.
  if (q.length < 3) throw new UserError('Digite pelo menos 3 letras do nome do personagem.');
  return q;
}

/** Nome exato (sem caixa) ou único resultado → id; vários → lista dos 5 primeiros; nenhum → erro amigável. */
export async function resolvePlayer(
  env: Env,
  ctx: ExecutionContext,
  name: string,
): Promise<{ id: string; name: string } | { list: MessageData }> {
  const { players } = await searchPlayers(env, ctx, name);
  if (!players.length) throw new UserError(`Nenhum jogador chamado “${clamp(name, 40)}” no killboard do Americas.`);
  const exact = players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const pick = exact ?? (players.length === 1 ? players[0] : null);
  if (pick) return { id: pick.id, name: pick.name };
  return { list: renderPlayerList(players, name) };
}

async function alertCommand(
  i: Interaction,
  sub: string | null,
  opts: InteractionOption[],
  env: Env,
  ctx: ExecutionContext,
): Promise<InteractionResponse> {
  const owner = ownerOf(i);
  if (!owner) throw new UserError('Não consegui identificar o seu usuário do Discord.');
  switch (sub) {
    case 'criar': {
      const raw = String(opt<string>(opts, 'item') ?? '');
      const city = opt<string>(opts, 'cidade');
      const cond = parseCondition(opt<string>(opts, 'condicao'), opt<number>(opts, 'valor'));
      if (!city || !(ALERT_CITIES as readonly string[]).includes(city)) throw new UserError('Escolha uma cidade da lista.');
      const quality = parseQuality(opt<number>(opts, 'qualidade'));
      return fastOrDeferred(
        i,
        ctx,
        async () => {
          const it = await resolveItem(env, raw, ctx);
          const rule: AlertRule = await createAlert(env, { ...buildAlert(owner, it.id, city as City, quality, cond), itemName: it.label }).catch(
            (err: unknown) => {
              throw alertError(err);
            },
          );
          return renderAlertCreated(rule, it.label);
        },
        true,
      );
    }
    case 'listar':
      return fastOrDeferred(
        i,
        ctx,
        async () => {
          const rules = await listAlerts(env, owner);
          return renderAlertList(rules, await labelsFor(env, rules.map((r) => r.itemId)));
        },
        true,
      );
    case 'apagar': {
      const id = String(opt<string>(opts, 'id') ?? '').trim();
      if (!id) throw new UserError('Informe o identificador do alerta (veja em /alerta listar).');
      return fastOrDeferred(
        i,
        ctx,
        async () =>
          (await deleteAlert(env, owner, id))
            ? notice(`Alerta \`${clamp(id, 64)}\` apagado.`)
            : notice(`Não achei um alerta seu com o identificador \`${clamp(id, 64)}\`. Veja em /alerta listar.`),
        true,
      );
    }
    default:
      throw new UserError('Use /alerta criar, /alerta listar ou /alerta apagar.');
  }
}

// ---------- /guilda e o botão de regear (Fase 2, módulo b) ----------

/** Nome de guilda digitado: espaços repetidos viram um (o nome real pode ter espaços, ex.: "B A G R E"). */
export function guildNameOpt(v: unknown, required: boolean): string | null {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) {
    if (required) throw new UserError('Informe o nome exato da guilda.');
    return null;
  }
  if (s.length < 2 || s.length > 64) throw new UserError('O nome da guilda precisa ter de 2 a 64 caracteres.');
  return s;
}

function requireManage(i: Interaction): void {
  if (!canManageGuild(i.member?.permissions)) {
    throw new UserError('Só quem tem a permissão Gerenciar Servidor pode configurar o killfeed da guilda.');
  }
}

/** Nome de quem clicou, para o rótulo do botão desligado. */
function displayName(i: Interaction): string {
  const u = i.member?.user ?? i.user;
  return i.member?.nick || u?.global_name || u?.username || 'um membro';
}

/** Discord aceitou a mensagem de teste? 403/404 viram texto de orientação; o resto, erro genérico. */
function assertPosted(status: number, channelId: string): void {
  const problem = channelProblem(status, channelId);
  if (problem) throw new UserError(problem);
  if (status < 200 || status >= 300) throw new Error(`discord: não consegui postar no canal (${status})`);
}

async function guildCommand(
  i: Interaction,
  sub: string | null,
  opts: InteractionOption[],
  env: Env,
  ctx: ExecutionContext,
): Promise<InteractionResponse> {
  const guildId = i.guild_id;
  const owner = ownerOf(i);
  if (!guildId || !i.member || !owner) throw new UserError('Use /guilda dentro de um servidor do Discord.');
  switch (sub) {
    case 'configurar': {
      requireManage(i);
      const name = guildNameOpt(opt<string>(opts, 'nome'), true) as string;
      const channelId = String(opt<string>(opts, 'canal') ?? '');
      if (!/^\d{15,22}$/.test(channelId)) throw new UserError('Escolha um canal de texto do servidor.');
      // A opção CHANNEL do Discord sempre traz o canal em resolved: sem ele, o pedido não veio do seletor do servidor.
      const ch = i.data?.resolved?.channels?.[channelId];
      if (!ch) throw new UserError('Escolha um canal de texto deste servidor na lista do comando.');
      if (!(FEED_CHANNEL_TYPES as readonly number[]).includes(ch.type)) {
        throw new UserError('Escolha um canal de texto ou de anúncios (não de voz, fórum ou categoria).');
      }
      return deferred(
        i,
        ctx,
        async () => {
          // Em paralelo: a busca na gameinfo (2 tentativas de 7 s, para caber no prazo de 25 s com o POST de 8 s) e a
          // conferência de que o canal é deste servidor (defesa em profundidade além da validação do Discord).
          const [found, sameGuild] = await Promise.all([
            findAlbionGuild(ctx, name, CONFIGURE_SEARCH_TIMEOUT_MS),
            channelInGuild(env, channelId, guildId),
          ]);
          if (sameGuild === false) throw new UserError('Esse canal não é deste servidor. Escolha um canal de texto daqui.');
          if (Array.isArray(found)) return renderGuildChoices(found, name);
          // A mensagem de boas-vindas prova que o bot está no servidor e pode escrever no canal.
          const posted = await botPostMessage(env, channelId, renderFeedWelcome(found.name, owner));
          assertPosted(posted.status, channelId);
          try {
            await saveGuildFeed(env, { guildIdDiscord: guildId, channelId, guildName: found.name, albionGuildId: found.id, createdBy: owner });
          } catch (err) {
            // O feed não foi salvo: tira do canal o aviso de "killfeed ligado", que seria mentira.
            if (posted.id) await botDelete(env, channelId, posted.id);
            throw err;
          }
          return renderFeedConfigured(found, channelId);
        },
        true,
      );
    }
    case 'feed ligar':
    case 'feed desligar': {
      requireManage(i);
      const enable = sub === 'feed ligar';
      return fastOrDeferred(
        i,
        ctx,
        async () => {
          const feed: GuildFeed | null = await getGuildFeed(env, guildId);
          if (!feed) throw new UserError('Este servidor ainda não tem guilda configurada. Use /guilda configurar.');
          if (enable) assertPosted(await botPost(env, feed.channelId, renderFeedWelcome(feed.guildName, owner)), feed.channelId);
          const updated = await setGuildFeedEnabled(env, feed, enable);
          return renderFeedToggled(updated.guildName, updated.channelId, enable);
        },
        true,
      );
    }
    case 'resumo': {
      const typed = guildNameOpt(opt<string>(opts, 'nome'), false);
      return deferred(i, ctx, async () => {
        const feed = await getGuildFeed(env, guildId).catch((err: unknown) => {
          console.warn('discord: feed da guilda indisponível', String(err));
          return null;
        });
        const name = typed ?? feed?.guildName;
        if (!name) throw new UserError('Informe o nome da guilda ou configure uma com /guilda configurar.');
        return renderGuildSummary(await getGuild(env, ctx, name), feedWarning(feed));
      });
    }
    default:
      throw new UserError('Use /guilda configurar, /guilda feed ligar, /guilda feed desligar ou /guilda resumo.');
  }
}

/** Botão "Pedir regear" (custom_id regear:<evento>:<vítima>) das mortes postadas pelo killfeed. */
function component(i: Interaction, env: Env, ctx: ExecutionContext): InteractionResponse {
  const parsed = parseRegearId(i.data?.custom_id);
  if (!parsed) return { type: R.MESSAGE, data: notice('Este botão não é mais válido.') };
  const clicker = ownerOf(i);
  if (!clicker || !i.guild_id) return { type: R.MESSAGE, data: notice('Use o botão dentro do servidor da guilda.') };
  const work = async (): Promise<MessageData> => {
    const r = await loadRegear(ctx, parsed.eventId, parsed.victimId).catch((err: unknown) => {
      if (err instanceof GameinfoError && err.kind === 'not_found') throw new UserError('Essa morte não está mais no killboard oficial.');
      throw err;
    });
    const nameOf = await labelsFor(env, r.rebuy.map((x) => x.id));
    return renderRegear(
      {
        time: r.event.time,
        victim: { id: r.event.victim.id, name: r.event.victim.name, guild: r.event.victim.guild },
        killer: { name: r.event.killer.name, guild: r.event.killer.guild },
        rebuy: r.rebuy,
        rebuyTotal: r.rebuyTotal,
      },
      clicker,
      nameOf,
    );
  };
  const original = i.message?.components;
  if (Array.isArray(original) && original.length) {
    // Desliga o botão NA RESPOSTA ao clique (type 7, antes de qualquer espera): um segundo clique, do mesmo membro ou
    // de outro, não gera outro pedido nem outra ida à gameinfo. A lista sai depois, num followup público.
    ctx.waitUntil(deliverRegear(i, work, original));
    return { type: R.UPDATE_MESSAGE, data: { components: disabledRegearComponents(original, `Regear pedido por ${displayName(i)}`) } };
  }
  // Mensagem sem componentes (não deveria acontecer num clique de botão): adiado, sem desligar nada.
  return deferred(i, ctx, work);
}

/**
 * Entrega do regear depois do type 7: sucesso → followup público com a lista; erro → aviso efêmero para quem clicou e
 * o botão volta ligado (PATCH em @original, que num clique é a própria mensagem do feed). Nunca usa deliver(): o
 * caminho de erro dele apaga @original, que aqui é a mensagem do killfeed.
 */
async function deliverRegear(i: Interaction, work: () => Promise<MessageData>, original: unknown[], deadlineMs = DELIVER_DEADLINE_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<JobResult>(
    (res) => (timer = setTimeout(() => res({ ok: false, err: new Error('timeout: fonte demorou demais') }), deadlineMs)),
  );
  const job = Promise.resolve()
    .then(work)
    .then(
      (data) => ({ ok: true as const, data }),
      (err: unknown) => ({ ok: false as const, err }),
    );
  const r = await Promise.race([job, late]);
  clearTimeout(timer);
  try {
    if (r.ok) {
      await webhook(i, 'POST', '', r.data);
      return;
    }
    await webhook(i, 'POST', '', notice(friendly(r.err), true));
    await webhook(i, 'PATCH', '/messages/@original', { components: original });
  } catch (err) {
    console.error('discord: entrega do regear falhou', err);
  }
}

export function parseCondition(key: unknown, valor: unknown): AlertCondition {
  const v = Number(valor);
  if (typeof key !== 'string' || !Object.hasOwn(CONDITIONS, key)) throw new UserError('Escolha uma condição da lista.');
  if (!Number.isFinite(v) || v <= 0) throw new UserError('O valor precisa ser um número maior que zero.');
  switch (key as ConditionKey) {
    case 'abaixo':
      return { kind: 'below', price: Math.round(v) };
    case 'acima':
      return { kind: 'above', price: Math.round(v) };
    case 'abaixo_mediana': {
      // Mesmos limites da API e do core (shared/alertLimits.ts); arredonda como eles.
      const pct = Math.round(v);
      if (pct < MEDIAN_PCT_MIN || pct > MEDIAN_PCT_MAX) {
        throw new UserError(`Na condição da mediana, o valor é uma porcentagem de ${MEDIAN_PCT_MIN} a ${MEDIAN_PCT_MAX}.`);
      }
      return { kind: 'belowMedianPct', pct };
    }
  }
}

/** createAlert lança mensagens PT-BR prontas (validação, limite por dono); falha de infraestrutura fica genérica. */
export function alertError(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : '';
  if (msg && msg.length <= 200 && !/hub|falha ao|não implementado|fetch|timeout|internal/i.test(msg)) {
    return new UserError(`Não deu para criar o alerta: ${msg.charAt(0).toLowerCase()}${msg.slice(1)}`);
  }
  return err;
}

export function buildAlert(owner: string, itemId: string, city: City, quality: Quality, condition: AlertCondition): NewAlert {
  return {
    itemId,
    quality,
    cities: [city],
    // O Black Market só tem ordens de compra: vigia o preço de venda instantânea.
    side: city === 'Black Market' ? 'buy' : 'sell',
    condition,
    cooldownMin: DEFAULT_COOLDOWN_MIN,
    channel: 'discord',
    owner,
  };
}

// ---------- respostas ----------

/** Texto amigável para qualquer erro (nunca detalhe interno). */
export function friendly(err: unknown): string {
  if (err instanceof UserError || err instanceof FeedError || err instanceof GuildNotFound) return err.message;
  // Antes da regex abaixo: "erro 502" do KillLog não é a gameinfo demorando.
  if (err instanceof CoreError) {
    console.error('discord: KillLog', err.message);
    return 'O histórico de kills da Guarita está indisponível agora. Tente de novo em alguns minutos.';
  }
  if (err instanceof GameinfoError) {
    console.error('discord: gameinfo', err.kind, err.message);
    if (err.kind === 'not_found') return 'Não encontrei isso no killboard oficial do Albion.';
    if (err.kind === 'timeout') return 'O killboard oficial do Albion demorou demais para responder. Tente de novo em alguns minutos.';
    if (err.kind === 'upstream') return 'O killboard oficial do Albion está instável agora. Tente de novo em alguns minutos.';
    return 'Não consegui completar o pedido agora. Tente de novo em instantes.';
  }
  console.error('discord: erro no comando', err);
  const msg = err instanceof Error ? err.message : String(err);
  if (/não implementado/i.test(msg)) return 'Esta função ainda está sendo preparada. Tente de novo mais tarde.';
  if (/timeout|timed out|abort|502|503|504/i.test(msg)) {
    return 'A fonte de dados do Albion demorou para responder. Tente de novo em alguns minutos.';
  }
  return 'Não consegui completar o pedido agora. Tente de novo em instantes.';
}

/** Responde direto se o trabalho couber no prazo; senão adia e entrega por followup. */
export async function fastOrDeferred(
  i: Interaction,
  ctx: ExecutionContext,
  work: () => Promise<MessageData>,
  ephemeral = false,
  budgetMs = FAST_BUDGET_MS,
  deadlineMs = DELIVER_DEADLINE_MS,
): Promise<InteractionResponse> {
  const job = work().then(
    (data) => ({ ok: true as const, data }),
    (err: unknown) => ({ ok: false as const, err }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((r) => (timer = setTimeout(() => r('timeout'), budgetMs)));
  const first = await Promise.race([job, timeout]);
  clearTimeout(timer);
  if (first === 'timeout') {
    ctx.waitUntil(deliver(i, job, ephemeral, deadlineMs));
    return deferredAck(ephemeral);
  }
  if (!first.ok) return { type: R.MESSAGE, data: notice(friendly(first.err)) };
  return { type: R.MESSAGE, data: ephemeral ? { ...first.data, flags: EPHEMERAL } : first.data };
}

/** Sempre adiado (type 5): o trabalho roda depois da resposta, dentro do ctx.waitUntil. */
export function deferred(i: Interaction, ctx: ExecutionContext, work: () => Promise<MessageData>, ephemeral = false): InteractionResponse {
  const job = Promise.resolve()
    .then(work)
    .then(
      (data) => ({ ok: true as const, data }),
      (err: unknown) => ({ ok: false as const, err }),
    );
  ctx.waitUntil(deliver(i, job, ephemeral));
  return deferredAck(ephemeral);
}

function deferredAck(ephemeral: boolean): InteractionResponse {
  return ephemeral ? { type: R.DEFERRED, data: { flags: EPHEMERAL } } : { type: R.DEFERRED };
}

type JobResult = { ok: true; data: MessageData } | { ok: false; err: unknown };

/** Edita a resposta original. Em erro numa resposta pública, troca por um aviso efêmero (só quem pediu vê). */
async function deliver(i: Interaction, job: Promise<JobResult>, ephemeral: boolean, deadlineMs = DELIVER_DEADLINE_MS): Promise<void> {
  // O waitUntil morre ~30 s após a resposta: sem teto, a mensagem ficaria "pensando" até o Discord desistir.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<JobResult>(
    (res) => (timer = setTimeout(() => res({ ok: false, err: new Error('timeout: fonte demorou demais') }), deadlineMs)),
  );
  const r = await Promise.race([job, late]);
  clearTimeout(timer);
  try {
    if (r.ok) {
      // Flags não mudam numa edição: a efemeridade já foi decidida no adiamento.
      const { flags: _flags, ...data } = r.data;
      await webhook(i, 'PATCH', '/messages/@original', data);
      return;
    }
    const text = friendly(r.err);
    if (!ephemeral) {
      try {
        await webhook(i, 'DELETE', '/messages/@original');
        await webhook(i, 'POST', '', notice(text, true));
        return;
      } catch (err) {
        console.error('discord: não consegui trocar por aviso efêmero', err);
      }
    }
    await webhook(i, 'PATCH', '/messages/@original', { content: text, embeds: [], components: [], allowed_mentions: { parse: [] } });
  } catch (err) {
    console.error('discord: followup falhou', err);
  }
}

/** Chamada ao webhook da interação (o token da interação autentica; vale 15 min). */
async function webhook(i: Interaction, method: 'PATCH' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<void> {
  const url = `${API}/webhooks/${encodeURIComponent(i.application_id)}/${encodeURIComponent(i.token)}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`webhook ${method} ${path || '/'} → ${res.status} ${clamp(await res.text().catch(() => ''), 200)}`);
}
