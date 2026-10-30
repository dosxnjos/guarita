import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
}));
vi.mock('../worker/lib/items', () => ({ loadItemsIndex: m.loadItemsIndex }));
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
  type MessageData,
} from '../worker/discord/render';

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
    m.loadItemsIndex.mockResolvedValue(INDEX);
    m.searchItems.mockReturnValue([{ id: 'T4_BAG@1', pt: 'Bolsa do Adepto', en: "Adept's Bag", tier: 4, ench: 1, score: 1 }]);
    const i: Interaction = { ...cmd('preco', [{ name: 'item', type: 3, value: 'bolsa', focused: true }]), type: 4 };
    const r = await dispatch(i, env(), makeCtx().ctx);
    expect(r).toEqual({ type: 8, data: { choices: [{ name: 'Bolsa do Adepto (T4.1)', value: 'T4_BAG@1' }] } });
    expect(m.searchItems).toHaveBeenCalledWith(INDEX, 'bolsa', 25);
  });
  it('erro no índice vira lista vazia, nunca erro', async () => {
    m.loadItemsIndex.mockRejectedValue(new Error('falhou'));
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
    expect(COMMANDS.map((c) => c.name).sort()).toEqual(['ajuda', 'alerta', 'dossie', 'morte', 'preco', 'relogio']);
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
});
