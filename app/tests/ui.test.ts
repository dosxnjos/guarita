// Regras puras do módulo de interface (lib/ui-*.ts): atalho, preço rápido, alertas, despertador, janelas e índice.
import { describe, expect, it, vi } from 'vitest';
import type { CityQuote, Flip, ItemResponse } from '../../shared/types';
import type { ItemsIndex } from '../../shared/items';
import { atalhoRepetido, capturarAtalho, partesAtalho, type TeclaEvento } from '../src/lib/ui-atalhos';
import { validarAtalho } from '../src/lib/shortcuts';
import { lembrarRecente, lerRecentes, resumoPreco, urlItemNoSite, urlJogadorNoSite } from '../src/lib/ui-preco';
import { detalhesRegra, formRegraPadrao, montarRegra, ultimosDisparos, validarFormRegra } from '../src/lib/ui-alertas';
import { defaultTimerForm, montarTimer, progresso } from '../src/lib/ui-timers';
import { atributoTema, lerTema, opacidadeEmTodos, proximaOpacidade, widgetsParaReabrir } from '../src/lib/ui-janelas';
import { criarCarregadorItens, ITENS_IDADE_MAX_MS, type CopiaLocal } from '../src/lib/ui-itens';
import { defaultConfig, normalizeConfig } from '../src/lib/config';

const tecla = (o: Partial<TeclaEvento>): TeclaEvento => ({ key: '', code: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o });

describe('captura de atalho', () => {
  it('Ctrl+Shift+P pelo código físico (vale no teclado ABNT)', () => {
    const c = capturarAtalho(tecla({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true }));
    expect(c).toEqual({ tipo: 'atalho', atalho: 'Ctrl+Shift+P' });
    // o motor (módulo b) aceita o texto que a tela grava
    expect(validarAtalho('Ctrl+Shift+P')).toBeNull();
  });
  it('só modificador é parcial; Esc cancela; Backspace limpa', () => {
    expect(capturarAtalho(tecla({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toEqual({ tipo: 'parcial', texto: 'Ctrl + …' });
    expect(capturarAtalho(tecla({ key: 'Escape', code: 'Escape' })).tipo).toBe('cancelar');
    expect(capturarAtalho(tecla({ key: 'Backspace', code: 'Backspace' })).tipo).toBe('limpar');
  });
  it('sem Ctrl/Alt/Win recusa (roubaria tecla do jogo), menos F13 a F24', () => {
    expect(capturarAtalho(tecla({ key: 'q', code: 'KeyQ' })).tipo).toBe('invalido');
    expect(capturarAtalho(tecla({ key: 'Q', code: 'KeyQ', shiftKey: true })).tipo).toBe('invalido');
    expect(capturarAtalho(tecla({ key: 'F1', code: 'F1' })).tipo).toBe('invalido');
    expect(capturarAtalho(tecla({ key: 'F13', code: 'F13' }))).toEqual({ tipo: 'atalho', atalho: 'F13' });
    expect(capturarAtalho(tecla({ key: '1', code: 'Digit1', altKey: true }))).toEqual({ tipo: 'atalho', atalho: 'Alt+1' });
  });
  it('mostra Win e Num de forma legível e acha atalho repetido', () => {
    expect(partesAtalho('Ctrl+Super+Numpad1')).toEqual(['Ctrl', 'Win', 'Num 1']);
    expect(partesAtalho(null)).toEqual([]);
    const at = { abrirPreco: 'Ctrl+Shift+P', abrirDossie: null, alternarWidgets: null, silenciarVoz: null };
    expect(atalhoRepetido(at, 'abrirDossie', 'ctrl+shift+p')).toBe('abrirPreco');
    expect(atalhoRepetido(at, 'abrirPreco', 'Ctrl+Shift+P')).toBeNull();
  });
});

const conf = (label: CityQuote['confidence']['label'], score = 80) => ({ score, label, reasons: [] });
const q = (city: CityQuote['city'], sellMin: number | null, label: CityQuote['confidence']['label'], buyMax: number | null = null): CityQuote => ({
  city, sellMin, sellMinAt: null, buyMax, buyMaxAt: null, ageMin: 10, confidence: conf(label), verdict: 'normal',
});
const flip = (from: CityQuote['city'], profitPremium: number, profitNoPremium: number, ageMin: number | null = 5): Flip => ({
  from, buyAt: 1000, sellAt: 1200, profitPremium, profitNoPremium, roi: profitPremium / 1000, ageMin,
});
const item = (cities: CityQuote[], flips: Flip[] = []): ItemResponse => ({
  id: 'T4_BAG', quality: 1, fetchedAt: '2026-10-30T12:00:00Z', cities, history: [], median7d: null, p25: null, p75: null, book: [], flips,
});

describe('preço rápido', () => {
  it('melhor confiável ignora o mais barato de selo baixo e o Black Market', () => {
    const r = resumoPreco(item([q('Martlock', 900, 'baixa'), q('Lymhurst', 1000, 'alta'), q('Black Market', null, 'média', 1500)]), true);
    expect(r.melhor?.quote.city).toBe('Lymhurst');
    expect(r.melhor?.reliable).toBe(true);
    expect(r.linhas.at(-1)?.city).toBe('Black Market');
    expect(r.semDado).toBe(false);
  });
  it('sem selo bom devolve o mais barato marcado como pouco confiável', () => {
    const r = resumoPreco(item([q('Martlock', 900, 'baixa'), q('Lymhurst', 1000, 'sem dado')]), true);
    expect(r.melhor).toMatchObject({ reliable: false, quote: { city: 'Martlock' } });
  });
  it('flip só aparece com lucro no Premium escolhido e avisa se velho', () => {
    const it1 = item([q('Martlock', 1000, 'alta')], [flip('Martlock', 150, -10, 45)]);
    expect(resumoPreco(it1, true).flip).toMatchObject({ lucro: 150, velho: true });
    expect(resumoPreco(it1, false).flip).toBeNull();
  });
  it('sem preço nenhum é "sem dado"', () => expect(resumoPreco(item([q('Martlock', null, 'sem dado')]), true).semDado).toBe(true));
  it('links do site e recentes', () => {
    expect(urlItemNoSite('T4_BAG@1', 3)).toBe('https://guarita.pages.dev/item/T4_BAG%401?q=3');
    expect(urlItemNoSite('T4_BAG', 1)).toBe('https://guarita.pages.dev/item/T4_BAG');
    expect(urlJogadorNoSite('ab c')).toBe('https://guarita.pages.dev/jogador/ab%20c');
    const l = lembrarRecente([{ id: 'A_1', nome: 'a' }, { id: 'B_1', nome: 'b' }], { id: 'B_1', nome: 'b' });
    expect(l.map((r) => r.id)).toEqual(['B_1', 'A_1']);
    expect(lerRecentes('lixo')).toEqual([]);
    expect(lerRecentes(JSON.stringify([{ id: 'T4_BAG', nome: 'Bolsa' }, { id: '<script>', nome: 'x' }]))).toEqual([{ id: 'T4_BAG', nome: 'Bolsa' }]);
  });
});

describe('alertas locais', () => {
  const base = { ...formRegraPadrao(), itemId: 'T4_BAG', itemName: 'Bolsa do Adepto', valor: '12.000' };
  it('formulário válido vira RegraLocal que a config aceita como está', () => {
    expect(validarFormRegra(base, 0)).toEqual({});
    const r = montarRegra(base, Date.parse('2026-10-30T12:00:00Z'), 'r1')!;
    expect(r).toMatchObject({ id: 'r1', itemId: 'T4_BAG', condition: { kind: 'below', price: 12000 }, ativa: true, voz: true, side: 'sell' });
    expect(r).not.toHaveProperty('channel');
    const cfg = normalizeConfig({ regras: [r] });
    expect(cfg.regras).toEqual([r]);
    expect(detalhesRegra(r)).toContain('abaixo de 12.000 prata');
  });
  it('erros em PT-BR: sem item, preço quebrado, porcentagem fora, Black Market para comprar', () => {
    expect(validarFormRegra({ ...base, itemId: '' }, 0).item).toBeTruthy();
    expect(validarFormRegra({ ...base, valor: '12,5' }, 0).valor).toBeTruthy();
    expect(validarFormRegra({ ...base, kind: 'belowMedianPct', valor: '95' }, 0).valor).toContain('entre 1 e 90');
    expect(validarFormRegra({ ...base, cities: ['Black Market'] }, 0).cities).toContain('Black Market');
    expect(validarFormRegra({ ...base, side: 'buy', kind: 'above', cities: ['Black Market'] }, 0)).toEqual({});
    expect(validarFormRegra(base, 50).form).toContain('limite');
  });
  it('comprar barato tira o Black Market da regra montada', () => {
    const r = montarRegra({ ...base, cities: ['Martlock', 'Black Market'] }, 0, 'r2')!;
    expect(r.cities).toEqual(['Martlock']);
  });
  it('últimos disparos: mais novo primeiro, com o nome do item', () => {
    const r = montarRegra(base, 0, 'r1')!;
    const ds = ultimosDisparos(
      [
        { regraId: 'r1', quando: '2026-10-30T10:00:00Z', mensagem: 'a' },
        { regraId: 'apagada', quando: '2026-10-30T11:00:00Z', mensagem: 'b' },
      ],
      [r],
    );
    expect(ds.map((d) => [d.mensagem, d.item])).toEqual([['b', null], ['a', 'Bolsa do Adepto']]);
  });
});

describe('despertador local', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  it('plantação vira timer de 22 h que a config aceita', () => {
    const r = montarTimer(defaultTimerForm(), 0, now, 't1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.timer).toMatchObject({ id: 't1', kind: 'plantacao', label: 'Plantação', endsAt: '2026-10-31T10:00:00.000Z' });
    expect(normalizeConfig({ timers: [r.timer] }).timers).toEqual([r.timer]);
    expect(progresso(r.timer, now + 11 * 3600_000)).toBeCloseTo(0.5);
  });
  it('tempo livre inválido e limite de lembretes', () => {
    const r = montarTimer({ ...defaultTimerForm(), preset: 'livre' }, 0, now);
    expect(r).toEqual({ ok: false, erro: 'Informe as horas e os minutos.' });
    expect(montarTimer(defaultTimerForm(), 50, now).ok).toBe(false);
  });
  it('foco sem Premium não tem hora para avisar', () => {
    const r = montarTimer({ ...defaultTimerForm(), preset: 'foco', focus: '1000', premium: false }, 0, now);
    expect(r.ok).toBe(false);
  });
});

describe('janelas e tema', () => {
  it('reabre só os widgets marcados como abertos', () => {
    const c = defaultConfig();
    c.janelas.preco.aberta = true;
    c.janelas.relogio.aberta = true;
    expect(widgetsParaReabrir(c)).toEqual(['preco', 'relogio']);
    expect(widgetsParaReabrir(defaultConfig())).toEqual([]);
  });
  it('opacidade rápida desce em degraus e volta ao 100%', () => {
    expect(proximaOpacidade(1)).toBe(0.85);
    expect(proximaOpacidade(0.85)).toBe(0.7);
    expect(proximaOpacidade(0.35)).toBe(1);
    expect(proximaOpacidade(0.6)).toBe(0.5);
  });
  it('opacidade padrão vale para todos os widgets, não para o painel', () => {
    const c = defaultConfig();
    opacidadeEmTodos(c, 0.1);
    expect(c.janelas.preco.opacidade).toBe(0.35);
    expect(c.janelas.lente.opacidade).toBe(0.35);
    expect(c.janelas.painel.opacidade).toBe(1);
  });
  it('tema: escuro por padrão; lixo volta ao escuro', () => {
    expect(lerTema(null)).toBe('escuro');
    expect(lerTema('roxo')).toBe('escuro');
    expect(atributoTema('claro')).toBe('light');
    expect(atributoTema('sistema')).toBeNull();
  });
});

describe('índice de itens com cópia local', () => {
  const idx: ItemsIndex = { v: 1, generatedAt: '', source: '', items: [['T4_BAG', 'Bolsa do Adepto', "Adept's Bag", 4, 0]] };
  const memoria = (inicial: { index: ItemsIndex; salvoEm: number } | null = null): CopiaLocal & { gravacoes: number } => {
    let v = inicial;
    const c = {
      gravacoes: 0,
      ler: async () => v,
      gravar: async (index: ItemsIndex, quando: number) => {
        c.gravacoes++;
        v = { index, salvoEm: quando };
      },
    };
    return c;
  };

  it('sem cópia baixa uma vez, grava e não baixa de novo na mesma janela', async () => {
    const baixar = vi.fn(async () => idx);
    const copia = memoria();
    const c = criarCarregadorItens({ baixar, copia, now: () => 1000 });
    await c.carregar();
    await c.carregar();
    expect(baixar).toHaveBeenCalledTimes(1);
    expect(copia.gravacoes).toBe(1);
  });
  it('com cópia fresca não usa a rede; velha devolve a cópia e atualiza em segundo plano', async () => {
    const baixar = vi.fn(async () => idx);
    await criarCarregadorItens({ baixar, copia: memoria({ index: idx, salvoEm: 0 }), now: () => 1000 }).carregar();
    expect(baixar).not.toHaveBeenCalled();
    const r = await criarCarregadorItens({ baixar, copia: memoria({ index: idx, salvoEm: 0 }), now: () => ITENS_IDADE_MAX_MS + 1 }).carregar();
    expect(r).toBe(idx);
    expect(baixar).toHaveBeenCalledTimes(1);
  });
  it('falha de rede sem cópia dá erro em PT-BR e deixa tentar de novo', async () => {
    let falhar = true;
    const baixar = vi.fn(async () => {
      if (falhar) throw new Error('sem rede');
      return idx;
    });
    const c = criarCarregadorItens({ baixar, copia: memoria() });
    await expect(c.carregar()).rejects.toThrow('Não foi possível carregar a lista de itens');
    falhar = false;
    await expect(c.carregar()).resolves.toBe(idx);
  });
});
