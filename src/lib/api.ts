// Cliente tipado da API (contrato em shared/types.ts). Telas importam daqui, nunca fetch direto.
import type { AlertRule, AutopsyResponse, ClockResponse, ItemResponse, PlayerDossier, PlayerSearchResponse, Quality, BookFillResponse, City, LossesResponse, GuildSummary, GuildSearchResponse, RiskQuote, GoldResponse, DataHealthResponse, Timer, TimerKind, HojeResponse, ForecastResponse } from '../../shared/types';
import { currentLocale } from './i18n/core';

/** Erro da API com o status HTTP (a tela decide pelo status, ex.: 404 de inscrição que sumiu). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Mensagens próprias do cliente na língua do site (espelho de i18n/core: sem runes, o app de PC importa este arquivo).
// O `error` que vem do servidor passa como veio.
const invalid = () => (currentLocale() === 'es' ? 'respuesta no válida' : 'resposta inválida');
const failed = (status: number) => (currentLocale() === 'es' ? `error ${status}` : `erro ${status}`);

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { accept: 'application/json' } });
  const body = await r.json().catch(() => ({ error: invalid() }));
  if (!r.ok) throw new ApiError((body as { error?: string }).error ?? failed(r.status), r.status);
  return body as T;
}
async function send<T>(method: 'POST' | 'DELETE', path: string, data?: unknown): Promise<T> {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const body = await r.json().catch(() => ({ error: invalid() }));
  if (!r.ok) throw new ApiError((body as { error?: string }).error ?? failed(r.status), r.status);
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
  // Fase 2
  losses: (days = 1) => get<LossesResponse>(`/api/losses?days=${days}`),
  guild: (name: string) => get<GuildSummary>(`/api/guild/${encodeURIComponent(name)}`),
  searchGuilds: (q: string) => get<GuildSearchResponse>(`/api/guilds?q=${encodeURIComponent(q)}`),
  risk: (items: { id: string; quality: Quality }[]) => send<RiskQuote>('POST', '/api/risk', { items }),
  gold: (days = 30) => get<GoldResponse>(`/api/gold?days=${days}`),
  dataHealth: () => get<DataHealthResponse>('/api/data-health'),
  timers: (owner: string) => get<{ timers: Timer[] }>(`/api/timers?owner=${encodeURIComponent(owner)}`),
  createTimer: (t: { owner: string; kind: TimerKind; label: string; endsAt: string }) => send<Timer>('POST', '/api/timers', t),
  deleteTimer: (owner: string, id: string) => send<{ ok: boolean }>('DELETE', `/api/timers/${encodeURIComponent(id)}?owner=${encodeURIComponent(owner)}`),
  // Fase 3
  /** `lang` 'es' pede os textos (passos, riscos, notas, nomes) em espanhol; sem ele, a URL é a mesma de antes (pt). */
  hoje: (prata: number, minutos: number, premium: boolean, lang: ApiLang = 'pt') =>
    get<HojeResponse>(`/api/hoje?prata=${prata}&minutos=${minutos}&premium=${premium ? 1 : 0}${langParam(lang)}`),
  /** `city` null = a API escolhe a cidade com mais unidades vendidas nos últimos 14 dias (sem Black Market). */
  forecast: (id: string, city: City | null, q: Quality = 1, lang: ApiLang = 'pt') =>
    get<ForecastResponse>(`/api/forecast/${encodeURIComponent(id)}?city=${encodeURIComponent(city ?? '')}&q=${q}${langParam(lang)}`),
};

/** Língua dos textos que a API devolve (só /api/hoje e /api/forecast por enquanto). */
export type ApiLang = 'pt' | 'es';
/** "&lang=es" só para espanhol: a URL em pt não muda (mesmo cache do navegador de antes). */
export function langParam(lang: ApiLang | undefined): string {
  return lang === 'es' ? '&lang=es' : '';
}
