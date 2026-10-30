// Cliente tipado da API (contrato em shared/types.ts). Telas importam daqui, nunca fetch direto.
import type { AlertRule, AutopsyResponse, ClockResponse, ItemResponse, PlayerDossier, PlayerSearchResponse, Quality, BookFillResponse, City } from '../../shared/types';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { accept: 'application/json' } });
  const body = await r.json().catch(() => ({ error: 'resposta inválida' }));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `erro ${r.status}`);
  return body as T;
}
async function send<T>(method: 'POST' | 'DELETE', path: string, data?: unknown): Promise<T> {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const body = await r.json().catch(() => ({ error: 'resposta inválida' }));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `erro ${r.status}`);
  return body as T;
}

export const api = {
  item: (id: string, q: Quality = 1) => get<ItemResponse>(`/api/item/${encodeURIComponent(id)}?q=${q}`),
  bookFill: (id: string, city: City, side: 'buy' | 'sell', n: number, q: Quality = 1) =>
    get<BookFillResponse>(`/api/book/${encodeURIComponent(id)}?city=${encodeURIComponent(city)}&side=${side}&n=${n}&q=${q}`),
  clock: () => get<ClockResponse>('/api/clock'),
  searchPlayers: (q: string) => get<PlayerSearchResponse>(`/api/player/search?q=${encodeURIComponent(q)}`),
  dossier: (id: string) => get<PlayerDossier>(`/api/player/${encodeURIComponent(id)}`),
  autopsy: (id: string) => get<AutopsyResponse>(`/api/player/${encodeURIComponent(id)}/autopsy`),
  alerts: (owner: string) => get<{ alerts: AlertRule[] }>(`/api/alerts?owner=${encodeURIComponent(owner)}`),
  createAlert: (rule: Omit<AlertRule, 'id' | 'createdAt' | 'lastFiredAt'>) => send<AlertRule>('POST', '/api/alerts', rule),
  deleteAlert: (owner: string, id: string) => send<{ ok: boolean }>('DELETE', `/api/alerts/${encodeURIComponent(id)}?owner=${encodeURIComponent(owner)}`),
};
