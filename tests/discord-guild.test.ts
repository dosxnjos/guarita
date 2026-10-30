// Fase 2, módulo (b): /guilda (configurar, feed ligar/desligar, resumo), /perdas e o botão "Pedir regear".
// Hub, gameinfo, AODP e Discord falsos; o killfeed em si (cron) tem teste no guarita-core (tests/feed.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../worker/env';
import type { GuildSummary, LossesResponse, PriceRow } from '../shared/types';
import DEATHS from './fixtures/gameinfo-deaths.json';
import GUILD_SEARCH from './fixtures/gameinfo-guild-search.json';

const m = vi.hoisted(() => ({
  acLabel: vi.fn(),
  acSearch: vi.fn(),
  getGuild: vi.fn(),
  getLosses: vi.fn(),
  aodpPrices: vi.fn(),
}));
vi.mock('../worker/lib/acIndex', () => ({ acSearch: m.acSearch, acLabel: m.acLabel }));
vi.mock('../worker/api/insights', () => ({ getGuild: m.getGuild, getLosses: m.getLosses }));
vi.mock('../worker/lib/aodp', async (orig) => ({ ...(await orig<typeof import('../worker/lib/aodp')>()), aodpPrices: m.aodpPrices }));

import { dispatch, readOptions, guildNameOpt, UserError, type Interaction } from '../worker/discord/interactions';
import {
  canManageGuild,
  channelProblem,
  feedWarning,
  normalizeGuilds,
  normalizeOneEvent,
  parseRegearId,
  pickGuild,
  type GuildFeed,
} from '../worker/discord/guild';
import { renderGuildSummary, renderLosses, peakHours, fmtDay } from '../worker/discord/render';
import { _resetGameinfoMemory } from '../worker/lib/gameinfo';

// ---------- utilidades ----------

const GID = '123456789012345678';
const CH = '223456789012345678';
const USER = '323456789012345678';
const MANAGE = String(32);

function makeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
  return { ctx, flush: () => Promise.all(pending) };
}

/** Hub falso só com /guild-feeds (mesmas respostas do guarita-core/src/guildFeeds.ts). */
function fakeHub(initial: GuildFeed | null = null, saveStatus = 201) {
  const state = { feed: initial, calls: [] as { method: string; path: string; body: any }[] };
  const stub = {
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      state.calls.push({ method, path: u.pathname + u.search, body });
      if (u.pathname === '/guild-feeds' && method === 'GET') return Response.json({ feeds: state.feed ? [state.feed] : [] });
      if (u.pathname === '/guild-feeds' && method === 'POST' && saveStatus === 503) {
        return Response.json({ error: 'o killfeed de guildas está cheio agora; tente de novo mais tarde' }, { status: 503 });
      }
      if (u.pathname === '/guild-feeds' && method === 'POST') {
        state.feed = feedOf({ ...body, id: 'feed1' });
        return Response.json(state.feed, { status: 201 });
      }
      if (u.pathname.startsWith('/guild-feeds/') && method === 'PATCH' && state.feed) {
        state.feed = { ...state.feed, enabled: body.enabled, lastError: body.enabled ? null : state.feed.lastError };
        return Response.json(state.feed);
      }
      return Response.json({ error: 'rota não encontrada' }, { status: 404 });
    }),
  };
  return { state, HUB: { idFromName: () => 'id', get: () => stub } as unknown as DurableObjectNamespace };
}

function feedOf(over: Partial<GuildFeed> = {}): GuildFeed {
  return {
    id: 'feed1',
    guildIdDiscord: GID,
    channelId: CH,
    guildName: 'B A G R E',
    guildKey: 'b a g r e',
    albionGuildId: 'M8buKnpDS2yL7Eh2A2CTsw',
    enabled: true,
    createdBy: USER,
    createdAt: '2026-10-30T12:00:00.000Z',
    lastEventId: 0,
    pending: 0,
    lastPostAt: null,
    lastError: null,
    lastErrorAt: null,
    ...over,
  };
}

// Valor falso do token do bot: o teste só confere que vai no cabeçalho Authorization.
function env(hub = fakeHub()): Env {
  return { DISCORD_APP_ID: 'app1', DISCORD_BOT_TOKEN: 'dummy-bot', HUB: hub.HUB } as unknown as Env;
}

type Call = { url: string; method: string; body: any; auth: string | null };
/** fetch falso: gameinfo (busca de guilda e evento), Discord REST do bot e webhook da interação. */
function mockFetch(opts: { channelStatus?: number; search?: unknown; event?: unknown; channelGuild?: string } = {}): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.Authorization ?? null });
    if (url.includes('gameinfo.albiononline.com')) {
      if (url.includes('/search')) return Response.json(opts.search ?? GUILD_SEARCH);
      if (url.includes('/events/')) return Response.json(opts.event ?? DEATHS[0]);
    }
    if (url.includes('/channels/') && (init.method ?? 'GET') === 'POST') {
      const status = opts.channelStatus ?? 200;
      return status === 200 ? Response.json({ id: '555555555555555555' }) : new Response('{}', { status });
    }
    if (/\/channels\/\d+$/.test(url) && (init.method ?? 'GET') === 'GET') return Response.json({ id: CH, guild_id: opts.channelGuild ?? GID });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response('{}', { status: 200 });
  });
  return calls;
}

function guilda(sub: unknown[], over: Partial<Interaction> = {}): Interaction {
  return {
    id: '1',
    application_id: 'app1',
    type: 2,
    token: 'tok',
    guild_id: GID,
    channel_id: CH,
    data: { name: 'guilda', options: sub as never },
    member: { user: { id: USER, username: 'gabriel' }, permissions: MANAGE },
    ...over,
  };
}
function configurar(nome: string, extra: Partial<Interaction> = {}): Interaction {
  const options = [{ name: 'configurar', type: 1, options: [{ name: 'nome', type: 3, value: nome }, { name: 'canal', type: 7, value: CH }] }];
  return guilda(options, { ...extra, data: { name: 'guilda', options, resolved: { channels: { [CH]: { id: CH, type: 0 } } } } });
}
const feedCmd = (estado: 'ligar' | 'desligar') => guilda([{ name: 'feed', type: 2, options: [{ name: estado, type: 1, options: [] }] }]);
const webhookPatch = (calls: Call[]) => calls.find((c) => c.url.includes('/webhooks/') && c.method === 'PATCH');

beforeEach(() => {
  _resetGameinfoMemory();
  m.acLabel.mockImplementation(async (_e: unknown, id: string) => ({ T7_MEAL_PIE: 'Torta de Carne (T7)' } as Record<string, string>)[id.toUpperCase()] ?? null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.values(m).forEach((f) => f.mockReset());
});

// ---------- lógica pura ----------

describe('guild.ts', () => {
  it('Gerenciar Servidor ou administrador', () => {
    expect(canManageGuild('32')).toBe(true);
    expect(canManageGuild('8')).toBe(true);
    expect(canManageGuild(String((1n << 40n) | 32n))).toBe(true);
    expect(canManageGuild('2048')).toBe(false);
    expect(canManageGuild(undefined)).toBe(false);
    expect(canManageGuild('abc')).toBe(false);
  });
  it('lê guildas do /search e escolhe pelo nome exato, sem caixa', () => {
    const gs = normalizeGuilds(GUILD_SEARCH);
    expect(gs[0]).toEqual({ id: 'M8buKnpDS2yL7Eh2A2CTsw', name: 'B A G R E', alliance: '', killFame: null, deathFame: 108797350 });
    expect(pickGuild(gs, '  b a g r e ')).toEqual(gs[0]);
    expect(pickGuild(gs, 'bagre')).toEqual(gs);
    expect(() => normalizeGuilds({ players: [] })).toThrow();
  });
  it('custom_id do regear e evento único da gameinfo', () => {
    expect(parseRegearId('regear:1328925237:NwcyH-y1Q924YlQkAkn7nw')).toEqual({ eventId: '1328925237', victimId: 'NwcyH-y1Q924YlQkAkn7nw' });
    expect(parseRegearId('regear:abc:x')).toBeNull();
    expect(parseRegearId(undefined)).toBeNull();
    const e = normalizeOneEvent(DEATHS[0]);
    expect(e.id).toBe(1328925237);
    expect(e.victim.name).toBe('CalangoPeto');
    expect(e.victim.gear.map((g) => g.id)).toContain('T7_MEAL_PIE');
    expect(() => normalizeOneEvent({})).toThrow();
  });
  it('avisos de canal e de feed desligado pelo cron', () => {
    expect(channelProblem(403, CH)).toMatch(/Enviar mensagens/);
    expect(channelProblem(404, CH)).toMatch(/apagado/);
    expect(channelProblem(200, CH)).toBeNull();
    expect(feedWarning(feedOf())).toBeNull();
    expect(feedWarning(feedOf({ enabled: false }))).toBeNull(); // desligado à mão: sem aviso
    expect(feedWarning(feedOf({ enabled: false, lastError: 'sem_permissao' }))).toMatch(/perdeu a permissão/);
    expect(feedWarning(feedOf({ enabled: false, lastError: 'canal_sumiu' }))).toMatch(/não existe mais/);
  });
  it('grupo de subcomandos e nome de guilda', () => {
    expect(readOptions(feedCmd('ligar')).sub).toBe('feed ligar');
    expect(guildNameOpt('  B  A G R E ', true)).toBe('B A G R E');
    expect(guildNameOpt('', false)).toBeNull();
    expect(() => guildNameOpt('', true)).toThrow(UserError);
    expect(() => guildNameOpt('x'.repeat(65), true)).toThrow(UserError);
  });
});

// ---------- /guilda ----------

describe('/guilda configurar', () => {
  it('exige Gerenciar Servidor', async () => {
    const r = await dispatch(configurar('B A G R E', { member: { user: { id: USER }, permissions: '0' } }), env(), makeCtx().ctx);
    expect(r).toMatchObject({ type: 4, data: { flags: 64 } });
    expect((r.data as { content: string }).content).toMatch(/Gerenciar Servidor/);
  });
  it('só dentro de servidor', async () => {
    const dm = { ...configurar('B A G R E'), guild_id: undefined, member: undefined, user: { id: USER } };
    const r = await dispatch(dm, env(), makeCtx().ctx);
    expect((r.data as { content: string }).content).toMatch(/dentro de um servidor/);
  });
  it('recusa canal de voz', async () => {
    const i = configurar('B A G R E');
    i.data!.resolved = { channels: { [CH]: { id: CH, type: 2 } } };
    const r = await dispatch(i, env(), makeCtx().ctx);
    expect((r.data as { content: string }).content).toMatch(/canal de texto/);
  });
  it('confere a guilda na gameinfo, posta as boas-vindas no canal e salva no Hub', async () => {
    const calls = mockFetch();
    const hub = fakeHub();
    const { ctx, flush } = makeCtx();
    const r = await dispatch(configurar('b a g r e'), env(hub), ctx);
    expect(r).toEqual({ type: 5, data: { flags: 64 } });
    await flush();
    const post = calls.find((c) => c.url.endsWith(`/channels/${CH}/messages`));
    expect(post?.auth).toBe('Bot dummy-bot');
    expect(post?.body.embeds[0].title).toContain('Killfeed da guilda B A G R E');
    expect(post?.body.allowed_mentions).toEqual({ parse: [] });
    const saved = hub.state.calls.find((c) => c.method === 'POST');
    expect(saved?.body).toEqual({ guildIdDiscord: GID, channelId: CH, guildName: 'B A G R E', albionGuildId: 'M8buKnpDS2yL7Eh2A2CTsw', createdBy: USER });
    expect(webhookPatch(calls)?.body.embeds[0].title).toBe('Killfeed configurado');
  });
  it('sem permissão no canal (403): explica e não salva', async () => {
    const calls = mockFetch({ channelStatus: 403 });
    const hub = fakeHub();
    const { ctx, flush } = makeCtx();
    await dispatch(configurar('B A G R E'), env(hub), ctx);
    await flush();
    expect(hub.state.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(webhookPatch(calls)?.body.content).toMatch(/Ver canal, Enviar mensagens e Inserir links/);
  });
  it('nome sem correspondência exata: lista as parecidas', async () => {
    const calls = mockFetch({ search: { guilds: [{ Id: 'abcdefgh', Name: 'Bagre Azul', AllianceName: 'ALI' }], players: [] } });
    const { ctx, flush } = makeCtx();
    await dispatch(configurar('bagre'), env(), ctx);
    await flush();
    expect(webhookPatch(calls)?.body.content).toContain('Bagre Azul');
    expect(calls.some((c) => c.url.includes('/channels/') && c.method === 'POST')).toBe(false);
  });
  it('canal sem resolved (não veio do seletor do servidor): recusa sem adiar', async () => {
    const i = configurar('B A G R E');
    i.data!.resolved = undefined;
    const r = await dispatch(i, env(), makeCtx().ctx);
    expect(r.type).toBe(4);
    expect((r.data as { content: string }).content).toMatch(/canal de texto deste servidor/);
  });
  it('canal de outro servidor (GET /channels/{id} com outro guild_id): recusa sem postar nem salvar', async () => {
    const calls = mockFetch({ channelGuild: '999999999999999999' });
    const hub = fakeHub();
    const { ctx, flush } = makeCtx();
    await dispatch(configurar('B A G R E'), env(hub), ctx);
    await flush();
    expect(calls.some((c) => c.url.endsWith(`/channels/${CH}/messages`))).toBe(false);
    expect(hub.state.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(webhookPatch(calls)?.body.content).toMatch(/não é deste servidor/);
  });
  it('Hub recusa salvar (teto de feeds): apaga a mensagem de boas-vindas e explica', async () => {
    const calls = mockFetch();
    const hub = fakeHub(null, 503);
    const { ctx, flush } = makeCtx();
    await dispatch(configurar('B A G R E'), env(hub), ctx);
    await flush();
    expect(calls.some((c) => c.url.endsWith(`/channels/${CH}/messages`) && c.method === 'POST')).toBe(true);
    expect(calls.some((c) => c.url.endsWith(`/channels/${CH}/messages/555555555555555555`) && c.method === 'DELETE')).toBe(true);
    expect(webhookPatch(calls)?.body.content).toMatch(/killfeed de guildas está cheio/);
  });
});

describe('/guilda feed e resumo', () => {
  it('desligar sem guilda configurada avisa', async () => {
    mockFetch();
    const r = await dispatch(feedCmd('desligar'), env(fakeHub(null)), makeCtx().ctx);
    expect((r.data as { content: string }).content).toMatch(/ainda não tem guilda configurada/);
  });
  it('desligar e ligar (ligar testa o canal de novo)', async () => {
    const calls = mockFetch();
    const hub = fakeHub(feedOf());
    let r = await dispatch(feedCmd('desligar'), env(hub), makeCtx().ctx);
    expect((r.data as { content: string }).content).toMatch(/desligado/);
    expect(hub.state.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ guild: GID, enabled: false });
    expect(calls.some((c) => c.url.includes('/channels/'))).toBe(false);
    r = await dispatch(feedCmd('ligar'), env(hub), makeCtx().ctx);
    expect((r.data as { content: string }).content).toMatch(/ligado em/);
    expect(calls.some((c) => c.url.endsWith(`/channels/${CH}/messages`))).toBe(true);
  });
  it('resumo usa a guilda configurada e avisa que o cron desligou o feed', async () => {
    const calls = mockFetch();
    m.getGuild.mockResolvedValue(summary());
    const { ctx, flush } = makeCtx();
    const r = await dispatch(guilda([{ name: 'resumo', type: 1, options: [] }]), env(fakeHub(feedOf({ enabled: false, lastError: 'sem_permissao' }))), ctx);
    expect(r).toEqual({ type: 5 });
    await flush();
    expect(m.getGuild.mock.calls[0][2]).toBe('B A G R E');
    const e = webhookPatch(calls)?.body.embeds[0];
    expect(e.title).toBe('Guilda B A G R E');
    expect(e.description).toMatch(/perdeu a permissão/);
  });
});

// ---------- /perdas ----------

describe('/perdas', () => {
  it('top 10 com valor; nomes que faltam vêm das fatias', async () => {
    m.getLosses.mockResolvedValue(losses());
    const r = await dispatch(
      { id: '1', application_id: 'app1', type: 2, token: 'tok', data: { name: 'perdas', options: [{ name: 'dias', type: 4, value: 7 }] }, user: { id: USER } },
      env(),
      makeCtx().ctx,
    );
    expect(m.getLosses.mock.calls[0].slice(2)).toEqual([7, 10]);
    expect(r.type).toBe(4);
    const e = (r.data as { embeds: { title: string; description: string }[] }).embeds[0];
    expect(e.title).toContain('últimos 7 dias');
    expect(e.description).toContain('1. **Torta de Carne (T7)** · perdido 1.200× · 300 cada · **360.000** prata');
    expect(e.description).toContain('2. **Espada Larga** · perdido 3× · sem preço');
    expect(e.description).toContain('Amostra de 54.321 mortes');
  });
});

// ---------- botão "Pedir regear" ----------

describe('Pedir regear', () => {
  const click = (customId: string): Interaction => ({
    id: '9',
    application_id: 'app1',
    type: 3,
    token: 'tok',
    guild_id: GID,
    channel_id: CH,
    data: { custom_id: customId, component_type: 2 },
    member: { user: { id: USER, username: 'gabriel', global_name: 'Gabriel' }, permissions: '0' },
    message: {
      id: '999999999999999999',
      channel_id: CH,
      components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Pedir regear', custom_id: customId }, { type: 2, style: 5, label: 'Dossiê', url: 'https://x' }] }],
    },
  });

  it('monta a lista com UM pedido ao AODP, posta no canal mencionando quem clicou e desliga o botão', async () => {
    const calls = mockFetch();
    const rows: PriceRow[] = [
      { id: 'T7_MEAL_PIE', city: 'Martlock', quality: 1, sellMin: 1000, sellMinAt: new Date().toISOString(), buyMax: null, buyMaxAt: null },
      { id: 'T5_2H_DUALSWORD@1', city: 'Lymhurst', quality: 1, sellMin: 50000, sellMinAt: new Date().toISOString(), buyMax: null, buyMaxAt: null },
    ];
    m.aodpPrices.mockResolvedValue(rows);
    const { ctx, flush } = makeCtx();
    const r = await dispatch(click('regear:1328925237:NwcyH-y1Q924YlQkAkn7nw'), env(), ctx);
    // A resposta ao clique já desliga o botão (type 7), antes de qualquer espera: segundo clique não repete o pedido.
    expect(r.type).toBe(7);
    const comps = (r.data as { components: { components: Record<string, unknown>[] }[] }).components;
    expect(comps[0].components[0]).toMatchObject({ disabled: true, style: 2, label: 'Regear pedido por Gabriel' });
    expect(comps[0].components[1]).toMatchObject({ style: 5, url: 'https://x' });
    await flush();
    expect(m.aodpPrices).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.url.includes('/events/1328925237'))).toHaveLength(1);
    // a lista sai num followup público (POST no webhook, sem flags), sem PATCH com o token do bot
    const body = calls.find((c) => c.url.includes('/webhooks/') && c.method === 'POST')?.body;
    expect(body.flags).toBeUndefined();
    expect(body.content).toBe(`<@${USER}> pediu regear.`);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0].title).toMatch(/^Pedido de regear de CalangoPeto: total [\d.]+ prata$/);
    const lista = body.embeds[0].fields[0].value as string;
    expect(lista).toContain('Torta de Carne (T7)');
    expect(lista).toContain('50.000 em Lymhurst');
    expect(lista).toContain('sem preço');
    expect(body.embeds[0].fields[1].value).toMatch(/aprovação e pagamento ficam com a guilda/);
    expect(calls.some((c) => c.url.includes('/channels/'))).toBe(false);
    expect(webhookPatch(calls)).toBeUndefined();
  });

  it('vítima que não bate com o evento: aviso só para quem clicou e o botão volta ligado', async () => {
    const calls = mockFetch();
    m.aodpPrices.mockResolvedValue([]);
    const { ctx, flush } = makeCtx();
    const i = click('regear:1328925237:OutroJogador123');
    await dispatch(i, env(), ctx);
    await flush();
    const warn = calls.find((c) => c.url.includes('/webhooks/') && c.method === 'POST');
    expect(warn?.body.content).toMatch(/não corresponde/);
    expect(warn?.body.flags).toBe(64);
    // nunca apaga @original (seria a mensagem do killfeed); só devolve os componentes originais
    expect(calls.some((c) => c.url.includes('/webhooks/') && c.method === 'DELETE')).toBe(false);
    expect(webhookPatch(calls)?.body).toEqual({ components: i.message!.components });
  });

  it('botão desconhecido', async () => {
    const r = await dispatch(click('outro:1'), env(), makeCtx().ctx);
    expect((r.data as { content: string }).content).toMatch(/não é mais válido/);
  });
});

// ---------- render ----------

describe('render da Fase 2', () => {
  it('dia e horário de pico', () => {
    expect(fmtDay('2026-10-30')).toBe('30/10');
    expect(fmtDay(null)).toBe('—');
    const h = Array(24).fill(0);
    h[21] = 14;
    h[22] = 9;
    h[3] = 9;
    expect(peakHours(h)).toBe('21h (14), 3h (9), 22h (9)');
    expect(peakHours(Array(24).fill(0))).toBeNull();
  });
  it('resumo sem dado e perdas vazias não quebram', () => {
    const e = renderGuildSummary({ ...summary(), days: [], topKillers: [], weapons: [], hoursBrt: Array(24).fill(0) }).embeds![0];
    expect(e.fields!.find((f) => f.name === 'Últimos dias')!.value).toMatch(/Nenhuma kill/);
    const l = renderLosses({ ...losses(), items: [], sampleKills: 0 }, (id) => id).embeds![0];
    expect(l.description).toMatch(/Ainda não há mortes/);
  });
});

function summary(): GuildSummary {
  return {
    name: 'B A G R E',
    id: 'M8buKnpDS2yL7Eh2A2CTsw',
    alliance: null,
    members: 12,
    killFame: null,
    deathFame: 108797350,
    days: [
      { date: '2026-10-30', kills: 3, deaths: 5 },
      { date: '2026-10-29', kills: 1, deaths: 0 },
    ],
    topKillers: [{ name: 'CalangoPeto', id: 'NwcyH-y1Q924YlQkAkn7nw', kills: 3 }],
    weapons: [{ type: 'T5_2H_DUALSWORD', labelPt: 'Espadas duplas', count: 2 }],
    hoursBrt: Array.from({ length: 24 }, (_, h) => (h === 21 ? 4 : 0)),
    coverageSince: '2026-10-30',
    fetchedAt: '2026-10-30T15:00:00.000Z',
  };
}

function losses(): LossesResponse {
  return {
    days: 7,
    since: '2026-10-30',
    sampleKills: 54321,
    items: [
      { id: 'T7_MEAL_PIE', name: 'T7_MEAL_PIE', count: 1200, price: 300, value: 360000, ageMin: 30 },
      { id: 'T4_MAIN_SWORD', name: 'Espada Larga', count: 3, price: null, value: null, ageMin: null },
    ],
    fetchedAt: '2026-10-30T15:00:00.000Z',
  };
}
