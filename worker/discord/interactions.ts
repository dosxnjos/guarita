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
  itemName,
  tierLabel,
  type ItemHit,
  type ItemsIndex,
  type ItemTuple,
} from '../../shared/items';
import { loadItemsIndex } from '../lib/items';
import { getItem } from '../api/market';
import { getClock } from '../api/clock';
import { searchPlayers, getDossier, getAutopsy } from '../api/player';
import { createAlert, listAlerts, deleteAlert, type NewAlert } from '../api/alerts';
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
  renderHelp,
  renderPlayerList,
  renderPreco,
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

const IT = { PING: 1, COMMAND: 2, AUTOCOMPLETE: 4 } as const;
const R = { PONG: 1, MESSAGE: 4, DEFERRED: 5, AUTOCOMPLETE: 8 } as const;
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
  data?: { name: string; options?: InteractionOption[] };
  member?: { user?: { id: string } };
  user?: { id: string };
}
export interface InteractionResponse {
  type: number;
  data?: MessageData | { choices: { name: string; value: string }[] } | { flags: number };
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
    default:
      return { type: R.MESSAGE, data: notice('Interação não suportada por este bot.') };
  }
}

function logEmpty(err: unknown): [] {
  console.error('discord: autocomplete falhou', err);
  return [];
}

// ---------- opções ----------

/** Subcomando escolhido (ex.: "criar" em /alerta criar) e as opções efetivas. */
export function readOptions(i: Interaction): { sub: string | null; opts: InteractionOption[] } {
  const top = i.data?.options ?? [];
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

function nameResolver(index: ItemsIndex | null): NameOf {
  return (id) => {
    if (!index) return id;
    const t = byId(index).get(id.toUpperCase());
    if (t) return itemLabel(t);
    try {
      return itemName(index, id);
    } catch {
      return id;
    }
  };
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
  const index = await loadItemsIndex(env);
  const exact = byId(index).get(q.toUpperCase());
  if (exact) return { id: exact[0], label: itemLabel(exact) };
  const hit = workerSearch(index, q, 1, ctx)[0];
  if (!hit) throw new UserError(`Não achei o item “${clamp(q, 60)}”. Escolha uma opção da lista que aparece enquanto você digita.`);
  return { id: hit.id, label: itemLabel(hit) };
}

async function loadIndexOrNull(env: Env): Promise<ItemsIndex | null> {
  try {
    return await loadItemsIndex(env);
  } catch (err) {
    console.error('discord: índice de itens indisponível', err);
    return null;
  }
}

// ---------- autocomplete ----------

async function autocomplete(i: Interaction, env: Env, ctx?: Pick<ExecutionContext, 'waitUntil'>): Promise<{ name: string; value: string }[]> {
  const f = focusedOption(i);
  if (!f) return [];
  const value = String(f.value ?? '');
  const cmd = i.data?.name;
  if (f.name === 'item' && (cmd === 'preco' || cmd === 'alerta')) {
    if (!value.trim()) return [];
    const index = await loadItemsIndex(env);
    return workerSearch(index, value, 25, ctx).map((h) => ({ name: itemLabel(h), value: h.id.slice(0, 100) }));
  }
  if (cmd === 'alerta' && f.name === 'id') {
    const owner = ownerOf(i);
    if (!owner) return [];
    const [rules, index] = await Promise.all([listAlerts(env, owner), loadIndexOrNull(env)]);
    const nameOf = nameResolver(index);
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
        const [autopsy, index] = await Promise.all([getAutopsy(env, ctx, found.id), loadIndexOrNull(env)]);
        return renderAutopsy(found, autopsy, nameResolver(index));
      });
    }
    case 'alerta':
      return alertCommand(i, sub, opts, env, ctx);
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
          const [rules, index] = await Promise.all([listAlerts(env, owner), loadIndexOrNull(env)]);
          return renderAlertList(rules, nameResolver(index));
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
  if (err instanceof UserError) return err.message;
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
