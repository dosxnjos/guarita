// Índice de itens e busca tolerante em PT-BR/EN. Dono: módulo (a) da Fase 1.
// Formato do arquivo estático /data/items-index.json (gerado por scripts/build-items.mjs):
//   { v: 1, generatedAt: ISO, source: string, items: ItemTuple[] }
// ItemTuple = [id, nomePtBr, nomeEn, tier, encantamento]  (tier 0 quando não se aplica)

export type ItemTuple = [id: string, pt: string, en: string, tier: number, ench: number];

export interface ItemsIndex {
  v: 1;
  generatedAt: string;
  source: string;
  items: ItemTuple[];
}

export interface ItemHit {
  id: string;
  pt: string;
  en: string;
  tier: number;
  ench: number;
  score: number;
}

// ---------------------------------------------------------------------------
// Vocabulário
// ---------------------------------------------------------------------------

/** Palavras que não pesam na busca ("capa de thetford" = "capa thetford"). */
const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'of', 'the', 'and']);

/**
 * Nome de tier como aparece no jogo. PT-BR do jogo: T1 Calouro, T2 Novato, T3 Iniciante (T3_BAG = "Bolsa do
 * Iniciante"), T4 Adepto, T5 Perito, T6 Mestre, T7 Grão-mestre, T8 Ancião. "jornaleiro" é aceito como apelido do T3.
 */
// Map (e não objeto literal): "constructor" ou "toString" digitados não podem casar com o protótipo.
const TIER_WORDS = new Map<string, number>(
  Object.entries({
    calouro: 1, novato: 2, iniciante: 3, jornaleiro: 3, adepto: 4, perito: 5, mestre: 6, graomestre: 7, anciao: 8,
    beginner: 1, novice: 2, journeyman: 3, adept: 4, expert: 5, master: 6, grandmaster: 7, elder: 8,
  }),
);
// Possessivo do EN sem apóstrofo ("Adept's" → "adepts").
for (const w of ['beginner', 'novice', 'journeyman', 'adept', 'expert', 'master', 'grandmaster', 'elder']) {
  TIER_WORDS.set(w + 's', TIER_WORDS.get(w)!);
}
/** Pares que viram uma palavra só antes de olhar o tier ("grão-mestre" → "grao mestre" → "graomestre"). */
function tierBigram(a: string, b: string | undefined): string | undefined {
  if (a === 'grao' && b === 'mestre') return 'graomestre';
  if (a === 'grand' && b === 'master') return 'grandmaster';
  return undefined;
}

/**
 * Sinônimos e gírias BR → termos que aparecem no nome EN ou no id do item (T4_WOOD é "Troncos de Pinho"/"Pine Logs":
 * "madeira" só acha pelo id). São alternativas somadas ao termo original, nunca substituem.
 */
const SYNONYM_LIST: Record<string, string[]> = {
  capa: ['cape', 'capeitem'],
  bolsa: ['bag'],
  montaria: ['mount'],
  cavalo: ['horse', 'mount'],
  boi: ['ox'],
  pocao: ['potion'],
  pocoes: ['potion'],
  pot: ['potion'],
  comida: ['meal'], // "food" casaria "foodcontainer" (móveis)
  tabua: ['planks'],
  barra: ['metalbar', 'bar'],
  couro: ['leather'],
  tecido: ['cloth'],
  pano: ['cloth'],
  bloco: ['stoneblock', 'block'],
  minerio: ['ore'],
  madeira: ['wood', 'logs'],
  tora: ['wood', 'logs'],
  tronco: ['wood', 'logs'],
  fibra: ['fiber'],
  pele: ['hide'],
  pedra: ['rock', 'stone'],
  elmo: ['head', 'helmet'],
  capacete: ['head', 'helmet'],
  bota: ['shoes', 'boots'],
  sapato: ['shoes'],
  peitoral: ['armor'],
  armadura: ['armor'],
  arma: ['main', '2h'],
  espada: ['sword'],
  machado: ['axe'],
  arco: ['bow'],
  besta: ['crossbow'],
  cajado: ['staff'],
  adaga: ['dagger'],
  lanca: ['spear'],
  martelo: ['hammer'],
  maca: ['mace'],
  escudo: ['shield'],
  tocha: ['torch'],
  tomo: ['book', 'tome'],
  peixe: ['fish'],
  carne: ['meat'],
  ferramenta: ['tool'],
};
const SYNONYMS = new Map(Object.entries(SYNONYM_LIST));

// ---------------------------------------------------------------------------
// Normalização e preparo (uma vez por objeto de índice)
// ---------------------------------------------------------------------------

/** Minúsculas, sem acento, sem apóstrofo; o que não é letra/número vira espaço. */
export function normalize(s: string): string {
  // Atalho para texto só ASCII (nomes EN): pula a decomposição de acentos, que é a parte cara.
  if (!/[^\x00-\x7f]/.test(s)) {
    return s
      .toLowerCase()
      .replace(/['`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Junta bigramas de tier e tira stopwords e nomes de tier: o "miolo" do nome para comparar com a busca. */
function coreOf(words: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if ((w === 'grao' || w === 'grand') && tierBigram(w, words[i + 1])) {
      i++;
      continue;
    }
    if (STOPWORDS.has(w) || TIER_WORDS.has(w)) continue;
    out.push(w);
  }
  return out.join(' ');
}

interface Prepared {
  t: ItemTuple;
  ptN: string;
  enN: string;
  /** Nome normalizado para desempate alfabético. */
  sortKey: string;
  /** Calculado só quando o item casa com a busca (economiza CPU no preparo). */
  extra?: PreparedExtra;
}

interface PreparedExtra {
  ptCore: string;
  enCore: string;
  /** Quantas palavras tem o miolo do nome PT (para preferir o nome mais curto). */
  coreLen: number;
  /** Id sem tier, nível e encantamento: T4_WOOD → "wood", T5_LEATHER_LEVEL2@2 → "leather". */
  idCore: string;
}

function extraOf(p: Prepared): PreparedExtra {
  if (p.extra) return p.extra;
  const ptWords = p.ptN ? p.ptN.split(' ') : [];
  const enWords = p.enN ? p.enN.split(' ') : [];
  const ptCore = coreOf(ptWords.length ? ptWords : enWords);
  const enCore = coreOf(enWords.length ? enWords : ptWords);
  p.extra = {
    ptCore,
    enCore,
    coreLen: Math.max(1, ptCore ? ptCore.split(' ').length : 1),
    idCore: p.t[0].replace(/^T\d_/, '').replace(/(_LEVEL\d+)?(@\d+)?$/, '').toLowerCase(),
  };
  return p.extra;
}

interface PreparedIndex {
  items: Prepared[];
  /** Vocabulário ordenado (palavras normalizadas de PT, EN e id): prefixo vira busca binária. */
  words: string[];
  /** postings[k] = índices dos itens que têm words[k]. */
  postings: number[][];
}

const cache = new WeakMap<ItemsIndex, PreparedIndex>();
// Mapa id → tupla separado do preparo da busca: barato (~2 ms), serve ao Worker sem gastar CPU normalizando nomes.
const idCache = new WeakMap<ItemsIndex, Map<string, ItemTuple>>();

function idMap(index: ItemsIndex): Map<string, ItemTuple> {
  let m = idCache.get(index);
  if (!m) {
    m = new Map(index.items.map((t) => [t[0], t] as const));
    idCache.set(index, m);
  }
  return m;
}

function prepare(index: ItemsIndex): PreparedIndex {
  let p = cache.get(index);
  if (p) return p;
  const items: Prepared[] = [];
  const vocab = new Map<string, number[]>();
  for (const t of index.items) {
    const [id, pt, en] = t;
    const ptN = normalize(pt);
    const enN = normalize(en);
    const idN = id.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const i = items.length;
    for (const list of [ptN.split(' '), enN.split(' '), idN.split(' ')]) {
      for (const w of list) {
        if (!w) continue;
        const posting = vocab.get(w);
        if (!posting) vocab.set(w, [i]);
        else if (posting[posting.length - 1] !== i) posting.push(i); // sem repetir o item
      }
    }
    items.push({ t, ptN, enN, sortKey: ptN || enN || idN });
  }
  const words = [...vocab.keys()].sort();
  p = { items, words, postings: words.map((w) => vocab.get(w)!) };
  cache.set(index, p);
  return p;
}

// ---------------------------------------------------------------------------
// Interpretação da busca
// ---------------------------------------------------------------------------

interface QueryToken {
  tok: string;
  alts: string[];
  /** Tier implícito quando o termo é nome de tier ("adepto" → 4). */
  tierWord: number;
}

export interface ParsedQuery {
  tier: number | null;
  ench: number | null;
  tokens: QueryToken[];
  /** Termos de texto sem nomes de tier, juntos: comparado com o miolo do nome. */
  core: string;
  /** Sinônimos do único termo de texto, comparados com o id inteiro do recurso ("madeira" → wood). */
  idAlt: Set<string>;
}

const TIER_RE = /^t([1-8])(?:[.@]([0-4]))?$/;
const TIER_ENCH_RE = /^([1-8])[.@]([0-4])$/;

function synonymsOf(tok: string): string[] {
  return SYNONYMS.get(tok) ?? (tok.endsWith('s') ? SYNONYMS.get(tok.slice(0, -1)) : undefined) ?? [];
}

/** Separa filtros de tier ("t4", "t4.1", "4.1", "4.0", "@2") dos termos de texto. */
export function parseQuery(q: string): ParsedQuery {
  const raw = q
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9.@]+/g, ' ')
    .trim();
  let tier: number | null = null;
  let ench: number | null = null;
  const words: string[] = [];
  for (const w of raw ? raw.split(' ') : []) {
    let m = TIER_RE.exec(w);
    if (m) {
      tier = Number(m[1]);
      if (m[2] !== undefined) ench = Number(m[2]);
      continue;
    }
    m = TIER_ENCH_RE.exec(w);
    if (m) {
      tier = Number(m[1]);
      ench = Number(m[2]);
      continue;
    }
    const e = /^[.@]([0-4])$/.exec(w);
    if (e) {
      ench = Number(e[1]);
      continue;
    }
    for (const part of w.split(/[.@]+/)) if (part) words.push(part);
  }

  const tokens: QueryToken[] = [];
  const core: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    const big = tierBigram(w, words[i + 1]);
    if (big) {
      w = big;
      i++;
    }
    if (STOPWORDS.has(w)) continue;
    const tierWord = TIER_WORDS.get(w) ?? 0;
    // "graomestre" aparece no nome como "grao mestre"; "grandmaster" como "grandmasters".
    const textual = w === 'graomestre' ? 'grao mestre' : w;
    const alts = synonymsOf(w);
    tokens.push({ tok: textual, alts, tierWord });
    if (!tierWord) core.push(w);
  }
  const text = tokens.filter((t) => !t.tierWord);
  const idAlt = new Set(text.length === 1 ? text[0].alts : []);
  return { tier, ench, tokens, core: core.join(' '), idAlt };
}

/** Primeira posição de `words` com palavra >= `s` (vocabulário ordenado). */
function lowerBound(words: string[], s: string): number {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function mark(out: Uint8Array, items: number[], q: number): void {
  for (const i of items) if (q > out[i]) out[i] = q;
}

/** Itens com palavra começando em `prefix`: `qExact` se a palavra é igual, senão `qPrefix`. */
function markPrefix(prep: PreparedIndex, prefix: string, qPrefix: number, qExact: number, out: Uint8Array): void {
  const { words, postings } = prep;
  for (let k = lowerBound(words, prefix); k < words.length && words[k].startsWith(prefix); k++) {
    mark(out, postings[k], words[k] === prefix ? qExact : qPrefix);
  }
}

/**
 * Qualidade de um termo em cada item: 3 palavra inteira ou tier do nome de tier, 2 começo de palavra ou sinônimo,
 * 1 trecho no meio da palavra, 0 nada.
 */
function tokenQualities(prep: PreparedIndex, qt: QueryToken): Uint8Array {
  const out = new Uint8Array(prep.items.length);
  const parts = qt.tok.split(' ');
  if (parts.length > 1) {
    // Termo de várias palavras ("grao mestre"): todas precisam aparecer inteiras.
    const acc = parts.map((w) => {
      const o = new Uint8Array(out.length);
      markPrefix(prep, w, 0, 3, o);
      return o;
    });
    for (let i = 0; i < out.length; i++) if (acc.every((o) => o[i] === 3)) out[i] = 3;
  } else {
    markPrefix(prep, qt.tok, 2, 3, out);
    for (const a of qt.alts) markPrefix(prep, a, 2, 2, out); // sinônimo nunca supera o termo literal
    if (qt.tok.length >= 3) {
      const { words, postings } = prep;
      for (let k = 0; k < words.length; k++) if (words[k].includes(qt.tok)) mark(out, postings[k], 1);
    }
  }
  if (qt.tierWord) prep.items.forEach((p, i) => p.t[3] === qt.tierWord && (out[i] = 3));
  return out;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Busca tolerante: ignora acento e caixa, aceita "t4.1 bolsa", "bolsa adepto", "merc", nome EN, id. */
export function searchItems(index: ItemsIndex, q: string, limit = 20): ItemHit[] {
  const max = Math.max(0, Math.floor(limit));
  const text = (q ?? '').trim();
  if (!text || !max || !index?.items?.length) return [];
  const prep = prepare(index);
  const parsed = parseQuery(text);

  // Id digitado direto ("T4_BAG", "T4_BAG@1") ou começo de id ("T4_CAPEITEM_FW").
  const upper = text.toUpperCase().replace(/\s+/g, '');
  const idLike = /^[A-Z0-9_@]+$/.test(upper) && upper.includes('_');

  if (!parsed.tokens.length && parsed.tier === null && parsed.ench === null && !idLike) return [];

  const quals = parsed.tokens.map((qt) => tokenQualities(prep, qt));
  const coreWords = parsed.core ? parsed.core.split(' ').length : 0;
  const hits: { p: Prepared; score: number }[] = [];
  const all = prep.items;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    const t = p.t;
    let score = 0;
    if (idLike) {
      if (t[0] === upper) score = 1000;
      else if (t[0].startsWith(upper)) score = 800;
    }
    if (!score) {
      if (parsed.tier !== null && t[3] !== parsed.tier) continue;
      if (parsed.ench !== null && t[4] !== parsed.ench) continue;
      let sum = 0;
      let strong = true;
      let ok = true;
      for (const qa of quals) {
        const qlt = qa[i];
        if (!qlt) {
          ok = false;
          break;
        }
        if (qlt < 2) strong = false;
        sum += qlt;
      }
      if (!ok) continue;
      const core = parsed.core;
      const x = extraOf(p);
      let base: number;
      if (!core) base = 300; // só filtro de tier ("t4", "adepto")
      else if (x.ptCore === core || x.enCore === core) base = 900;
      else if (x.ptCore.startsWith(core) || x.enCore.startsWith(core)) base = 700;
      else if (parsed.idAlt.has(x.idCore)) base = 700; // "madeira" → T4_WOOD, "pedra" → T4_ROCK
      else if (strong) base = 500;
      else base = 200;
      // Bônus: qualidade dos termos e nome mais curto (mais específico) primeiro.
      const coverage = coreWords ? Math.min(1, coreWords / x.coreLen) : 0;
      score = base + sum * 5 + Math.round(coverage * 20);
    }
    hits.push({ p, score });
  }

  // Empate: tier menor primeiro; item sem tier (móvel, missão, visual) depois dos que têm tier.
  const tierKey = (t: ItemTuple) => t[3] || 99;
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      tierKey(a.p.t) - tierKey(b.p.t) ||
      a.p.t[4] - b.p.t[4] ||
      (a.p.sortKey < b.p.sortKey ? -1 : a.p.sortKey > b.p.sortKey ? 1 : 0) ||
      (a.p.t[0] < b.p.t[0] ? -1 : 1),
  );

  return hits.slice(0, max).map(({ p, score }) => {
    const [id, pt, en, tier, ench] = p.t;
    return { id, pt: pt || en || id, en: en || pt || id, tier, ench, score };
  });
}

/**
 * Prepara tudo de uma vez (~80 ms para 11 mil itens, uma vez por objeto). Opcional: o navegador chama em momento
 * ocioso para que toda busca saia em < 5 ms. Sem isso, searchItems prepara só o necessário (~50 ms na primeira
 * chamada; o miolo de cada nome é calculado quando o item casa pela primeira vez).
 */
export function warmItemsIndex(index: ItemsIndex): void {
  if (!index?.items?.length) return;
  for (const p of prepare(index).items) extraOf(p);
}

/** true quando o preparo da busca completa já foi feito para este índice (searchItems sai barato). */
export function isSearchReady(index: ItemsIndex): boolean {
  return !!index && cache.has(index);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Busca de reserva, barata em CPU, para o Worker com isolate frio (limite de 10 ms do plano grátis): procura cada
 * termo como trecho do nome PT/EN/id, sem tirar acento dos nomes. Respeita tier, encantamento e sinônimos.
 * Ordem: id exato/começo de id, nome PT começando pelo 1º termo, depois o resto; empate por tier e nome curto.
 */
export function quickSearch(index: ItemsIndex, q: string, limit = 20): ItemHit[] {
  const max = Math.max(0, Math.floor(limit));
  const text = (q ?? '').trim();
  if (!text || !max || !index?.items?.length) return [];
  const parsed = parseQuery(text);
  const upper = text.toUpperCase().replace(/\s+/g, '');
  const idLike = /^[A-Z0-9_@]+$/.test(upper) && upper.includes('_');
  // Palavra digitada com acento ("grão") também vale como está, porque os nomes PT não perdem o acento aqui.
  const raw = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // Regex sem diferenciar caixa, compilada uma vez: testar o texto cru não aloca nada por item (CPU baixa).
  const terms = parsed.tokens.map((t) => {
    const alts = [...new Set([...t.tok.split(' '), ...t.alts, ...raw.filter((w) => normalize(w) === t.tok)])];
    return { tierWord: t.tierWord, alts, re: new RegExp(alts.map(escapeRe).join('|'), 'i') };
  });
  if (!terms.length && parsed.tier === null && parsed.ench === null && !idLike) return [];
  const firstTerm = terms.find((t) => !t.tierWord);
  const firstRe = firstTerm ? new RegExp('^(?:' + firstTerm.alts.map(escapeRe).join('|') + ')', 'i') : null;

  const hits: { t: ItemTuple; score: number }[] = [];
  const items = index.items;
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    let score = 0;
    if (idLike) {
      if (t[0] === upper) score = 1000;
      else if (t[0].startsWith(upper)) score = 800;
    }
    if (!score) {
      if (parsed.tier !== null && t[3] !== parsed.tier) continue;
      if (parsed.ench !== null && t[4] !== parsed.ench) continue;
      let ok = true;
      for (const term of terms) {
        if (term.tierWord && t[3] === term.tierWord) continue;
        if (!term.re.test(t[1]) && !term.re.test(t[2]) && !term.re.test(t[0])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      score = firstRe && (firstRe.test(t[1]) || firstRe.test(t[2])) ? 700 : 500;
    }
    hits.push({ t, score });
  }
  const tierKey = (t: ItemTuple) => t[3] || 99;
  hits.sort((a, b) => b.score - a.score || tierKey(a.t) - tierKey(b.t) || a.t[4] - b.t[4] || a.t[1].length - b.t[1].length || (a.t[0] < b.t[0] ? -1 : 1));
  return hits.slice(0, max).map(({ t, score }) => {
    const [id, pt, en, tier, ench] = t;
    return { id, pt: pt || en || id, en: en || pt || id, tier, ench, score };
  });
}

/** Tupla do item pelo id (aceita minúsculas); undefined se não existe no índice. */
export function findItem(index: ItemsIndex, id: string): ItemTuple | undefined {
  if (!index?.items || !id) return undefined;
  const byId = idMap(index);
  return byId.get(id) ?? byId.get(id.trim().toUpperCase());
}

/** Nome em PT-BR (cai para EN e depois para o id). */
export function itemName(index: ItemsIndex, id: string): string {
  const t = findItem(index, id);
  return (t && (t[1] || t[2])) || id;
}

/** Rótulo curto de tier.encantamento, ex.: "T4.1". */
export function tierLabel(tier: number, ench: number): string {
  return tier ? `T${tier}${ench ? '.' + ench : ''}` : '';
}
