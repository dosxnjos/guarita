import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconciliarIniciarComWindows, setAutostartPlugin, setIniciarComWindows } from '../src/lib/autostart';
import {
  defaultConfig,
  getConfig,
  loadConfig,
  memoryBackend,
  normalizeConfig,
  onConfigChange,
  setConfigBackend,
  updateConfig,
} from '../src/lib/config';
import { WIDGET_LABELS } from '../src/lib/windows';

describe('padrões que são regra do produto', () => {
  const c = defaultConfig();
  it('não inicia com o Windows', () => expect(c.iniciarComWindows).toBe(false));
  it('nenhuma janela nasce por cima e o aviso da SBI não vem aceito', () => {
    expect(c.avisoSbiAceitoEm).toBeNull();
    for (const l of ['painel', ...WIDGET_LABELS] as const) expect(c.janelas[l].porCima).toBe(false);
  });
  it('atalhos globais vêm vazios', () => expect(Object.values(c.atalhos).every((a) => a === null)).toBe(true));
  it('lente desligada e fechar o painel encerra o app', () => {
    expect(c.lente.ligada).toBe(false);
    expect(c.fecharParaBandeja).toBe(false);
  });
});

describe('normalizeConfig', () => {
  it('lixo vira o padrão', () => {
    expect(normalizeConfig(null)).toEqual(defaultConfig());
    expect(normalizeConfig('x')).toEqual(defaultConfig());
  });
  it('limita números e recusa lente fora do localhost', () => {
    const c = normalizeConfig({
      intervaloRegrasMin: 30,
      voz: { volume: 5, velocidade: 0 },
      janelas: { preco: { opacidade: 0.01, porCima: true } },
      lente: { ligada: true, url: 'ws://exemplo.com:8099' },
    });
    expect(c.intervaloRegrasMin).toBe(5);
    expect(c.voz.volume).toBe(1);
    expect(c.voz.velocidade).toBe(0.5);
    expect(c.janelas.preco.opacidade).toBe(0.35);
    expect(c.janelas.preco.porCima).toBe(true);
    expect(c.lente).toEqual({ ligada: true, url: 'ws://localhost:8099/ws' });
  });
});

describe('load/update/onConfigChange', () => {
  beforeEach(() => setConfigBackend(memoryBackend({ iniciarComWindows: true })));
  it('carrega do backend e grava a mudança', async () => {
    const c = await loadConfig();
    expect(c.iniciarComWindows).toBe(true);
    const vistos: boolean[] = [];
    const parar = onConfigChange((x) => vistos.push(x.fecharParaBandeja));
    await updateConfig((d) => {
      d.fecharParaBandeja = true;
    });
    parar();
    expect(getConfig().fecharParaBandeja).toBe(true);
    expect(vistos[0]).toBe(false);
    expect(vistos.at(-1)).toBe(true);
  });

  it('gravação parte do valor gravado, não do retrato da janela (não apaga o que outra janela gravou)', async () => {
    // Backend sem watch: simula a outra janela gravando sem o aviso ter chegado ainda a esta.
    let valor: unknown = { timers: [{ id: 't1', kind: 'plantacao', label: '', endsAt: '2026-10-30T10:00:00Z', createdAt: '2026-10-30T09:00:00Z' }] };
    setConfigBackend({ read: async () => valor, write: async (v) => void (valor = structuredClone(v)), watch: async () => () => {} });
    await loadConfig();
    // Outra janela (o motor) marca o disparo direto no store.
    valor = { ...(valor as object), timers: [{ ...(valor as { timers: object[] }).timers[0], firedAt: '2026-10-30T10:00:05Z' }] };
    await updateConfig((d) => void (d.janelas.preco.aberta = true));
    const gravado = normalizeConfig(valor);
    expect(gravado.timers[0].firedAt).toBe('2026-10-30T10:00:05Z');
    expect(gravado.janelas.preco.aberta).toBe(true);
  });

  it('memória dos avisos do relógio sobrevive à normalização e lixo vira o padrão', () => {
    expect(normalizeConfig({ avisosRelogio: { temporada: 'x|7', bonus: ['a', 3, ''] } }).avisosRelogio).toEqual({ temporada: 'x|7', bonus: ['a'] });
    expect(normalizeConfig({ avisosRelogio: 'lixo' }).avisosRelogio).toEqual({ temporada: null, bonus: [] });
  });
});

describe('iniciar com o Windows: o registro é a verdade', () => {
  const fake = (ligado: boolean) => {
    const p = {
      ligado,
      enable: vi.fn(async () => void (p.ligado = true)),
      disable: vi.fn(async () => void (p.ligado = false)),
      isEnabled: vi.fn(async () => p.ligado),
    };
    return p;
  };
  afterEach(() => setAutostartPlugin(null));

  it('registro ligado com a config desligada (config perdida): desliga no registro, nunca liga', async () => {
    setConfigBackend(memoryBackend({}));
    const p = fake(true);
    setAutostartPlugin(p);
    expect(await reconciliarIniciarComWindows()).toBe(false);
    expect(p.disable).toHaveBeenCalledTimes(1);
    expect(p.enable).not.toHaveBeenCalled();
    expect(p.ligado).toBe(false);
    expect(getConfig().iniciarComWindows).toBe(false);
  });

  it('config ligada sem a chave no registro: grava desligado', async () => {
    setConfigBackend(memoryBackend({ iniciarComWindows: true }));
    const p = fake(false);
    setAutostartPlugin(p);
    expect(await reconciliarIniciarComWindows()).toBe(false);
    expect(p.enable).not.toHaveBeenCalled();
    expect(getConfig().iniciarComWindows).toBe(false);
  });

  it('os dois iguais: não mexe em nada', async () => {
    setConfigBackend(memoryBackend({ iniciarComWindows: true }));
    const p = fake(true);
    setAutostartPlugin(p);
    expect(await reconciliarIniciarComWindows()).toBe(true);
    expect(p.disable).not.toHaveBeenCalled();
    expect(p.enable).not.toHaveBeenCalled();
  });

  it('ligou no registro mas a gravação da config falhou: desfaz', async () => {
    setConfigBackend({ read: async () => ({}), write: async () => Promise.reject(new Error('disco cheio')), watch: async () => () => {} });
    const p = fake(false);
    setAutostartPlugin(p);
    await expect(setIniciarComWindows(true)).rejects.toThrow('disco cheio');
    expect(p.enable).toHaveBeenCalledTimes(1);
    expect(p.ligado).toBe(false);
  });
});
