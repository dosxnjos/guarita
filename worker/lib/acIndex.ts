// Busca de item barata para o bot do Discord: lê só uma fatia pequena do índice (public/data/ac/<3 letras>.json,
// gerada por scripts/build-items.mjs) em vez do items-index.json inteiro, que estoura os 10 ms de CPU do plano
// grátis com o isolate frio. names/t<tier>.json resolve id → rótulo. As fatias ficam em memória no isolate.
// Espanhol: ac-es/ e names-es/ (mesmo formato, rótulo com o nome ES do jogo), escolhidos pelo parâmetro `locale`.
import type { Env } from '../env';
import { labelFromShardText } from './shardText';

/** [id, rótulo pronto ("Bolsa do Adepto (T4.1)"), palavras normalizadas + "t<tier> e<ench>"] */
export type AcLine = [id: string, label: string, words: string];

export interface AcHit {
  id: string;
  label: string;
}

/** Língua das fatias: 'pt' (padrão, sem sufixo) ou 'es' (ac-es/, names-es/). */
export type AcLocale = 'pt' | 'es';

const TIER_EN = { beginner: 1, novice: 2, journeyman: 3, adept: 4, expert: 5, master: 6, grandmaster: 7, elder: 8 };
const TIER_WORDS: Record<AcLocale, Map<string, number>> = {
  pt: new Map(
    Object.entries({
      calouro: 1, novato: 2, iniciante: 3, jornaleiro: 3, adepto: 4, perito: 5, mestre: 6, grao: 7, anciao: 8,
      ...TIER_EN,
    }),
  ),
  // Mesmas palavras que scripts/build-items.mjs tira das fatias ES ("gran" sozinho é palavra comum).
  es: new Map(
    Object.entries({
      principiante: 1, novato: 2, obrero: 3, iniciado: 4, experto: 5, maestro: 6, anciano: 8,
      ...TIER_EN,
    }),
  ),
};
const STOP: Record<AcLocale, Set<string>> = {
  pt: new Set(['de', 'do', 'da', 'dos', 'das', 'of', 'the', 'e', 'a', 'o']),
  es: new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'of', 'the', 'a']),
};
/** Pares que formam o nome do T7: "grão-mestre", "gran maestro", "grand master". */
const T7_BIGRAMS = new Set(['grao mestre', 'gran maestro', 'grand master']);

/** Caminho da fatia de nomes (id → rótulo) de um tier na língua pedida. */
export function acNamesPath(tier: number, locale: AcLocale = 'pt'): string {
  return `/data/names${locale === 'es' ? '-es' : ''}/t${tier}.json`;
}

const shards = new Map<string, Promise<AcLine[]>>();
// Fatias names*/t<tier>.json guardadas como TEXTO: JSON.parse da fatia inteira (~110–127 KB) custa ~1 ms cada com o
// isolate frio, e 5–6 tiers (top 10 do /perdas em espanhol) chegavam perto dos 10 ms de CPU. O rótulo sai recortado
// do texto (labelFromShardText), como no worker/api/insightsA.ts e no worker/seo.ts.
const names = new Map<string, Promise<string>>();

function loadText(env: Env, path: string): Promise<string> {
  let p = names.get(path);
  if (!p) {
    p = env.ASSETS.fetch(new Request(`https://assets.local${path}`)).then((r) => (r.ok ? r.text() : ''));
    // Falha ou fatia vazia não fica guardada: tenta de novo na próxima.
    p.then((t) => t || names.delete(path), () => names.delete(path));
    names.set(path, p);
  }
  return p;
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’`´]/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
}

/** Consulta → tokens de palavra (prefixos) e tokens de tier/encantamento exatos ("t4", "e1"). */
export function parseAcQuery(q: string, locale: AcLocale = 'pt'): { words: string[]; exact: string[] } {
  const words: string[] = [];
  const exact: string[] = [];
  const stop = STOP[locale] ?? STOP.pt;
  const tiers = TIER_WORDS[locale] ?? TIER_WORDS.pt;
  const raws = norm(q).split(' ').filter(Boolean);
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    const te = /^t?([1-8])\.([0-4])$/.exec(raw);
    const t = /^t([1-8])$/.exec(raw);
    if (te) exact.push(`t${te[1]}`, `e${te[2]}`);
    else if (t) exact.push(`t${t[1]}`);
    else {
      const w = raw.replace(/\./g, '');
      if (!w || stop.has(w)) continue;
      // "grão-mestre"/"gran maestro" é o T7 (sem isso virava t7 + t6 e não casava nada).
      const next = raws[i + 1]?.replace(/\./g, '');
      if (next && T7_BIGRAMS.has(`${w} ${next}`)) {
        exact.push('t7');
        i++;
        continue;
      }
      const tier = tiers.get(w) ?? tiers.get(w.replace(/s$/, ''));
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

/** Qualquer valor fora de 'es' vale 'pt' (o locale do Discord chega como 'es-ES', 'pt-BR' etc. — normalize antes). */
const pick = (locale: AcLocale | undefined): AcLocale => (locale === 'es' ? 'es' : 'pt');

/**
 * Até `limit` itens que casam com todos os tokens. Precisa de pelo menos uma palavra com 3 letras.
 * `locale` 'es' busca nas fatias ES (nome ES + EN) e devolve o rótulo em espanhol.
 */
export async function acSearch(env: Env, q: string, limit = 25, locale: AcLocale = 'pt'): Promise<AcHit[]> {
  const loc = pick(locale);
  // Id digitado direto (T4_BAG, T4_BAG@1): resolve pela fatia names/ sem passar pela busca de palavras.
  if (/^T\d_[A-Z0-9_]+(@\d)?$/i.test(q.trim())) {
    const label = await acLabel(env, q, loc);
    if (label) return [{ id: q.trim().toUpperCase(), label }];
  }
  const { words, exact } = parseAcQuery(q, loc);
  const key = words.filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)[0];
  if (!key) return [];
  const dir = loc === 'es' ? 'ac-es' : 'ac';
  const lines = await loadJson<AcLine[]>(env, `/data/${dir}/k-${key.slice(0, 3)}.json`, shards, []);
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

/**
 * Rótulo do item pelo id (ex.: T4_BAG@1 → "Bolsa do Adepto (T4.1)"; em 'es', "Bolsa del iniciado (T4.1)"), ou null
 * se não existir.
 */
export async function acLabel(env: Env, id: string, locale: AcLocale = 'pt'): Promise<string | null> {
  const up = id.trim().toUpperCase();
  const m = /^T(\d)_/.exec(up);
  if (!up || /["\\:]/.test(up)) return null;
  const text = await loadText(env, acNamesPath(m ? Number(m[1]) : 0, pick(locale))).catch(() => '');
  return text ? labelFromShardText(text, up) : null;
}
