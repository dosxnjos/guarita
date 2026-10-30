import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, normalizarRegraLocal, normalizarTimerLocal, normalizeConfig } from '../src/lib/config';
import { aplicarAtalhos, conflitosAtalhos, normalizarAtalho, validarAtalho, type PluginAtalhos } from '../src/lib/shortcuts';

describe('atalhos: validação', () => {
  it('normaliza para a forma do plugin', () => {
    expect(normalizarAtalho('ctrl + shift + p')).toBe('Ctrl+Shift+P');
    expect(normalizarAtalho('Shift+Control+KeyP')).toBe('Ctrl+Shift+P');
    expect(normalizarAtalho('Win+Alt+f2')).toBe('Alt+Super+F2');
    expect(normalizarAtalho('CmdOrCtrl+Digit1')).toBe('Ctrl+1');
    expect(normalizarAtalho('Ctrl+numpad1')).toBe('Ctrl+Numpad1');
    expect(normalizarAtalho('Ctrl+P+Q')).toBeNull();
    expect(normalizarAtalho('Ctrl+Shift')).toBeNull();
    expect(normalizarAtalho('Ctrl+Ç')).toBeNull();
  });
  it('exige Ctrl, Alt ou Win (menos F13–F24) e recusa atalhos do Windows', () => {
    expect(validarAtalho('Ctrl+Shift+P')).toBeNull();
    expect(validarAtalho('Alt+F2')).toBeNull();
    expect(validarAtalho('F13')).toBeNull();
    expect(validarAtalho('P')).toMatch(/Ctrl, Alt ou Win/);
    expect(validarAtalho('Shift+P')).toMatch(/Ctrl, Alt ou Win/);
    expect(validarAtalho('F5')).toMatch(/Ctrl, Alt ou Win/);
    expect(validarAtalho('Ctrl+C')).toMatch(/atalho do Windows/);
    expect(validarAtalho('Alt+F4')).toMatch(/atalho do Windows/);
    expect(validarAtalho('')).toBe('Escolha uma combinação de teclas.');
  });
  it('acha conflito mesmo com grafia diferente', () => {
    expect(conflitosAtalhos({ abrirPreco: 'Ctrl+Shift+P', abrirDossie: 'shift+ctrl+p', alternarWidgets: 'Alt+1', silenciarVoz: null })).toEqual([['abrirPreco', 'abrirDossie']]);
  });
});

describe('aplicarAtalhos', () => {
  it('solta tudo, registra os válidos, devolve falhas e só age no "apertou"', async () => {
    const handlers = new Map<string, (e: { shortcut: string; state: 'Pressed' | 'Released' }) => void>();
    const plugin: PluginAtalhos = {
      unregisterAll: vi.fn(async () => handlers.clear()),
      register: vi.fn(async (a, h) => {
        if (a === 'Alt+9') throw new Error('HotKey already registered');
        handlers.set(a, h);
      }),
    };
    const acoes = { abrirPreco: vi.fn(), abrirDossie: vi.fn(), alternarWidgets: vi.fn(), silenciarVoz: vi.fn() };
    const r = await aplicarAtalhos({ abrirPreco: 'ctrl+shift+p', abrirDossie: 'Ctrl+Shift+P', alternarWidgets: 'Alt+9', silenciarVoz: 'P' }, acoes, plugin);
    expect(plugin.unregisterAll).toHaveBeenCalledTimes(1);
    expect(r.registrados).toEqual(['abrirPreco']);
    expect(r.falhas.map((f) => f.acao)).toEqual(['abrirDossie', 'alternarWidgets', 'silenciarVoz']);
    expect(r.falhas[0].erro).toContain('Abrir o preço rápido');
    expect(r.falhas[1].erro).toContain('outro programa');
    handlers.get('Ctrl+Shift+P')!({ shortcut: 'Ctrl+Shift+P', state: 'Pressed' });
    handlers.get('Ctrl+Shift+P')!({ shortcut: 'Ctrl+Shift+P', state: 'Released' });
    expect(acoes.abrirPreco).toHaveBeenCalledTimes(1);
  });
  it('fora do app (sem plugin) não faz nada', async () => {
    expect(await aplicarAtalhos(defaultConfig().atalhos, {} as never, null)).toEqual({ falhas: [], registrados: [] });
  });
});

describe('config: regras, timers e disparos item a item', () => {
  const base = {
    id: 'r1', itemId: 't4_bag', quality: 1, cities: ['Lymhurst'], side: 'sell', condition: { kind: 'below', price: 3999.6 },
    cooldownMin: 2, createdAt: '2026-10-30T10:00:00Z',
  };
  it('aceita, arruma e põe padrões', () => {
    expect(normalizarRegraLocal(base)).toEqual({ ...base, itemId: 'T4_BAG', condition: { kind: 'below', price: 4000 }, cooldownMin: 5, ativa: true, voz: true });
  });
  it('recusa regra estragada', () => {
    expect(normalizarRegraLocal({ ...base, cities: ['Lugar Nenhum'] })).toBeNull();
    expect(normalizarRegraLocal({ ...base, cities: ['Black Market'] })).toBeNull(); // comprar barato no BM não existe
    expect(normalizarRegraLocal({ ...base, condition: { kind: 'belowMedianPct', pct: 95 } })).toBeNull();
    expect(normalizarRegraLocal({ ...base, itemId: '../x' })).toBeNull();
    expect(normalizarRegraLocal({ ...base, quality: 7 })).toBeNull();
  });
  it('normalizeConfig descarta o item ruim sem perder os bons, e tira id repetido', () => {
    const c = normalizeConfig({
      regras: [base, { ...base, id: 'r2', side: 'x' }, base],
      timers: [{ id: 't1', kind: 'animal', label: 'Galinhas', endsAt: '2026-10-30T12:00:00Z' }, { id: 't2', endsAt: 'ontem' }],
      disparos: [{ regraId: 'r1', quando: '2026-10-30T11:00:00Z', mensagem: 'ok' }, { regraId: 'r1', quando: 'x', mensagem: 'ruim' }],
    });
    expect(c.regras.map((r) => r.id)).toEqual(['r1']);
    expect(c.timers.map((t) => t.id)).toEqual(['t1']);
    expect(c.disparos).toHaveLength(1);
    expect(normalizarTimerLocal({ id: 't', kind: '???', endsAt: '2026-10-30T12:00:00Z' })?.kind).toBe('outro');
  });
  it('aviso de festividade nova vem ligado por padrão (campo novo)', () => {
    expect(defaultConfig().avisos.relogio.festividade).toBe(true);
    expect(normalizeConfig({ avisos: { relogio: { servidor: false } } }).avisos.relogio).toEqual({ bonusAcabando: true, servidor: false, temporada: true, festividade: true });
  });
});

// ---------- voz (speechSynthesis falso: o ambiente de teste é node) ----------

class Utter {
  lang = '';
  volume = 1;
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function sinteseFalsa() {
  const faladas: Utter[] = [];
  const s = {
    speak: vi.fn((u: Utter) => faladas.push(u)),
    cancel: vi.fn(() => {
      const u = faladas[faladas.length - 1];
      // Como no Chromium: o fim da cancelada chega depois.
      if (u) queueMicrotask(() => u.onerror?.());
    }),
    getVoices: () => [
      { name: 'Microsoft Zira', lang: 'en-US', localService: true },
      { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true },
    ],
    addEventListener: () => {},
  };
  return { s, faladas };
}

describe('voz', () => {
  let falsa: ReturnType<typeof sinteseFalsa>;
  beforeEach(() => {
    vi.resetModules();
    falsa = sinteseFalsa();
    vi.stubGlobal('speechSynthesis', falsa.s);
    vi.stubGlobal('SpeechSynthesisUtterance', Utter);
  });
  afterEach(() => vi.unstubAllGlobals());

  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('uma fala por vez, em pt-BR com a voz Maria; a próxima só depois do fim', async () => {
    const v = await import('../src/lib/voice');
    v.falar('primeira');
    v.falar('segunda');
    await tick();
    expect(falsa.faladas.map((u) => u.text)).toEqual(['primeira']);
    expect(falsa.faladas[0].lang).toBe('pt-BR');
    expect((falsa.faladas[0].voice as { name: string }).name).toMatch(/Maria/);
    falsa.faladas[0].onend!();
    await tick();
    expect(falsa.faladas.map((u) => u.text)).toEqual(['primeira', 'segunda']);
  });

  it('alta interrompe a normal e passa na frente; a cancelada não atrapalha a seguinte', async () => {
    const v = await import('../src/lib/voice');
    v.falar('preço no alvo');
    await tick();
    v.falar('outro aviso');
    v.falar('o servidor caiu', 'alta');
    await tick();
    await tick();
    expect(falsa.faladas.map((u) => u.text)).toEqual(['preço no alvo', 'o servidor caiu']);
    expect(v.tamanhoFila()).toBe(2); // falando + 'outro aviso'
    falsa.faladas[1].onend!();
    await tick();
    expect(falsa.faladas.map((u) => u.text)).toEqual(['preço no alvo', 'o servidor caiu', 'outro aviso']);
  });

  it('silenciar cala e descarta o que vier', async () => {
    const v = await import('../src/lib/voice');
    v.falar('um');
    v.falar('dois');
    await tick();
    v.setSilenciada(true);
    expect(v.tamanhoFila()).toBe(0);
    v.falar('três');
    await tick();
    expect(falsa.faladas.map((u) => u.text)).toEqual(['um']);
    v.setSilenciada(false);
    v.falar('quatro');
    await tick();
    expect(falsa.faladas.map((u) => u.text)).toEqual(['um', 'quatro']);
  });

  it('escolherVoz: preferida, depois Francisca, Maria, qualquer pt-BR, qualquer português', async () => {
    const { escolherVoz } = await import('../src/lib/voice');
    const vz = (name: string, lang: string) => ({ name, lang, localService: true }) as SpeechSynthesisVoice;
    const lista = [vz('Zira', 'en-US'), vz('Maria', 'pt-BR'), vz('Francisca Online', 'pt-BR'), vz('Helia', 'pt-PT')];
    expect(escolherVoz(lista, 'Zira')?.name).toBe('Zira');
    expect(escolherVoz(lista, 'Não existe')?.name).toBe('Francisca Online');
    expect(escolherVoz(lista.slice(0, 2), null)?.name).toBe('Maria');
    expect(escolherVoz([vz('Zira', 'en-US'), vz('Helia', 'pt-PT')], null)?.name).toBe('Helia');
    expect(escolherVoz([vz('Zira', 'en-US')], null)).toBeNull();
  });
});
