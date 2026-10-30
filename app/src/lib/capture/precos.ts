// Preço do loot pela API pública da Guarita (/api/prices em lote, qualidade normal; cache de 60 s no api.ts).
import type { PriceRow } from '../../../../shared/types';
import { api } from '../api';
import { CIDADES_ESTIMATIVA, idsParaPreco } from './sessao';
import type { ItemLoot } from './tipos';

export async function precosDoLoot(loot: ItemLoot[]): Promise<{ rows: PriceRow[]; em: number } | null> {
  const ids = idsParaPreco(loot);
  if (!ids.length) return null;
  // Ordem estável: o cache do api.ts é por URL, e o loot cresce item a item.
  ids.sort();
  const r = await api.prices({ ids, cities: CIDADES_ESTIMATIVA, qualities: [1] });
  return { rows: r.data.rows, em: r.at };
}
