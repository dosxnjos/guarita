// Regras puras do widget "Preço rápido" e dos links "abrir no site". Testado em tests/ui.test.ts.
import type { CityQuote, Flip, ItemResponse, Quality } from '../../../shared/types';
import { API_BASE } from './api';
import { cheapestReliable, flipIsStale, flipView, sortCities, sortFlips } from './format';

export interface FlipResumo {
  flip: Flip;
  lucro: number;
  roi: number | null;
  velho: boolean;
}

export interface ResumoPreco {
  /** Cidade mais barata para comprar; reliable=false quando nenhuma tem selo alta ou média. */
  melhor: { quote: CityQuote; reliable: boolean } | null;
  /** Tabela: com venda primeiro (mais barata no topo), depois só compra, Black Market no fim. */
  linhas: CityQuote[];
  /** Melhor flip para o Black Market com lucro positivo (com o Premium escolhido), ou null. */
  flip: FlipResumo | null;
  semDado: boolean;
}

export function resumoPreco(item: ItemResponse, premium: boolean): ResumoPreco {
  const linhas = sortCities(item.cities);
  const top = sortFlips(item.flips, premium)[0];
  let flip: FlipResumo | null = null;
  if (top) {
    const v = flipView(top, premium);
    if (v.profit > 0) flip = { flip: top, lucro: v.profit, roi: v.roi, velho: flipIsStale(top) };
  }
  return {
    melhor: cheapestReliable(item.cities),
    linhas,
    flip,
    semDado: !item.cities.some((c) => c.sellMin !== null || c.buyMax !== null),
  };
}

export const SITE = API_BASE;

export function urlItemNoSite(id: string, q: Quality | number = 1): string {
  return `${SITE}/item/${encodeURIComponent(id)}${q > 1 ? `?q=${q}` : ''}`;
}

export function urlJogadorNoSite(id: string): string {
  return `${SITE}/jogador/${encodeURIComponent(id)}`;
}

export interface Recente {
  id: string;
  nome: string;
}

/** Põe o item no topo da lista de recentes, sem repetir, até `max`. */
export function lembrarRecente(lista: Recente[], item: Recente, max = 6): Recente[] {
  return [item, ...lista.filter((r) => r.id !== item.id)].slice(0, max);
}

/** Lê a lista de recentes salva (localStorage pode faltar ou estar estragado). */
export function lerRecentes(raw: string | null): Recente[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((r): r is Recente => !!r && typeof r.id === 'string' && typeof r.nome === 'string' && /^[A-Z0-9_@]{3,80}$/.test(r.id))
      .slice(0, 6);
  } catch {
    return [];
  }
}
