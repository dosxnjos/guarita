import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, type Fetcher } from '../src/lib/api';

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createApi', () => {
  it('monta a URL na API pública, põe o id em maiúsculas e usa o cache', async () => {
    const f = vi.fn<Fetcher>(async () => ok({ id: 'T4_BAG' }));
    let t = 0;
    const api = createApi({ fetcher: f, now: () => t });
    const a = await api.item('t4_bag', 2);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://guarita.pages.dev/api/item/T4_BAG?q=2');
    expect(a.fromCache).toBe(false);
    t = 30_000;
    expect((await api.item('T4_BAG', 2)).fromCache).toBe(true);
    t = 61_000;
    await api.item('T4_BAG', 2);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('uma requisição em voo por URL', async () => {
    const f = vi.fn<Fetcher>(async () => ok({ now: 'x' }));
    const api = createApi({ fetcher: f });
    await Promise.all([api.clock(), api.clock(), api.clock()]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('erro HTTP vira ApiError com a mensagem da API', async () => {
    const api = createApi({ fetcher: async () => ok({ error: 'Id de item inválido.' }, 400) });
    await expect(api.item('x')).rejects.toMatchObject({ name: 'ApiError', status: 400, kind: 'http', message: 'Id de item inválido.' });
  });

  it('timeout aborta e explica em PT-BR', async () => {
    const f: Fetcher = (_u, init) =>
      new Promise((_ok, fail) => init?.signal?.addEventListener('abort', () => fail(new DOMException('abort', 'AbortError'))));
    const api = createApi({ fetcher: f, timeoutMs: 20 });
    const e = await api.clock().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).kind).toBe('timeout');
  });

  it('corpo que trava depois dos cabeçalhos também cai no timeout e libera a URL', async () => {
    // O plugin-http resolve com os cabeçalhos; o corpo vem por stream, sem prazo próprio.
    let chamadas = 0;
    const f: Fetcher = async () => {
      chamadas++;
      if (chamadas === 1) return { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response;
      return ok({ now: 'x' });
    };
    const api = createApi({ fetcher: f, timeoutMs: 20 });
    const e = await api.clock().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).kind).toBe('timeout');
    // A promessa travada não ficou presa no `inflight`: a próxima chamada vai à rede de novo.
    expect((await api.clock()).data).toEqual({ now: 'x' });
    expect(chamadas).toBe(2);
  });

  it('prices junta ids sem repetir e recusa lista vazia', async () => {
    const f = vi.fn<Fetcher>(async () => ok({ fetchedAt: 'x', rows: [] }));
    const api = createApi({ fetcher: f });
    await api.prices({ ids: ['t4_bag', 'T4_BAG', 'T5_BAG'], cities: ['Caerleon', 'Black Market'], qualities: [1, 2] });
    expect(f.mock.calls[0][0]).toBe('https://guarita.pages.dev/api/prices?ids=T4_BAG%2CT5_BAG&cities=Caerleon%2CBlack%20Market&q=1,2');
    await expect(api.prices({ ids: [] })).rejects.toBeInstanceOf(ApiError);
  });
});
