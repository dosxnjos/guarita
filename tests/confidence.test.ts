import { describe, expect, it } from 'vitest';
import { ageFactor, ageLabel, bookDepth, confidence, median, scoreLabel, verdict, weightedQuantile } from '../shared/confidence';

const good = { price: 1000, ageMin: 10, depth: 25, median7d: 1000, sellMin: 1000, buyMax: 900, avgDailyVolume: 50 };

describe('selo de confiança', () => {
  it('preço fresco, livro fundo, perto da mediana → 100 alta', () => {
    const c = confidence(good);
    expect(c.score).toBe(100);
    expect(c.label).toBe('alta');
    expect(c.reasons).toEqual(['visto há 10 min']);
  });

  it('sem preço → sem dado', () => {
    expect(confidence({ price: null, ageMin: null })).toEqual({ score: 0, label: 'sem dado', reasons: ['sem preço registrado'] });
  });

  it('idade derruba: 3 h fica média, mais de 24 h quase zero', () => {
    const three = confidence({ ...good, ageMin: 180 });
    expect(three.label).toBe('média');
    expect(three.reasons[0]).toBe('visto há 3 h');
    const old = confidence({ ...good, ageMin: 3000 });
    expect(old.score).toBeLessThanOrEqual(10);
    expect(old.label).toBe('baixa');
  });

  it('isca: muito abaixo da mediana com livro raso → baixa', () => {
    const c = confidence({ ...good, price: 400, sellMin: 400, buyMax: 300, depth: 1 });
    expect(c.reasons).toContain('muito abaixo da mediana');
    expect(c.reasons).toContain('livro raso');
    expect(c.label).toBe('baixa');
  });

  it('compra acima da venda é suspeito', () => {
    const c = confidence({ ...good, buyMax: 1200 });
    expect(c.reasons).toContain('compra acima da venda (suspeito)');
    expect(c.score).toBe(70);
  });

  it('pouco volume e sem livro pesam', () => {
    const c = confidence({ ...good, avgDailyVolume: 2, depth: 0 });
    expect(c.reasons).toEqual(['visto há 10 min', 'sem livro de ofertas', 'pouco volume']);
    expect(c.score).toBe(55);
  });

  it('sinal ausente não pune', () => {
    expect(confidence({ price: 1000, ageMin: 5 }).score).toBe(100);
  });

  it('rótulos e fatores', () => {
    expect([scoreLabel(70), scoreLabel(69), scoreLabel(40), scoreLabel(1), scoreLabel(0)]).toEqual(['alta', 'média', 'média', 'baixa', 'sem dado']);
    expect([ageFactor(30), ageFactor(120), ageFactor(360), ageFactor(1440), ageFactor(1441)]).toEqual([1, 0.85, 0.6, 0.35, 0.1]);
    expect([ageLabel(0), ageLabel(59), ageLabel(60), ageLabel(2880), ageLabel(null)]).toEqual(['visto agora', 'visto há 59 min', 'visto há 1 h', 'visto há 2 dias', 'sem data']);
  });
});

describe('veredito', () => {
  it('abaixo do P25 barato, acima do P75 caro', () => {
    expect(verdict(90, 100, 200)).toBe('barato');
    expect(verdict(150, 100, 200)).toBe('normal');
    expect(verdict(100, 100, 200)).toBe('normal');
    expect(verdict(201, 100, 200)).toBe('caro');
  });
  it('sem faixa ou sem preço → sem dado', () => {
    expect(verdict(null, 100, 200)).toBe('sem dado');
    expect(verdict(150, null, 200)).toBe('sem dado');
  });
});

describe('estatística e livro', () => {
  it('profundidade até +5% do melhor preço (venda) e −5% (compra)', () => {
    const sell = [{ price: 100, amount: 2 }, { price: 105, amount: 3 }, { price: 106, amount: 50 }];
    expect(bookDepth(sell, 'sell')).toBe(5);
    const buy = [{ price: 100, amount: 4 }, { price: 95, amount: 1 }, { price: 94, amount: 9 }];
    expect(bookDepth(buy, 'buy')).toBe(5);
    expect(bookDepth([], 'sell')).toBe(0);
  });

  it('quantil ponderado pela quantidade', () => {
    const v = [{ value: 10, weight: 1 }, { value: 20, weight: 100 }, { value: 1000, weight: 1 }];
    expect(weightedQuantile(v, 0.5)).toBe(20);
    expect(weightedQuantile([], 0.5)).toBeNull();
  });

  it('mediana simples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
