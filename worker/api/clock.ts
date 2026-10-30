// Módulo (b): /api/clock. Também exporta getClock para o bot.
// Junta status do servidor, festividades (ativas ou nas próximas 48 h), ouro e temporada. Cada fonte falha
// sozinha: o relógio sempre responde, com 'desconhecido' ou 'sem dado' onde faltou.
import type { Env } from '../env';
import type { ClockResponse, Festivity } from '../../shared/types';
import { PREMIUM_30D_GOLD, SEASON, SERVER_STATUS_URL } from '../../shared/market';
import { festivityLabelPt } from '../../shared/festivities';
import { median } from '../../shared/confidence';
import { aodpFestivities, aodpGold, USER_AGENT, type FestivityRaw } from '../lib/aodp';
import { cachedJsonMeta } from '../lib/cache';
import { json } from '../lib/respond';

const STATUS_TTL = 60;
const STATUS_TIMEOUT_MS = 8000;
const UPCOMING_MS = 48 * 3600_000;
const GOLD_POINTS = 720; // 30 dias de pontos horários

type ServerStatus = ClockResponse['server'];
type Gold = ClockResponse['gold'];

// ---------- lógica pura (exportada para teste) ----------

/** {"status":"online","message":"..."} → status do contrato. Mensagem com "maintenance" vence. */
export function normalizeStatus(raw: unknown): { status: ServerStatus['status']; message: string } {
  const o = (raw ?? {}) as { status?: unknown; message?: unknown };
  const message = typeof o.message === 'string' ? o.message : '';
  const s = typeof o.status === 'string' ? o.status.toLowerCase() : '';
  if (/maintenance|manuten/i.test(message) || s.includes('maintenance')) return { status: 'manutenção', message };
  if (s === 'online') return { status: 'online', message };
  if (s === 'offline') return { status: 'offline', message };
  return { status: 'desconhecido', message };
}

/** O endpoint de status às vezes vem com BOM ou espaço antes do JSON. */
export function parseStatusText(text: string): unknown {
  return JSON.parse(text.replace(/^﻿/, '').trim());
}

/** Só festividades ativas agora ou que começam nas próximas 48 h, em ordem de início. */
export function filterFestivities(events: FestivityRaw[], now: number): Festivity[] {
  return events
    .filter((e) => {
      const start = Date.parse(e.start);
      const end = Date.parse(e.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now) return false;
      return start <= now + UPCOMING_MS;
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.kind - b.kind)
    .map((e) => ({ kind: e.kind, category: e.category, name: e.name, labelPt: festivityLabelPt(e.kind, e.category, e.name), start: e.start, end: e.end }));
}

function mean(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / v.length;
}

/** Ouro: último preço, mediana de 30 dias (720 h) e tendência pela média de 24 h contra a de 7 dias (faixa de 1%). */
export function summarizeGold(points: { price: number; at: string }[]): Gold {
  const sorted = [...points].sort((a, b) => b.at.localeCompare(a.at)); // mais recente primeiro
  if (!sorted.length) return { price: null, at: null, p30: null, trend: 'sem dado' };
  const last = sorted[0];
  const p30 = median(sorted.slice(0, GOLD_POINTS).map((p) => p.price));
  let trend: Gold['trend'] = 'sem dado';
  if (sorted.length >= 48) {
    const day = mean(sorted.slice(0, 24).map((p) => p.price));
    const week = mean(sorted.slice(0, 168).map((p) => p.price));
    const d = day / week - 1;
    trend = d > 0.01 ? 'subindo' : d < -0.01 ? 'caindo' : 'estável';
  }
  return { price: last.price, at: last.at, p30: p30 === null ? null : Math.round(p30), trend };
}

// ---------- fontes ----------

async function serverStatus(ctx: ExecutionContext | undefined): Promise<ServerStatus> {
  try {
    const r = await cachedJsonMeta('status/server', STATUS_TTL, ctx, async () => {
      const res = await fetch(SERVER_STATUS_URL, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return normalizeStatus(parseStatusText(await res.text()));
    });
    return { ...r.data, checkedAt: r.at };
  } catch (err) {
    console.warn('relógio: status do servidor indisponível', String(err));
    return { status: 'desconhecido', message: 'Não foi possível consultar o status do servidor.', checkedAt: new Date().toISOString() };
  }
}

export async function getClock(_env: Env, ctx: ExecutionContext): Promise<ClockResponse> {
  const now = Date.now();
  const [server, fest, gold] = await Promise.all([
    serverStatus(ctx),
    aodpFestivities(ctx).catch((e) => { console.warn('relógio: festividades indisponíveis', String(e)); return [] as FestivityRaw[]; }),
    aodpGold(GOLD_POINTS, ctx).catch((e) => { console.warn('relógio: ouro indisponível', String(e)); return [] as { price: number; at: string }[]; }),
  ]);
  const g = summarizeGold(gold);
  return {
    now: new Date(now).toISOString(),
    server,
    festivities: filterFestivities(fest, now),
    gold: g,
    premiumSilver: g.price === null ? null : Math.round(PREMIUM_30D_GOLD * g.price),
    season: { name: SEASON.name, end: SEASON.end, approx: true },
  };
}

export async function routeClock(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  if (url.pathname !== '/api/clock' && url.pathname !== '/api/clock/') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'método não permitido' }, 405, 0, { Allow: 'GET, HEAD' });
  }
  try {
    return json(await getClock(env, ctx), 200, 120);
  } catch (err) {
    console.error('relógio: erro inesperado', err);
    return json({ error: 'Não foi possível montar o relógio agora.' }, 502);
  }
}
