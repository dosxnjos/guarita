import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClockResponse, Festivity } from '../../shared/types';
import type { GuaritaApi } from '../src/lib/api';
import { defaultConfig, type GuaritaConfig, type TimerLocal } from '../src/lib/config';
import { avisoRelogio, compararRelogio, criarMotorRelogio, eventoLigado, filtrarJaAvisados } from '../src/lib/engine/clock';
import { atrasoMin, avisoTimer, avisoTimersFechados, criarMotorTimers, esperaAte, MAX_ATRASO_TIMEOUT, proximoTimer, VARREDURA_MS, vencidos } from '../src/lib/engine/timers';
import type { Aviso } from '../src/lib/notify';

const NOW = Date.parse('2026-10-30T15:00:00Z'); // 12:00 em Brasília
const iso = (ms: number) => new Date(ms).toISOString();

const timer = (id: string, endsAt: number, p: Partial<TimerLocal> = {}): TimerLocal => ({
  id,
  kind: 'plantacao',
  label: `Horta ${id}`,
  endsAt: iso(endsAt),
  createdAt: iso(NOW - 3600_000),
  ...p,
});

describe('timers: funções puras', () => {
  const ts = [timer('a', NOW + 10 * 60000), timer('b', NOW - 60000), timer('c', NOW - 5 * 60000, { firedAt: iso(NOW) })];
  it('próximo ignora os já disparados; vencidos vêm do mais antigo', () => {
    expect(proximoTimer(ts)?.id).toBe('b');
    expect(vencidos([...ts, timer('d', NOW - 120000)], NOW).map((t) => t.id)).toEqual(['d', 'b']);
  });
  it('espera até o próximo, limitada à varredura e ao máximo seguro do setTimeout', () => {
    expect(esperaAte([timer('a', NOW + 30_000)], NOW)).toBe(30_000);
    expect(esperaAte([timer('a', NOW - 1)], NOW)).toBe(0);
    expect(esperaAte([timer('a', NOW + 40 * 86400_000)], NOW)).toBe(VARREDURA_MS);
    expect(esperaAte([], NOW)).toBe(VARREDURA_MS);
    expect(VARREDURA_MS).toBeLessThan(MAX_ATRASO_TIMEOUT);
  });
  it('aviso diz quando venceu com o app fechado e quando chegou atrasado', () => {
    const t = timer('a', NOW - 90 * 60000);
    expect(atrasoMin(t, NOW)).toBe(90);
    const f = avisoTimer(t, NOW, true);
    expect(f.titulo).toBe('Plantação pronta');
    expect(f.corpo).toBe('Horta a: venceu às 10:30 (horário de Brasília), enquanto o app estava fechado.');
    expect(f.voz).toBe('Horta a: venceu enquanto o app estava fechado.');
    expect(avisoTimer(timer('b', NOW - 5 * 60000), NOW, false).voz).toBe('Horta b: venceu há cinco minutos.');
    const agora = avisoTimer(timer('c', NOW, { kind: 'foco', label: 'Foco recarregado' }), NOW, false);
    expect(agora).toMatchObject({ titulo: 'Foco recarregado', voz: 'Foco recarregado.', prioridade: 'alta' });
  });
});

describe('criarMotorTimers', () => {
  afterEach(() => vi.useRealTimers());

  it('ao abrir avisa os vencidos com o app fechado; depois avisa na hora com setTimeout; nunca repete', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let cfg: GuaritaConfig = { ...defaultConfig(), timers: [timer('velho', NOW - 3600_000), timer('novo', NOW + 2 * 60000)] };
    const avisos: Aviso[] = [];
    const marcar = vi.fn(async (id: string, quando: string) => {
      cfg = { ...cfg, timers: cfg.timers.map((t) => (t.id === id ? { ...t, firedAt: quando } : t)) };
    });
    const m = criarMotorTimers({ getConfig: () => cfg, avisar: async (a) => void avisos.push(a), marcarDisparo: marcar });
    m.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(avisos.map((a) => a.corpo)).toEqual([expect.stringContaining('enquanto o app estava fechado')]);
    await vi.advanceTimersByTimeAsync(2 * 60000);
    expect(avisos).toHaveLength(2);
    expect(avisos[1].corpo).toContain('venceu agora');
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(avisos).toHaveLength(2);
    expect(marcar).toHaveBeenCalledTimes(2);

    // Timer novo criado com o app aberto: reagendar pega.
    cfg = { ...cfg, timers: [...cfg.timers, timer('x', Date.now() + 30_000)] };
    m.reagendar();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(avisos).toHaveLength(3);
    m.parar();
  });

  it('timer vencido enquanto o painel estava preso (throttling) sai com "venceu há N min"', async () => {
    let t = NOW;
    const cfg = { ...defaultConfig(), timers: [timer('a', NOW + 60000)] };
    const avisos: Aviso[] = [];
    const m = criarMotorTimers({ getConfig: () => cfg, avisar: async (a) => void avisos.push(a), marcarDisparo: async () => {}, now: () => t });
    m.iniciar();
    m.parar(); // sem setTimeout: simula a acordada atrasada chamando conferir
    t = NOW + 6 * 60000;
    expect(await m.conferir()).toEqual(['a']);
    expect(avisos[0].voz).toBe('Horta a: venceu há cinco minutos.');
    expect(await m.conferir()).toEqual([]);
  });
});

// ---------- relógio ----------

const fest = (p: Partial<Festivity> = {}): Festivity => ({
  kind: 1,
  category: 'production',
  name: 'BEAST',
  labelPt: 'Bônus de produção: bestas',
  start: iso(NOW - 3600_000),
  end: iso(NOW + 3 * 3600_000),
  ...p,
});

const relogio = (p: Partial<ClockResponse> = {}, at = NOW): ClockResponse => ({
  now: iso(at),
  server: { status: 'online', message: '', checkedAt: iso(at) },
  festivities: [],
  gold: { price: null, at: null, p30: null, trend: 'sem dado' },
  premiumSilver: null,
  season: { name: 'Temporada 28', end: iso(NOW + 30 * 86400_000), approx: true },
  ...p,
});

describe('compararRelogio', () => {
  it('servidor: só transição; desconhecido e primeira leitura não avisam', () => {
    const off = { status: 'offline' as const, message: 'Manutenção semanal', checkedAt: iso(NOW) };
    expect(compararRelogio(relogio(), relogio({ server: off }), NOW)).toEqual([{ tipo: 'servidorCaiu', mensagem: 'Manutenção semanal', status: 'offline' }]);
    expect(compararRelogio(relogio({ server: off }), relogio(), NOW)).toEqual([{ tipo: 'servidorVoltou' }]);
    expect(compararRelogio(null, relogio({ server: off }), NOW)).toEqual([]);
    const desc = { status: 'desconhecido' as const, message: '', checkedAt: iso(NOW) };
    expect(compararRelogio(relogio(), relogio({ server: desc }), NOW)).toEqual([]);
    expect(compararRelogio(relogio({ server: desc }), relogio(), NOW)).toEqual([]);
  });

  it('bônus acabando: avisa ao entrar na janela de 30 min, uma vez só', () => {
    const f = fest({ end: iso(NOW + 25 * 60000) });
    const antes = relogio({ festivities: [f] }, NOW - 2 * 60000); // faltavam 27 min: já dentro
    const fora = relogio({ festivities: [f] }, NOW - 10 * 60000); // faltavam 35 min
    expect(compararRelogio(fora, relogio({ festivities: [f] }), NOW)).toEqual([{ tipo: 'bonusAcabando', festividade: f, faltamMin: 25 }]);
    expect(compararRelogio(antes, relogio({ festivities: [f] }), NOW)).toEqual([]);
    // Primeira leitura já dentro da janela: avisa (acabou de abrir o app).
    expect(compararRelogio(null, relogio({ festivities: [f] }), NOW)).toHaveLength(1);
  });

  it('festividade nova: ativa agora e não antes; primeira leitura não conta', () => {
    const f = fest();
    expect(compararRelogio(relogio(), relogio({ festivities: [f] }), NOW)).toEqual([{ tipo: 'festividadeNova', festividade: f }]);
    expect(compararRelogio(relogio({ festivities: [f] }), relogio({ festivities: [f] }), NOW)).toEqual([]);
    expect(compararRelogio(null, relogio({ festivities: [f] }), NOW)).toEqual([]);
    const futura = fest({ start: iso(NOW + 3600_000) });
    expect(compararRelogio(relogio(), relogio({ festivities: [futura] }), NOW)).toEqual([]);
  });

  it('temporada: avisa ao cruzar 7, 3 e 1 dia', () => {
    const season = (dias: number) => ({ name: 'Temporada 28', end: iso(NOW + dias * 86400_000), approx: true as const });
    expect(compararRelogio(null, relogio({ season: season(10) }), NOW)).toEqual([]);
    expect(compararRelogio(null, relogio({ season: season(6.5) }), NOW)).toMatchObject([{ tipo: 'temporadaAcabando', faltamDias: 7 }]);
    expect(compararRelogio(relogio({ season: season(6.5) }), relogio({ season: season(6.4) }), NOW)).toEqual([]);
    expect(compararRelogio(relogio({ season: season(3.01) }), relogio({ season: season(2.99) }), NOW)).toMatchObject([{ tipo: 'temporadaAcabando', faltamDias: 3 }]);
  });

  it('textos em horário de Brasília e respeito aos ajustes', () => {
    const f = fest({ end: iso(NOW + 25 * 60000) });
    const a = avisoRelogio({ tipo: 'bonusAcabando', festividade: f, faltamMin: 25 });
    expect(a.corpo).toBe('Bônus de produção: bestas termina em 25 min, às 12:25 (horário de Brasília).');
    expect(a.voz).toBe('Bônus de produção: bestas acaba em vinte e cinco minutos.');
    const cfg = defaultConfig();
    cfg.avisos.relogio.servidor = false;
    expect(eventoLigado({ tipo: 'servidorVoltou' }, cfg)).toBe(false);
    expect(eventoLigado({ tipo: 'festividadeNova', festividade: f }, cfg)).toBe(true);
  });
});

describe('criarMotorRelogio', () => {
  afterEach(() => vi.useRealTimers());
  it('lê ao abrir e a cada 2 min; avisa queda do servidor; avisos desligados não saem', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let status: ClockResponse['server']['status'] = 'online';
    const clock = vi.fn(async () => ({ data: relogio({ server: { status, message: '', checkedAt: iso(Date.now()) } }, Date.now()), at: Date.now(), fromCache: false }));
    const avisos: Aviso[] = [];
    let cfg = defaultConfig();
    const m = criarMotorRelogio({ api: { clock } as unknown as GuaritaApi, getConfig: () => cfg, avisar: async (a) => void avisos.push(a) });
    const lidos: string[] = [];
    m.onAtualizar((c) => lidos.push(c.server.status));
    m.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(clock).toHaveBeenCalledTimes(1);
    status = 'offline';
    await vi.advanceTimersByTimeAsync(2 * 60000);
    expect(avisos.map((a) => a.titulo)).toEqual(['Servidor fora do ar']);
    cfg = { ...cfg, avisos: { ...cfg.avisos, relogio: { ...cfg.avisos.relogio, servidor: false } } };
    status = 'online';
    await vi.advanceTimersByTimeAsync(2 * 60000);
    expect(avisos).toHaveLength(1);
    expect(lidos).toEqual(['online', 'offline', 'online']);
    expect(m.ultimo()?.server.status).toBe('online');
    m.parar();
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(clock).toHaveBeenCalledTimes(3);
  });

  it('uma checagem "desconhecido" no meio não engole a queda nem a volta do servidor', async () => {
    const seq: ClockResponse['server']['status'][] = ['online', 'desconhecido', 'manutenção', 'desconhecido', 'online'];
    let i = 0;
    let t = NOW;
    const clock = vi.fn(async () => {
      const status = seq[i++];
      t += 120_000;
      return { data: relogio({ server: { status, message: 'The server is down for maintenance.', checkedAt: iso(t) } }, t), at: t, fromCache: false };
    });
    const avisos: Aviso[] = [];
    const cfg = defaultConfig();
    const m = criarMotorRelogio({ api: { clock } as unknown as GuaritaApi, getConfig: () => cfg, avisar: async (a) => void avisos.push(a), now: () => t });
    for (let k = 0; k < seq.length; k++) await m.lerAgora();
    expect(avisos.map((a) => a.titulo)).toEqual(['Servidor em manutenção', 'Servidor de volta']);
    // A mensagem oficial em inglês não entra na notificação (fica no widget Relógio).
    expect(avisos[0].corpo).toBe('O servidor Americas entrou em manutenção.');
  });

  it('temporada e bônus acabando não se repetem a cada abertura do app', async () => {
    const t = NOW;
    const f = fest({ end: iso(NOW + 20 * 60000) });
    const leitura = relogio({ festivities: [f], season: { name: 'Temporada 28', end: iso(NOW + 5 * 86400_000), approx: true } });
    let cfg = defaultConfig();
    const abrir = async () => {
      const avisos: Aviso[] = [];
      const m = criarMotorRelogio({
        api: { clock: async () => ({ data: structuredClone(leitura), at: t, fromCache: false }) } as unknown as GuaritaApi,
        getConfig: () => cfg,
        avisar: async (a) => void avisos.push(a),
        marcarAvisos: async (dados) => void (cfg = { ...cfg, avisosRelogio: dados }),
        now: () => t,
      });
      await m.lerAgora();
      return avisos.map((a) => a.titulo);
    };
    expect(await abrir()).toEqual(['Bônus acabando', 'Temporada acabando']);
    expect(await abrir()).toEqual([]);
    expect(await abrir()).toEqual([]);
    expect(cfg.avisosRelogio.bonus).toHaveLength(1);
  });
});

describe('filtrarJaAvisados', () => {
  it('marco novo da temporada avisa de novo; bônus novo também', () => {
    const ev7 = { tipo: 'temporadaAcabando' as const, faltamDias: 6, nome: 'T', fim: '2026-11-09T00:00:00Z', marco: 7 };
    const ev3 = { ...ev7, faltamDias: 3, marco: 3 };
    const r1 = filtrarJaAvisados([ev7], { temporada: null, bonus: [] });
    expect(r1.novos).toHaveLength(1);
    expect(r1.dados).toEqual({ temporada: '2026-11-09T00:00:00Z|7', bonus: [] });
    expect(filtrarJaAvisados([ev7], r1.dados!)).toEqual({ novos: [], dados: null });
    expect(filtrarJaAvisados([ev3], r1.dados!).novos).toHaveLength(1);
    // Servidor e festividade nova não entram na memória.
    expect(filtrarJaAvisados([{ tipo: 'servidorVoltou' }], r1.dados!)).toEqual({ novos: [{ tipo: 'servidorVoltou' }], dados: null });
  });
});

describe('timers vencidos com o app fechado', () => {
  afterEach(() => vi.useRealTimers());
  it('vários viram um aviso só (marcando todos); um só continua com o aviso próprio', async () => {
    const cfg = {
      ...defaultConfig(),
      timers: [
        timer('p1', NOW - 5 * 3600_000),
        timer('p2', NOW - 4 * 3600_000),
        timer('a1', NOW - 3 * 3600_000, { kind: 'animal' }),
      ],
    };
    const avisos: Aviso[] = [];
    const marcados: string[] = [];
    const m = criarMotorTimers({ getConfig: () => cfg, avisar: async (a) => void avisos.push(a), marcarDisparo: async (id) => void marcados.push(id), now: () => NOW });
    m.iniciar();
    m.parar();
    expect(await m.conferir()).toEqual(['p1', 'p2', 'a1']);
    expect(marcados).toEqual(['p1', 'p2', 'a1']);
    expect(avisos).toEqual([
      {
        titulo: 'Lembretes vencidos',
        corpo: '3 lembretes venceram enquanto o app estava fechado: 2 plantações e 1 lote de animais.',
        voz: '3 lembretes venceram enquanto o app estava fechado.',
        prioridade: 'normal',
      },
    ]);
    expect(avisoTimersFechados([timer('x', NOW), timer('y', NOW, { kind: 'foco' }), timer('z', NOW, { kind: 'outro' })]).corpo).toBe(
      '3 lembretes venceram enquanto o app estava fechado: 1 plantação, 1 foco e 1 outro lembrete.',
    );
  });
});
