// Service worker (Chrome/Edge) e página de fundo (Firefox) da extensão da Guarita.
// Só aqui saem as requisições, e só para https://guarita.pages.dev (a API não manda CORS; o content script não
// consegue buscar direto). Freios: cache por item (5 min), consultas iguais em voo viram uma só e no máximo
// ITEM_PER_MIN consultas de item por minuto. Cada /api/item custa várias chamadas ao AODP do lado da Guarita
// (docs/ARMADILHAS.md, "getItem gasta até 9"), por isso passar o mouse numa página cheia de ícones não pode virar
// uma rajada.
// Línguas: cada mensagem pode trazer `lang` ('pt' | 'es'); sem ela, vale a opção salva (ou a língua do navegador).
// O preço é o mesmo nas duas línguas (cache único por item e qualidade); muda só o nome (índice por língua) e o texto.
/* global importScripts */
if (typeof importScripts === 'function' && !globalThis.GuaritaCore) importScripts('lib/core.js');

const C = globalThis.GuaritaCore;
const ext = globalThis.browser ?? globalThis.chrome;

const ITEM_PER_MIN = 20;
const ITEM_TTL_MS = 5 * 60 * 1000;
const CLOCK_TTL_MS = 30 * 1000;
const INDEX_TTL_MS = 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 15000;

/** Índice de nomes por língua: arquivo no site e chave no storage.local (a do português é a de sempre). */
const INDEX_SOURCES = {
  pt: { path: '/data/items-index.json', key: 'itemsIndex' },
  es: { path: '/data/items-index-es.json', key: 'itemsIndexEs' },
};

const itemCache = C.createTtlCache(ITEM_TTL_MS, 300);
const clockCache = C.createTtlCache(CLOCK_TTL_MS, 2);
const limiter = C.createLimiter(ITEM_PER_MIN, 60 * 1000);
const inflight = new Map();
const indexPromises = new Map();

/** Erro com código de texto (traduzido na língua de quem pediu) ou mensagem já pronta. */
class ApiError extends Error {
  constructor(code, text) {
    super(text || code);
    this.code = code;
    this.text = text || '';
  }
  textFor(loc) {
    return this.text || C.t(loc, this.code);
  }
}

async function getJson(path, loc) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${C.BASE}${path}`, { signal: ctl.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
  } catch (err) {
    throw new ApiError(err && err.name === 'AbortError' ? 'errTimeout' : 'errOffline');
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new ApiError('http', C.httpErrorMessage(res.status, body && body.error, loc));
  if (!body || typeof body !== 'object') throw new ApiError('errUnexpected');
  return body;
}

// ---------- língua ----------

function uiLanguage() {
  try {
    return ext.i18n && ext.i18n.getUILanguage ? ext.i18n.getUILanguage() : '';
  } catch {
    return '';
  }
}

async function options() {
  try {
    return C.normalizeOptions((await ext.storage.local.get('options')).options);
  } catch {
    return C.defaultOptions();
  }
}

/** Língua da mensagem: a que veio nela ou a das opções. */
async function localeOf(msgLang) {
  if (msgLang === 'pt' || msgLang === 'es') return msgLang;
  return C.resolveLocale((await options()).lang, uiLanguage());
}

// ---------- índice de itens (nome na língua e busca do popup) ----------

async function loadIndex(loc) {
  const src = INDEX_SOURCES[loc] || INDEX_SOURCES.pt;
  let stored = null;
  try {
    stored = (await ext.storage.local.get(src.key))[src.key] || null;
  } catch {
    stored = null;
  }
  if (C.indexFresh(stored, Date.now(), INDEX_TTL_MS)) return C.prepareIndex(stored.items);
  try {
    const data = await getJson(src.path, loc);
    if (!Array.isArray(data.items) || !data.items.length) throw new ApiError('errEmptyIndex');
    const fresh = { fetchedAt: Date.now(), generatedAt: data.generatedAt || null, items: data.items };
    try {
      await ext.storage.local.set({ [src.key]: fresh });
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

function getIndex(loc) {
  const key = INDEX_SOURCES[loc] ? loc : 'pt';
  let p = indexPromises.get(key);
  if (!p) {
    p = loadIndex(key).catch((err) => {
      indexPromises.delete(key); // tenta de novo na próxima mensagem
      throw err;
    });
    indexPromises.set(key, p);
  }
  return p;
}

async function namesFor(id, loc) {
  try {
    const idx = await getIndex(loc);
    const row = idx.byId.get(id);
    return row ? { pt: row.pt, en: row.en } : null;
  } catch {
    return null; // o cartão mostra o id
  }
}

// ---------- mensagens ----------

async function itemCard(rawId, rawQ, loc) {
  const parsed = C.parseItemSrc(`https://render.albiononline.com/v1/item/${encodeURIComponent(String(rawId || ''))}.png`);
  if (!parsed) return { ok: false, error: C.t(loc, 'errInvalidItem') };
  const id = parsed.id;
  const q = C.parseQuality(rawQ) || (await options()).quality;
  const key = `${id}|${q}`;
  const hit = itemCache.get(key);
  if (hit) return { ok: true, card: C.buildCard(id, q, hit, await namesFor(id, loc), loc) };
  let p = inflight.get(key);
  if (!p) {
    const gate = limiter.take(Date.now());
    if (!gate.ok) {
      return {
        ok: false,
        limited: true,
        error: C.t(loc, 'errLimited', { s: gate.retryInS }),
        url: C.itemPageUrl(id, q, loc),
      };
    }
    p = getJson(C.apiItemUrl(id, q).slice(C.BASE.length), loc).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const item = await p;
    itemCache.set(key, item);
    return { ok: true, card: C.buildCard(id, q, item, await namesFor(id, loc), loc) };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.textFor(loc) : C.t(loc, 'errItem'), url: C.itemPageUrl(id, q, loc) };
  }
}

async function search(q, loc) {
  const text = String(q || '').slice(0, 80);
  try {
    const idx = await getIndex(loc);
    return { ok: true, hits: C.searchIndex(idx, text, 8, loc) };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.textFor(loc) : C.t(loc, 'errSearch') };
  }
}

/** Em espanhol pede /api/clock?lang=es (rótulo das festividades em `labelEs`); o resto da resposta é igual. */
async function clock(loc) {
  const hit = clockCache.get(loc);
  if (hit) return { ok: true, clock: hit };
  try {
    const data = await getJson(loc === 'es' ? '/api/clock?lang=es' : '/api/clock', loc);
    clockCache.set(loc, data);
    return { ok: true, clock: data };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.textFor(loc) : C.t(loc, 'errClock') };
  }
}

async function handle(msg) {
  if (!msg || typeof msg !== 'object') return { ok: false, error: C.t('pt', 'errBadMessage') };
  const loc = await localeOf(msg.lang);
  if (msg.type === 'item') return itemCard(msg.id, msg.q, loc);
  if (msg.type === 'search') return search(msg.q, loc);
  if (msg.type === 'clock') return clock(loc);
  return { ok: false, error: C.t(loc, 'errUnknownMessage') };
}

// sendResponse + return true funciona em Chrome, Edge e Firefox (Promise devolvida só no Firefox).
ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Só as páginas da própria extensão e os content scripts dela falam com o fundo.
  if (sender && sender.id && sender.id !== ext.runtime.id) return false;
  handle(msg).then(sendResponse, () => sendResponse({ ok: false, error: C.t(msg && msg.lang, 'errInternal') }));
  return true;
});

ext.runtime.onInstalled.addListener(() => {
  // Baixa o índice da língua em uso logo na instalação: o primeiro cartão já sai com o nome traduzido.
  localeOf(null)
    .then((loc) => getIndex(loc))
    .catch(() => {});
});
