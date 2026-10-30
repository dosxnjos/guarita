// Módulo (b): /api/prices, /api/item/:id, /api/book/:id. Também exporta as funções que o bot usa.
import type { Env } from '../env';
import type { BookFillResponse, ItemResponse, PricesResponse, Quality, City } from '../../shared/types';

export async function getPrices(_env: Env, _ctx: ExecutionContext, _ids: string[], _cities?: City[], _qualities?: Quality[]): Promise<PricesResponse> {
  throw new Error('não implementado: módulo (b)');
}
export async function getItem(_env: Env, _ctx: ExecutionContext, _id: string, _quality: Quality = 1): Promise<ItemResponse> {
  throw new Error('não implementado: módulo (b)');
}
export async function getBookFill(_env: Env, _ctx: ExecutionContext, _id: string, _city: City, _side: 'buy' | 'sell', _n: number, _quality: Quality = 1): Promise<BookFillResponse> {
  throw new Error('não implementado: módulo (b)');
}
export async function routeMarket(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null;
}
