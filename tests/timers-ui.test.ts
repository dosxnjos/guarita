// Despertador (módulo f): presets e cálculos da tela (src/lib/timers/presets.ts) e a rota /api/timers do Pages.
import { describe, expect, it, vi } from 'vitest';
import {
  FARM_BABY_MIN, FOCUS_MAX, MAX_MINUTES, MOUNT_BABY_MIN, PLANT_MIN, PRESETS, defaultTimerForm, endsAtFrom, fmtDuration,
  focusFullMinutes, formDuration, formLabel, parseNumberBR, presetById, splitTimers, type TimerFormState,
} from '../src/lib/timers/presets';
import { handleTimers, pickTimerBody, SUB_GONE_ERROR, upstreamStatus } from '../worker/api/timers';
import { isSubGone } from '../src/lib/push';
import type { Env } from '../worker/env';

const form = (over: Partial<TimerFormState>): TimerFormState => ({ ...defaultTimerForm(), ...over });

describe('tempos-padrão (ao-bin-dumps)', () => {
  it('plantação 22 h, filhote de granja 44 h, montaria por tier', () => {
    expect(PLANT_MIN).toBe(79200 / 60);
    expect(FARM_BABY_MIN).toBe(158400 / 60);
    expect(MOUNT_BABY_MIN).toEqual({ 3: 2640, 4: 5520, 5: 8400, 6: 11280, 7: 14160, 8: 17040 });
    expect(MOUNT_BABY_MIN[8]).toBe(1022400 / 60);
    // todos cabem no limite de 30 dias do servidor
    for (const m of Object.values(MOUNT_BABY_MIN)) expect(m).toBeLessThanOrEqual(MAX_MINUTES);
    expect(presetById('plantacao').minutes).toBe(22 * 60);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

describe('focusFullMinutes', () => {
  it('Premium: 10.000 por dia, arredondado para cima', () => {
    expect(focusFullMinutes(0, true)).toEqual({ ok: true, minutes: 72 * 60 });
    expect(focusFullMinutes(20_000, true)).toEqual({ ok: true, minutes: 24 * 60 });
    expect(focusFullMinutes(29_999, true)).toEqual({ ok: true, minutes: 1 }); // 0,144 min → 1
    expect(focusFullMinutes(12_345, true)).toEqual({ ok: true, minutes: Math.ceil((17_655 / 10_000) * 1440) });
  });

  it('sem Premium não regenera; cheio e inválido', () => {
    expect(focusFullMinutes(1000, false)).toEqual({ ok: false, reason: 'sem-premium' });
    expect(focusFullMinutes(FOCUS_MAX, true)).toEqual({ ok: false, reason: 'cheio' });
    expect(focusFullMinutes(null, true)).toEqual({ ok: false, reason: 'invalido' });
    expect(focusFullMinutes(-1, true)).toEqual({ ok: false, reason: 'invalido' });
    expect(focusFullMinutes(40_000, true)).toEqual({ ok: false, reason: 'invalido' });
  });
});

describe('parseNumberBR', () => {
  it('lê milhar com ponto e decimal com vírgula', () => {
    expect(parseNumberBR('12.500')).toBe(12500);
    expect(parseNumberBR('12500')).toBe(12500);
    expect(parseNumberBR('1.234.567')).toBe(1234567);
    expect(parseNumberBR('1,5')).toBe(1.5);
    expect(parseNumberBR(' 30 ')).toBe(30);
    expect(parseNumberBR('')).toBeNull();
    expect(parseNumberBR('abc')).toBeNull();
    expect(parseNumberBR(null)).toBeNull();
  });
});

describe('formDuration e formLabel', () => {
  it('presets fixos e montaria por tier', () => {
    expect(formDuration(form({ preset: 'plantacao' }))).toEqual({ ok: true, minutes: 1320 });
    expect(formDuration(form({ preset: 'filhote-granja' }))).toEqual({ ok: true, minutes: 2640 });
    expect(formDuration(form({ preset: 'filhote-montaria', tier: 6 }))).toEqual({ ok: true, minutes: 11280 });
    expect(formDuration(form({ preset: 'filhote-montaria', tier: 2 })).ok).toBe(false);
  });

  it('foco cheio a partir do foco atual', () => {
    expect(formDuration(form({ preset: 'foco', focus: '20.000', premium: true }))).toEqual({ ok: true, minutes: 1440 });
    const sem = formDuration(form({ preset: 'foco', focus: '100', premium: false }));
    expect(sem.ok === false && sem.error).toMatch(/Sem Premium/);
    const cheio = formDuration(form({ preset: 'foco', focus: '30000' }));
    expect(cheio.ok === false && cheio.error).toMatch(/já está cheio/);
    expect(formDuration(form({ preset: 'foco', focus: '' })).ok).toBe(false);
  });

  it('tempo livre: horas e minutos inteiros, de 1 min a 30 dias', () => {
    expect(formDuration(form({ preset: 'livre', hours: '1', minutes: '30' }))).toEqual({ ok: true, minutes: 90 });
    expect(formDuration(form({ preset: 'livre', hours: '', minutes: '5' }))).toEqual({ ok: true, minutes: 5 });
    expect(formDuration(form({ preset: 'livre', hours: '720', minutes: '' }))).toEqual({ ok: true, minutes: MAX_MINUTES });
    expect(formDuration(form({ preset: 'livre', hours: '720', minutes: '1' })).ok).toBe(false);
    expect(formDuration(form({ preset: 'livre', hours: '0', minutes: '0' })).ok).toBe(false);
    expect(formDuration(form({ preset: 'livre', hours: '1,5', minutes: '' })).ok).toBe(false);
    expect(formDuration(form({ preset: 'livre', hours: '-1', minutes: '' })).ok).toBe(false);
    expect(formDuration(form({ preset: 'livre' })).ok).toBe(false);
  });

  it('rótulo digitado (limpo e cortado) ou o do preset', () => {
    expect(formLabel(form({ preset: 'plantacao' }))).toBe('Plantação');
    expect(formLabel(form({ preset: 'filhote-montaria', tier: 5 }))).toBe('Filhote de montaria T5');
    expect(formLabel(form({ preset: 'livre' }))).toBe('Despertador');
    expect(formLabel(form({ label: '  Ilha\n de  Martlock ' }))).toBe('Ilha de Martlock');
    expect(formLabel(form({ label: 'x'.repeat(100) }))).toHaveLength(60);
  });
});

describe('utilidades da lista', () => {
  it('endsAtFrom, fmtDuration e splitTimers', () => {
    expect(endsAtFrom(90, Date.parse('2026-10-30T12:00:00Z'))).toBe('2026-10-30T13:30:00.000Z');
    expect(fmtDuration(1320)).toBe('22 h');
    expect(fmtDuration(90)).toBe('1 h 30 min');
    expect(fmtDuration(45)).toBe('45 min');
    expect(fmtDuration(17040)).toBe('11 d 20 h');
    expect(fmtDuration(2880)).toBe('2 d');
    const list = [
      { id: 'a', endsAt: '2026-10-31T00:00:00Z' },
      { id: 'b', endsAt: '2026-10-30T13:00:00Z' },
      { id: 'c', endsAt: '2026-10-29T00:00:00Z', firedAt: '2026-10-29T00:00:01Z' },
      { id: 'd', endsAt: '2026-10-29T05:00:00Z', firedAt: '2026-10-29T05:00:01Z' },
    ];
    const s = splitTimers(list);
    expect(s.pending.map((t) => t.id)).toEqual(['b', 'a']);
    expect(s.fired.map((t) => t.id)).toEqual(['d', 'c']);
  });
});

// ---------- rota /api/timers ----------

interface Calls { hub: string[]; timers: { name: string; url: string; init?: RequestInit }[] }

function makeEnv(opts: { hubStatus?: number; doStatus?: number; doBody?: unknown } = {}) {
  const calls: Calls = { hub: [], timers: [] };
  const env = {
    HUB: {
      idFromName: (n: string) => n,
      get: () => ({
        fetch: async (url: string) => {
          calls.hub.push(url);
          const status = opts.hubStatus ?? 200;
          return Response.json(status === 404 ? { error: 'inscrição não encontrada' } : { id: 'x', endpoint: 'segredo', p256dh: 'k', auth: 'a' }, { status });
        },
      }),
    },
    TIMERS: {
      idFromName: (n: string) => `id:${n}`,
      get: (id: string) => ({
        fetch: async (url: string, init?: RequestInit) => {
          calls.timers.push({ name: id, url, init });
          return Response.json(opts.doBody ?? { ok: true }, { status: opts.doStatus ?? 200 });
        },
      }),
    },
  } as unknown as Env;
  return { env, calls };
}

const OWNER = 'abc_DEF-123';
const req = (method: string, path: string, body?: unknown) =>
  new Request('https://guarita.pages.dev' + path, { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const run = (env: Env, r: Request) => handleTimers(r, new URL(r.url), env);

describe('handleTimers', () => {
  it('ignora rotas de outros módulos', async () => {
    const { env } = makeEnv();
    expect(await run(env, req('GET', '/api/timersx'))).toBeNull();
    expect(await run(env, req('GET', '/api/alerts'))).toBeNull();
  });

  it('POST: confere o dono no Hub e repassa só os campos do contrato ao DO do dono', async () => {
    const created = { id: 't1', owner: OWNER, kind: 'plantacao', label: 'Ilha', endsAt: '2026-10-31T10:00:00.000Z', createdAt: 'x' };
    const { env, calls } = makeEnv({ doStatus: 201, doBody: created });
    const r = await run(env, req('POST', '/api/timers', { owner: OWNER, kind: 'plantacao', label: 'Ilha', endsAt: created.endsAt, extra: 'fora' }));
    expect(r?.status).toBe(201);
    expect(r?.headers.get('Cache-Control')).toBe('no-store');
    expect(await r?.json()).toEqual(created);
    expect(calls.hub).toEqual([`https://hub/push/sub/${OWNER}`]);
    expect(calls.timers[0].name).toBe(`id:${OWNER}`);
    expect(calls.timers[0].url).toBe('https://timers/timers');
    expect(JSON.parse(String(calls.timers[0].init?.body))).toEqual({ owner: OWNER, kind: 'plantacao', label: 'Ilha', endsAt: created.endsAt });
  });

  it('POST: inscrição inexistente → 404 que o front reconhece como "sumiu"', async () => {
    const { env, calls } = makeEnv({ hubStatus: 404 });
    const r = await run(env, req('POST', '/api/timers', { owner: OWNER, endsAt: 'x' }));
    expect(r?.status).toBe(404);
    const body = (await r?.json()) as { error: string };
    expect(body.error).toBe(SUB_GONE_ERROR);
    expect(isSubGone({ status: 404, message: body.error })).toBe(true);
    expect(calls.timers).toHaveLength(0);
  });

  it('POST: JSON quebrado, sem dono e corpo grande', async () => {
    const { env } = makeEnv();
    expect((await run(env, req('POST', '/api/timers', '{')))?.status).toBe(400);
    expect((await run(env, req('POST', '/api/timers', { owner: 'a b' })))?.status).toBe(400);
    expect((await run(env, req('POST', '/api/timers', { owner: OWNER, label: 'x'.repeat(5000) })))?.status).toBe(413);
  });

  it('POST: erro de validação do DO passa; 5xx vira 502', async () => {
    const v = makeEnv({ doStatus: 400, doBody: { error: 'o despertador precisa tocar daqui a pelo menos 1 minuto' } });
    const r = await run(v.env, req('POST', '/api/timers', { owner: OWNER, endsAt: 'x' }));
    expect(r?.status).toBe(400);
    expect(((await r?.json()) as { error: string }).error).toMatch(/1 minuto/);
    const f = makeEnv({ doStatus: 500, doBody: { error: 'erro interno do despertador' } });
    expect((await run(f.env, req('POST', '/api/timers', { owner: OWNER, endsAt: 'x' })))?.status).toBe(502);
    const h = makeEnv({ hubStatus: 500 });
    expect((await run(h.env, req('POST', '/api/timers', { owner: OWNER, endsAt: 'x' })))?.status).toBe(502);
  });

  it('GET: lista do DO do dono, sem nada da inscrição', async () => {
    const { env, calls } = makeEnv({ doBody: { timers: [] } });
    const r = await run(env, req('GET', `/api/timers?owner=${OWNER}`));
    expect(r?.status).toBe(200);
    const text = await r?.text();
    expect(text).toBe('{"timers":[]}');
    expect(text).not.toContain('segredo');
    expect(calls.timers[0].url).toBe(`https://timers/timers?owner=${OWNER}`);
    expect((await run(env, req('GET', '/api/timers')))?.status).toBe(400);
  });

  it('DELETE: valida id e dono e repassa', async () => {
    const { env, calls } = makeEnv();
    const r = await run(env, req('DELETE', `/api/timers/t1?owner=${OWNER}`));
    expect(r?.status).toBe(200);
    expect(calls.timers[0].url).toBe(`https://timers/timers/t1?owner=${OWNER}`);
    expect(calls.timers[0].init?.method).toBe('DELETE');
    expect((await run(env, req('DELETE', '/api/timers/t1')))?.status).toBe(400);
    expect((await run(env, req('DELETE', `/api/timers/a%20b?owner=${OWNER}`)))?.status).toBe(400);
    expect((await run(env, req('PUT', '/api/timers')))?.status).toBe(405);
  });

  it('guarda por 1 min se o dono existe ou sumiu: repetir não volta ao Hub; a URL do cache não leva o id cru', async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal('caches', {
      default: {
        match: async (k: string) => store.get(k)?.clone(),
        put: async (k: string, r: Response) => void store.set(k, r),
      },
    });
    try {
      const ok = makeEnv({ doBody: { timers: [] } });
      await run(ok.env, req('GET', `/api/timers?owner=${OWNER}`));
      await run(ok.env, req('GET', `/api/timers?owner=${OWNER}`));
      expect(ok.calls.hub).toHaveLength(1);
      expect(ok.calls.timers).toHaveLength(2);
      expect([...store.keys()].some((k) => k.includes(OWNER))).toBe(false);
      const gone = makeEnv({ hubStatus: 404 });
      const other = 'outro_dono_1';
      expect((await run(gone.env, req('GET', `/api/timers?owner=${other}`)))?.status).toBe(404);
      const again = await run(gone.env, req('GET', `/api/timers?owner=${other}`));
      expect(again?.status).toBe(404);
      expect(((await again?.json()) as { error: string }).error).toBe(SUB_GONE_ERROR);
      expect(gone.calls.hub).toHaveLength(1);
      // erro do Hub (5xx) não é guardado
      const bad = makeEnv({ hubStatus: 500 });
      await run(bad.env, req('GET', '/api/timers?owner=terceiro_1'));
      await run(bad.env, req('GET', '/api/timers?owner=terceiro_1'));
      expect(bad.calls.hub).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('auxiliares puros', () => {
    expect(upstreamStatus(404)).toBe(404);
    expect(upstreamStatus(503)).toBe(502);
    expect(pickTimerBody(null)).toBeNull();
    expect(pickTimerBody({ owner: OWNER, kind: 'foco', x: 1 })).toEqual({ owner: OWNER, kind: 'foco', label: undefined, endsAt: undefined });
  });
});
