// Service worker (Chrome/Edge) e página de fundo (Firefox) da extensão da Guarita.
// Só aqui saem as requisições, e só para https://guarita.pages.dev (a API não manda CORS; o content script não
// consegue buscar direto). Freios: cache por item (5 min), consultas iguais em voo viram uma só e no máximo
// ITEM_PER_MIN consultas de item por minuto. Cada /api/item custa várias chamadas ao AODP do lado da Guarita
// (docs/ARMADILHAS.md, "getItem gasta até 9"), por isso passar o mouse numa página cheia de ícones não pode virar
// uma rajada.
/* global importScripts */
if (typeof importScripts === 'function' && !globalThis.GuaritaCore) importScripts('lib/core.js');

const C = globalThis.GuaritaCore;
const ext = globalThis.browser ?? globalThis.chrome;

const ITEM_PER_MIN = 20;
const ITEM_TTL_MS = 5 * 60 * 1000;
const CLOCK_TTL_MS = 30 * 1000;
const INDEX_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 15000;

const itemCache = C.createTtlCache(ITEM_TTL_MS, 300);
const clockCache = C.createTtlCache(CLOCK_TTL_MS, 1);
const limiter = C.createLimiter(ITEM_PER_MIN, 60 * 1000);
const inflight = new Map();
let indexPromise = null;

class ApiError extends Error {}

async function getJson(path) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${C.BASE}${path}`, { signal: ctl.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
  } catch (err) {
    throw new ApiError(
      err && err.name === 'AbortError'
        ? 'A Guarita demorou demais para responder. Tente de novo.'
        : 'Sem conexão com a Guarita. Confira a internet ou a permissão de acesso da extensão.',
    );
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new ApiError(C.httpErrorMessage(res.status, body && body.error));
  if (!body || typeof body !== 'object') throw new ApiError('Resposta inesperada da Guarita.');
  return body;
}

// ---------- índice de itens (nome PT-BR e busca do popup) ----------

async function loadIndex() {
  let stored = null;
  try {
    stored = (await ext.storage.local.get('itemsIndex')).itemsIndex || null;
  } catch {
    stored = null;
  }
  if (C.indexFresh(stored, Date.now(), INDEX_TTL_MS)) return C.prepareIndex(stored.items);
  try {
    const data = await getJson('/data/items-index.json');
    if (!Array.isArray(data.items) || !data.items.length) throw new ApiError('Índice de itens vazio.');
    const fresh = { fetchedAt: Date.now(), generatedAt: data.generatedAt || null, items: data.items };
    try {
      await ext.storage.local.set({ itemsIndex: fresh });
    } catch {
      /* sem espaço: segue só com a cópia em memória */
    }
    return C.prepareIndex(fresh.items);
  } catch (err) {
    // Sem rede: o índice vencido ainda serve (nomes mudam pouco).
    if (stored && Array.isArray(stored.items) && stored.items.length) return C.prepareIndex(stored.items);
    throw err;
  }
}

function getIndex() {
  if (!indexPromise) {
    indexPromise = loadIndex().catch((err) => {
      indexPromise = null; // tenta de novo na próxima mensagem
      throw err;
    });
  }
  return indexPromise;
}

async function namesFor(id) {
  try {
    const idx = await getIndex();
    const row = idx.byId.get(id);
    return row ? { pt: row.pt, en: row.en } : null;
  } catch {
    return null; // o cartão mostra o id
  }
}

// ---------- mensagens ----------

async function options() {
  try {
    return C.normalizeOptions((await ext.storage.local.get('options')).options);
  } catch {
    return C.defaultOptions();
  }
}

async function itemCard(rawId, rawQ) {
  const parsed = C.parseItemSrc(`https://render.albiononline.com/v1/item/${encodeURIComponent(String(rawId || ''))}.png`);
  if (!parsed) return { ok: false, error: 'Item inválido.' };
  const id = parsed.id;
  const q = C.parseQuality(rawQ) || (await options()).quality;
  const key = `${id}|${q}`;
  const hit = itemCache.get(key);
  if (hit) return { ok: true, card: C.buildCard(id, q, hit, await namesFor(id)) };
  let p = inflight.get(key);
  if (!p) {
    const gate = limiter.take(Date.now());
    if (!gate.ok) {
      return {
        ok: false,
        limited: true,
        error: `Muitas consultas em pouco tempo. Espere ${gate.retryInS} s ou abra o item na Guarita.`,
        url: C.itemPageUrl(id, q),
      };
    }
    p = getJson(C.apiItemUrl(id, q).slice(C.BASE.length)).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const item = await p;
    itemCache.set(key, item);
    return { ok: true, card: C.buildCard(id, q, item, await namesFor(id)) };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Erro ao consultar a Guarita.', url: C.itemPageUrl(id, q) };
  }
}

async function search(q) {
  const text = String(q || '').slice(0, 80);
  try {
    const idx = await getIndex();
    return { ok: true, hits: C.searchIndex(idx, text, 8) };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Não foi possível carregar a lista de itens.' };
  }
}

async function clock() {
  const hit = clockCache.get('c');
  if (hit) return { ok: true, clock: hit };
  try {
    const data = await getJson('/api/clock');
    clockCache.set('c', data);
    return { ok: true, clock: data };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Não foi possível consultar o relógio.' };
  }
}

function handle(msg) {
  if (!msg || typeof msg !== 'object') return Promise.resolve({ ok: false, error: 'Mensagem inválida.' });
  if (msg.type === 'item') return itemCard(msg.id, msg.q);
  if (msg.type === 'search') return search(msg.q);
  if (msg.type === 'clock') return clock();
  return Promise.resolve({ ok: false, error: 'Mensagem desconhecida.' });
}

// sendResponse + return true funciona em Chrome, Edge e Firefox (Promise devolvida só no Firefox).
ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Só as páginas da própria extensão e os content scripts dela falam com o fundo.
  if (sender && sender.id && sender.id !== ext.runtime.id) return false;
  handle(msg).then(sendResponse, () => sendResponse({ ok: false, error: 'Erro interno da extensão.' }));
  return true;
});

ext.runtime.onInstalled.addListener(() => {
  // Baixa o índice logo na instalação: o primeiro cartão já sai com o nome em português.
  getIndex().catch(() => {});
});
