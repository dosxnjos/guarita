// Busca de item barata para o bot do Discord: lê só uma fatia pequena do índice (public/data/ac/<3 letras>.json,
// gerada por scripts/build-items.mjs) em vez do items-index.json inteiro, que estoura os 10 ms de CPU do plano
// grátis com o isolate frio. names/t<tier>.json resolve id → rótulo. As fatias ficam em memória no isolate.
import type { Env } from '../env';

/** [id, rótulo pronto ("Bolsa do Adepto (T4.1)"), palavras normalizadas + "t<tier> e<ench>"] */
export type AcLine = [id: string, label: string, words: string];

export interface AcHit {
  id: string;
  label: string;
}

const TIER_WORDS: Record<string, number> = {
  calouro: 1, novato: 2, iniciante: 3, jornaleiro: 3, adepto: 4, perito: 5, mestre: 6, grao: 7, anciao: 8,
  beginner: 1, novice: 2, journeyman: 3, adept: 4, expert: 5, master: 6, grandmaster: 7, elder: 8,
};
const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'of', 'the', 'e', 'a', 'o']);

const shards = new Map<string, Promise<AcLine[]>>();
const names = new Map<string, Promise<Record<string, string>>>();

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’`´]/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
}

/** Consulta → tokens de palavra (prefixos) e tokens de tier/encantamento exatos ("t4", "e1"). */
export function parseAcQuery(q: string): { words: string[]; exact: string[] } {
  const words: string[] = [];
  const exact: string[] = [];
  for (const raw of norm(q).split(' ')) {
    if (!raw) continue;
    const te = /^t?([1-8])\.([0-4])$/.exec(raw);
    const t = /^t([1-8])$/.exec(raw);
    if (te) exact.push(`t${te[1]}`, `e${te[2]}`);
    else if (t) exact.push(`t${t[1]}`);
    else {
      const w = raw.replace(/\./g, '');
      if (!w || STOP.has(w)) continue;
      const tier = TIER_WORDS[w] ?? TIER_WORDS[w.replace(/s$/, '')];
      if (tier) exact.push(`t${tier}`);
      else words.push(w);
    }
  }
  return { words, exact };
}

async function loadJson<T>(env: Env, path: string, cache: Map<string, Promise<T>>, empty: T): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = env.ASSETS.fetch(new Request(`https://assets.local${path}`)).then(async (r) => (r.ok ? ((await r.json()) as T) : empty));
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

/** Até `limit` itens que casam com todos os tokens. Precisa de pelo menos uma palavra com 3 letras. */
export async function acSearch(env: Env, q: string, limit = 25): Promise<AcHit[]> {
  // Id digitado direto (T4_BAG, T4_BAG@1): resolve pela fatia names/ sem passar pela busca de palavras.
  if (/^T\d_[A-Z0-9_]+(@\d)?$/i.test(q.trim())) {
    const label = await acLabel(env, q);
    if (label) return [{ id: q.trim().toUpperCase(), label }];
  }
  const { words, exact } = parseAcQuery(q);
  const key = words.filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)[0];
  if (!key) return [];
  const lines = await loadJson<AcLine[]>(env, `/data/ac/k-${key.slice(0, 3)}.json`, shards, []);
  const hits: { line: AcLine; score: number; order: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ws = ' ' + line[2];
    if (!exact.every((e) => ws.includes(' ' + e + ' ') || ws.endsWith(' ' + e))) continue;
    if (!words.every((w) => ws.includes(' ' + w))) continue;
    // Rótulo que começa com a primeira palavra digitada sobe; depois, a ordem do arquivo (tier e id).
    const first = norm(line[1]).startsWith(words[0] ?? '') ? 0 : 1;
    hits.push({ line, score: first, order: i });
    if (hits.length > 400) break;
  }
  hits.sort((a, b) => a.score - b.score || a.order - b.order);
  return hits.slice(0, limit).map((h) => ({ id: h.line[0], label: h.line[1] }));
}

/** Rótulo do item pelo id (ex.: T4_BAG@1 → "Bolsa do Adepto (T4.1)"), ou null se não existir. */
export async function acLabel(env: Env, id: string): Promise<string | null> {
  const up = id.trim().toUpperCase();
  const m = /^T(\d)_/.exec(up);
  const map = await loadJson<Record<string, string>>(env, `/data/names/t${m ? m[1] : 0}.json`, names, {});
  return map[up] ?? null;
}
