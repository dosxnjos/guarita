// Espanhol do despertador (src/lib/timers/presets.ts) e do formulário de alertas (src/lib/player/alertForm.ts).
// O português segue coberto por tests/timers-ui.test.ts e tests/player-ui.test.ts sem mudança; aqui o espanhol é pedido
// com `loc` explícito ou pelo espelho de i18n/core.ts (o mesmo que o site usa em /es).
import { afterEach, describe, expect, it } from 'vitest';
import { setCurrentLocale } from '../src/lib/i18n/core';
import {
  KIND_LABEL, PRESETS, defaultTimerForm, formDuration, formLabel, kindLabel, parseNumberBR, presetById, presetText, type TimerFormState,
} from '../src/lib/timers/presets';
import { citiesText, conditionText, describeRule, ruleDetails, sideText, validate, defaultForm } from '../src/lib/player/alertForm';
import type { AlertRule } from '../shared/types';

afterEach(() => setCurrentLocale('pt'));

const form = (over: Partial<TimerFormState>): TimerFormState => ({ ...defaultTimerForm(), ...over });

describe('despertador em espanhol', () => {
  it('todo preset tem título, explicação e rótulo em espanhol; o português não muda', () => {
    for (const p of PRESETS) {
      const es = presetText(p, 'es');
      expect(es.title).toBeTruthy();
      expect(es.hint).toBeTruthy();
      expect(es.title).not.toBe(p.title);
      expect(presetText(p, 'pt')).toEqual({ title: p.title, hint: p.hint, label: p.label });
    }
    expect(presetText(presetById('plantacao'), 'es').title).toBe('Cultivos o hierbas (22 h)');
  });

  it('rótulo sugerido e tipo na língua pedida', () => {
    expect(formLabel(form({ preset: 'filhote-montaria', tier: 5 }), 'es')).toBe('Cría de montura T5');
    expect(formLabel(form({ preset: 'foco' }), 'es')).toBe('Foco lleno');
    expect(formLabel(form({ preset: 'livre' }), 'es')).toBe('Despertador');
    expect(formLabel(form({ preset: 'foco', label: '  Mi isla ' }), 'es')).toBe('Mi isla');
    expect(formLabel(form({ preset: 'filhote-montaria', tier: 5 }))).toBe('Filhote de montaria T5');
    expect(kindLabel('plantacao', 'es')).toBe('Cultivos');
    expect(kindLabel('animal', 'pt')).toBe(KIND_LABEL.animal);
  });

  it('erros do formulário em espanhol, com o milhar do es-419', () => {
    const sem = formDuration(form({ preset: 'foco', focus: '100', premium: false }), 'es');
    expect(sem.ok === false && sem.error).toMatch(/Sin Premium/);
    const cheio = formDuration(form({ preset: 'foco', focus: '30000' }), 'es');
    expect(cheio.ok === false && cheio.error).toBe('Con 30,000 de foco ya está lleno.');
    const vazio = formDuration(form({ preset: 'livre' }), 'es');
    expect(vazio.ok === false && vazio.error).toBe('Indica las horas y los minutos.');
    const fora = formDuration(form({ preset: 'livre', hours: '999' }), 'es');
    expect(fora.ok === false && fora.error).toMatch(/30 días/);
    // o português segue igual
    const cheioPt = formDuration(form({ preset: 'foco', focus: '30000' }), 'pt');
    expect(cheioPt.ok === false && cheioPt.error).toBe('Com 30.000 de foco ele já está cheio.');
  });

  it('a língua padrão é a do site (espelho de i18n/core)', () => {
    setCurrentLocale('es');
    expect(formLabel(form({ preset: 'produto' }))).toBe('Huevos y leche');
    expect(kindLabel('outro')).toBe('Otro');
    const r = formDuration(form({ preset: 'livre' }));
    expect(r.ok === false && r.error).toMatch(/^Indica/);
  });

  it('em espanhol "12,500" é milhar (como o site mostra); em português continua decimal', () => {
    expect(parseNumberBR('12,500', 'es')).toBe(12500);
    expect(parseNumberBR('1,234,567', 'es')).toBe(1234567);
    expect(parseNumberBR('12.500', 'es')).toBe(12500);
    expect(parseNumberBR('1,5', 'es')).toBe(1.5);
    expect(parseNumberBR('12,500', 'pt')).toBe(12.5);
    const r = formDuration(form({ preset: 'foco', focus: '20,000' }), 'es');
    expect(r).toEqual(formDuration(form({ preset: 'foco', focus: '20.000' }), 'pt'));
  });
});

describe('alertas em espanhol', () => {
  const rule: AlertRule = {
    id: 'a1', itemId: 'T4_BAG', quality: 3, cities: ['Caerleon', 'Black Market'], side: 'buy',
    condition: { kind: 'above', price: 12000 }, cooldownMin: 60, channel: 'push', owner: 'x', createdAt: '2026-10-30T00:00:00Z',
  };

  it('descrição da regra com glossário (Notable, Mercado Negro, órdenes, plata)', () => {
    expect(ruleDetails(rule, 'es')).toBe(
      'Notable · vender caro (órdenes de compra) · por encima de 12,000 de plata · Caerleon, Mercado Negro · como máximo 1 aviso cada 60 min',
    );
    expect(describeRule(rule, 'Bolsa del iniciado', 'es')).toMatch(/^Bolsa del iniciado · Notable/);
    expect(ruleDetails(rule, 'pt')).toBe(
      'Excepcional · vender caro (ordens de compra) · acima de 12.000 prata · Caerleon, Black Market · no máximo 1 aviso a cada 60 min',
    );
  });

  it('textos curtos', () => {
    expect(conditionText({ kind: 'belowMedianPct', pct: 15 }, 'es')).toBe('15% por debajo de la mediana de 7 días de la ciudad');
    expect(conditionText({ kind: 'below', price: 1500 }, 'es')).toBe('por debajo de 1,500 de plata');
    expect(sideText('sell', 'es')).toBe('comprar barato (órdenes de venta)');
    expect(citiesText(['Bridgewatch', 'Lymhurst', 'Martlock', 'Thetford'], 'es')).toBe('4 ciudades');
    expect(citiesText(['Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Caerleon'], 'es')).toBe('ciudades reales y Caerleon');
  });

  it('erros de validação em espanhol', () => {
    const f = defaultForm();
    const e = validate({ ...f, cities: [] }, 0, 'es');
    expect(e.item).toBe('Elige un objeto.');
    expect(e.cities).toBe('Marca al menos una ciudad.');
    expect(e.value).toMatch(/precio entero en plata/);
    expect(validate({ ...f, itemId: 'T4_BAG', kind: 'belowMedianPct', value: '95' }, 0, 'es').value).toMatch(/entre 1 y 90/);
    expect(validate({ ...f, itemId: 'T4_BAG', value: '10', side: 'sell', cities: ['Black Market'] }, 0, 'es').cities).toMatch(/Mercado Negro/);
    expect(validate({ ...f, itemId: 'T4_BAG', value: '10' }, 99, 'es').form).toMatch(/límite/);
  });
});

describe('valor do alerta em espanhol (milhar com vírgula)', () => {
  it('"12,000" vale 12000 em espanhol; em português nada muda', async () => {
    const { parseNumberBR: parseAlert, toRule } = await import('../src/lib/player/alertForm');
    expect(parseAlert('12,000', 'es')).toBe(12000);
    expect(parseAlert('1,234,567', 'es')).toBe(1234567);
    expect(parseAlert('1,5', 'es')).toBe(1.5);
    expect(parseAlert('12000', 'es')).toBe(12000);
    expect(parseAlert('12,000', 'pt')).toBe(12);
    expect(parseAlert('12.000', 'pt')).toBe(12000);
    const f = { ...defaultForm('T4_BAG'), value: '12,000' };
    expect(validate(f, 0, 'es').value).toBeUndefined();
    expect(toRule(f, 'dono', 'es').condition).toEqual({ kind: 'below', price: 12000 });
    setCurrentLocale('es');
    expect(toRule(f, 'dono').condition).toEqual({ kind: 'below', price: 12000 });
  });
});
