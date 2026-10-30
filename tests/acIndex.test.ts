import { describe, expect, it } from 'vitest';
import { acLabel, acSearch, parseAcQuery } from '../worker/lib/acIndex';
import type { Env } from '../worker/env';
import { readPublic } from './helpers/public';

// ASSETS falso que serve public/ do disco (as fatias geradas por scripts/build-items.mjs).
const env = {
  ASSETS: {
    fetch: async (req: Request) => {
      const body = readPublic(new URL(req.url).pathname);
      return body == null ? new Response('não achei', { status: 404 }) : new Response(body);
    },
  },
} as unknown as Env;

describe('acIndex (busca barata do bot)', () => {
  it('lê tier e encantamento da consulta', () => {
    expect(parseAcQuery('bolsa adepto 4.1')).toEqual({ words: ['bolsa'], exact: ['t4', 't4', 'e1'] });
    expect(parseAcQuery('T6 espada')).toEqual({ words: ['espada'], exact: ['t6'] });
  });
  it('acha a bolsa do adepto e as variantes', async () => {
    const hits = await acSearch(env, 'bolsa adepto', 5);
    expect(hits[0]).toEqual({ id: 'T4_BAG', label: 'Bolsa do Adepto (T4)' });
    expect(hits.map((h) => h.id)).toContain('T4_BAG@1');
  });
  it('filtra encantamento', async () => {
    const hits = await acSearch(env, 'bolsa t4.2', 5);
    expect(hits[0].id).toBe('T4_BAG@2');
  });
  it('aceita nome em inglês', async () => {
    expect((await acSearch(env, "elder's bag", 3))[0].id).toBe('T8_BAG');
  });
  it('aceita o id digitado direto', async () => {
    expect(await acSearch(env, 't4_bag@1', 5)).toEqual([{ id: 'T4_BAG@1', label: 'Bolsa do Adepto (T4.1)' }]);
  });
  it('consulta curta demais não busca', async () => {
    expect(await acSearch(env, 'bo', 5)).toEqual([]);
  });
  it('resolve rótulo pelo id', async () => {
    expect(await acLabel(env, 't4_bag@1')).toBe('Bolsa do Adepto (T4.1)');
    expect(await acLabel(env, 'T4_NAO_EXISTE')).toBeNull();
  });
});
