import { describe, expect, it } from 'vitest';
import { diasFalados, minutosFalados, porExtenso, precoFalado } from '../src/lib/fala';

describe('porExtenso', () => {
  it.each([
    [0, 'zero'],
    [1, 'um'],
    [15, 'quinze'],
    [21, 'vinte e um'],
    [100, 'cem'],
    [101, 'cento e um'],
    [123, 'cento e vinte e três'],
    [500, 'quinhentos'],
    [1000, 'mil'],
    [1001, 'mil e um'],
    [1100, 'mil e cem'],
    [1123, 'mil cento e vinte e três'],
    [2000, 'dois mil'],
    [3500, 'três mil e quinhentos'],
    [3520, 'três mil quinhentos e vinte'],
    [3550, 'três mil quinhentos e cinquenta'],
    [10050, 'dez mil e cinquenta'],
    [999999, 'novecentos e noventa e nove mil novecentos e noventa e nove'],
    [1_000_000, 'um milhão'],
    [1_200_000, 'um milhão e duzentos mil'],
    [1_230_000, 'um milhão duzentos e trinta mil'],
    [2_000_500, 'dois milhões e quinhentos'],
    [2_000_000_000, 'dois bilhões'],
    [1_001_000, 'um milhão e mil'],
  ])('%i → %s', (n, txt) => expect(porExtenso(n)).toBe(txt));

  it('arredonda, trata negativo e não-número', () => {
    expect(porExtenso(3499.6)).toBe('três mil e quinhentos');
    expect(porExtenso(-2)).toBe('menos dois');
    expect(porExtenso(Number.NaN)).toBe('');
  });
});

describe('precoFalado', () => {
  it('exato até 999.999', () => expect(precoFalado(3500)).toBe('três mil e quinhentos'));
  it('acima de um milhão fala só os dois grupos mais altos', () => {
    expect(precoFalado(1_234_567)).toBe('um milhão duzentos e trinta e cinco mil');
    expect(precoFalado(12_345_678)).toBe('doze milhões trezentos e quarenta e seis mil');
    expect(precoFalado(1_500_000_000)).toBe('um bilhão e quinhentos milhões');
  });
});

describe('minutos e dias', () => {
  it('singular e plural', () => {
    expect(minutosFalados(1)).toBe('um minuto');
    expect(minutosFalados(30)).toBe('trinta minutos');
    expect(diasFalados(1)).toBe('um dia');
    expect(diasFalados(3)).toBe('três dias');
  });
});
