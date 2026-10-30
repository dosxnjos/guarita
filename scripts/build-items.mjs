// Gera public/data/items-index.json a partir do dump ao-bin-dumps (formatted/items.json).
// Uso: npm run data:items   (baixa o dump para data-cache/ se ainda não existir)
// Formato: { v: 1, generatedAt, source, items: [id, pt, en, tier, ench][] }  (ver shared/items.ts)
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cachePath = join(root, 'data-cache', 'items.json');
const outPath = join(root, 'public', 'data', 'items-index.json');
const outPathEs = join(root, 'public', 'data', 'items-index-es.json');
const LIMITE_BYTES = 1.2 * 1024 * 1024;

async function baixarDump() {
  console.log(`baixando ${SOURCE} ...`);
  const res = await fetch(SOURCE, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!res.ok) throw new Error(`falha ao baixar o dump: HTTP ${res.status}`);
  const texto = await res.text();
  JSON.parse(texto); // valida antes de gravar no cache
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, texto);
  console.log(`dump salvo em ${cachePath} (${texto.length} bytes)`);
}

/** Tier: número após "T" no começo do id (T4_BAG → 4); 0 quando não há. */
export function tierDoId(id) {
  const m = /^T(\d)_/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** Encantamento: número após "@" no fim do id (T4_BAG@1 → 1); 0 quando não há. */
export function enchDoId(id) {
  const m = /@(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

const limpar = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

if (!existsSync(cachePath)) await baixarDump();
const dump = JSON.parse(await readFile(cachePath, 'utf8'));
if (!Array.isArray(dump)) throw new Error('dump inesperado: esperado um array de itens');

const vistos = new Set();
const items = [];
/** id → nome em espanhol (ES-ES, a única variante de espanhol do jogo); '' quando o dump não traz. */
const nomeEs = new Map();
let semNome = 0;
for (const it of dump) {
  const id = limpar(it?.UniqueName);
  if (!id || vistos.has(id)) continue;
  const nomes = it.LocalizedNames ?? {};
  let pt = limpar(nomes['PT-BR']);
  let en = limpar(nomes['EN-US']);
  let es = limpar(nomes['ES-ES']);
  // Nome de localização não resolvido ("@ITEMS_...") não serve para busca.
  if (pt.startsWith('@')) pt = '';
  if (en.startsWith('@')) en = '';
  if (es.startsWith('@')) es = '';
  if (!pt && !en) {
    semNome++;
    continue;
  }
  vistos.add(id);
  nomeEs.set(id, es);
  items.push([id, pt, en, tierDoId(id), enchDoId(id)]);
}

// Ordem estável (diff limpo no git): tier, id.
items.sort((a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const generatedAt = new Date().toISOString();
const index = { v: 1, generatedAt, source: SOURCE, items };
const json = JSON.stringify(index);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, json);

// Índice em espanhol para o navegador (/es/...): MESMO formato e mesmos itens, com o nome ES na posição do nome
// localizado (posição 1; cai para EN quando o dump não traz ES). Assim shared/items.ts e as telas funcionam sem
// mudar nada: src/lib/itemsClient.ts só troca o arquivo conforme getLocale().
const itemsEs = items.map(([id, , en, tier, ench]) => [id, nomeEs.get(id) || '', en, tier, ench]);
await writeFile(outPathEs, JSON.stringify({ v: 1, generatedAt, source: SOURCE, items: itemsEs }));

// ---------------------------------------------------------------------------
// Fatias pequenas para o Worker (bot do Discord): o índice inteiro custa mais que os 10 ms de CPU do plano
// grátis com o isolate frio. ac/<letra>.json = itens com alguma palavra começando pela letra, no formato
// [id, rótulo, palavras]; names/t<tier>.json = { id: rótulo }. Lidos por worker/lib/acIndex.ts.
// ---------------------------------------------------------------------------
// Nomes de tier viram o token t<n> (a busca do bot converte "adepto" em t4), senão a fatia "ad" teria mil itens.
const TIER_EN = { beginner: 1, novice: 2, journeyman: 3, adept: 4, expert: 5, master: 6, grandmaster: 7, elder: 8 };
export const TIER_WORDS = {
  calouro: 1, novato: 2, iniciante: 3, jornaleiro: 3, adepto: 4, perito: 5, mestre: 6, grao: 7, anciao: 8,
  ...TIER_EN,
};
// Espanhol do jogo (ES-ES): T1 principiante, T2 novato, T3 obrero, T4 iniciado, T5 experto, T6 maestro,
// T7 "gran maestro", T8 anciano. "gran" sozinho NÃO é tier ("Gran bastón maldito" existe em todo tier): só sai
// do texto quando vem antes de "maestro" (ver BIGRAMAS).
export const TIER_WORDS_ES = {
  principiante: 1, novato: 2, obrero: 3, iniciado: 4, experto: 5, maestro: 6, anciano: 8,
  ...TIER_EN,
};
const STOP_PT = new Set(['de', 'do', 'da', 'dos', 'das', 'of', 'the', 'e', 'a', 'o']);
export const STOP_ES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'of', 'the', 'a']);
/** Pares que, juntos, são nome de tier: as duas palavras saem do texto ("gran maestro" → T7). */
const BIGRAMAS = new Set(['gran maestro', 'grao mestre', 'grand master']);

const norm = (s) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const rotulo = ([id, nome, en, tier, ench]) => `${nome || en || id}${tier ? ` (T${tier}${ench ? '.' + ench : ''})` : ''}`;

/** Palavras de busca de um nome: sem stopwords, sem nomes de tier (inclusive "Adept's" → "adepts" e bigramas). */
export function palavrasDe(texto, stop, tierWords) {
  const isTier = (w) => Object.hasOwn(tierWords, w) || Object.hasOwn(tierWords, w.replace(/s$/, ''));
  const ws = norm(texto).split(' ');
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (i + 1 < ws.length && BIGRAMAS.has(`${w} ${ws[i + 1]}`)) {
      i++;
      continue;
    }
    if (w.length >= 2 && !stop.has(w) && !isTier(w)) out.push(w);
  }
  return [...new Set(out)];
}

/**
 * Grava ac<sufixo>/k-<3 letras>.json ([id, rótulo, palavras]) e names<sufixo>/t<tier>.json ({ id: rótulo }).
 * `lista` no formato do índice ([id, nomeLocalizado, en, tier, ench]); as palavras vêm do nome localizado + EN.
 */
async function gravarFatias(lista, sufixo, stop, tierWords) {
  const fatias = new Map();
  const nomes = new Map();
  for (const it of lista) {
    const [id, nome, en, tier, ench] = it;
    const palavras = palavrasDe(`${nome} ${en}`, stop, tierWords);
    const extra = tier ? [`t${tier}`, `e${ench}`] : [];
    const linha = [id, rotulo(it), [...palavras, ...extra].join(' ')];
    for (const k of new Set(palavras.filter((w) => w.length >= 3).map((w) => w.slice(0, 3)))) {
      if (!fatias.has(k)) fatias.set(k, []);
      fatias.get(k).push(linha);
    }
    const t = `t${tier}`;
    if (!nomes.has(t)) nomes.set(t, {});
    nomes.get(t)[id] = rotulo(it);
  }
  const acDir = join(root, 'public', 'data', `ac${sufixo}`);
  const namesDir = join(root, 'public', 'data', `names${sufixo}`);
  await mkdir(acDir, { recursive: true });
  await mkdir(namesDir, { recursive: true });
  let maiorFatia = 0;
  for (const [k, linhas] of fatias) {
    const s = JSON.stringify(linhas);
    maiorFatia = Math.max(maiorFatia, s.length);
    // Prefixo "k-": no Windows "con", "aux", "nul", "prn" são nomes reservados e o arquivo some sem erro.
    await writeFile(join(acDir, `k-${k}.json`), s);
  }
  for (const [t, mapa] of nomes) await writeFile(join(namesDir, `${t}.json`), JSON.stringify(mapa));
  console.log(
    `fatias do bot: ${fatias.size} em ac${sufixo}/ (maior ${maiorFatia} bytes), ${nomes.size} em names${sufixo}/`,
  );
}

await gravarFatias(items, '', STOP_PT, TIER_WORDS);
await gravarFatias(itemsEs, '-es', STOP_ES, TIER_WORDS_ES);

const { size } = await stat(outPath);
const semPt = items.filter((i) => !i[1]).length;
console.log(`items-index.json: ${items.length} itens (${semNome} sem nome excluídos, ${semPt} só em EN), ${size} bytes`);
if (size > LIMITE_BYTES) console.warn(`AVISO: acima do alvo de ${LIMITE_BYTES} bytes`);
const { size: sizeEs } = await stat(outPathEs);
const semEs = itemsEs.filter((i) => !i[1]).length;
console.log(`items-index-es.json: ${itemsEs.length} itens (${semEs} só em EN), ${sizeEs} bytes`);
if (sizeEs > LIMITE_BYTES) console.warn(`AVISO: índice ES acima do alvo de ${LIMITE_BYTES} bytes`);
