import { beforeEach, describe, expect, it } from 'vitest';
import { MEDIAN_PCT_MAX, clientKey, routeAlerts, validateAlertBody, validateSubscriptionBody } from '../worker/api/alerts';
import { resetItemsIndexCache } from '../worker/lib/items';
import type { Env } from '../worker/env';

const base = {
  itemId: 'T4_BAG',
  itemName: 'Bolsa do Adepto',
  quality: 1,
  cities: ['Lymhurst', 'Martlock'],
  side: 'sell',
  condition: { kind: 'below', price: 3600 },
  cooldownMin: 60,
  channel: 'push',
  owner: 'Abc_def-0123456789ABCD',
};

describe('validateAlertBody', () => {
  it('aceita o corpo completo', () => {
    const v = validateAlertBody(base);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toMatchObject({ itemId: 'T4_BAG', itemName: 'Bolsa do Adepto', cooldownMin: 60, channel: 'push' });
  });
  it('aplica padrões (qualidade 1, venda, 60 min, push) e aceita ?sub como dono', () => {
    const { quality, side, cooldownMin, channel, owner, ...rest } = base;
    const v = validateAlertBody({ ...rest, sub: owner });
    expect(v.ok && v.value).toMatchObject({ quality: 1, side: 'sell', cooldownMin: 60, channel: 'push', owner });
  });
  it('itemName é opcional e higienizado', () => {
    const { itemName, ...rest } = base;
    const v1 = validateAlertBody(rest);
    expect(v1.ok && v1.value.itemName).toBeUndefined();
    const v2 = validateAlertBody({ ...base, itemName: 'x'.repeat(300) + '\n' });
    expect(v2.ok && v2.value.itemName?.length).toBe(120);
  });
  it('arredonda preço e percentual', () => {
    const v = validateAlertBody({ ...base, condition: { kind: 'belowMedianPct', pct: 12.6 } });
    expect(v.ok && v.value.condition).toEqual({ kind: 'belowMedianPct', pct: 13 });
  });
  it.each([
    [{ itemId: '' }, 'item'],
    [{ itemId: 'T4_BAG; DROP' }, 'item'],
    [{ itemName: 5 }, 'nome'],
    [{ quality: 0 }, 'qualidade'],
    [{ quality: '2' }, 'qualidade'],
    [{ cities: 'Lymhurst' }, 'cidade'],
    [{ cities: ['Lymhurst', 'Atlântida'] }, 'cidade desconhecida'],
    [{ side: 'any' }, 'lado'],
    [{ condition: null }, 'condição'],
    [{ condition: { kind: 'above', price: -1 } }, 'preço-alvo'],
    [{ condition: { kind: 'above', price: 'mil' } }, 'preço-alvo'],
    [{ condition: { kind: 'belowMedianPct', pct: 0 } }, 'percentual'],
    [{ condition: { kind: 'belowMedianPct', pct: MEDIAN_PCT_MAX + 1 } }, 'percentual'],
    [{ cities: ['Lymhurst', 'Black Market'] }, 'Black Market'],
    [{ cooldownMin: 99999 }, 'intervalo'],
    [{ channel: 'sms' }, 'canal'],
    [{ owner: 'com espaço' }, 'dono'],
    [{ channel: 'discord', owner: 'naoNumerico' }, 'Discord'],
  ])('recusa %j', (patch, msg) => {
    const v = validateAlertBody({ ...base, ...patch });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain(msg);
  });
});

describe('validateSubscriptionBody', () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', expirationTime: null, keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
  it('aceita PushSubscription.toJSON()', () => expect(validateSubscriptionBody(sub).ok).toBe(true));
  it('recusa endpoint sem https e chaves ausentes', () => {
    expect(validateSubscriptionBody({ ...sub, endpoint: 'http://x' }).ok).toBe(false);
    expect(validateSubscriptionBody({ endpoint: sub.endpoint }).ok).toBe(false);
    expect(validateSubscriptionBody({ ...sub, keys: { p256dh: 'a b', auth: 'x' } }).ok).toBe(false);
  });
  it('repassa o subId atual (prova de posse) e recusa formato estranho', () => {
    const v = validateSubscriptionBody({ ...sub, subId: 'Abc_123-x' });
    expect(v.ok && v.value.subId).toBe('Abc_123-x');
    expect(validateSubscriptionBody({ ...sub, subId: 'com espaço' }).ok).toBe(false);
  });
});

describe('Black Market', () => {
  it('aceita no lado de vender caro (ordens de compra)', () => {
    expect(validateAlertBody({ ...base, side: 'buy', cities: ['Black Market'] }).ok).toBe(true);
  });
});

// Hub falso em memória: registra as chamadas e responde como o DO.
function fakeEnv(handler: (path: string, init?: RequestInit) => Response) {
  const calls: { path: string; method: string; body?: string; headers: Headers }[] = [];
  const stub = {
    fetch: async (input: string, init?: RequestInit) => {
      const u = new URL(input);
      calls.push({ path: u.pathname + u.search, method: init?.method ?? 'GET', body: init?.body as string | undefined, headers: hdr(init) });
      return handler(u.pathname + u.search, init);
    },
  };
  const ASSETS = { fetch: async () => (assetsDown ? new Response('fora', { status: 500 }) : Response.json(INDEX)) };
  const env = { HUB: { idFromName: () => ({}), get: () => stub }, ASSETS, VAPID_PUBLIC: 'BPUB' } as unknown as Env;
  return { env, calls };
}

// Catálogo mínimo no formato de /data/items-index.json.
const INDEX = { v: 1, generatedAt: '2026-10-29', source: 'teste', items: [['T4_BAG', 'Bolsa do Adepto', "Adept's Bag", 4, 0], ['T8_BAG', 'Bolsa do Ancião', "Elder's Bag", 8, 0]] };
let assetsDown = false;
beforeEach(() => {
  assetsDown = false;
  resetItemsIndexCache();
});

const ctx = {} as ExecutionContext;
const call = (env: Env, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const req = new Request('https://guarita.pages.dev' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return routeAlerts(req, new URL(req.url), env, ctx);
};

const hdr = (init?: RequestInit) => new Headers(init?.headers);

describe('routeAlerts', () => {
  it('ignora rotas de outros módulos', async () => {
    const { env } = fakeEnv(() => Response.json({}));
    expect(await call(env, 'GET', '/api/prices?ids=T4_BAG')).toBeNull();
  });
  it('GET /api/push/vapid devolve a chave', async () => {
    const { env } = fakeEnv(() => Response.json({}));
    const res = (await call(env, 'GET', '/api/push/vapid'))!;
    expect(await res.json()).toEqual({ key: 'BPUB' });
  });
  it('POST /api/alerts repassa ao Hub e devolve 201', async () => {
    const { env, calls } = fakeEnv(() => Response.json({ ...base, id: 'x1', createdAt: 'agora' }, { status: 201 }));
    const res = (await call(env, 'POST', '/api/alerts', base))!;
    expect(res.status).toBe(201);
    expect(calls[0]).toMatchObject({ path: '/alerts', method: 'POST' });
    expect(JSON.parse(calls[0].body!)).toMatchObject({ owner: base.owner, itemName: 'Bolsa do Adepto' });
  });
  it('POST /api/alerts recusa canal discord pela web', async () => {
    const { env, calls } = fakeEnv(() => Response.json({}));
    const res = (await call(env, 'POST', '/api/alerts', { ...base, channel: 'discord', owner: '123456789012345678' }))!;
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it('POST /api/alerts com inscrição inexistente propaga o 404 do Hub', async () => {
    const { env } = fakeEnv(() => Response.json({ error: 'inscrição de notificação não encontrada' }, { status: 404 }));
    const res = (await call(env, 'POST', '/api/alerts', base))!;
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain('inscrição');
  });
  it('POST /api/alerts com JSON quebrado dá 400', async () => {
    const { env } = fakeEnv(() => Response.json({}));
    const req = new Request('https://guarita.pages.dev/api/alerts', { method: 'POST', body: '{nada' });
    expect((await routeAlerts(req, new URL(req.url), env, ctx))!.status).toBe(400);
  });
  it('GET e DELETE filtram por canal push', async () => {
    const { env, calls } = fakeEnv((p, init) => (init?.method === 'DELETE' ? Response.json({ ok: true }) : Response.json({ alerts: [] })));
    expect((await call(env, 'GET', `/api/alerts?sub=${base.owner}`))!.status).toBe(200);
    expect((await call(env, 'DELETE', `/api/alerts/x1?owner=${base.owner}`))!.status).toBe(200);
    expect(calls[0].path).toBe(`/alerts?owner=${base.owner}&channel=push`);
    expect(calls[1].path).toBe(`/alerts/x1?owner=${base.owner}&channel=push`);
  });
  it('GET sem dono dá 400', async () => {
    const { env } = fakeEnv(() => Response.json({}));
    expect((await call(env, 'GET', '/api/alerts'))!.status).toBe(400);
  });
  it('POST /api/alerts recusa item fora do catálogo sem chamar o Hub', async () => {
    const { env, calls } = fakeEnv(() => Response.json({}, { status: 201 }));
    const res = (await call(env, 'POST', '/api/alerts', { ...base, itemId: 'AAAA_0001' }))!;
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('catálogo');
    expect(calls).toHaveLength(0);
  });
  it('POST /api/alerts usa o nome do catálogo, não o que o cliente mandou', async () => {
    const { env, calls } = fakeEnv(() => Response.json({ ...base, id: 'x1', createdAt: 'agora' }, { status: 201 }));
    await call(env, 'POST', '/api/alerts', { ...base, itemId: 'T8_BAG', itemName: 'Promoção falsa' });
    expect(JSON.parse(calls[0].body!).itemName).toBe('Bolsa do Ancião');
  });
  it('POST /api/alerts com catálogo fora do ar dá 503', async () => {
    assetsDown = true;
    const { env, calls } = fakeEnv(() => Response.json({}, { status: 201 }));
    expect((await call(env, 'POST', '/api/alerts', base))!.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
  it('POST /api/alerts recusa Black Market no lado de comprar barato', async () => {
    const { env, calls } = fakeEnv(() => Response.json({}, { status: 201 }));
    expect((await call(env, 'POST', '/api/alerts', { ...base, cities: ['Black Market'] }))!.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('manda ao Hub o hash do IP (nunca o IP cru) e repassa 429 e 503', async () => {
    const { env, calls } = fakeEnv((p) => (p === '/alerts' ? Response.json({ error: 'cheio' }, { status: 503 }) : Response.json({ error: 'muitas' }, { status: 429 })));
    const ip = { 'CF-Connecting-IP': '203.0.113.7' };
    expect((await call(env, 'POST', '/api/alerts', base, ip))!.status).toBe(503);
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'BAAA', auth: 'AAAA' }, subId: 'abc_123' };
    expect((await call(env, 'POST', '/api/push/subscribe', sub, ip))!.status).toBe(429);
    const key = await clientKey(new Request('https://x', { headers: ip }));
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    for (const c of calls) {
      expect(c.headers.get('x-guarita-client')).toBe(key);
      expect(c.body).not.toContain('203.0.113.7');
    }
    expect(JSON.parse(calls[1].body!).subId).toBe('abc_123');
  });
  it('Hub fora do ar vira 503 com mensagem', async () => {
    const { env } = fakeEnv(() => {
      throw new Error('DO indisponível');
    });
    const res = (await call(env, 'GET', `/api/alerts?owner=${base.owner}`))!;
    expect(res.status).toBe(503);
  });
});
