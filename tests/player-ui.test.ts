import { describe, expect, it } from 'vitest';
import {
  ageClass, dangerTone, famBars, fmtAgo, fmtAgoMin, fmtCompact, fmtDateBR, fmtNum, fmtPct, gatherLabel, iconUrl,
  isIosUA, isStale, itemHref, playerQuery, pveLabel, qualityLabel, slotLabel,
} from '../src/lib/player/format';
import {
  DEFAULT_CITIES, MAX_RULES, citiesForSide, citiesText, conditionText, defaultForm, describeRule, kindForSide, parseNumberBR,
  toRule, validate,
} from '../src/lib/player/alertForm';
import { parseQuality, QUALITY_LABEL as QUALITY_LABEL_SITE } from '../src/lib/format';
import { QUALITY_LABEL as QUALITY_LABEL_FORM } from '../src/lib/player/format';
import { isSubGone } from '../src/lib/push';
import { ApiError } from '../src/lib/api';
import type { AlertRule, City } from '../shared/types';

const NOW = Date.parse('2026-10-29T18:00:00Z');

describe('formatação pt-BR', () => {
  it('números com milhar e traço sem dado', () => {
    expect(fmtNum(1234567)).toBe('1.234.567');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(NaN)).toBe('—');
    expect(fmtPct(0.424)).toBe('42%');
  });
  it('número compacto só a partir de 10 mil', () => {
    expect(fmtCompact(9999)).toBe('9.999');
    expect(fmtCompact(2_421_977)).toMatch(/^2,4\s?mi$/);
  });
  it('data em Brasília (UTC-3)', () => {
    expect(fmtDateBR('2026-10-29T02:30:00Z')).toBe('28/10/2026 23:30');
    expect(fmtDateBR(null)).toBe('—');
    expect(fmtDateBR('lixo')).toBe('—');
  });
  it('tempo relativo', () => {
    expect(fmtAgoMin(0)).toBe('agora');
    expect(fmtAgoMin(5)).toBe('há 5 min');
    expect(fmtAgoMin(185)).toBe('há 3 h');
    expect(fmtAgoMin(60 * 72)).toBe('há 3 dias');
    expect(fmtAgoMin(null)).toBe('sem data');
    expect(fmtAgo('2026-10-29T15:00:00Z', NOW)).toBe('há 3 h');
  });
  it('idade do preço e dado velho', () => {
    expect(ageClass(30)).toBe('fresh');
    expect(ageClass(200)).toBe('stale');
    expect(ageClass(1000)).toBe('');
    expect(ageClass(null)).toBe('');
    expect(isStale('2026-10-29T17:00:00Z', NOW)).toBe(true);
    expect(isStale('2026-10-29T17:50:00Z', NOW)).toBe(false);
    expect(isStale(null, NOW)).toBe(false);
  });
  it('rótulos PT-BR', () => {
    expect(dangerTone('perigoso')).toBe('bad');
    expect(dangerTone('sem dado')).toBe('');
    expect(qualityLabel(5)).toBe('Obra-prima');
    // nomes oficiais do cliente em PT-BR, iguais na página do item e no formulário de alerta
    expect([1, 2, 3, 4, 5].map(qualityLabel)).toEqual(['Normal', 'Bom', 'Excepcional', 'Excelente', 'Obra-prima']);
    expect(QUALITY_LABEL_SITE).toBe(QUALITY_LABEL_FORM);
    expect(slotLabel('MainHand')).toBe('Arma');
    expect(slotLabel('XYZ')).toBe('XYZ');
    expect(pveLabel('CorruptedDungeon')).toBe('Masmorras Corrompidas');
    expect(gatherLabel('Fiber')).toBe('Fibra');
  });
  it('barras de fama separam o total e ignoram não-número', () => {
    const r = famBars({ Total: 100, Royal: 20, Avalon: 70, Mists: 0, Bad: 'x' as unknown as number }, pveLabel);
    expect(r.total).toBe(100);
    expect(r.bars.map((b) => b.key)).toEqual(['Avalon', 'Royal']);
    expect(famBars({ fiber: 3, ore: 7 }, gatherLabel).total).toBe(10);
    expect(famBars(undefined, gatherLabel)).toEqual({ total: 0, bars: [] });
  });
  it('links', () => {
    expect(iconUrl('T4_BAG')).toBe('https://render.albiononline.com/v1/item/T4_BAG.png?size=64');
    expect(iconUrl('T6_MAIN_SWORD@1', 3)).toContain('T6_MAIN_SWORD%401.png?size=64&quality=3');
    expect(itemHref('T4_BAG', 2)).toBe('/item/T4_BAG?q=2');
  });
  it('busca de jogador exige 3 letras', () => {
    expect(playerQuery('  ab ')).toEqual({ q: 'ab', ok: false });
    expect(playerQuery(' Calango   Peto ')).toEqual({ q: 'Calango Peto', ok: true });
  });
  it('detecta iPhone e iPad que se diz Mac', () => {
    expect(isIosUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(isIosUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIosUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosUA('Mozilla/5.0 (Linux; Android 15)')).toBe(false);
  });
});

describe('formulário de alerta', () => {
  it('lê número digitado em pt-BR', () => {
    expect(parseNumberBR('12.000')).toBe(12000);
    expect(parseNumberBR('1.234.567')).toBe(1234567);
    expect(parseNumberBR('12 000')).toBe(12000);
    expect(parseNumberBR('2,5')).toBe(2.5);
    expect(parseNumberBR('')).toBeNull();
    expect(parseNumberBR('abc')).toBeNull();
  });
  it('padrão: comprar barato, cidades reais + Caerleon, 60 min', () => {
    const f = defaultForm('T4_BAG');
    expect(f.side).toBe('sell');
    expect(f.cities).toEqual(DEFAULT_CITIES);
    expect(f.cities).toHaveLength(6);
    expect(f.cooldownMin).toBe(60);
  });
  it('valida campos com mensagens em PT-BR', () => {
    const f = defaultForm();
    const e = validate({ ...f, cities: [] }, 0);
    expect(e.item).toBe('Escolha um item.');
    expect(e.cities).toBeDefined();
    expect(e.value).toBeDefined();
    expect(validate({ ...f, itemId: 'T4_BAG', value: '12.000' }, 0)).toEqual({});
    expect(validate({ ...f, itemId: 't4 bag', value: '1' }, 0).item).toMatch(/inválido/);
    expect(validate({ ...f, itemId: 'T4_BAG', value: '1,5' }, 0).value).toMatch(/inteiro/);
    expect(validate({ ...f, itemId: 'T4_BAG', kind: 'belowMedianPct', value: '95' }, 0).value).toMatch(/1 e 90/);
    expect(validate({ ...f, itemId: 'T4_BAG', kind: 'belowMedianPct', value: '20' }, 0)).toEqual({});
    expect(validate({ ...f, itemId: 'T4_BAG', value: '10', cooldownMin: 45 }, 0).cooldown).toBeDefined();
  });
  it('barra no limite de regras', () => {
    const f = { ...defaultForm('T4_BAG'), value: '100' };
    expect(validate(f, MAX_RULES - 1).form).toBeUndefined();
    expect(validate(f, MAX_RULES).form).toMatch(/limite/);
  });
  it('monta a regra para push com dono e nome opcional', () => {
    const f = { ...defaultForm('T6_MAIN_SWORD@1'), itemName: ' T6.1 Espada ', value: '12.500' };
    const r = toRule(f, 'sub-123');
    expect(r).toEqual({
      itemId: 'T6_MAIN_SWORD@1', quality: 1, cities: DEFAULT_CITIES, side: 'sell',
      condition: { kind: 'below', price: 12500 }, cooldownMin: 60, channel: 'push', owner: 'sub-123',
      itemName: 'T6.1 Espada',
    });
    const p = toRule({ ...f, itemName: '', kind: 'belowMedianPct', value: '20' }, 'x');
    expect(p.condition).toEqual({ kind: 'belowMedianPct', pct: 20 });
    expect('itemName' in p).toBe(false);
    // a lista da regra é cópia: mexer no formulário depois não altera o que foi enviado
    f.cities.pop();
    expect(r.cities).toHaveLength(6);
  });
  it('qualidade vem da página do item (/alertas?item=…&q=3)', () => {
    const f = defaultForm('T6_BAG', parseQuality('3'));
    expect(f.quality).toBe(3);
    expect(toRule({ ...f, value: '40.000' }, 's').quality).toBe(3);
    expect(defaultForm('T6_BAG', parseQuality(null)).quality).toBe(1);
    expect(defaultForm('T6_BAG', parseQuality('9')).quality).toBe(1);
  });
  it('Black Market só no lado de vender caro', () => {
    const f = { ...defaultForm('T4_BAG'), value: '6.000', cities: ['Lymhurst', 'Black Market'] as City[] };
    expect(validate(f, 0).cities).toMatch(/Black Market/);
    expect(validate({ ...f, side: 'buy', kind: 'above' }, 0)).toEqual({});
    expect(citiesForSide('sell', f.cities)).toEqual(['Lymhurst']);
    const buy = citiesForSide('buy', f.cities);
    expect(buy).toEqual(f.cities);
    expect(buy).not.toBe(f.cities);
    expect(toRule({ ...f, side: 'buy' }, 's').cities).toEqual(['Lymhurst', 'Black Market']);
  });
  it('percentual da mediana arredonda como a API (90,4 passa, 90,6 não)', () => {
    const f = { ...defaultForm('T4_BAG'), kind: 'belowMedianPct' as const };
    expect(validate({ ...f, value: '90,4' }, 0).value).toBeUndefined();
    expect(validate({ ...f, value: '90,6' }, 0).value).toBeDefined();
    expect(validate({ ...f, value: '0,4' }, 0).value).toBeDefined();
  });
  it('reconhece o 404 de inscrição que sumiu (e só ele)', () => {
    expect(isSubGone(new ApiError('inscrição de notificação não encontrada: ative as notificações de novo', 404))).toBe(true);
    expect(isSubGone(new ApiError('alerta não encontrado', 404))).toBe(false);
    expect(isSubGone(new ApiError('inscrição de notificação não encontrada', 502))).toBe(false);
    expect(isSubGone(new Error('inscrição'))).toBe(false);
  });
  it('troca a condição natural junto com o lado', () => {
    expect(kindForSide('buy', 'below')).toBe('above');
    expect(kindForSide('sell', 'above')).toBe('below');
    expect(kindForSide('buy', 'belowMedianPct')).toBe('belowMedianPct');
  });
  it('descreve a regra em uma linha', () => {
    const rule: AlertRule = {
      id: 'r1', itemId: 'T4_BAG', quality: 2, cities: DEFAULT_CITIES, side: 'buy',
      condition: { kind: 'above', price: 12000 }, cooldownMin: 180, channel: 'push', owner: 's', createdAt: '2026-10-29T00:00:00Z',
    };
    expect(describeRule(rule, 'T4 Bolsa')).toBe(
      'T4 Bolsa · Bom · vender caro (ordens de compra) · acima de 12.000 prata · cidades reais e Caerleon · no máximo 1 aviso a cada 180 min',
    );
    expect(conditionText({ kind: 'belowMedianPct', pct: 15 })).toBe('15% abaixo da mediana de 7 dias da cidade');
    expect(citiesText(['Caerleon', 'Black Market'])).toBe('Caerleon, Black Market');
    expect(citiesText(['Bridgewatch', 'Lymhurst', 'Martlock', 'Thetford'])).toBe('4 cidades');
  });
});
