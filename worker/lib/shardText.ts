// Rótulo de item recortado do TEXTO de uma fatia names*/t<n>.json, sem JSON.parse do arquivo inteiro (que estoura a
// CPU do plano grátis com o isolate frio; ver docs/ARMADILHAS.md § Cloudflare). Usado por acLabel (lib/acIndex.ts),
// labelsFor (api/insightsA.ts) e pelo nome do item nas metas (seo.ts).

/**
 * Rótulo de um id dentro do TEXTO de uma fatia names/t<n>.json ({"ID":"rótulo",...}) sem JSON.parse do arquivo.
 * A chave vem entre aspas e seguida de ':', então "T4_BAG" não casa com "T4_BAG@1".
 */
export function labelFromShardText(text: string, id: string): string | null {
  const key = `"${id}":`;
  const i = text.indexOf(key);
  if (i < 0) return null;
  let j = i + key.length;
  while (text[j] === ' ') j++;
  if (text[j] !== '"') return null;
  let k = j + 1;
  while (k < text.length && text[k] !== '"') k += text[k] === '\\' ? 2 : 1;
  try {
    const v = JSON.parse(text.slice(j, k + 1)) as unknown;
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}
