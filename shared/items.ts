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

/** Busca tolerante: ignora acento e caixa, aceita "t4.1 bolsa", "bolsa adepto", "merc", nome EN, id. */
export function searchItems(_index: ItemsIndex, _q: string, _limit = 20): ItemHit[] {
  throw new Error('não implementado: módulo (a)');
}

/** Nome em PT-BR (cai para EN e depois para o id). */
export function itemName(_index: ItemsIndex, _id: string): string {
  throw new Error('não implementado: módulo (a)');
}

/** Rótulo curto de tier.encantamento, ex.: "T4.1". */
export function tierLabel(tier: number, ench: number): string {
  return tier ? `T${tier}${ench ? '.' + ench : ''}` : '';
}
