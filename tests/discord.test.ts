import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../worker/env';
import type { ClockResponse, ItemResponse, PlayerDossier, AlertRule, CityQuote } from '../shared/types';

// Os módulos de dado (a, b, c, e) são substituídos: aqui só se testa o bot.
const m = vi.hoisted(() => ({
  loadItemsIndex: vi.fn(),
  searchItems: vi.fn(),
  getItem: vi.fn(),
  getClock: vi.fn(),
  searchPlayers: vi.fn(),
  getDossier: vi.fn(),
  getAutopsy: vi.fn(),
  createAlert: vi.fn(),
  listAlerts: vi.fn(),
  deleteAlert: vi.fn(),
  acSearch: vi.fn(),
  acLabel: vi.fn(),
  getHoje: vi.fn(),
}));
vi.mock('../worker/api/hoje', () => ({ getHoje: m.getHoje }));
vi.mock('../worker/lib/items', () => ({ loadItemsIndex: m.loadItemsIndex }));
// O bot busca item só pelas fatias pequenas (worker/lib/acIndex.ts, teste próprio em acIndex.test.ts).
vi.mock('../worker/lib/acIndex', () => ({ acSearch: m.acSearch, acLabel: m.acLabel }));
const LABELS: Record<string, string> = { 'T4_BAG@1': 'Bolsa do Adepto (T4.1)', T4_BAG: 'Bolsa do Adepto (T4)' };
function acDefaults() {
  m.acLabel.mockImplementation(async (_env: unknown, id: string) => LABELS[id.toUpperCase()] ?? null);
  m.acSearch.mockResolvedValue([]);
}
vi.mock('../shared/items', async (orig) => ({
  ...(await orig<typeof import('../shared/items')>()),
  searchItems: m.searchItems,
  // Índice "já preparado": o caminho frio (quickSearch) tem teste próprio em items-quick.test.ts.
  isSearchReady: () => true,
  itemName: (_i: unknown, id: string) => id,
}));
vi.mock('../worker/api/market', () => ({ getItem: m.getItem }));
vi.mock('../worker/api/clock', () => ({ getClock: m.getClock }));
vi.mock('../worker/api/player', () => ({ searchPlayers: m.searchPlayers, getDossier: m.getDossier, getAutopsy: m.getAutopsy }));
vi.mock('../worker/api/alerts', () => ({ createAlert: m.createAlert, listAlerts: m.listAlerts, deleteAlert: m.deleteAlert }));

import { hexToBytes, verifySignature, MAX_SKEW_SECONDS } from '../worker/discord/verify';
import {
  handleDiscord,
  dispatch,
  fastOrDeferred,
  parseCondition,
  buildAlert,
  ownerOf,
  UserError,
  friendly,
  type Interaction,
} from '../worker/discord/interactions';
import { COMMANDS, QUALITY_NAMES } from '../worker/discord/commands';
import { CoreError, GuildNotFound } from '../worker/api/insightsA';
import { GameinfoError } from '../worker/lib/gameinfo';
import { readPublic } from './helpers/public';
import { QUALITY_LABEL } from '../shared/quality';
import {
  AMBER,
  FOOTER,
  ageLabel,
  clamp,
  esc,
  finalize,
  fmtDateBr,
  fmtInt,
  renderClock,
  renderPreco,
  renderDossier,
  FOOTER_ES,
  renderHelp,
  renderAlertList,
  type MessageData,
} from '../worker/discord/render';
import { QUALITY_NAMES_ES, ES_LOCALES, commandName } from '../worker/discord/commands';
import { discordLocale, siteUrl } from '../worker/discord/i18n';
import { channelProblem, feedWarning, FeedError } from '../worker/discord/guild';
import { QUALITY_LABEL_ES } from '../src/lib/format';

// ---------- utilidades ----------

const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
let keys: CryptoKeyPair;
let pubHex: string;
beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  pubHex = toHex(await crypto.subtle.exportKey('raw', keys.publicKey));
});
async function sign(ts: string, body: string): Promise<string> {
  return toHex(await crypto.subtle.sign({ name: 'Ed25519' }, keys.privateKey, new TextEncoder().encode(ts + body)));
}
const nowTs = () => String(Math.floor(Date.now() / 1000));
const env = () => ({ DISCORD_PUBLIC_KEY: pubHex, DISCORD_APP_ID: 'app1' }) as unknown as Env;
function makeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
  return { ctx, flush: () => Promise.all(pending) };
}
async function signedRequest(body: string, ts = nowTs()): Promise<Request> {
  return new Request('https://guarita.pages.dev/discord', {
    method: 'POST',
    headers: { 'X-Signature-Ed25519': await sign(ts, body), 'X-Signature-Timestamp': ts, 'Content-Type': 'application/json' },
    body,
  });
}
function cmd(name: string, options: Interaction['data'] extends infer D ? (D extends { options?: infer O } ? O : never) : never = []): Interaction {
  return { id: '1', application_id: 'app1', type: 2, token: 'tok', data: { name, options }, member: { user: { id: 'u42' } } };
}
type FetchCall = { url: string; method: string; body: unknown };
function mockFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(init.method === 'DELETE' ? null : '{}', { status: init.method === 'DELETE' ? 204 : 200 });
  });
  return calls;
}
beforeEach(acDefaults);
afterEach(() => {
  vi.unstubAllGlobals();
  Object.values(m).forEach((f) => f.mockReset());
});

const conf = (score: number) => ({ score, label: score >= 70 ? ('alta' as const) : ('baixa' as const), reasons: [] });
const recent = (min: number) => new Date(Date.now() - min * 60000).toISOString();
function quote(city: CityQuote['city'], sellMin: number | null, buyMax: number | null, age = 10): CityQuote {
  return { city, sellMin, sellMinAt: sellMin ? recent(age) : null, buyMax, buyMaxAt: buyMax ? recent(age) : null, ageMin: age, confidence: conf(80), verdict: 'barato' };
}
const ITEM: ItemResponse = {
  id: 'T4_BAG@1',
  quality: 1,
  fetchedAt: new Date().toISOString(),
  cities: [quote('Martlock', 4572, 4000), quote('Lymhurst', 5100, 4100), quote('Thetford', null, null), quote('Black Market', null, 5056)],
  history: [],
  median7d: 4800,
  p25: 4500,
  p75: 5200,
  book: [],
  flips: [
    { from: 'Martlock', buyAt: 4572, sellAt: 5056, profitPremium: 282, profitNoPremium: 80, roi: 0.0617, ageMin: 10 },
    { from: 'Lymhurst', buyAt: 5100, sellAt: 5056, profitPremium: -246, profitNoPremium: -449, roi: -0.05, ageMin: 10 },
  ],
};
const INDEX = { v: 1, generatedAt: '', source: '', items: [['T4_BAG@1', 'Bolsa do Adepto', "Adept's Bag", 4, 1]] };

// ---------- verificação Ed25519 ----------

describe('verify', () => {
  it('converte hex e rejeita hex inválido', () => {
    expect(Array.from(hexToBytes('00ff10')!)).toEqual([0, 255, 16]);
    expect(hexToBytes('abc')).toBeNull();
    expect(hexToBytes('zz')).toBeNull();
    expect(hexToBytes('')).toBeNull();
  });

  it('aceita assinatura correta e rejeita corpo adulterado', async () => {
    const ts = nowTs();
    const sig = await sign(ts, '{"type":1}');
    expect((await verifySignature(pubHex, sig, ts, '{"type":1}')).ok).toBe(true);
    expect((await verifySignature(pubHex, sig, ts, '{"type":2}')).ok).toBe(false);
  });

  it('rejeita timestamp velho, assinatura malformada e chave ausente', async () => {
    const old = String(Math.floor(Date.now() / 1000) - MAX_SKEW_SECONDS - 10);
    expect((await verifySignature(pubHex, await sign(old, 'x'), old, 'x')).reason).toMatch(/janela/);
    expect((await verifySignature(pubHex, 'abcd', nowTs(), 'x')).reason).toMatch(/malformada/);
    expect((await verifySignature('', 'ab', nowTs(), 'x')).ok).toBe(false);
    expect((await verifySignature('00', 'a'.repeat(128), nowTs(), 'x')).ok).toBe(false);
  });
});

describe('handleDiscord', () => {
  const ctx = makeCtx().ctx;
  it('401 sem cabeçalhos de assinatura', async () => {
    const r = await handleDiscord(new Request('https://x/discord', { method: 'POST', body: '{"type":1}' }), env(), ctx);
    expect(r.status).toBe(401);
  });
  it('401 com assinatura de outra chave', async () => {
    const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const ts = nowTs();
    const sig = toHex(await crypto.subtle.sign({ name: 'Ed25519' }, other.privateKey, new TextEncoder().encode(ts + '{"type":1}')));
    const req = new Request('https://x/discord', { method: 'POST', headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts }, body: '{"type":1}' });
    expect((await handleDiscord(req, env(), ctx)).status).toBe(401);
  });
  it('405 em GET', async () => {
    expect((await handleDiscord(new Request('https://x/discord'), env(), ctx)).status).toBe(405);
  });
  it('PING assinado → PONG', async () => {
    const r = await handleDiscord(await signedRequest('{"type":1,"id":"1","application_id":"a","token":"t"}'), env(), ctx);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ type: 1 });
  });
  it('400 em JSON inválido assinado', async () => {
    expect((await handleDiscord(await signedRequest('{nope'), env(), ctx)).status).toBe(400);
  });
});

// ---------- autocomplete ----------

describe('autocomplete', () => {
  it('devolve até 25 opções com nome PT-BR e tier', async () => {
    m.acSearch.mockResolvedValueOnce([{ id: 'T4_BAG@1', label: 'Bolsa do Adepto (T4.1)' }]);
    const i: Interaction = { ...cmd('preco', [{ name: 'item', type: 3, value: 'bolsa', focused: true }]), type: 4 };
    const r = await dispatch(i, env(), makeCtx().ctx);
    expect(r).toEqual({ type: 8, data: { choices: [{ name: 'Bolsa do Adepto (T4.1)', value: 'T4_BAG@1' }] } });
    expect(m.acSearch).toHaveBeenCalledWith(expect.anything(), 'bolsa', 25);
  });
  it('erro no índice vira lista vazia, nunca erro', async () => {
    m.acSearch.mockRejectedValueOnce(new Error('falhou'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const i: Interaction = { ...cmd('preco', [{ name: 'item', type: 3, value: 'x', focused: true }]), type: 4 };
    expect(await dispatch(i, env(), makeCtx().ctx)).toEqual({ type: 8, data: { choices: [] } });
  });
  it('id de /alerta apagar lista os alertas do usuário', async () => {
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.listAlerts.mockResolvedValue([rule()]);
    const i: Interaction = {
      ...cmd('alerta', [{ name: 'apagar', type: 1, options: [{ name: 'id', type: 3, value: '', focused: true }] }]),
      type: 4,
    };
    const r = await dispatch(i, env(), makeCtx().ctx);
    expect(m.listAlerts).toHaveBeenCalledWith(expect.anything(), 'u42');
    expect((r.data as { choices: { value: string; name: string }[] }).choices[0]).toEqual({
      value: 'a1',
      name: 'Bolsa do Adepto (T4.1) · Martlock · abaixo de 4.000 prata',
    });
  });
});

function rule(): AlertRule {
  return {
    id: 'a1', itemId: 'T4_BAG@1', quality: 1, cities: ['Martlock'], side: 'sell', condition: { kind: 'below', price: 4000 },
    cooldownMin: 60, channel: 'discord', owner: 'u42', createdAt: new Date().toISOString(),
  };
}

// ---------- comandos ----------

describe('/preco', () => {
  it('responde direto com embed âmbar, flip e link', async () => {
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.getItem.mockResolvedValue(ITEM);
    const r = await dispatch(cmd('preco', [{ name: 'item', type: 3, value: 'T4_BAG@1' }, { name: 'qualidade', type: 4, value: 1 }]), env(), makeCtx().ctx);
    expect(r.type).toBe(4);
    const data = r.data as MessageData;
    const e = data.embeds![0];
    expect(e.color).toBe(AMBER);
    expect(e.footer?.text).toBe(FOOTER);
    expect(e.title).toBe('Bolsa do Adepto (T4.1) · Normal');
    expect(e.url).toBe('https://guarita.pages.dev/item/T4_BAG%401');
    expect(e.description).toContain('Martlock');
    expect(e.description).toContain('4.572');
    const flip = e.fields!.find((f) => f.name.startsWith('Melhor flip'))!;
    expect(flip.value).toContain('282');
    expect(flip.value).toContain('Martlock');
    expect(data.flags).toBeUndefined();
    expect(data.components?.[0].components[0].url).toBe(e.url);
  });
  it('texto livre sem resultado vira aviso efêmero', async () => {
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.searchItems.mockReturnValue([]);
    const r = await dispatch(cmd('preco', [{ name: 'item', type: 3, value: 'xyzzy' }]), env(), makeCtx().ctx);
    expect(r.type).toBe(4);
    expect((r.data as MessageData).flags).toBe(64);
    expect((r.data as MessageData).content).toMatch(/Não achei o item/);
  });
  it('erro de módulo não implementado vira mensagem amigável', async () => {
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.getItem.mockRejectedValue(new Error('não implementado: módulo (b)'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await dispatch(cmd('preco', [{ name: 'item', type: 3, value: 'T4_BAG@1' }]), env(), makeCtx().ctx);
    expect((r.data as MessageData).content).toMatch(/sendo preparada/);
    expect((r.data as MessageData).flags).toBe(64);
  });
});

describe('fastOrDeferred', () => {
  it('estoura o prazo → adia (type 5) e edita a original pelo webhook', async () => {
    const calls = mockFetch();
    const { ctx, flush } = makeCtx();
    const slow = () => new Promise<MessageData>((r) => setTimeout(() => r({ content: 'pronto', flags: 64 }), 30));
    const r = await fastOrDeferred(cmd('relogio'), ctx, slow, false, 5);
    expect(r).toEqual({ type: 5 });
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toBe('https://discord.com/api/v10/webhooks/app1/tok/messages/@original');
    expect(calls[0].body).toEqual({ content: 'pronto' });
  });
  it('trabalho que passa do teto vira aviso de demora, não fica pensando', async () => {
    const calls = mockFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, flush } = makeCtx();
    const never = () => new Promise<MessageData>((r) => setTimeout(() => r({ content: 'tarde demais' }), 200));
    await fastOrDeferred(cmd('relogio'), ctx, never, false, 1, 20);
    await flush();
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'POST']);
    expect((calls[1].body as MessageData).content).toMatch(/demorou/);
    expect(JSON.stringify(calls)).not.toContain('tarde demais');
  });
  it('efêmero adiado leva flags 64 no ack', async () => {
    mockFetch();
    const { ctx, flush } = makeCtx();
    const r = await fastOrDeferred(cmd('alerta'), ctx, () => new Promise((res) => setTimeout(() => res({ content: 'ok' }), 20)), true, 1);
    expect(r).toEqual({ type: 5, data: { flags: 64 } });
    await flush();
  });
});

describe('/dossie e /morte (adiados)', () => {
  it('nome exato → dossiê no followup', async () => {
    const calls = mockFetch();
    const { ctx, flush } = makeCtx();
    m.searchPlayers.mockResolvedValue({ players: [{ id: 'X1', name: 'CalangoPeto', guild: '', alliance: '', killFame: 1, deathFame: 1 }, { id: 'X2', name: 'CalangoPetoo', guild: '', alliance: '', killFame: 0, deathFame: 0 }] });
    m.getDossier.mockResolvedValue(dossier());
    const r = await dispatch(cmd('dossie', [{ name: 'nome', type: 3, value: 'calangopeto' }]), env(), ctx);
    expect(r).toEqual({ type: 5 });
    await flush();
    expect(m.getDossier).toHaveBeenCalledWith(expect.anything(), ctx, 'X1');
    const body = calls[0].body as MessageData;
    expect(body.embeds![0].title).toBe('Dossiê: CalangoPeto');
    expect(body.embeds![0].url).toBe('https://guarita.pages.dev/jogador/X1');
  });
  it('vários sem nome exato → lista dos 5 primeiros', async () => {
    const calls = mockFetch();
    const { ctx, flush } = makeCtx();
    const players = Array.from({ length: 8 }, (_, k) => ({ id: `P${k}`, name: `Calango${k}`, guild: 'G', alliance: '', killFame: k, deathFame: 0 }));
    m.searchPlayers.mockResolvedValue({ players });
    await dispatch(cmd('dossie', [{ name: 'nome', type: 3, value: 'calango' }]), env(), ctx);
    await flush();
    const desc = (calls[0].body as MessageData).embeds![0].description!;
    expect(desc.match(/^• /gm)).toHaveLength(5);
    expect(desc).toContain('/jogador/P4');
    expect(desc).not.toContain('/jogador/P5');
    expect(desc).toContain('mais 3');
  });
  it('erro num adiado público → apaga a original e manda aviso efêmero', async () => {
    const calls = mockFetch();
    const { ctx, flush } = makeCtx();
    m.searchPlayers.mockResolvedValue({ players: [] });
    await dispatch(cmd('morte', [{ name: 'nome', type: 3, value: 'Ninguem' }]), env(), ctx);
    await flush();
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'POST']);
    expect(calls[1].url).toBe('https://discord.com/api/v10/webhooks/app1/tok');
    expect((calls[1].body as MessageData).flags).toBe(64);
    expect((calls[1].body as MessageData).content).toMatch(/Nenhum jogador/);
  });
  it('nome curto demais responde na hora, sem adiar', async () => {
    const r = await dispatch(cmd('dossie', [{ name: 'nome', type: 3, value: 'ab' }]), env(), makeCtx().ctx);
    expect(r.type).toBe(4);
    expect((r.data as MessageData).flags).toBe(64);
  });
  it('autópsia sem morte recente', async () => {
    const calls = mockFetch();
    const { ctx, flush } = makeCtx();
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.searchPlayers.mockResolvedValue({ players: [{ id: 'X1', name: 'CalangoPeto', guild: '', alliance: '', killFame: 1, deathFame: 1 }] });
    m.getAutopsy.mockResolvedValue({ death: null, killerDossier: null, lessons: [], rebuy: [], rebuyTotal: null });
    await dispatch(cmd('morte', [{ name: 'nome', type: 3, value: 'Calango' }]), env(), ctx);
    await flush();
    const e = (calls[0].body as MessageData).embeds![0];
    expect(e.url).toBe('https://guarita.pages.dev/jogador/X1/morte');
    expect(e.description).toMatch(/Nenhuma morte/);
  });
});

function dossier(): PlayerDossier {
  return {
    id: 'X1', name: 'CalangoPeto', guild: 'Guilda [BR]', alliance: '', killFame: 1234567, deathFame: 7654, ratio: 161.3,
    pve: {}, gathering: {}, recentKills: [], recentDeaths: [], weapons: [{ type: 'T4_MAIN_SWORD', labelPt: 'Espada larga', count: 3 }],
    soloRate: 0.4, avgGroup: 2.5, avgIp: 1100, danger: { score: 70, label: 'perigoso', reasons: ['mata solo com frequência'] },
    fetchedAt: new Date().toISOString(),
  };
}

describe('/alerta', () => {
  it('criar: dono = member.user.id, canal discord, resposta efêmera', async () => {
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.createAlert.mockImplementation(async (_e: Env, r: object) => ({ ...r, id: 'novo1', createdAt: new Date().toISOString() }));
    const r = await dispatch(
      cmd('alerta', [{ name: 'criar', type: 1, options: [
        { name: 'item', type: 3, value: 'T4_BAG@1' }, { name: 'cidade', type: 3, value: 'Black Market' },
        { name: 'condicao', type: 3, value: 'acima' }, { name: 'valor', type: 10, value: 6000 },
      ] }]),
      env(),
      makeCtx().ctx,
    );
    expect(m.createAlert).toHaveBeenCalledWith(expect.anything(), {
      itemId: 'T4_BAG@1', quality: 1, cities: ['Black Market'], side: 'buy', condition: { kind: 'above', price: 6000 },
      cooldownMin: 60, channel: 'discord', owner: 'u42', itemName: 'Bolsa do Adepto (T4.1)',
    });
    expect(r.type).toBe(4);
    expect((r.data as MessageData).flags).toBe(64);
    expect(JSON.stringify(r.data)).toContain('novo1');
  });
  it('mensagem de validação do módulo de alertas chega ao usuário; falha de infraestrutura não', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.loadItemsIndex.mockResolvedValue(INDEX);
    const criar = cmd('alerta', [{ name: 'criar', type: 1, options: [
      { name: 'item', type: 3, value: 'T4_BAG@1' }, { name: 'cidade', type: 3, value: 'Martlock' },
      { name: 'condicao', type: 3, value: 'abaixo' }, { name: 'valor', type: 10, value: 10 },
    ] }]);
    m.createAlert.mockRejectedValue(new Error('Limite de 20 alertas por dono atingido'));
    const r = await dispatch(criar, env(), makeCtx().ctx);
    expect((r.data as MessageData).content).toBe('Não deu para criar o alerta: limite de 20 alertas por dono atingido');
    m.createAlert.mockRejectedValue(new Error('falha ao criar alerta (500)'));
    const r2 = await dispatch(criar, env(), makeCtx().ctx);
    expect((r2.data as MessageData).content).toMatch(/Tente de novo/);
  });
  it('listar vazio e apagar inexistente', async () => {
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.listAlerts.mockResolvedValue([]);
    const dm = { ...cmd('alerta', [{ name: 'listar', type: 1 }]), member: undefined, user: { id: 'dm7' } };
    const r = await dispatch(dm, env(), makeCtx().ctx);
    expect(m.listAlerts).toHaveBeenCalledWith(expect.anything(), 'dm7');
    expect((r.data as MessageData).embeds![0].description).toMatch(/ainda não tem alertas/);
    m.deleteAlert.mockResolvedValue(false);
    const r2 = await dispatch(cmd('alerta', [{ name: 'apagar', type: 1, options: [{ name: 'id', type: 3, value: 'zz' }] }]), env(), makeCtx().ctx);
    expect((r2.data as MessageData).content).toMatch(/Não achei um alerta seu/);
    expect((r2.data as MessageData).flags).toBe(64);
  });
  it('valida condição e valor', () => {
    expect(parseCondition('abaixo', 4000.4)).toEqual({ kind: 'below', price: 4000 });
    expect(parseCondition('abaixo_mediana', 15)).toEqual({ kind: 'belowMedianPct', pct: 15 });
    expect(() => parseCondition('abaixo_mediana', 150)).toThrow(UserError);
    // mesmos limites da API (1 a 90), arredondado como ela
    expect(() => parseCondition('abaixo_mediana', 95)).toThrow(/1 a 90/);
    expect(() => parseCondition('abaixo_mediana', 0.4)).toThrow(UserError);
    expect(parseCondition('abaixo_mediana', 12.6)).toEqual({ kind: 'belowMedianPct', pct: 13 });
    expect(parseCondition('abaixo_mediana', 90)).toEqual({ kind: 'belowMedianPct', pct: 90 });
    expect(buildAlert('u', 'X', 'Black Market', 1, { kind: 'above', price: 1 }).side).toBe('buy');
    expect(() => parseCondition('abaixo', 0)).toThrow(UserError);
    expect(() => parseCondition('toString', 10)).toThrow(UserError);
    expect(buildAlert('u', 'X', 'Martlock', 2, { kind: 'below', price: 1 }).side).toBe('sell');
  });
  it('dono vem de member.user ou user', () => {
    expect(ownerOf(cmd('x'))).toBe('u42');
    expect(ownerOf({ ...cmd('x'), member: undefined, user: { id: 'd' } })).toBe('d');
    expect(ownerOf({ ...cmd('x'), member: undefined })).toBeNull();
  });
});

describe('/ajuda e desconhecido', () => {
  it('ajuda é efêmera e lista os comandos', async () => {
    const r = await dispatch(cmd('ajuda'), env(), makeCtx().ctx);
    const data = r.data as MessageData;
    expect(data.flags).toBe(64);
    expect(data.embeds![0].fields!.map((f) => f.name).join(' ')).toContain('/preco');
  });
  it('erro desconhecido não vaza detalhe', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(friendly(new Error('TypeError: x is undefined at /secret'))).not.toMatch(/secret/);
  });
  it('erros preparados do resumo de guilda: nome, histórico fora e gameinfo por tipo', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(friendly(new GuildNotFound('BAGRE'))).toMatch(/Guilda “BAGRE” não encontrada.*nome precisa ser exato/);
    // "erro 502" do KillLog não vira "a fonte do Albion demorou"
    const core = friendly(new CoreError('O histórico do killboard respondeu com erro 502.'));
    expect(core).toMatch(/histórico de kills da Guarita está indisponível/);
    expect(core).not.toMatch(/demorou/);
    expect(friendly(new GameinfoError('timeout', 'gameinfo: sem resposta em 15000 ms'))).toMatch(/demorou demais/);
    expect(friendly(new GameinfoError('upstream', 'gameinfo HTTP 500'))).toMatch(/instável/);
    expect(friendly(new GameinfoError('not_found', 'x'))).toMatch(/Não encontrei/);
  });
});

// ---------- definições dos comandos ----------

describe('commands', () => {
  it('respeitam os limites do Discord', () => {
    const walk = (o: { name: string; description: string; options?: unknown[]; choices?: { name: string }[] }) => {
      expect(o.name).toMatch(/^[-_a-z0-9]{1,32}$/);
      expect(o.description.length).toBeGreaterThan(0);
      expect(o.description.length).toBeLessThanOrEqual(100);
      expect((o.choices ?? []).length).toBeLessThanOrEqual(25);
      (o.choices ?? []).forEach((c) => expect(c.name.length).toBeLessThanOrEqual(100));
      (o.options ?? []).forEach((x) => walk(x as typeof o));
    };
    COMMANDS.forEach(walk);
    // guilda e perdas: Fase 2 (casos próprios em tests/discord-guild.test.ts).
    // hoje: Fase 3, módulo c (casos próprios em tests/hoje.test.ts).
    expect(COMMANDS.map((c) => c.name).sort()).toEqual(['ajuda', 'alerta', 'dossie', 'guilda', 'hoje', 'morte', 'perdas', 'preco', 'relogio']);
  });
  it('qualidades com os mesmos nomes do site (shared/quality.ts)', () => {
    expect(QUALITY_NAMES).toEqual(QUALITY_LABEL);
  });
});

// ---------- render ----------

describe('render', () => {
  it('formata número, data de Brasília e idade', () => {
    expect(fmtInt(1234567)).toBe('1.234.567');
    expect(fmtInt(null)).toBe('—');
    expect(fmtDateBr('2026-11-09T11:00:00Z')).toBe('09/11/2026 08:00');
    expect(ageLabel(0)).toBe('agora');
    expect(ageLabel(12)).toBe('há 12 min');
    expect(ageLabel(180)).toBe('há 3 h');
    expect(ageLabel(4 * 1440)).toBe('há 4 dias');
    expect(ageLabel(null)).toBe('sem data');
  });
  it('escapa markdown e menções de nomes externos', () => {
    expect(esc('*ab_c*')).toBe('\\*ab\\_c\\*');
    expect(esc('@everyone')).not.toBe('@everyone');
  });
  it('finalize corta nos limites', () => {
    const e = finalize({ title: 'x'.repeat(300), fields: Array.from({ length: 30 }, (_, k) => ({ name: `f${k}`, value: 'v'.repeat(1500) })) });
    expect(e.title!.length).toBe(256);
    expect(e.fields!.length).toBeLessThanOrEqual(25);
    e.fields!.forEach((f) => expect(f.value.length).toBeLessThanOrEqual(1024));
    const total = e.title!.length + e.footer!.text.length + e.fields!.reduce((s, f) => s + f.name.length + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(clamp('abcdef', 4)).toBe('abc…');
  });
  it('preço avisa dado velho e sem flip lucrativo', () => {
    const old: ItemResponse = { ...ITEM, cities: [quote('Martlock', 4572, null, 900)], flips: [] };
    const e = renderPreco(old, 'Bolsa').embeds![0];
    expect(e.description).toMatch(/Dado velho/);
    expect(e.fields!.find((f) => f.name.startsWith('Melhor flip'))!.value).toMatch(/Nenhum flip/);
  });
  it('relógio separa bônus ativos e próximos, em horário de Brasília', () => {
    const now = Date.parse('2026-10-29T15:00:00Z');
    const c: ClockResponse = {
      now: new Date(now).toISOString(),
      server: { status: 'online', message: 'Servidor no ar', checkedAt: new Date(now - 60000).toISOString() },
      festivities: [
        { kind: 1, category: 'x', name: 'A', labelPt: 'Bônus de coleta: madeira', start: '2026-10-29T10:00:00Z', end: '2026-10-30T10:00:00Z' },
        { kind: 1, category: 'x', name: 'B', labelPt: 'Bônus de produção: bestas', start: '2026-10-31T10:00:00Z', end: '2026-11-01T10:00:00Z' },
      ],
      gold: { price: 4120, at: new Date(now).toISOString(), p30: 4000, trend: 'subindo' },
      premiumSilver: 15450000,
      season: { name: 'Temporada 34', end: '2026-11-09T11:00:00Z', approx: true },
    };
    const e = renderClock(c, now).embeds![0];
    const f = Object.fromEntries(e.fields!.map((x) => [x.name, x.value]));
    expect(f['Bônus ativos agora']).toContain('madeira');
    expect(f['Bônus ativos agora']).toContain('30/10 07:00');
    expect(f['Próximas festividades']).toContain('bestas');
    expect(f['Premium (30 dias)']).toContain('15.450.000');
    expect(f['Temporada 34']).toContain('09/11/2026 08:00');
    expect(e.description).toContain('29/10/2026 12:00');
  });
  it('dossiê mostra perigo, fama e estilo', () => {
    const e = renderDossier(dossier()).embeds![0];
    const f = Object.fromEntries(e.fields!.map((x) => [x.name, x.value]));
    expect(f['Perigo']).toContain('perigoso');
    expect(f['Fama']).toContain('1.234.567');
    expect(f['Estilo']).toContain('40%');
    expect(e.description).toContain('Guilda \\[BR\\]');
  });
  it('em espanhol: festividade, família de arma e IP sem português', () => {
    const now = Date.parse('2026-10-29T15:00:00Z');
    const c: ClockResponse = {
      now: new Date(now).toISOString(),
      server: { status: 'online', message: 'Servidor no ar', checkedAt: new Date(now - 60000).toISOString() },
      festivities: [
        { kind: 2, category: 'GENERAL', name: 'COMMON_CROSSBOW', labelPt: 'Bônus de produção: bestas comuns', start: '2026-10-29T10:00:00Z', end: '2026-10-30T10:00:00Z' },
        { kind: 1, category: 'ACTIVITIES', name: 'FACTIONPOINTS', labelPt: 'Pontos de facção em dobro', start: '2026-10-31T10:00:00Z', end: '2026-11-01T10:00:00Z' },
      ],
      gold: { price: 4120, at: new Date(now).toISOString(), p30: 4000, trend: 'subindo' },
      premiumSilver: 15450000,
      season: { name: 'Temporada 34', end: '2026-11-09T11:00:00Z', approx: true },
    };
    const clock = JSON.stringify(renderClock(c, now, 'es'));
    expect(clock).toContain('Bonificación de producción: ballestas comunes');
    expect(clock).toContain('Puntos de facción dobles');
    expect(clock).not.toMatch(/Bônus|bestas|Pontos de facção/);
    const d = { ...dossier(), avgIp: 1250, weapons: [{ type: 'cursedstaff', labelPt: 'Cajado amaldiçoado', count: 5 }] };
    const dos = JSON.stringify(renderDossier(d, undefined, 'es'));
    expect(dos).toContain('Bastón maldito (5×)');
    expect(dos).toContain('IP medio');
    expect(dos).toContain('Dosier');
    expect(dos).not.toMatch(/Cajado|Dossier|Poder de objeto/);
    // Português intacto.
    expect(JSON.stringify(renderDossier(d))).toContain('Cajado amaldiçoado (5×)');
    // Rótulo do perigo igual ao do site e do MCP ("atención", não "precaución"); em PT o código segue "atenção".
    const at = { ...d, danger: { ...d.danger, label: 'atenção' as const } };
    expect(JSON.stringify(renderDossier(at, undefined, 'es'))).toContain('**atención**');
    expect(JSON.stringify(renderDossier(at, undefined, 'es'))).not.toContain('precaución');
    expect(JSON.stringify(renderDossier(at))).toContain('**atenção**');
  });
});

// ---------- espanhol (interaction.locale "es…") ----------

describe('espanhol', () => {
  const es = (i: Interaction, locale = 'es-ES'): Interaction => ({ ...i, locale });
  const ES_LABELS: Record<string, string> = { 'T4_BAG@1': 'Bolsa del iniciado (T4.1)' };
  const acEs = () =>
    m.acLabel.mockImplementation(async (_env: unknown, id: string, locale?: string) =>
      (locale === 'es' ? ES_LABELS : LABELS)[id.toUpperCase()] ?? null,
    );

  it('locale do Discord: só "es…" vira espanhol', () => {
    expect(discordLocale('es-ES')).toBe('es');
    expect(discordLocale('es-419')).toBe('es');
    expect(discordLocale('pt-BR')).toBe('pt');
    expect(discordLocale('en-US')).toBe('pt');
    expect(discordLocale(undefined)).toBe('pt');
    expect(siteUrl('es', '/item/X?q=2')).toBe('https://guarita.pages.dev/es/item/X?q=2');
    expect(siteUrl('es', '/')).toBe('https://guarita.pages.dev/es');
    expect(siteUrl('pt', '/')).toBe('https://guarita.pages.dev');
  });

  it('/preco em es-ES: embed, botão, números e link em espanhol, nome do item pelas fatias ES', async () => {
    acEs();
    m.getItem.mockResolvedValue(ITEM);
    const r = await dispatch(es(cmd('preco', [{ name: 'item', type: 3, value: 'T4_BAG@1' }])), env(), makeCtx().ctx);
    const data = r.data as MessageData;
    const e = data.embeds![0];
    expect(m.acLabel).toHaveBeenCalledWith(expect.anything(), 'T4_BAG@1', 'es');
    expect(e.title).toBe('Bolsa del iniciado (T4.1) · Normal');
    expect(e.url).toBe('https://guarita.pages.dev/es/item/T4_BAG%401');
    expect(e.footer?.text).toBe(FOOTER_ES);
    expect(e.description).toContain('Más barato: **Martlock** por **4,572** de plata');
    expect(e.fields!.map((f) => f.name)).toContain('Mercado Negro (compra)');
    const flip = e.fields!.find((f) => f.name === 'Mejor reventa al Mercado Negro')!;
    expect(flip.value).toContain('vende en el Mercado Negro');
    expect(data.components?.[0].components[0]).toMatchObject({ label: 'Ver en Guarita', url: e.url });
    expect(JSON.stringify(data)).not.toMatch(/prata|Ver na Guarita|Melhor flip/);
  });

  it('pt-BR explícito sai idêntico ao de antes (sem locale)', async () => {
    m.getItem.mockResolvedValue(ITEM);
    const a = await dispatch({ ...cmd('preco', [{ name: 'item', type: 3, value: 'T4_BAG@1' }]), locale: 'pt-BR' }, env(), makeCtx().ctx);
    const b = await dispatch(cmd('preco', [{ name: 'item', type: 3, value: 'T4_BAG@1' }]), env(), makeCtx().ctx);
    expect(a).toEqual(b);
    expect(m.acLabel).toHaveBeenCalledWith(expect.anything(), 'T4_BAG@1');
    expect((a.data as MessageData).embeds![0].title).toBe('Bolsa do Adepto (T4.1) · Normal');
  });

  it('autocomplete em es-419 busca nas fatias ES', async () => {
    m.acSearch.mockResolvedValueOnce([{ id: 'T4_BAG@1', label: 'Bolsa del iniciado (T4.1)' }]);
    const i: Interaction = { ...es(cmd('preco', [{ name: 'item', type: 3, value: 'bolsa', focused: true }]), 'es-419'), type: 4 };
    const r = await dispatch(i, env(), makeCtx().ctx);
    expect(m.acSearch).toHaveBeenCalledWith(expect.anything(), 'bolsa', 25, 'es');
    expect(r).toEqual({ type: 8, data: { choices: [{ name: 'Bolsa del iniciado (T4.1)', value: 'T4_BAG@1' }] } });
  });

  it('erros em espanhol: item não achado, nome curto, jogador inexistente no adiado', async () => {
    const r = await dispatch(es(cmd('preco', [{ name: 'item', type: 3, value: 'xyzzy' }])), env(), makeCtx().ctx);
    expect((r.data as MessageData).content).toMatch(/^No encontré el objeto “xyzzy”/);
    expect(m.acSearch).toHaveBeenCalledWith(expect.anything(), 'xyzzy', 1, 'es');
    const curto = await dispatch(es(cmd('dossie', [{ name: 'nome', type: 3, value: 'ab' }])), env(), makeCtx().ctx);
    expect((curto.data as MessageData).content).toBe('Escribe al menos 3 letras del nombre del personaje.');
    const calls = mockFetch();
    const { ctx, flush } = makeCtx();
    m.searchPlayers.mockResolvedValue({ players: [] });
    await dispatch(es(cmd('morte', [{ name: 'nome', type: 3, value: 'Ninguem' }])), env(), ctx);
    await flush();
    expect((calls[1].body as MessageData).content).toMatch(/^Ningún jugador llamado “Ninguem”/);
  });

  it('erro genérico e de fonte em espanhol, sem vazar detalhe', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(friendly(new Error('TypeError at /secret'), 'es')).toBe('No pude completar la solicitud ahora. Inténtalo de nuevo en unos instantes.');
    expect(friendly(new GameinfoError('timeout', 'x'), 'es')).toMatch(/tardó demasiado/);
    expect(friendly(new GameinfoError('upstream', 'x'), 'es')).toMatch(/inestable/);
    expect(friendly(new CoreError('erro 502'), 'es')).toMatch(/historial de asesinatos de Guarita/);
    expect(friendly(new GuildNotFound('BAGRE'), 'es')).toBe('No encontré el gremio “BAGRE” en el servidor Americas. El nombre tiene que ser exacto.');
    expect(friendly(new FeedError('cheio', 'lleno'), 'es')).toBe('lleno');
    expect(friendly(new FeedError('cheio', 'lleno'))).toBe('cheio');
    expect(friendly(new FeedError('só pt'), 'es')).toBe('só pt');
  });

  it('limite de alertas do módulo de alertas vira texto em espanhol', async () => {
    m.createAlert.mockRejectedValue(new Error('Limite de 20 alertas por dono atingido'));
    const criar = es(cmd('alerta', [{ name: 'criar', type: 1, options: [
      { name: 'item', type: 3, value: 'T4_BAG@1' }, { name: 'cidade', type: 3, value: 'Martlock' },
      { name: 'condicao', type: 3, value: 'abaixo' }, { name: 'valor', type: 10, value: 10 },
    ] }]));
    const r = await dispatch(criar, env(), makeCtx().ctx);
    expect((r.data as MessageData).content).toBe('No se pudo crear la alerta: llegaste al límite de 20 alertas. Borra alguna con /alerta borrar.');
    expect(() => parseCondition('abaixo_mediana', 95, 'es')).toThrow(/porcentaje de 1 a 90/);
  });

  it('ajuda em espanhol cita os comandos com o nome em espanhol e linka /es', async () => {
    const r = await dispatch(es(cmd('ajuda')), env(), makeCtx().ctx);
    const data = r.data as MessageData;
    const e = data.embeds![0];
    expect(data.flags).toBe(64);
    expect(e.title).toBe('Guarita en Discord');
    const names = e.fields!.map((f) => f.name).join(' ');
    for (const c of ['/precio', '/reloj', '/dosier', '/muerte', '/perdidas', '/hoy', '/gremio']) expect(names).toContain(c);
    expect(JSON.stringify(e)).toContain('https://guarita.pages.dev/es/permitido');
    expect(data.components?.[0].components[0]).toMatchObject({ label: 'Abrir Guarita', url: 'https://guarita.pages.dev/es' });
    // português continua com a ajuda de antes
    expect(renderHelp().embeds![0].title).toBe('Guarita no Discord');
  });

  it('/dosier e /muerte em espanhol pedem à API os textos em espanhol (motivos do perigo e lições)', async () => {
    const calls = mockFetch();
    const { ctx, flush } = makeCtx();
    m.searchPlayers.mockResolvedValue({ players: [{ id: 'X1', name: 'CalangoPeto', guild: '', alliance: '', killFame: 1, deathFame: 1 }] });
    m.getDossier.mockResolvedValue({ ...dossier(), danger: { score: 70, label: 'perigoso', reasons: ['mata en solitario con IP alto (80% de los asesinatos)'] } });
    await dispatch(es(cmd('dossie', [{ name: 'nome', type: 3, value: 'CalangoPeto' }])), env(), ctx);
    await flush();
    expect(m.getDossier).toHaveBeenCalledWith(expect.anything(), ctx, 'X1', 'es');
    const dossierJson = JSON.stringify(calls[0].body);
    expect(dossierJson).toContain('mata en solitario con IP alto (80% de los asesinatos)');
    m.getAutopsy.mockResolvedValue({ death: null, killerDossier: null, lessons: [], rebuy: [], rebuyTotal: null });
    await dispatch(es(cmd('morte', [{ name: 'nome', type: 3, value: 'CalangoPeto' }])), env(), ctx);
    await flush();
    expect(m.getAutopsy).toHaveBeenCalledWith(expect.anything(), ctx, 'X1', 'es');
  });

  it('lista de alertas, datas e idade em espanhol (horário de Brasília em 24 h)', () => {
    const e = renderAlertList([rule()], () => 'Bolsa del iniciado (T4.1)', Date.now(), 'es').embeds![0];
    expect(e.title).toBe('Tus alertas (1)');
    expect(e.description).toContain('Martlock · por debajo de 4,000 de plata · todavía sin avisos');
    expect(e.description).toContain('/alerta borrar id:<identificador>');
    expect(fmtDateBr('2026-11-09T21:00:00Z', 'es')).toBe('09/11/2026 18:00');
    expect(fmtDateBr('2026-11-09T21:00:00Z')).toBe('09/11/2026 18:00');
    expect(ageLabel(12, 'es')).toBe('hace 12 min');
    expect(ageLabel(4 * 1440, 'es')).toBe('hace 4 días');
    expect(ageLabel(null, 'es')).toBe('sin fecha');
  });

  it('textos do killfeed em espanhol (permissões com o nome do Discord em espanhol)', () => {
    expect(channelProblem(403, '1', 'es')).toMatch(/Ver canal, Enviar mensajes e Insertar enlaces/);
    expect(channelProblem(404, '1', 'es')).toMatch(/^No encontré el canal/);
    const feed = { channelId: '1', enabled: false, lastError: 'canal_sumiu' } as Parameters<typeof feedWarning>[0];
    expect(feedWarning(feed, 'es')).toMatch(/\/gremio configurar/);
    expect(feedWarning(feed)).toMatch(/\/guilda configurar/);
  });

  it('nome do comando como quem lê vê', () => {
    expect(commandName('guilda feed desligar', 'es')).toBe('/gremio feed desactivar');
    expect(commandName('alerta listar', 'es')).toBe('/alerta listar');
    expect(commandName('preco', 'es')).toBe('/precio');
    expect(commandName('guilda feed desligar')).toBe('/guilda feed desligar');
  });

  it('o site em espanhol cita os comandos com os nomes que o cliente em espanhol mostra', async () => {
    // Fonte das telas lida do disco pelo mesmo helper dos arquivos de public/ (o tsconfig não carrega @types/node).
    const src = (p: string) => readPublic(`/../src/routes/${p}`) ?? '';
    // Tabela espelho escrita nas telas (o site não importa commands.ts): precisa bater com os name_localizations.
    expect(commandName('preco', 'es')).toBe('/precio');
    expect(commandName('relogio', 'es')).toBe('/reloj');
    expect(commandName('alerta criar', 'es')).toBe('/alerta crear');
    const preco = COMMANDS.find((c) => c.name === 'preco');
    expect(preco?.options?.find((o) => o.name === 'item')?.name_localizations?.['es-419']).toBe('objeto');
    expect(src('Item.svelte')).toContain('`/precio objeto:${n}`');
    expect(src('Alertas.svelte')).toContain('<code>/alerta crear</code>');
    expect(src('Inicio.svelte')).toContain('<code>/precio</code> muestra');
    expect(src('Inicio.svelte')).toContain('<code>/reloj</code> muestra');
  });

  it('comandos: traduções válidas para o Discord (minúsculas, sem espaço, até 100 caracteres, sem nome repetido)', () => {
    type Node = {
      name: string;
      description?: string;
      name_localizations?: Record<string, string>;
      description_localizations?: Record<string, string>;
      options?: Node[];
      choices?: Node[];
    };
    const keys = [...ES_LOCALES].sort();
    const walk = (o: Node, isChoice = false) => {
      if (o.name_localizations) {
        expect(Object.keys(o.name_localizations).sort()).toEqual(keys);
        for (const v of Object.values(o.name_localizations)) {
          if (isChoice) expect(v.length).toBeLessThanOrEqual(100);
          else expect(v).toMatch(/^[-_a-z0-9]{1,32}$/);
        }
      }
      if (!isChoice) {
        // toda descrição tem a versão em espanhol
        expect(Object.keys(o.description_localizations ?? {}).sort()).toEqual(keys);
        for (const v of Object.values(o.description_localizations!)) {
          expect(v.length).toBeGreaterThan(0);
          expect(v.length).toBeLessThanOrEqual(100);
        }
      }
      const kids = o.options ?? [];
      const esNames = kids.map((k) => k.name_localizations?.['es-419'] ?? k.name);
      expect(new Set(esNames).size).toBe(esNames.length);
      kids.forEach((k) => walk(k));
      (o.choices ?? []).forEach((c) => walk(c, true));
    };
    COMMANDS.forEach((c) => walk(c as Node));
    const top = COMMANDS.map((c) => c.name_localizations?.['es-419'] ?? c.name);
    expect(new Set(top).size).toBe(top.length);
  });

  it('/hoje em espanhol pede o retrato com lang "es"; em português, sem lang (como antes)', async () => {
    const resp = { prata: 50_000, minutos: 60, premium: false, fetchedAt: new Date().toISOString(), opcoes: [], notas: [] };
    m.getHoje.mockResolvedValue(resp);
    const opts = [{ name: 'prata', type: 4, value: 50_000 }];
    const r = await dispatch(es(cmd('hoje', opts), 'es-419'), env(), makeCtx().ctx);
    expect(m.getHoje).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { prata: 50_000, minutos: 60, premium: false, lang: 'es' });
    const e = (r.data as MessageData).embeds![0];
    expect(e.title).toBe('Qué hacer hoy');
    expect(e.url).toBe('https://guarita.pages.dev/es/hoje?prata=50000&minutos=60&premium=0');
    expect(e.description).toContain('Con **50,000 de plata**, 60 min y sin Premium.');
    const pt = await dispatch(cmd('hoje', opts), env(), makeCtx().ctx);
    expect(m.getHoje).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { prata: 50_000, minutos: 60, premium: false });
    expect((pt.data as MessageData).embeds![0].title).toBe('O que fazer hoje');
    const fora = await dispatch(es(cmd('hoje', [{ name: 'prata', type: 4, value: 10 }])), env(), makeCtx().ctx);
    expect((fora.data as MessageData).content).toBe('Indica la plata entre 1,000 y 100,000,000,000.');
  });

  it('qualidades em espanhol iguais às do site (QUALITY_LABEL_ES)', () => {
    expect(QUALITY_NAMES_ES).toEqual(QUALITY_LABEL_ES);
  });
});
