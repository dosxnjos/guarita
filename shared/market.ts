// Constantes de mercado compartilhadas (fonte: gamedata.xml do ao-bin-dumps de 12/10/2026, bloco
// <MarketPlace><TaxValues>; o Premium pela metade vem de fonte secundária e o front avisa).
import type { City } from './types';

export const ROYAL_CITIES: City[] = ['Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford'];
export const ALL_CITIES: City[] = [...ROYAL_CITIES, 'Caerleon', 'Brecilien', 'Black Market'];

export const SETUP_FEE = 0.025;
export const SALES_TAX = 0.08;
export const SALES_TAX_PREMIUM = 0.04;

/** Premium de 30 dias em gold (gamedata.xml <PremiumPackages>). */
export const PREMIUM_30D_GOLD = 3750;

export const AODP_BASE = 'https://west.albion-online-data.com/api/v2/stats';
export const GAMEINFO_BASE = 'https://gameinfo.albiononline.com/api/gameinfo';
export const SERVER_STATUS_URL = 'https://serverstatus.albiononline.com/';
export const RENDER_BASE = 'https://render.albiononline.com/v1/item';

/** Temporada atual (aproximada: o fim exato não foi confirmado em post oficial). */
export const SEASON = { name: 'Temporada 34', end: '2026-11-09T11:00:00Z', approx: true as const };

/** Ticks .NET (100 ns desde 0001-01-01) → ISO UTC. */
export function ticksToIso(ticks: number): string {
  return new Date((ticks - 621355968000000000) / 10000).toISOString();
}

/** O AODP manda datas sem fuso ("2026-10-29T04:10:00") e "0001-01-01T00:00:00" para vazio. */
export function aodpDate(s: string | null | undefined): string | null {
  if (!s || s.startsWith('0001')) return null;
  return s.endsWith('Z') ? s : s + 'Z';
}

export function minutesSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
}

/** Lucro de comprar por sell order numa cidade e vender instantâneo na buy order do Black Market. */
export function flipProfit(buyAt: number, sellAt: number, premium: boolean): number {
  const tax = premium ? SALES_TAX_PREMIUM : SALES_TAX;
  return Math.round(sellAt * (1 - tax) - buyAt);
}
