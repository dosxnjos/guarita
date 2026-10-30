// Apoio aos testes do módulo (b): fixtures reais (capturadas por curl em 29/10/2026), fetch falso por URL e
// Cache API falsa em memória. Nada de rede de verdade nos testes.
import { vi } from 'vitest';

// O tsconfig não carrega @types/node (o código roda em Workers); o fs entra só aqui, tipado à mão.
const NODE_FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(p: URL, enc: 'utf8'): string };

function readFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFixture(name).replace(/^﻿/, '')) as T;
}

export interface Call { url: string; headers: Record<string, string> }

/** Troca o fetch global: `route(url)` devolve a Response (ou lança). Guarda as chamadas. */
export function mockFetch(route: (url: string) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const h = new Headers(init?.headers);
    const headers: Record<string, string> = {};
    h.forEach((v, k) => (headers[k] = v));
    calls.push({ url, headers });
    return route(url);
  });
  return calls;
}

export function jsonRes(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** Cache API mínima (match/put por URL), instalada em globalThis.caches.default. */
export function mockCaches(): Map<string, Response> {
  const store = new Map<string, Response>();
  const cache = {
    async match(req: RequestInfo | URL) {
      const r = store.get(String(req instanceof Request ? req.url : req));
      return r ? r.clone() : undefined;
    },
    async put(req: RequestInfo | URL, res: Response) {
      store.set(String(req instanceof Request ? req.url : req), res.clone());
    },
  };
  vi.stubGlobal('caches', { default: cache });
  return store;
}

/** Responde às rotas do AODP com as fixtures de T4_BAG. */
export function aodpFixtureRoute(url: string): Response {
  const u = new URL(url);
  if (u.pathname.includes('/prices/')) return jsonRes(fixture('prices.json'));
  if (u.pathname.includes('/history/')) return jsonRes(fixture('history.json'));
  if (u.pathname.includes('/orderbook/')) return jsonRes(fixture('orderbook.json'));
  if (u.pathname.endsWith('/gold.json')) return jsonRes(fixture('gold.json'));
  if (u.pathname.endsWith('/festivities')) return jsonRes(fixture('festivities.json'));
  if (u.hostname === 'serverstatus.albiononline.com') return new Response(readFixture('serverstatus.json'), { status: 200 });
  return new Response('not found', { status: 404 });
}
