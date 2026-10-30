// Cliente do Albion Online Data Project (Americas). Dono: módulo (b). Regras: gzip sempre, Cache API,
// lote por URL até 4096 caracteres, 429 → respeitar RateLimit-Reset. Outros módulos importam daqui.
import type { BookLevel, City, PriceRow, Quality } from '../../shared/types';

export interface HistoryPoint { date: string; avg: number; count: number }

export async function aodpPrices(_ids: string[], _cities: City[], _qualities: Quality[], _ctx?: ExecutionContext): Promise<PriceRow[]> {
  throw new Error('não implementado: módulo (b)');
}
export async function aodpHistory(_id: string, _cities: City[], _quality: Quality, _days: number, _ctx?: ExecutionContext): Promise<{ city: City; points: HistoryPoint[] }[]> {
  throw new Error('não implementado: módulo (b)');
}
export async function aodpBook(_id: string, _cities: City[], _quality: Quality, _ctx?: ExecutionContext): Promise<{ city: City; sell: BookLevel[]; buy: BookLevel[] }[]> {
  throw new Error('não implementado: módulo (b)');
}
export async function aodpGold(_count: number, _ctx?: ExecutionContext): Promise<{ price: number; at: string }[]> {
  throw new Error('não implementado: módulo (b)');
}
