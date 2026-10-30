import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../worker/env';
import type { ClockResponse, ItemResponse, LossesResponse, PlayerDossier, CityQuote } from '../shared/types';

// As funções de dado (outros módulos) são substituídas: aqui só se testa o servidor MCP e as ferramentas.
const m = vi.hoisted(() => ({
  acSearch: vi.fn(),
  acLabel: vi.fn(),
  getItem: vi.fn(),
  getClock: vi.fn(),
  searchPlayers: vi.fn(),
  getDossier: vi.fn(),
  getLosses: vi.fn(),
}));
vi.mock('../worker/lib/acIndex', () => ({ acSearch: m.acSearch, acLabel: m.acLabel }));
vi.mock('../worker/api/market', () => ({ getItem: m.getItem }));
vi.mock('../worker/api/clock', () => ({ getClock: m.getClock }));
vi.mock('../worker/api/player', async (orig) => ({
  ...(await orig<typeof import('../worker/api/player')>()),
  searchPlayers: m.searchPlayers,
  getDossier: m.getDossier,
}));
vi.mock('../worker/api/insights', () => ({ getLosses: m.getLosses }));

import { handleMcp, resetMcpRateLimit, hashIp, takeToken, LATEST_VERSION, MAX_TOOL_CALLS_PER_POST } from '../worker/mcp/server';
import { callTool, listTools, summarizeItem, summarizeHoje, ageLabel, fmtDateBr, DANGER_ES, TRILHA_TEXTO_ES } from '../worker/mcp/tools';
import { trilhaLabel } from '../src/lib/hoje/view';
import { dangerHeadline } from '../src/lib/player/format';
import { MCP_TOOLS, MCP_CALLS_PER_MIN } from '../worker/mcp/catalog';
import { GameinfoError } from '../worker/lib/gameinfo';
import { AodpError } from '../worker/lib/aodp';
import { readPublic } from './helpers/public';

// env espião: registra todo campo lido. O servidor MCP em si não lê nenhum (segredo nenhum tem como sair por ele);
// só repassa o env às funções de dado, que aqui são falsas.
const envReads: string[] = [];
const env = new Proxy({} as Env, {
  get(_t, p) {
    if (typeof p === 'string' && p !== 'then' && p !== 'asymmetricMatch' && !p.startsWith('$$') && p !== 'nodeType') envReads.push(p);
    return undefined;
  },
});
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

let ipSeq = 0;
function post(body: unknown, headers: Record<string, string> = {}, ip = `10.0.0.${++ipSeq}`): Request {
  return new Request('https://guarita.pages.dev/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'cf-connecting-ip': ip, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
async function rpc(body: unknown, headers: Record<string, string> = {}, ip?: string) {
  const res = await handleMcp(post(body, headers, ip), env, ctx);
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null };
}
const call = (name: string, args: unknown, id: number | string = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

// ---------- dados de exemplo ----------

const NOW = Date.parse('2026-10-30T15:00:00Z');
const quote = (city: CityQuote['city'], sellMin: number | null, buyMax: number | null = null): CityQuote => ({
  city,
  sellMin,
  sellMinAt: sellMin == null ? null : '2026-10-30T14:40:00Z',
  buyMax,
  buyMaxAt: buyMax == null ? null : '2026-10-30T14:30:00Z',
  ageMin: 20,
  confidence: { score: 80, label: 'alta', reasons: [] },
  verdict: sellMin == null ? 'sem dado' : 'barato',
});
const ITEM: ItemResponse = {
  id: 'T4_BAG@1',
  quality: 1,
  fetchedAt: '2026-10-30T14:58:00Z',
  cities: [quote('Martlock', 5200, 4100), quote('Lymhurst', 4800), quote('Caerleon', null), quote('Black Market', null, 6100)],
  history: [{ city: 'Martlock', days: [{ date: '2026-10-29', avg: 5000, count: 30 }] }],
  median7d: 5100,
  p25: 4700,
  p75: 5600,
  book: [{ city: 'Martlock', sell: [{ price: 5200, amount: 3 }], buy: [] }],
  flips: [{ from: 'Lymhurst', buyAt: 4800, sellAt: 6100, profitPremium: 1057, profitNoPremium: 813, roi: 0.22, ageMin: 20 }],
};
const CLOCK: ClockResponse = {
  now: '2026-10-30T15:00:00Z',
  server: { status: 'online', message: '', checkedAt: '2026-10-30T14:59:00Z' },
  festivities: [{ kind: 0, category: '', name: 'HALLOWEEN2026', labelPt: 'Halloween 2026', start: '2026-10-20T10:00:00Z', end: '2026-11-03T10:00:00Z' }],
  gold: { price: 4321, at: '2026-10-30T14:00:00Z', p30: 4400, trend: 'caindo' },
  premiumSilver: 16_203_750,
  season: { name: 'Temporada 34', end: '2026-11-09T11:00:00Z', approx: true },
};
const side = (name: string, guild = '') => ({ id: name + '-id', name, guild, alliance: '', ip: 1200, gear: [] });
const DOSSIER: PlayerDossier = {
  id: 'NwcyH-y1Q924YlQkAkn7nw',
  name: 'CalangoPeto',
  guild: 'B A G R E',
  alliance: '',
  killFame: 2_421_977,
  deathFame: 1_000_000,
  ratio: 2.42,
  pve: {},
  gathering: {},
  recentKills: [{ id: 1, time: '2026-10-30T12:00:00Z', killer: side('CalangoPeto', 'B A G R E'), victim: side('Fulano', 'Outra'), participants: 1, totalFame: 52000, estValue: 300000 }],
  recentDeaths: [],
  weapons: [{ type: 'MAIN_SPEAR', labelPt: 'Lança', count: 4 }],
  soloRate: 0.5,
  avgGroup: 2.5,
  avgIp: 1250,
  danger: { score: 40, label: 'atenção', reasons: ['mata em grupo pequeno'] },
  fetchedAt: '2026-10-30T14:55:00Z',
};
const LOSSES: LossesResponse = {
  days: 7,
  since: '2026-10-30',
  sampleKills: 12_345,
  items: [{ id: 'T4_MAIN_SPEAR', name: 'Lança do Adepto', count: 321, price: 9000, value: 2_889_000, ageMin: 30 }],
  fetchedAt: '2026-10-30T14:50:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetMcpRateLimit();
  m.acLabel.mockImplementation(async (_e: unknown, id: string) => (id.toUpperCase() === 'T4_BAG@1' ? 'Bolsa do Adepto (T4.1)' : null));
  m.acSearch.mockResolvedValue([]);
});

// ---------- transporte ----------

describe('transporte HTTP', () => {
  it('OPTIONS responde CORS aberto com os cabeçalhos do MCP', async () => {
    const res = await handleMcp(new Request('https://guarita.pages.dev/mcp', { method: 'OPTIONS' }), env, ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const allow = res.headers.get('access-control-allow-headers') ?? '';
    for (const h of ['content-type', 'mcp-session-id', 'mcp-protocol-version']) expect(allow).toContain(h);
  });
  it('GET e DELETE recebem 405 (sem SSE e sem sessão)', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await handleMcp(new Request('https://guarita.pages.dev/mcp', { method, headers: { accept: 'text/event-stream' } }), env, ctx);
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST, OPTIONS');
    }
  });
  it('resposta JSON com CORS e sem cache', async () => {
    const { res } = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('mcp-session-id')).toBeNull();
  });
  it('versão do protocolo desconhecida no cabeçalho → 400', async () => {
    const { status, body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { 'mcp-protocol-version': '1999-01-01' });
    expect(status).toBe(400);
    expect(body.error.code).toBe(-32600);
  });
  it('versão conhecida no cabeçalho e Mcp-Session-Id qualquer são aceitos', async () => {
    const { status, body } = await rpc({ jsonrpc: '2.0', id: 7, method: 'ping' }, { 'mcp-protocol-version': '2025-06-18', 'mcp-session-id': 'abc' });
    expect(status).toBe(200);
    expect(body).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });
  it('corpo grande demais → 413', async () => {
    const { status } = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping', params: { x: 'a'.repeat(70_000) } });
    expect(status).toBe(413);
  });
});

// ---------- JSON-RPC ----------

describe('initialize e métodos básicos', () => {
  it('devolve a versão pedida quando suportada', async () => {
    for (const v of ['2025-06-18', '2025-03-26']) {
      const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: v, capabilities: {}, clientInfo: { name: 't', version: '1' } } });
      expect(body.result.protocolVersion).toBe(v);
      expect(body.result.capabilities).toEqual({ tools: {} });
      expect(body.result.serverInfo).toMatchObject({ name: 'guarita' });
      expect(body.result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(body.result.instructions).toContain('Americas');
    }
  });
  it('versão desconhecida → a mais nova que o servidor suporta', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 'a', method: 'initialize', params: { protocolVersion: '2030-01-01' } });
    expect(body.id).toBe('a');
    expect(body.result.protocolVersion).toBe(LATEST_VERSION);
  });
  it('notifications/initialized → 202 sem corpo', async () => {
    const { status, body, res } = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(status).toBe(202);
    expect(body).toBeNull();
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('ping → resultado vazio', async () => {
    expect((await rpc({ jsonrpc: '2.0', id: 3, method: 'ping' })).body).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
  });
  it('tools/list traz as 6 ferramentas com esquema e sem campos internos', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = body.result.tools;
    // o_que_fazer: Fase 3, módulo c (casos próprios em tests/hoje.test.ts)
    expect(tools.map((t: { name: string }) => t.name)).toEqual(['buscar_item', 'preco_item', 'relogio', 'dossie_jogador', 'perdas_pvp', 'o_que_fazer']);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t).not.toHaveProperty('example');
    }
    expect(tools[1].inputSchema.required).toEqual(['item']);
    expect(listTools()).toHaveLength(MCP_TOOLS.length);
  });
});

describe('erros JSON-RPC', () => {
  it('-32700 com JSON inválido', async () => {
    const { status, body } = await rpc('{"jsonrpc": "2.0", "id": 1,');
    expect(status).toBe(400);
    expect(body).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32700 } });
  });
  it('-32600 sem jsonrpc 2.0, sem method, id nulo ou lote vazio', async () => {
    expect((await rpc({ id: 1, method: 'ping' })).body.error.code).toBe(-32600);
    expect((await rpc({ jsonrpc: '2.0', id: 1 })).body.error.code).toBe(-32600);
    expect((await rpc({ jsonrpc: '2.0', id: null, method: 'ping' })).body.error.code).toBe(-32600);
    expect((await rpc([])).body.error.code).toBe(-32600);
    expect((await rpc('42')).body.error.code).toBe(-32600);
  });
  it('-32601 para método desconhecido (resources/list não é anunciado)', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
    expect(body).toMatchObject({ id: 9, error: { code: -32601 } });
  });
  it('-32602 para ferramenta inexistente, sem name ou params que não é objeto', async () => {
    expect((await rpc(call('apagar_tudo', {}))).body.error.code).toBe(-32602);
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} })).body.error.code).toBe(-32602);
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: [1] })).body.error.code).toBe(-32602);
  });
  it('resposta do cliente (sem method, com result) é aceita sem resposta', async () => {
    expect((await rpc({ jsonrpc: '2.0', id: 5, result: {} })).status).toBe(202);
  });
});

describe('lote', () => {
  it('responde cada requisição e pula as notificações', async () => {
    const { body } = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'nada' },
    ]);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(body[1].error.code).toBe(-32601);
  });
  it('lote só de notificações → 202', async () => {
    expect((await rpc([{ jsonrpc: '2.0', method: 'notifications/initialized' }])).status).toBe(202);
  });
  it('mais ferramentas que o permitido por requisição viram isError', async () => {
    m.getClock.mockResolvedValue(CLOCK);
    const batch = Array.from({ length: MAX_TOOL_CALLS_PER_POST + 1 }, (_, i) => call('relogio', {}, i + 1));
    const { body } = await rpc(batch);
    expect(body.slice(0, MAX_TOOL_CALLS_PER_POST).every((r: { result: { isError?: boolean } }) => !r.result.isError)).toBe(true);
    expect(body[MAX_TOOL_CALLS_PER_POST].result.isError).toBe(true);
    expect(m.getClock).toHaveBeenCalledTimes(MAX_TOOL_CALLS_PER_POST);
  });
});

// ---------- ferramentas ----------

describe('buscar_item', () => {
  it('até 10 itens pela busca barata', async () => {
    m.acSearch.mockResolvedValue([{ id: 'T4_BAG', label: 'Bolsa do Adepto (T4)' }, { id: 'T4_BAG@1', label: 'Bolsa do Adepto (T4.1)' }]);
    const { body } = await rpc(call('buscar_item', { consulta: 'bolsa adepto' }));
    expect(m.acSearch.mock.calls[0][1]).toBe('bolsa adepto');
    expect(m.acSearch.mock.calls[0][2]).toBe(10);
    const r = body.result;
    expect(r.isError).toBeUndefined();
    expect(r.content[0].type).toBe('text');
    expect(r.content[0].text).toContain('Bolsa do Adepto (T4.1) · id T4_BAG@1');
    expect(r.structuredContent.itens).toEqual([{ id: 'T4_BAG', nome: 'Bolsa do Adepto (T4)' }, { id: 'T4_BAG@1', nome: 'Bolsa do Adepto (T4.1)' }]);
  });
  it('com as fatias reais de public/data (acIndex de verdade)', async () => {
    const real = await vi.importActual<typeof import('../worker/lib/acIndex')>('../worker/lib/acIndex');
    m.acSearch.mockImplementation(real.acSearch);
    m.acLabel.mockImplementation(real.acLabel);
    const assetsEnv = {
      ASSETS: {
        fetch: async (req: Request) => {
          const body = readPublic(new URL(req.url).pathname);
          return body == null ? new Response('não achei', { status: 404 }) : new Response(body);
        },
      },
    } as unknown as Env;
    const r = await callTool('buscar_item', { consulta: 'bolsa adepto' }, { env: assetsEnv, ctx });
    const ids = (r.structuredContent!.itens as { id: string }[]).map((i) => i.id);
    expect(ids[0]).toBe('T4_BAG');
    expect(ids.length).toBeLessThanOrEqual(10);
    m.getItem.mockResolvedValue(ITEM);
    await callTool('preco_item', { item: 'bolsa adepto 4.1' }, { env: assetsEnv, ctx });
    expect(m.getItem.mock.calls[0][2]).toBe('T4_BAG@1');
  });
  it('sem resultado é resposta normal com dica', async () => {
    const { body } = await rpc(call('buscar_item', { consulta: 'xyzabc' }));
    expect(body.result.isError).toBeUndefined();
    expect(body.result.content[0].text).toContain('Nenhum item encontrado');
  });
  it('consulta curta ou ausente → isError com dica', async () => {
    expect((await rpc(call('buscar_item', { consulta: 'bo' }))).body.result).toMatchObject({ isError: true });
    const r = (await rpc(call('buscar_item', {}))).body.result;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('consulta');
    expect(m.acSearch).not.toHaveBeenCalled();
  });
});

describe('preco_item', () => {
  it('pelo id: resolve o rótulo, chama getItem com a qualidade e resume em PT-BR', async () => {
    m.getItem.mockResolvedValue({ ...ITEM, quality: 2 });
    const { body } = await rpc(call('preco_item', { item: 't4_bag@1', qualidade: 2 }));
    expect(m.getItem.mock.calls[0].slice(1)).toEqual([ctx, 'T4_BAG@1', 2]);
    const r = body.result;
    expect(r.content[0].text).toContain('Bolsa do Adepto (T4.1)');
    expect(r.content[0].text).toContain('qualidade Bom');
    expect(r.content[0].text).toContain('Lymhurst, 4.800 prata');
    expect(r.structuredContent.qualidade).toBe(2);
    expect(r.structuredContent).not.toHaveProperty('history');
    expect(r.structuredContent).not.toHaveProperty('book');
    expect(r.structuredContent.link).toBe('https://guarita.pages.dev/item/T4_BAG%401?q=2');
  });
  it('pelo nome: usa a primeira opção da busca barata', async () => {
    m.acSearch.mockResolvedValue([{ id: 'T4_BAG@1', label: 'Bolsa do Adepto (T4.1)' }]);
    m.getItem.mockResolvedValue(ITEM);
    await rpc(call('preco_item', { item: 'bolsa adepto 4.1' }));
    expect(m.acSearch.mock.calls[0].slice(1)).toEqual(['bolsa adepto 4.1', 1]);
    expect(m.getItem.mock.calls[0].slice(1)).toEqual([ctx, 'T4_BAG@1', 1]);
  });
  it('qualidade fora de 1 a 5 → isError sem chamar a fonte', async () => {
    const r = (await rpc(call('preco_item', { item: 'T4_BAG@1', qualidade: 9 }))).body.result;
    expect(r.isError).toBe(true);
    expect(m.getItem).not.toHaveBeenCalled();
  });
  it('item não achado → isError sugerindo buscar_item', async () => {
    const r = (await rpc(call('preco_item', { item: 'coisa inexistente' }))).body.result;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('buscar_item');
  });
  it('AODP fora → isError com mensagem amigável', async () => {
    m.getItem.mockRejectedValue(new AodpError('limite de requisições do AODP; tente em 30 s', 429, 30));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = (await rpc(call('preco_item', { item: 'T4_BAG@1' }))).body.result;
    warn.mockRestore();
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Albion Data Project indisponível');
  });
  it('resumo puro: flip, mediana, Black Market e datas', () => {
    const t = summarizeItem(ITEM, 'Bolsa do Adepto (T4.1)', NOW).content[0].text;
    expect(t).toContain('Mediana de 7 dias: 5.100 prata (faixa normal de 4.700 a 5.600)');
    expect(t).toContain('Black Market (venda instantânea): 6.100 prata');
    expect(t).toContain('comprar em Lymhurst por 4.800 e vender por 6.100');
    expect(t).toContain('Veredito em Lymhurst: barato');
    expect(t).toContain('Caerleon: venda sem dado');
  });
});

describe('relogio', () => {
  it('status, bônus e ouro em PT-BR', async () => {
    m.getClock.mockResolvedValue(CLOCK);
    const r = (await rpc(call('relogio', {}))).body.result;
    const t: string = r.content[0].text;
    expect(t).toContain('Servidor Americas: online');
    expect(t).toContain('Halloween 2026');
    expect(t).toContain('Ouro: 4.321 prata por ouro, caindo');
    expect(t).toContain('16.203.750 prata');
    expect(r.structuredContent.gold.price).toBe(4321);
  });
  it('aceita arguments ausente', async () => {
    m.getClock.mockResolvedValue(CLOCK);
    const r = (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'relogio' } })).body.result;
    expect(r.isError).toBeUndefined();
  });
});

describe('dossie_jogador', () => {
  it('nome exato (sem diferenciar maiúsculas) → dossiê', async () => {
    m.searchPlayers.mockResolvedValue({ players: [{ id: DOSSIER.id, name: 'CalangoPeto', guild: 'B A G R E', alliance: '', killFame: 1, deathFame: 1 }, { id: 'x', name: 'CalangoPetoII', guild: '', alliance: '', killFame: 1, deathFame: 1 }] });
    m.getDossier.mockResolvedValue(DOSSIER);
    const r = (await rpc(call('dossie_jogador', { nome: 'calangopeto' }))).body.result;
    expect(m.getDossier.mock.calls[0][2]).toBe(DOSSIER.id);
    const t: string = r.content[0].text;
    expect(t).toContain('Dossiê de CalangoPeto');
    expect(t).toContain('Guilda: B A G R E');
    expect(t).toContain('Lança (4×)');
    expect(t).toContain('matou Fulano [Outra]');
    expect(t).toContain('nunca a posição atual');
    expect(r.structuredContent.link).toBe(`https://guarita.pages.dev/jogador/${DOSSIER.id}`);
  });
  it('vários parecidos → lista de candidatos, sem chamar o dossiê', async () => {
    m.searchPlayers.mockResolvedValue({ players: [
      { id: 'a', name: 'Calango1', guild: 'G', alliance: '', killFame: 10, deathFame: 1 },
      { id: 'b', name: 'Calango2', guild: '', alliance: '', killFame: 20, deathFame: 1 },
    ] });
    const r = (await rpc(call('dossie_jogador', { nome: 'Calango' }))).body.result;
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain('Calango1 · guilda G');
    expect(r.structuredContent.candidatos).toHaveLength(2);
    expect(m.getDossier).not.toHaveBeenCalled();
  });
  it('ninguém com o nome → isError', async () => {
    m.searchPlayers.mockResolvedValue({ players: [] });
    expect((await rpc(call('dossie_jogador', { nome: 'Ninguem' }))).body.result.isError).toBe(true);
  });
  it('gameinfo lenta → isError amigável, sem detalhe interno', async () => {
    m.searchPlayers.mockRejectedValue(new GameinfoError('timeout', 'gameinfo: sem resposta em 25000 ms'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = (await rpc(call('dossie_jogador', { nome: 'CalangoPeto' }))).body.result;
    warn.mockRestore();
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('killboard oficial está lento');
    expect(r.content[0].text).not.toContain('25000');
  });
});

describe('perdas_pvp', () => {
  it('chama getLosses com os dias e resume', async () => {
    m.getLosses.mockResolvedValue(LOSSES);
    const r = (await rpc(call('perdas_pvp', { dias: 7 }))).body.result;
    expect(m.getLosses.mock.calls[0].slice(1)).toEqual([ctx, 7, 20]);
    const t: string = r.content[0].text;
    expect(t).toContain('nos últimos 7 dias');
    expect(t).toContain('12.345 mortes');
    expect(t).toContain('coleta desde 30/10/2026');
    expect(t).toContain('1. Lança do Adepto (T4_MAIN_SPEAR): 321 perdidos · 9.000 prata cada');
    expect(r.structuredContent.amostraKills).toBe(12345);
  });
  it('padrão 1 dia; aceita número em texto; recusa fora da faixa', async () => {
    m.getLosses.mockResolvedValue({ ...LOSSES, days: 1 });
    await rpc(call('perdas_pvp', {}));
    expect(m.getLosses.mock.calls.at(-1)!.slice(2)).toEqual([1, 20]);
    await rpc(call('perdas_pvp', { dias: '3' }));
    expect(m.getLosses.mock.calls.at(-1)!.slice(2)).toEqual([3, 20]);
    expect((await rpc(call('perdas_pvp', { dias: 30 }))).body.result.isError).toBe(true);
  });
  it('erro inesperado da fonte não vaza a mensagem crua', async () => {
    m.getLosses.mockRejectedValue(new Error('não implementado: módulo (a) da Fase 2 / binding CORE'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = (await rpc(call('perdas_pvp', {}))).body.result;
    err.mockRestore();
    expect(r.isError).toBe(true);
    expect(r.content[0].text).not.toContain('CORE');
  });
});

describe('segurança e limites', () => {
  it('o servidor e as ferramentas não leem campo nenhum do env (segredos e ligações)', async () => {
    m.getClock.mockResolvedValue(CLOCK);
    m.getItem.mockResolvedValue(ITEM);
    envReads.length = 0;
    await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    await rpc(call('relogio', {}));
    await rpc(call('preco_item', { item: 'T4_BAG@1' }));
    expect(envReads).toEqual([]);
  });
  it(`limite de ${MCP_CALLS_PER_MIN} chamadas por minuto por IP`, async () => {
    m.getClock.mockResolvedValue(CLOCK);
    const ip = '203.0.113.9';
    for (let i = 0; i < MCP_CALLS_PER_MIN; i++) expect((await rpc(call('relogio', {}), {}, ip)).body.result.isError).toBeUndefined();
    const over = (await rpc(call('relogio', {}), {}, ip)).body.result;
    expect(over.isError).toBe(true);
    expect(over.content[0].text).toContain('Limite de 60 consultas por minuto');
    // outro IP segue livre; ping e tools/list não contam
    expect((await rpc(call('relogio', {}), {}, '203.0.113.10')).body.result.isError).toBeUndefined();
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, {}, ip)).body.result).toEqual({});
  });
  it('janela de 1 minuto zera a contagem; o hash não guarda o IP', () => {
    const k = hashIp('198.51.100.1');
    expect(k).not.toContain('198');
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(takeToken(k, t0, 3)).toBe(true);
    expect(takeToken(k, t0 + 1000, 3)).toBe(false);
    expect(takeToken(k, t0 + 60_000, 3)).toBe(true);
  });
  it('callTool direto: argumentos que não são objeto → isError', async () => {
    expect((await callTool('relogio', 'x', { env, ctx })).isError).toBe(true);
  });
});

describe('espanhol (argumento lingua)', () => {
  const es = (name: string, args: Record<string, unknown> = {}, id: number | string = 1) => call(name, { ...args, lingua: 'es' }, id);
  const PT_WORDS = /\bprata\b|\bguilda\b|\bDossiê\b|\bvocê\b|\bconfiança\b|Black Market|\bcidade\b/;

  it('tools/list: lingua opcional em todas, enum pt|es, descrição "pt / es" e required de antes', async () => {
    const tools = (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).body.result.tools;
    for (const t of tools) {
      expect(t.inputSchema.properties.lingua).toMatchObject({ type: 'string', enum: ['pt', 'es'], default: 'pt' });
      expect(t.inputSchema.required ?? []).not.toContain('lingua');
      expect(t.description).toContain(' / ');
      expect(t).not.toHaveProperty('descriptionEs');
    }
    // A página /mcp em português continua lendo só a descrição em português do catálogo.
    for (const d of MCP_TOOLS) expect(d.description).not.toContain(' / ');
    expect(tools[1].inputSchema.required).toEqual(['item']);
    const init = (await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} })).body.result;
    expect(init.instructions).toContain('lingua: "es"');
  });

  it('buscar_item: busca nas fatias ES e responde em espanhol', async () => {
    m.acSearch.mockResolvedValue([{ id: 'T4_BAG', label: 'Bolsa del iniciado (T4)' }]);
    const r = (await rpc(es('buscar_item', { consulta: 'bolsa iniciado' }))).body.result;
    expect(m.acSearch.mock.calls[0].slice(1)).toEqual(['bolsa iniciado', 10, 'es']);
    expect(r.content[0].text).toContain('Objetos encontrados para “bolsa iniciado” (1)');
    expect(r.content[0].text).toContain('Usa el id en preco_item');
    m.acSearch.mockResolvedValue([]);
    expect((await rpc(es('buscar_item', { consulta: 'xyzabc' }))).body.result.content[0].text).toMatch(/^No encontré ningún objeto/);
  });

  it('preco_item: nome ES, números es-419, Mercado Negro, link /es; getItem com a assinatura de antes', async () => {
    m.acLabel.mockImplementation(async (_e: unknown, id: string, loc?: string) =>
      id.toUpperCase() === 'T4_BAG@1' ? (loc === 'es' ? 'Bolsa del iniciado (T4.1)' : 'Bolsa do Adepto (T4.1)') : null);
    m.getItem.mockResolvedValue({ ...ITEM, quality: 2 });
    const r = (await rpc(es('preco_item', { item: 't4_bag@1', qualidade: 2 }))).body.result;
    expect(m.acLabel).toHaveBeenCalledWith(expect.anything(), 't4_bag@1', 'es');
    expect(m.getItem.mock.calls[0].slice(1)).toEqual([ctx, 'T4_BAG@1', 2]);
    const t: string = r.content[0].text;
    expect(t).toContain('Bolsa del iniciado (T4.1) (T4_BAG@1) · calidad Bueno · servidor Americas');
    expect(t).toContain('Más barato para comprar: Lymhurst, 4,800 de plata');
    expect(t).toContain('Mercado Negro (venta inmediata): 6,100 de plata');
    expect(t).toContain('Veredicto en Lymhurst: barato');
    expect(t).toContain('Mejor reventa al Mercado Negro: comprar en Lymhurst por 4,800 y vender por 6,100');
    expect(t).toContain('Martlock: venta 5,200');
    expect(t).toContain('confianza alta');
    expect(t).not.toMatch(PT_WORDS);
    expect(r.structuredContent.qualidadeNome).toBe('Bueno');
    expect(r.structuredContent.link).toBe('https://guarita.pages.dev/es/item/T4_BAG%401?q=2');
  });

  it('lingua "pt" explícita sai idêntica a sem lingua', async () => {
    m.getItem.mockResolvedValue(ITEM);
    const a = (await rpc(call('preco_item', { item: 'T4_BAG@1', lingua: 'pt' }))).body.result;
    const b = (await rpc(call('preco_item', { item: 'T4_BAG@1' }))).body.result;
    expect(a).toEqual(b);
    expect(m.getItem.mock.calls.every((c: unknown[]) => c.length === 4)).toBe(true);
  });

  it('relogio: getClock com "es", status, festividade e ouro em espanhol', async () => {
    m.getClock.mockResolvedValue(CLOCK);
    const r = (await rpc(es('relogio'))).body.result;
    expect(m.getClock.mock.calls[0].slice(1)).toEqual([ctx, 'es']);
    const t: string = r.content[0].text;
    expect(t).toContain('(hora de Brasilia)');
    expect(t).toContain('Servidor Americas: en línea');
    expect(t).toContain('Bonificaciones activas:');
    expect(t).toContain('Oro: 4,321 de plata por oro, bajando');
    expect(t).toContain('16,203,750 de plata');
    expect(t).not.toMatch(PT_WORDS);
  });

  it('dossie_jogador: getDossier com "es", gremio, arma ES, peligro e link /es', async () => {
    m.searchPlayers.mockResolvedValue({ players: [{ id: DOSSIER.id, name: 'CalangoPeto', guild: 'B A G R E', alliance: '', killFame: 1, deathFame: 1 }] });
    m.getDossier.mockResolvedValue({ ...DOSSIER, danger: { score: 40, label: 'atenção', reasons: ['mata en solitario (60% de los asesinatos)'] } });
    const r = (await rpc(es('dossie_jogador', { nome: 'calangopeto' }))).body.result;
    expect(m.getDossier.mock.calls[0].slice(1)).toEqual([ctx, DOSSIER.id, 'es']);
    const t: string = r.content[0].text;
    expect(t).toContain('Dosier de CalangoPeto (Americas)');
    expect(t).toContain('Gremio: B A G R E');
    expect(t).toContain('Peligro: atención (40/100): mata en solitario (60% de los asesinatos).');
    expect(t).toContain('Lanza (4×)');
    expect(t).toContain('mató a Fulano [Outra]');
    expect(t).toContain(' · asesinatos/muertes ');
    expect(t).not.toMatch(/razón|\bsolo en el\b|· solo\b/);
    expect(t).toContain('nunca la posición actual');
    expect(t).not.toMatch(PT_WORDS);
    expect(r.structuredContent.link).toBe(`https://guarita.pages.dev/es/jogador/${DOSSIER.id}`);
    m.searchPlayers.mockResolvedValue({ players: [{ id: 'a', name: 'Calango1', guild: 'G', alliance: '', killFame: 10, deathFame: 1 }, { id: 'b', name: 'Calango2', guild: '', alliance: '', killFame: 2, deathFame: 1 }] });
    const list: string = (await rpc(es('dossie_jogador', { nome: 'Calango' }))).body.result.content[0].text;
    expect(list).toContain('Calango1 · gremio G');
    expect(list).toContain('Calango2 · sin gremio');
  });

  it('perdas_pvp: getLosses com "es" e resumo em espanhol', async () => {
    m.getLosses.mockResolvedValue({ ...LOSSES, items: [{ ...LOSSES.items[0], name: 'Lanza del iniciado' }] });
    const r = (await rpc(es('perdas_pvp', { dias: 7 }))).body.result;
    expect(m.getLosses.mock.calls[0].slice(1)).toEqual([ctx, 7, 20, 'es']);
    const t: string = r.content[0].text;
    expect(t).toContain('Objetos más perdidos en PvP en Americas en los últimos 7 días.');
    expect(t).toContain('Muestra: 12,345 muertes recopiladas por Guarita (recopilación desde el 30/10/2026)');
    expect(t).toContain('1. Lanza del iniciado (T4_MAIN_SPEAR): 321 perdidos · 9,000 de plata c/u');
    expect(t).toContain('https://guarita.pages.dev/es/perdas');
    expect(t).not.toMatch(PT_WORDS);
  });

  it('o_que_fazer: validação e resumo em espanhol, link /es/hoje', async () => {
    const deps = { env, ctx };
    expect((await callTool('o_que_fazer', { lingua: 'es' }, deps)).content[0].text).toBe('Indica la plata disponible (argumento "prata").');
    expect((await callTool('o_que_fazer', { prata: 1_000_000, minutos: 240, lingua: 'es' }, deps)).content[0].text).toMatch(/debe ser 30, 60 o 120/);
    expect((await callTool('o_que_fazer', { prata: 1_000_000, premium: 'talvez', lingua: 'es' }, deps)).content[0].text).toMatch(/true o false/);
    const resp = {
      prata: 2_000_000, minutos: 60, premium: true, fetchedAt: '2026-10-30T14:58:00Z', notas: ['Hoy hay bonificación de refinado.'],
      opcoes: [{
        trilha: 'flip' as const, titulo: 'Reventa: Bolsa del iniciado', passos: ['Compra 10 en Lymhurst.'], lucro: 12_000, capital: 48_000, minutos: 30,
        confianca: 70, riscos: ['Ruta por zona roja.'], itens: [], conta: { compra: 48_000, venda: 61_000, taxas: 1_000, lucro: 12_000 },
      }],
    };
    const t = summarizeHoje(resp, NOW, 'es');
    const s = t.content[0].text;
    expect(s).toContain('Qué hacer hoy con 2,000,000 de plata, 60 min y Premium');
    expect(s).toContain('1. [Reventa al Mercado Negro] Bolsa del iniciado · confianza 70/100');
    expect(s).toContain('Cálculo: compra 48,000, venta 61,000, impuestos 1,000, ganancia estimada 12,000');
    expect(s).toContain('Riesgos: Ruta por zona roja.');
    expect(t.structuredContent!.link).toBe('https://guarita.pages.dev/es/hoje?prata=2000000&minutos=60&premium=1');
    expect(summarizeHoje(resp, NOW).structuredContent!.link).toBe('https://guarita.pages.dev/hoje?prata=2000000&minutos=60&premium=1');
  });

  it('erros na língua pedida: argumento, item não achado, fonte fora; lingua desconhecida vira pt', async () => {
    expect((await rpc(es('preco_item', { item: 'T4_BAG@1', qualidade: 9 }))).body.result.content[0].text).toBe('El argumento "qualidade" debe ser un número entero de 1 a 5.');
    expect((await rpc(es('preco_item', { item: 'coisa inexistente' }))).body.result.content[0].text).toMatch(/^No encontré el objeto “coisa inexistente”. Usa buscar_item/);
    expect((await rpc(es('buscar_item', {}))).body.result.content[0].text).toBe('Indica el nombre del objeto (argumento "consulta").');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.searchPlayers.mockRejectedValue(new GameinfoError('timeout', 'gameinfo: sem resposta em 25000 ms'));
    const slow: string = (await rpc(es('dossie_jogador', { nome: 'CalangoPeto' }))).body.result.content[0].text;
    expect(slow).toContain('El killboard oficial está lento');
    expect(slow).not.toContain('25000');
    m.getItem.mockRejectedValue(new AodpError('O AODP limitou as requisições; tente de novo em 30 s.', 429, 30));
    expect((await rpc(es('preco_item', { item: 'T4_BAG@1' }))).body.result.content[0].text).toBe(
      'Albion Data Project no disponible ahora: El AODP limitó las solicitudes; inténtalo de nuevo en 30 s.',
    );
    warn.mockRestore();
    m.searchPlayers.mockResolvedValue({ players: [] });
    expect((await rpc(es('dossie_jogador', { nome: 'Ninguem' }))).body.result.content[0].text).toBe('Ningún jugador llamado “Ninguem” en el killboard de Americas.');
    // lingua fora de pt/es (ex.: um cliente que já mandava "en" ou "fr"): cai em português, sem erro, como antes do argumento.
    m.getClock.mockResolvedValue(CLOCK);
    const outra = (await rpc(call('relogio', { lingua: 'fr' }))).body.result;
    const semLingua = (await rpc(call('relogio', {}))).body.result;
    expect(outra.isError).toBeFalsy();
    expect(outra.content[0].text).toBe(semLingua.content[0].text);
    expect((await rpc(call('relogio', { lingua: 42 }))).body.result.content[0].text).toBe(semLingua.content[0].text);
    expect((await rpc(call('relogio', { lingua: 'es-419' }))).body.result.content[0].text).toContain('en línea');
  });

  it('rótulos em espanhol iguais aos do site (trilha do "hoje" e perigo)', () => {
    for (const t of ['flip', 'refino', 'transporte'] as const) expect(TRILHA_TEXTO_ES[t]).toBe(trilhaLabel(t, 'es'));
    for (const l of ['tranquilo', 'atenção', 'perigoso'] as const) expect(DANGER_ES[l]).toBe(dangerHeadline(l, 'es').toLowerCase());
  });

  it('limite de ferramentas por requisição em espanhol', async () => {
    m.getClock.mockResolvedValue(CLOCK);
    const batch = Array.from({ length: MAX_TOOL_CALLS_PER_POST + 1 }, (_, k) => es('relogio', {}, k + 1));
    const out = (await rpc(batch)).body;
    expect(out.at(-1).result.content[0].text).toMatch(/^Como máximo 2 herramientas por solicitud/);
  });
});

describe('formatação', () => {
  it('idade e data em horário de Brasília', () => {
    expect(ageLabel(0.5)).toBe('agora');
    expect(ageLabel(12)).toBe('há 12 min');
    expect(ageLabel(180)).toBe('há 3 h');
    expect(ageLabel(4000)).toBe('há 3 dias');
    expect(fmtDateBr('2026-11-09T11:00:00Z')).toBe('09/11/2026 08:00');
  });
});
