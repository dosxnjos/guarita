// Fumaça do _worker.js contra as APIs REAIS (AODP, gameinfo, serverstatus). Fica fora da suíte normal:
// roda só com SMOKE=1  →  SMOKE=1 npx vitest run tests/smoke.worker.test.ts
// Env falso: ASSETS serve public/ do disco, HUB em memória, caches.default em memória, ctx guarda os waitUntil.
// Falha de rede (502/504 da gameinfo, 429 do AODP) é registrada no log e não derruba o teste.
import { afterAll, describe, expect, it } from 'vitest';
import worker from '../worker/index';
import type { Env } from '../worker/env';
import type { ClockResponse, ItemResponse, PlayerDossier, PlayerSearchResponse } from '../shared/types';
import { mockCaches } from './helpers/net';
import { dispatch } from '../worker/discord/interactions';

const RUN = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.SMOKE;
const NODE_FS = 'node:fs';
const fs = RUN ? ((await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(p: URL): Uint8Array; existsSync(p: URL): boolean }) : null;

const ORIGIN = 'https://guarita.local';
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

function fakeEnv(): Env {
  const ASSETS = {
    async fetch(input: RequestInfo | URL) {
      const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
      const file = new URL('../public' + path, import.meta.url);
      if (!fs || !fs.existsSync(file)) return new Response('not found', { status: 404 });
      const type = path.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      return new Response(fs.readFileSync(file) as BodyInit, { headers: { 'content-type': type } });
    },
  } as unknown as Fetcher;
  const store = new Map<string, unknown>();
  const HUB = {
    idFromName: (n: string) => n,
    get: () => ({
      async fetch(input: RequestInfo | URL) {
        const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
        if (path === '/health') return Response.json({ ok: true, fake: true });
        return Response.json({ value: store.get(path) ?? null });
      },
    }),
  } as unknown as DurableObjectNamespace;
  const CORE = { fetch: async () => Response.json({ ok: true }) } as unknown as Fetcher;
  return { ASSETS, HUB, CORE, DISCORD_PUBLIC_KEY: '', DISCORD_APP_ID: '', DISCORD_BOT_TOKEN: '', VAPID_PUBLIC: '' };
}

const env = fakeEnv();

async function call(path: string): Promise<{ status: number; ms: number; body: any; headers: Headers }> {
  const t = Date.now();
  const res = await worker.fetch(new Request(ORIGIN + path), env, ctx);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* corpo não-JSON fica como texto */
  }
  const ms = Date.now() - t;
  console.log(`[fumaça] ${path} → ${res.status} em ${ms} ms`);
  return { status: res.status, ms, body, headers: res.headers };
}

/** Upstream fora do ar: registra e segue (a tarefa pede registrar, não falhar). */
function upstreamDown(r: { status: number; body: any }, path: string): boolean {
  if (r.status === 502 || r.status === 504 || r.status === 429) {
    console.warn(`[fumaça] ${path}: fonte externa indisponível (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`);
    expect(typeof r.body?.error).toBe('string');
    return true;
  }
  return false;
}

const isIsoOrNull = (v: unknown) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
const isNumOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

describe.skipIf(!RUN)('fumaça do worker contra as APIs reais', () => {
  if (RUN) mockCaches();

  afterAll(async () => {
    await Promise.allSettled(pending);
  });

  it('/api/clock', async () => {
    const r = await call('/api/clock');
    expect(r.status).toBe(200);
    const c = r.body as ClockResponse;
    expect(isIsoOrNull(c.now)).toBe(true);
    expect(['online', 'offline', 'manutenção', 'desconhecido']).toContain(c.server.status);
    expect(Array.isArray(c.festivities)).toBe(true);
    for (const f of c.festivities) {
      expect(typeof f.labelPt).toBe('string');
      expect(isIsoOrNull(f.start) && isIsoOrNull(f.end)).toBe(true);
    }
    expect(isNumOrNull(c.gold.price)).toBe(true);
    expect(['subindo', 'caindo', 'estável', 'sem dado']).toContain(c.gold.trend);
    expect(isNumOrNull(c.premiumSilver)).toBe(true);
    expect(c.season.approx).toBe(true);
    console.log(`[fumaça] relógio: servidor ${c.server.status}, ouro ${c.gold.price}, ${c.festivities.length} festividades`);
  }, 60_000);

  it('/api/item/T4_BAG (e minúsculas viram maiúsculas)', async () => {
    const r = await call('/api/item/t4_bag');
    if (upstreamDown(r, '/api/item/t4_bag')) return;
    expect(r.status).toBe(200);
    const it = r.body as ItemResponse;
    expect(it.id).toBe('T4_BAG');
    expect(it.quality).toBe(1);
    expect(it.cities.length).toBeGreaterThan(0);
    for (const q of it.cities) {
      expect(isNumOrNull(q.sellMin) && isNumOrNull(q.buyMax) && isNumOrNull(q.ageMin)).toBe(true);
      expect(['alta', 'média', 'baixa', 'sem dado']).toContain(q.confidence.label);
      expect(['barato', 'normal', 'caro', 'sem dado']).toContain(q.verdict);
    }
    expect(Array.isArray(it.history) && Array.isArray(it.book) && Array.isArray(it.flips)).toBe(true);
    expect(isNumOrNull(it.median7d) && isNumOrNull(it.p25) && isNumOrNull(it.p75)).toBe(true);
    const priced = it.cities.filter((c) => c.sellMin !== null).length;
    console.log(`[fumaça] item: ${priced}/${it.cities.length} cidades com venda, mediana 7d ${it.median7d}, ${it.flips.length} flips`);
  }, 60_000);

  it('/api/item com id inválido dá 400', async () => {
    const r = await call('/api/item/nao%20existe!');
    expect(r.status).toBe(400);
    expect(typeof r.body.error).toBe('string');
  });

  it('/api/player/search?q=CalangoPeto', async () => {
    const r = await call('/api/player/search?q=CalangoPeto');
    if (upstreamDown(r, '/api/player/search')) return;
    expect(r.status).toBe(200);
    const s = r.body as PlayerSearchResponse;
    const hit = s.players.find((p) => p.id === 'NwcyH-y1Q924YlQkAkn7nw');
    expect(hit?.name).toBe('CalangoPeto');
    expect(typeof hit?.killFame).toBe('number');
  }, 120_000);

  it('/api/player/NwcyH-y1Q924YlQkAkn7nw', async () => {
    const r = await call('/api/player/NwcyH-y1Q924YlQkAkn7nw');
    if (upstreamDown(r, '/api/player/:id')) return;
    expect(r.status).toBe(200);
    const d = r.body as PlayerDossier;
    expect(d.id).toBe('NwcyH-y1Q924YlQkAkn7nw');
    expect(d.name).toBe('CalangoPeto');
    expect(Number.isFinite(d.ratio)).toBe(true);
    expect(['tranquilo', 'atenção', 'perigoso', 'sem dado']).toContain(d.danger.label);
    expect(d.danger.score).toBeGreaterThanOrEqual(0);
    expect(d.danger.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(d.recentKills) && Array.isArray(d.recentDeaths)).toBe(true);
    for (const e of [...d.recentKills, ...d.recentDeaths]) {
      expect(typeof e.id).toBe('number');
      expect(isIsoOrNull(e.time)).toBe(true);
      expect(typeof e.killer.name).toBe('string');
      expect(isNumOrNull(e.estValue)).toBe(true);
    }
    for (const v of [...Object.values(d.pve), ...Object.values(d.gathering)]) expect(typeof v).toBe('number');
    expect(isIsoOrNull(d.fetchedAt)).toBe(true);
    console.log(`[fumaça] dossiê: perigo ${d.danger.label} (${d.danger.score}), ${d.recentKills.length} kills, ${d.recentDeaths.length} mortes, motivos: ${d.danger.reasons.join('; ')}`);
  }, 180_000);

  it('autocomplete do bot lê o índice pelo ASSETS (isolate frio usa a busca rápida)', async () => {
    const i = {
      type: 4,
      id: '1',
      application_id: '1',
      token: 't',
      data: { name: 'preco', options: [{ name: 'item', type: 3, value: 'bolsa adepto', focused: true }] },
    } as unknown as Parameters<typeof dispatch>[0];
    const r = (await dispatch(i, env, ctx)) as { type: number; data: { choices: { name: string; value: string }[] } };
    expect(r.type).toBe(8);
    expect(r.data.choices.map((c) => c.value)).toContain('T4_BAG');
    console.log(`[fumaça] autocomplete "bolsa adepto": ${r.data.choices.slice(0, 3).map((c) => c.name).join(' | ')}`);
  });

  it('/api/health e rota desconhecida', async () => {
    const h = await call('/api/health');
    expect(h.body.ok).toBe(true);
    const n = await call('/api/nada');
    expect(n.status).toBe(404);
  });
});
