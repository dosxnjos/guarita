// Fumaça do _worker.js contra as APIs REAIS (AODP, gameinfo, serverstatus). Fica fora da suíte normal:
// roda só com SMOKE=1  →  SMOKE=1 npx vitest run tests/smoke.worker.test.ts
// Env falso: ASSETS serve public/ do disco, HUB em memória, caches.default em memória, ctx guarda os waitUntil.
// Falha de rede (502/504 da gameinfo, 429 do AODP) é registrada no log e não derruba o teste.
import { afterAll, describe, expect, it } from 'vitest';
import worker from '../worker/index';
import type { Env } from '../worker/env';
import type {
  ClockResponse, DataHealthResponse, ForecastResponse, GoldResponse, GuildSearchResponse, GuildSummary, HojeResponse, ItemResponse, LossesResponse, PlayerDossier,
  PlayerSearchResponse,
} from '../shared/types';
import { MCP_PROTOCOL_VERSIONS } from '../worker/mcp/catalog';
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
      let path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
      // Como o ASSETS do Pages: pasta ("/") serve o index.html.
      if (path.endsWith('/')) path += 'index.html';
      // index.html não mora em public/: o do build (dist/, com a cabeça do Vite) ou, sem build, o da raiz.
      let file = new URL('../public' + path, import.meta.url);
      if (path === '/index.html') {
        const built = new URL('../dist/index.html', import.meta.url);
        file = fs?.existsSync(built) ? built : new URL('../index.html', import.meta.url);
      }
      if (!fs || !fs.existsSync(file)) return new Response('not found', { status: 404 });
      const type = path.endsWith('.json') ? 'application/json' : path.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
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
  // KillLog falso com formas válidas (amostra pequena): a fumaça exercita preço (AODP) e nome reais nas perdas e a
  // gameinfo real na guilda. O KillLog de verdade só se prova depois do deploy.
  const CORE = {
    async fetch(input: RequestInfo | URL) {
      const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const today = new Date().toISOString().slice(0, 10);
      if (u.pathname === '/internal/killlog/losses') {
        return Response.json({ days: Number(u.searchParams.get('days')) || 1, deaths: 12, since: today, items: [{ type: 'T4_BAG', count: 5 }, { type: 'T6_2H_BOW', count: 3 }, { type: 'T5_MAIN_SWORD', count: 2 }] });
      }
      const g = /^\/internal\/killlog\/guild\/([^/]+)\/summary$/.exec(u.pathname);
      if (g) {
        return Response.json({
          guild: decodeURIComponent(g[1]),
          days: [{ day: today, kills: 2, deaths: 1 }],
          totals: { kills: 2, deaths: 1 },
          detail: { windowDays: 7, kills: 2, deaths: 1, topKillers: [{ id: 'NwcyH-y1Q924YlQkAkn7nw', name: 'CalangoPeto', kills: 2 }], weapons: [{ type: 'T6_2H_BOW', count: 2 }], hoursBrt: Array.from({ length: 24 }, (_, i) => (i === 21 ? 2 : 0)), coverageSince: today },
        });
      }
      return Response.json({ error: 'rota não encontrada' }, { status: 404 });
    },
  } as unknown as Fetcher;
  const TIMERS = HUB; // stub em memória serve aos dois na fumaça
  return { ASSETS, HUB, CORE, TIMERS, DISCORD_PUBLIC_KEY: '', DISCORD_APP_ID: '', DISCORD_BOT_TOKEN: '', VAPID_PUBLIC: '' };
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

async function post(path: string, data: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any; headers: Headers }> {
  const t = Date.now();
  const res = await worker.fetch(
    new Request(ORIGIN + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(data) }),
    env,
    ctx,
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* corpo vazio (202 de notificação) fica como texto */
  }
  console.log(`[fumaça] POST ${path} → ${res.status} em ${Date.now() - t} ms`);
  return { status: res.status, body, headers: res.headers };
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

  // ---------- Fase 2 ----------

  it('/api/losses?days=1 e 7 (KillLog falso, preço e nome reais)', async () => {
    for (const days of [1, 7]) {
      const r = await call(`/api/losses?days=${days}&limit=10`);
      if (upstreamDown(r, '/api/losses')) return;
      expect(r.status).toBe(200);
      const l = r.body as LossesResponse;
      expect(l.days).toBe(days);
      expect(Array.isArray(l.items)).toBe(true);
      expect(typeof l.sampleKills).toBe('number');
      expect(isIsoOrNull(l.fetchedAt)).toBe(true);
      for (const i of l.items) {
        expect(typeof i.id === 'string' && typeof i.name === 'string').toBe(true);
        expect(isNumOrNull(i.price) && isNumOrNull(i.value) && isNumOrNull(i.ageMin)).toBe(true);
        if (i.price !== null) expect(i.value).toBe(i.count * i.price);
      }
      const bag = l.items.find((i) => i.id === 'T4_BAG');
      console.log(`[fumaça] perdas ${days}d: ${l.items.length} itens, bolsa "${bag?.name}" a ${bag?.price} (${bag?.ageMin} min)`);
    }
    // valor torto cai no padrão (1 dia), por desenho do módulo (a): clampParam
    expect((await call('/api/losses?days=abc')).body.days).toBe(1);
  }, 60_000);

  it('/api/guild/B%20A%20G%20R%20E (gameinfo real)', async () => {
    const r = await call('/api/guild/B%20A%20G%20R%20E');
    if (upstreamDown(r, '/api/guild/:nome')) return;
    expect(r.status).toBe(200);
    const g = r.body as GuildSummary;
    expect(g.name).toBe('B A G R E');
    expect(g.hoursBrt).toHaveLength(24);
    expect(Array.isArray(g.days) && Array.isArray(g.topKillers) && Array.isArray(g.weapons)).toBe(true);
    // gameinfo pode estar lenta: com o KillLog de pé a rota devolve o histórico com os campos dela vazios
    if (g.id) {
      expect(typeof g.members === 'number' || g.members === null).toBe(true);
      expect(isNumOrNull(g.killFame) && isNumOrNull(g.deathFame)).toBe(true);
    } else console.warn('[fumaça] guilda: gameinfo não respondeu a tempo; só o KillLog veio');
    console.log(`[fumaça] guilda: id ${g.id}, ${g.members} membros, aliança ${g.alliance}, killFame ${g.killFame}, armas ${g.weapons.map((w) => w.labelPt).join(', ')}`);
  }, 180_000);

  it('/api/guilds?q=B A G R E', async () => {
    const r = await call('/api/guilds?q=B%20A%20G%20R%20E');
    if (upstreamDown(r, '/api/guilds')) return;
    expect(r.status).toBe(200);
    const s = r.body as GuildSearchResponse;
    expect(Array.isArray(s.guilds)).toBe(true);
    console.log(`[fumaça] busca de guilda: ${s.guilds.slice(0, 5).map((x) => x.name).join(' | ')}`);
  }, 120_000);

  it('/api/gold?days=30 e 90 (date= libera mais de 720 pontos)', async () => {
    const r = await call('/api/gold?days=30');
    if (upstreamDown(r, '/api/gold')) return;
    expect(r.status).toBe(200);
    const g = r.body as GoldResponse;
    expect(g.points.length).toBeGreaterThan(24);
    for (let i = 1; i < g.points.length; i++) expect(g.points[i].at >= g.points[i - 1].at).toBe(true);
    expect(['barato', 'normal', 'caro', 'sem dado']).toContain(g.verdict);
    expect(isNumOrNull(g.current) && isNumOrNull(g.p10) && isNumOrNull(g.p50) && isNumOrNull(g.p90)).toBe(true);

    const r90 = await call('/api/gold?days=90');
    if (upstreamDown(r90, '/api/gold?days=90')) return;
    const g90 = r90.body as GoldResponse;
    const spanDays = (Date.parse(g90.points.at(-1)!.at) - Date.parse(g90.points[0].at)) / 86_400_000;
    expect(spanDays).toBeGreaterThan(40);
    console.log(`[fumaça] ouro: 30d ${g.points.length} pontos, atual ${g.current} (${g.verdict}); 90d ${g90.points.length} pontos, ${spanDays.toFixed(1)} dias`);
    expect((await call('/api/gold?days=12')).status).toBe(400);
  }, 60_000);

  it('/api/data-health', async () => {
    const r = await call('/api/data-health');
    if (upstreamDown(r, '/api/data-health')) return;
    expect(r.status).toBe(200);
    const h = r.body as DataHealthResponse;
    expect(h.basket).toBeGreaterThan(30);
    expect(h.cities.length).toBeGreaterThan(0);
    for (const c of h.cities) {
      expect(isNumOrNull(c.medianAgeMin)).toBe(true);
      expect(c.fresh1h + c.stale24h + c.missing).toBeLessThanOrEqual(h.basket);
    }
    console.log(`[fumaça] saúde: ${h.cities.map((c) => `${c.city} ${c.medianAgeMin}min/${c.missing} sem`).join('; ')}`);
  }, 60_000);

  it('POST /api/risk', async () => {
    const r = await post('/api/risk', { items: [{ id: 'T4_BAG', quality: 1 }, { id: 'T4_2H_BOW', quality: 2 }] });
    if (upstreamDown(r, '/api/risk')) return;
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.zones.length).toBeGreaterThanOrEqual(6);
    console.log(`[fumaça] risco: total ${r.body.total}, ${r.body.missing} sem preço`);
  }, 60_000);

  it('POST /mcp: initialize, notificação, tools/list e tools/call relogio', async () => {
    const init = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fumaca', version: '0' } } });
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe('2025-06-18');
    expect((MCP_PROTOCOL_VERSIONS as readonly string[]).includes(init.body.result.protocolVersion)).toBe(true);
    expect(init.body.result.serverInfo.name).toBe('guarita');
    expect(init.headers.get('access-control-allow-origin')).toBe('*');

    const note = await post('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': '2025-06-18' });
    expect(note.status).toBe(202);

    const list = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-protocol-version': '2025-06-18' });
    const names = (list.body.result.tools as { name: string }[]).map((t) => t.name).sort();
    expect(names).toEqual(['buscar_item', 'dossie_jogador', 'o_que_fazer', 'perdas_pvp', 'preco_item', 'relogio']);

    const clock = await post('/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'relogio', arguments: {} } }, { 'mcp-protocol-version': '2025-06-18' });
    expect(clock.status).toBe(200);
    expect(clock.body.result.isError).toBeFalsy();
    expect(clock.body.result.structuredContent).toBeTruthy();
    expect(clock.body.result.content[0].type).toBe('text');
    console.log(`[fumaça] mcp relogio: ${String(clock.body.result.content[0].text).slice(0, 160).replace(/\n/g, ' / ')}`);

    const item = await post('/mcp', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'buscar_item', arguments: { consulta: 'bolsa adepto' } } });
    expect(item.status).toBe(200);
    expect(item.body.result.isError).toBeFalsy();
    expect(JSON.stringify(item.body.result.structuredContent)).toContain('T4_BAG');
  }, 60_000);

  it('GET /mcp: cliente MCP recebe 405; navegador recebe a página', async () => {
    const rpc = await worker.fetch(new Request(ORIGIN + '/mcp', { headers: { accept: 'text/event-stream' } }), env, ctx);
    expect(rpc.status).toBe(405);
    expect(rpc.headers.get('allow')).toContain('POST');
    await rpc.body?.cancel();
    const page = await worker.fetch(new Request(ORIGIN + '/mcp', { headers: { accept: 'text/html,application/xhtml+xml' } }), env, ctx);
    expect(page.status).not.toBe(405);
    await page.body?.cancel();
    // prévia de link (Discord, WhatsApp) e curl simples mandam Accept */* ou nada: também recebem a página
    for (const accept of ['*/*', '']) {
      const r = await worker.fetch(new Request(ORIGIN + '/mcp', { headers: accept ? { accept } : {} }), env, ctx);
      expect(r.status).not.toBe(405);
      await r.body?.cancel();
    }
    // cliente MCP que manda só a versão do protocolo também vai ao servidor
    const v = await worker.fetch(new Request(ORIGIN + '/mcp', { headers: { 'mcp-protocol-version': '2025-06-18' } }), env, ctx);
    expect(v.status).toBe(405);
    await v.body?.cancel();
  });

  // ---------- Fase 3 ----------

  it('/api/hoje (três trilhas com a conta aberta) e prata ausente dá 400', async () => {
    const path = '/api/hoje?prata=2000000&minutos=60&premium=1';
    const r = await call(path);
    if (upstreamDown(r, path)) return;
    expect(r.status).toBe(200);
    const b = r.body as HojeResponse;
    expect(b.prata).toBe(2_000_000);
    expect(b.minutos).toBe(60);
    expect(b.premium).toBe(true);
    expect(isIsoOrNull(b.fetchedAt) && b.fetchedAt !== null).toBe(true);
    expect(Array.isArray(b.opcoes)).toBe(true);
    for (const o of b.opcoes) {
      expect(['flip', 'refino', 'transporte']).toContain(o.trilha);
      expect(o.confianca).toBeGreaterThanOrEqual(0);
      expect(o.confianca).toBeLessThanOrEqual(100);
      expect(o.passos.length).toBeGreaterThan(0);
      expect(o.itens.length).toBeGreaterThan(0);
      if (o.conta) expect(o.conta.venda - o.conta.taxas - o.conta.compra).toBeCloseTo(o.conta.lucro, -1);
    }
    console.log(`[fumaça] hoje: ${b.opcoes.length} opções (${b.opcoes.map((o) => `${o.trilha} ${Math.round(o.lucro)}`).join(', ')}); notas: ${(b.notas ?? []).length}`);
    // segunda chamada: retrato em cache (sem fonte externa nova)
    const again = await call(path);
    expect(again.status).toBe(200);
    const bad = await call('/api/hoje');
    expect(bad.status).toBe(400);
    expect(typeof bad.body.error).toBe('string');
  }, 60_000);

  it('/api/forecast/T4_BAG?city=Lymhurst (backtest publicado) e cidade automática', async () => {
    const path = '/api/forecast/T4_BAG?city=Lymhurst';
    const r = await call(path);
    if (upstreamDown(r, path)) return;
    expect(r.status).toBe(200);
    const b = r.body as ForecastResponse;
    expect(b.id).toBe('T4_BAG');
    expect(b.city).toBe('Lymhurst');
    expect(typeof b.method).toBe('string');
    expect(b.method.length).toBeGreaterThan(10);
    expect(Array.isArray(b.history)).toBe(true);
    expect(typeof b.backtest.days).toBe('number');
    expect(isNumOrNull(b.backtest.maeModel)).toBe(true);
    expect(isNumOrNull(b.backtest.maeNaive)).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    for (const f of b.forecast) {
      expect(f.date >= today).toBe(true);
      expect(f.p10).toBeLessThanOrEqual(f.p50);
      expect(f.p50).toBeLessThanOrEqual(f.p90);
    }
    console.log(`[fumaça] forecast T4_BAG Lymhurst: ${b.history.length} dias, ${b.forecast.length} previstos, MAE modelo ${b.backtest.maeModel} × ingênuo ${b.backtest.maeNaive}, bate: ${b.backtest.beatsNaive}`);
    const auto = await call('/api/forecast/T4_BAG?city=');
    if (!upstreamDown(auto, 'forecast auto')) {
      expect(auto.status).toBe(200);
      expect(typeof auto.body.city).toBe('string');
      console.log(`[fumaça] forecast T4_BAG cidade automática: ${auto.body.city}`);
    }
    const bad = await call('/api/forecast/%3Cx%3E?city=Lymhurst');
    expect(bad.status).toBe(400);
  }, 60_000);

  it('HTML de /item/T4_BAG sai com o título e o Open Graph do item', async () => {
    const res = await worker.fetch(new Request(ORIGIN + '/item/T4_BAG', { headers: { accept: 'text/html' } }), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
    const html = await res.text();
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
    console.log(`[fumaça] /item/T4_BAG → <title>${title}</title>`);
    expect(title).toBe('Bolsa do Adepto (T4) · Guarita');
    expect(html.match(/<title>/g)?.length).toBe(1);
    expect(html).toContain('<meta property="og:title" content="Bolsa do Adepto (T4) · Guarita"');
    expect(html).toContain('<link rel="canonical" href="https://guarita.pages.dev/item/T4_BAG"');
  });

  // ---------- Rodada 2: espanhol e /status ----------

  async function page(path: string): Promise<{ status: number; html: string }> {
    const res = await worker.fetch(new Request(ORIGIN + path, { headers: { accept: 'text/html' } }), env, ctx);
    const html = await res.text();
    console.log(`[fumaça] ${path} → ${res.status}, <title>${/<title>([^<]*)<\/title>/.exec(html)?.[1]}</title>`);
    return { status: res.status, html };
  }

  it('HTML de /es: lang es, título em espanhol e hreflang das duas línguas', async () => {
    const { status, html } = await page('/es');
    expect(status).toBe(200);
    expect(html).toMatch(/<html\b[^>]*\slang="es"/);
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe('Guarita: compañero de Albion Online en español');
    expect(html).toContain('<link rel="alternate" hreflang="pt-BR" href="https://guarita.pages.dev/"');
    expect(html).toContain('<link rel="alternate" hreflang="es" href="https://guarita.pages.dev/es"');
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://guarita.pages.dev/"');
    expect(html).toContain('<link rel="canonical" href="https://guarita.pages.dev/es"');
    expect(html).toContain('<meta property="og:locale" content="es_LA"');
    // o português segue sem prefixo e com lang pt-BR
    const pt = await page('/');
    expect(pt.html).toMatch(/<html\b[^>]*\slang="pt-BR"/);
  });

  it('HTML de /es/item/T4_BAG sai com o nome do item em espanhol', async () => {
    const { status, html } = await page('/es/item/T4_BAG');
    expect(status).toBe(200);
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe('Bolsa del iniciado (T4) · Guarita');
    expect(html).toMatch(/<html\b[^>]*\slang="es"/);
    expect(html).toContain('<link rel="canonical" href="https://guarita.pages.dev/es/item/T4_BAG"');
    expect(html).toContain('<link rel="alternate" hreflang="pt-BR" href="https://guarita.pages.dev/item/T4_BAG"');
  });

  it('HTML de /status e /es/status: título da tela, indexável', async () => {
    const pt = await page('/status');
    expect(pt.status).toBe(200);
    expect(/<title>([^<]*)<\/title>/.exec(pt.html)?.[1]).toBe('Status e custos · Guarita');
    expect(pt.html).not.toContain('noindex');
    const es = await page('/es/status');
    expect(es.status).toBe(200);
    expect(/<title>([^<]*)<\/title>/.exec(es.html)?.[1]).toBe('Estado y costos · Guarita');
  });

  it('/api/hoje?…&lang=es devolve o texto em espanhol com os mesmos números', async () => {
    const path = '/api/hoje?prata=2000000&minutos=60&premium=1&lang=es';
    const r = await call(path);
    if (upstreamDown(r, path)) return;
    expect(r.status).toBe(200);
    const es = r.body as HojeResponse;
    const pt = (await call('/api/hoje?prata=2000000&minutos=60&premium=1')).body as HojeResponse;
    expect(es.opcoes.map((o) => [o.trilha, o.lucro])).toEqual(pt.opcoes.map((o) => [o.trilha, o.lucro]));
    const text = JSON.stringify([es.opcoes.map((o) => [o.titulo, o.passos, o.riscos]), es.notas ?? []]);
    // palavras que só existem no português não podem aparecer no espanhol
    expect(text).not.toMatch(/\b(você|não|comprar em|vender em|prata)\b/i);
    if (es.opcoes.length) expect(es.opcoes[0].titulo).not.toBe(pt.opcoes[0].titulo);
    console.log(`[fumaça] hoje ES: ${es.opcoes.map((o) => o.titulo).join(' | ')}; notas: ${(es.notas ?? []).join(' | ').slice(0, 200)}`);
    const bad = await call('/api/hoje?lang=es');
    expect(bad.status).toBe(400);
    expect(String(bad.body.error)).not.toMatch(/\b(você|não)\b/i);
  }, 60_000);

  // ---------- Rodada 3: textos montados no servidor em espanhol ----------

  /** Palavras que só existem no português dos textos montados (motivos, lições, nomes). */
  const PT_ONLY = /\b(você|kills?|abate|sozinho|histórico|não|montaria|poção|guilda|prata|dossiê|matador)\b/i;

  it('/api/player/:id?lang=es: mesmos números, motivos do perigo em espanhol', async () => {
    const id = 'NwcyH-y1Q924YlQkAkn7nw';
    const es = await call(`/api/player/${id}?lang=es`);
    if (upstreamDown(es, '/api/player/:id?lang=es')) return;
    expect(es.status).toBe(200);
    const pt = await call(`/api/player/${id}`);
    if (upstreamDown(pt, '/api/player/:id')) return;
    const d = es.body as PlayerDossier;
    const p = pt.body as PlayerDossier;
    // Mesmo dado em cache: só os motivos mudam de língua.
    expect([d.danger.score, d.danger.label, d.killFame, d.recentKills.length]).toEqual([p.danger.score, p.danger.label, p.killFame, p.recentKills.length]);
    expect(d.danger.reasons).toHaveLength(p.danger.reasons.length);
    for (const r of d.danger.reasons) expect(r).not.toMatch(PT_ONLY);
    console.log(`[fumaça] dosier ES: ${d.danger.label} (${d.danger.score}): ${d.danger.reasons.join('; ')}`);
  }, 180_000);

  it('/api/player/:id/autopsy?lang=es: lições em espanhol', async () => {
    const r = await call('/api/player/NwcyH-y1Q924YlQkAkn7nw/autopsy?lang=es');
    if (upstreamDown(r, '/api/player/:id/autopsy?lang=es')) return;
    expect(r.status).toBe(200);
    const lessons = (r.body.lessons ?? []) as string[];
    for (const l of lessons) expect(l).not.toMatch(PT_ONLY);
    console.log(`[fumaça] autópsia ES: ${lessons.join(' | ').slice(0, 300)}`);
  }, 180_000);

  it('/api/losses?lang=es: nomes das fatias names-es, mesmos números', async () => {
    const es = await call('/api/losses?days=1&limit=10&lang=es');
    if (upstreamDown(es, '/api/losses?lang=es')) return;
    expect(es.status).toBe(200);
    const pt = (await call('/api/losses?days=1&limit=10')).body as LossesResponse;
    const l = es.body as LossesResponse;
    expect(l.items.map((i) => [i.id, i.count, i.price])).toEqual(pt.items.map((i) => [i.id, i.count, i.price]));
    expect(l.items.find((i) => i.id === 'T4_BAG')?.name).toBe('Bolsa del iniciado (T4)');
    expect(pt.items.find((i) => i.id === 'T4_BAG')?.name).toBe('Bolsa do Adepto (T4)');
  }, 60_000);

  it('/api/item/T4_BAG?lang=es, /api/clock?lang=es e POST /api/risk?lang=es', async () => {
    const item = await call('/api/item/T4_BAG?lang=es');
    if (!upstreamDown(item, '/api/item?lang=es')) {
      expect(item.status).toBe(200);
      const reasons = (item.body as ItemResponse).cities.flatMap((c) => c.confidence.reasons);
      for (const r of reasons) expect(r).not.toMatch(/\b(visto há|livro|preço|pouco|acima|abaixo)\b/);
    }
    const clock = await call('/api/clock?lang=es');
    expect(clock.status).toBe(200);
    for (const f of (clock.body as ClockResponse).festivities) expect(typeof f.label).toBe('string');
    const risk = await post('/api/risk?lang=es', { items: [{ id: 'T4_BAG', quality: 1 }] });
    if (!upstreamDown(risk, '/api/risk?lang=es')) {
      expect(risk.body.zones.find((z: { zone: string }) => z.zone === 'brumas').label).toBe('Nieblas');
    }
  }, 60_000);

  it('POST /mcp com lingua "es": relogio e buscar_item em espanhol', async () => {
    const clock = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'relogio', arguments: { lingua: 'es' } } });
    expect(clock.status).toBe(200);
    expect(String(clock.body.result.content[0].text)).toContain('hora de Brasilia');
    const item = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'buscar_item', arguments: { consulta: 'bolsa iniciado', lingua: 'es' } } });
    expect(item.body.result.isError).toBeFalsy();
    expect(String(item.body.result.content[0].text)).toContain('Bolsa del iniciado');
  }, 60_000);

  it('/api/health e rota desconhecida', async () => {
    const h = await call('/api/health');
    expect(h.body.ok).toBe(true);
    const n = await call('/api/nada');
    expect(n.status).toBe(404);
  });
});
