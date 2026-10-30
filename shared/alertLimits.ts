// Limites das regras de alerta, usados pelo formulário (src/), pela API (worker/api/alerts.ts) e pelo bot.
// Espelhados em guarita-core/src/rules.ts (o core não importa do repo público): mudou aqui, muda lá.
import type { City } from './types';

/** Percentual aceito na condição "abaixo da mediana de 7 dias". */
export const MEDIAN_PCT_MIN = 1;
export const MEDIAN_PCT_MAX = 90;

/** O Black Market só compra: o jogador não compra dele, então o lado "sell" (comprar barato) não vale lá. */
export const BM_CITY: City = 'Black Market';
export const BM_SELL_ERROR = 'o Black Market só tem ordens de compra: para ele, use o lado de vender caro (ordens de compra)';

/** A combinação lado + cidades faz sentido? (comprar barato no Black Market não existe). Pura. */
export function sideAllowsCities(side: 'sell' | 'buy', cities: readonly City[]): boolean {
  return !(side === 'sell' && cities.includes(BM_CITY));
}
