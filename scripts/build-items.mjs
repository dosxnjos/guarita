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
let semNome = 0;
for (const it of dump) {
  const id = limpar(it?.UniqueName);
  if (!id || vistos.has(id)) continue;
  const nomes = it.LocalizedNames ?? {};
  let pt = limpar(nomes['PT-BR']);
  let en = limpar(nomes['EN-US']);
  // Nome de localização não resolvido ("@ITEMS_...") não serve para busca.
  if (pt.startsWith('@')) pt = '';
  if (en.startsWith('@')) en = '';
  if (!pt && !en) {
    semNome++;
    continue;
  }
  vistos.add(id);
  items.push([id, pt, en, tierDoId(id), enchDoId(id)]);
}

// Ordem estável (diff limpo no git): tier, id.
items.sort((a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const index = { v: 1, generatedAt: new Date().toISOString(), source: SOURCE, items };
const json = JSON.stringify(index);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, json);

const { size } = await stat(outPath);
const semPt = items.filter((i) => !i[1]).length;
console.log(`items-index.json: ${items.length} itens (${semNome} sem nome excluídos, ${semPt} só em EN), ${size} bytes`);
if (size > LIMITE_BYTES) console.warn(`AVISO: acima do alvo de ${LIMITE_BYTES} bytes`);
