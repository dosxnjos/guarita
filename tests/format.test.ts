import { describe, expect, it } from 'vitest';
import type { CityQuote, Confidence, Flip, Festivity } from '../shared/types';
import {
  ageTone, alertConditionText, cheapestReliable, confidenceTone, dangerTone, flipIsStale, flipView, fmtAge, fmtCountdown, fmtDateTime,
  fmtDayMonth, fmtInt, fmtPct, fmtSilver, fmtTime, hasAnyPrice, isStale, parseQuality, rangePos, serverLabel, sortCities, sortFlips,
  splitFestivities, tierFromId, verdictTone, citySlug,
} from '../src/lib/format';
import { dateDomain, extent, linePath, niceTicks, scale } from '../src/lib/ui/chart';
import { minutesSinceIso } from '../src/lib/ui/time';

const conf = (label: Confidence['label'], score = 50): Confidence => ({ label, score, reasons: [] });
const q = (city: CityQuote['city'], sellMin: number | null, label: Confidence['label'] = 'alta', score = 80, buyMax: number | null = null): CityQuote => ({
  city, sellMin, sellMinAt: null, buyMax, buyMaxAt: null, ageMin: 10, confidence: conf(label, score), verdict: 'normal',
});

describe('números pt-BR', () => {
  it('milhar com ponto e nulo vira travessão', () => {
    expect(fmtInt(1234567)).toBe('1.234.567');
    expect(fmtSilver(1234567.6)).toBe('1.234.568');
    expect(fmtSilver(null)).toBe('—');
    expect(fmtSilver(Number.NaN)).toBe('—');
  });
  it('prata compacta', () => {
    expect(fmtSilver(950, true)).toBe('950');
    expect(fmtSilver(9999, true)).toBe('9.999');
    expect(fmtSilver(12345, true)).toBe('12,3 mil');
    expect(fmtSilver(1250000, true)).toBe('1,25 mi');
    expect(fmtSilver(2_000_000_000, true)).toBe('2 bi');
  });
  it('porcentagem com vírgula e sinal', () => {
    expect(fmtPct(0.123)).toBe('12,3%');
    expect(fmtPct(0.05, true)).toBe('+5%');
    expect(fmtPct(-0.021, true)).toBe('-2,1%');
    expect(fmtPct(null)).toBe('—');
  });
});

describe('idade do preço', () => {
  it('texto', () => {
    expect(fmtAge(null)).toBe('sem dado');
    expect(fmtAge(0)).toBe('agora');
    expect(fmtAge(12)).toBe('há 12 min');
    expect(fmtAge(60)).toBe('há 1 h');
    expect(fmtAge(125)).toBe('há 2 h 5 min');
    expect(fmtAge(600)).toBe('há 10 h');
    expect(fmtAge(60 * 24 * 3)).toBe('há 3 dias');
  });
  it('régua de cor igual à do app.css', () => {
    expect(ageTone(60)).toBe('fresh');
    expect(ageTone(61)).toBe('stale');
    expect(ageTone(360)).toBe('stale');
    expect(ageTone(361)).toBe('old');
    expect(ageTone(null)).toBe('none');
  });
  it('minutos desde ISO', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(minutesSinceIso('2026-10-29T11:30:30Z', now)).toBe(29);
    expect(minutesSinceIso(null, now)).toBeNull();
    expect(minutesSinceIso('lixo', now)).toBeNull();
  });
});

describe('datas em Brasília', () => {
  it('data e hora', () => {
    expect(fmtDateTime('2026-10-29T17:05:00Z')).toBe('29/10/2026 14:05');
    expect(fmtDateTime('2026-10-29T02:30:00Z', undefined, true)).toBe('28/10 23:30');
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime('não é data')).toBe('—');
  });
  it('hora de Brasília e UTC', () => {
    expect(fmtTime('2026-10-29T17:05:09Z')).toBe('14:05:09');
    expect(fmtTime('2026-10-29T17:05:09Z', 'UTC', false)).toBe('17:05');
    expect(fmtTime('2026-10-29T00:00:00Z', 'UTC')).toBe('00:00:00');
  });
  it('dia/mês do history', () => expect(fmtDayMonth('2026-10-03')).toBe('03/10'));
  it('contagem regressiva', () => {
    expect(fmtCountdown(0)).toBe('agora');
    expect(fmtCountdown(-5)).toBe('agora');
    expect(fmtCountdown(65_000)).toBe('1 min 05 s');
    expect(fmtCountdown((3 * 3600 + 4 * 60) * 1000)).toBe('3 h 04 min');
    expect(fmtCountdown((2 * 86400 + 3 * 3600) * 1000)).toBe('2 d 3 h');
  });
  it('dado velho', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(isStale('2026-10-29T11:50:00Z', 15, now)).toBe(false);
    expect(isStale('2026-10-29T11:40:00Z', 15, now)).toBe(true);
    expect(isStale(null, 15, now)).toBe(true);
  });
});

describe('qualidade, tier, cidade', () => {
  it('qualidade da URL', () => {
    expect(parseQuality('3')).toBe(3);
    expect(parseQuality('9')).toBe(1);
    expect(parseQuality(null)).toBe(1);
    expect(parseQuality('2.5')).toBe(1);
  });
  it('tier do id', () => {
    expect(tierFromId('T4_BAG')).toEqual({ tier: 4, ench: 0 });
    expect(tierFromId('T6_PLANKS_LEVEL2@2')).toEqual({ tier: 6, ench: 2 });
    expect(tierFromId('UNIQUE_HIDEOUT')).toEqual({ tier: 0, ench: 0 });
  });
  it('slug da cidade', () => expect(citySlug('Black Market')).toBe('black-market'));
});

describe('tons', () => {
  it('selo, veredito, perigo, servidor', () => {
    expect(confidenceTone('alta')).toBe('good');
    expect(confidenceTone('baixa')).toBe('bad');
    expect(verdictTone('barato')).toBe('good');
    expect(verdictTone('sem dado')).toBe('');
    expect(dangerTone('perigoso')).toBe('bad');
    expect(serverLabel('manutenção')).toBe('Em manutenção');
  });
});

describe('mercado', () => {
  it('mais barato confiável ignora Black Market e prefere selo alto', () => {
    const r = cheapestReliable([q('Black Market', 10), q('Martlock', 100, 'baixa', 20), q('Lymhurst', 120, 'alta'), q('Thetford', 130, 'média')]);
    expect(r?.quote.city).toBe('Lymhurst');
    expect(r?.reliable).toBe(true);
  });
  it('sem cidade confiável devolve a mais barata marcada como pouco confiável', () => {
    const r = cheapestReliable([q('Martlock', 100, 'baixa'), q('Lymhurst', 90, 'sem dado', 0)]);
    expect(r).toEqual({ quote: expect.objectContaining({ city: 'Lymhurst' }), reliable: false });
  });
  it('sem preço nenhum', () => {
    expect(cheapestReliable([q('Martlock', null)])).toBeNull();
    expect(hasAnyPrice([q('Martlock', null)])).toBe(false);
    expect(hasAnyPrice([q('Martlock', null, 'alta', 0, 50)])).toBe(true);
  });
  it('ordem da tabela', () => {
    const order = sortCities([q('Black Market', 5), q('Caerleon', null, 'alta', 0, 40), q('Martlock', 200), q('Lymhurst', 100)]).map((c) => c.city);
    expect(order).toEqual(['Lymhurst', 'Martlock', 'Caerleon', 'Black Market']);
  });
  const flip = (from: Flip['from'], buyAt: number, pp: number, pn: number, ageMin: number | null): Flip => ({
    from, buyAt, sellAt: 0, profitPremium: pp, profitNoPremium: pn, roi: pp / buyAt, ageMin,
  });
  it('flip: lucro e ROI conforme o Premium, ordem e aviso de idade', () => {
    const a = flip('Martlock', 1000, 200, 100, 10);
    const b = flip('Lymhurst', 1000, 150, 140, 45);
    expect(flipView(a, false)).toEqual({ profit: 100, roi: 0.1 });
    expect(sortFlips([a, b], true).map((f) => f.from)).toEqual(['Martlock', 'Lymhurst']);
    expect(sortFlips([a, b], false).map((f) => f.from)).toEqual(['Lymhurst', 'Martlock']);
    expect(flipIsStale(a)).toBe(false);
    expect(flipIsStale(b)).toBe(true);
    expect(flipIsStale(flip('Thetford', 1, 1, 1, null))).toBe(true);
  });
  it('posição na faixa', () => {
    expect(rangePos(5, 0, 10)).toBe(0.5);
    expect(rangePos(-1, 0, 10)).toBe(0);
    expect(rangePos(99, 0, 10)).toBe(1);
    expect(rangePos(3, 4, 4)).toBe(0.5);
  });
  it('texto da condição do alerta', () => {
    expect(alertConditionText({ kind: 'below', price: 12000 })).toBe('abaixo de 12.000');
    expect(alertConditionText({ kind: 'above', price: 5 })).toBe('acima de 5');
    expect(alertConditionText({ kind: 'belowMedianPct', pct: 12.5 })).toBe('12,5% abaixo da mediana de 7 dias da cidade');
  });
});

describe('festividades', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const f = (name: string, start: string, end: string): Festivity => ({ kind: 1, category: 'x', name, labelPt: name, start, end });
  it('separa ativas e próximas, descarta encerradas e ordena', () => {
    const r = splitFestivities(
      [
        f('velha', '2026-10-20T00:00:00Z', '2026-10-28T00:00:00Z'),
        f('ativa-longa', '2026-10-28T00:00:00Z', '2026-11-02T00:00:00Z'),
        f('ativa-curta', '2026-10-29T10:00:00Z', '2026-10-29T13:00:00Z'),
        f('depois', '2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'),
        f('logo', '2026-10-30T00:00:00Z', '2026-10-31T00:00:00Z'),
      ],
      now,
    );
    expect(r.active.map((x) => x.name)).toEqual(['ativa-curta', 'ativa-longa']);
    expect(r.active[0].msLeft).toBe(3600_000);
    expect(r.upcoming.map((x) => x.name)).toEqual(['logo', 'depois']);
    expect(r.upcoming[0].msLeft).toBe(12 * 3600_000);
  });
});

describe('gráfico', () => {
  it('extent com folga e valores iguais', () => {
    expect(extent([])).toEqual([0, 1]);
    expect(extent([100, 100])).toEqual([90, 110]);
    const [lo, hi] = extent([100, 200]);
    expect(lo).toBeLessThan(100);
    expect(hi).toBeGreaterThan(200);
  });
  it('escala linear', () => {
    const s = scale(0, 10, 100, 0);
    expect(s(0)).toBe(100);
    expect(s(5)).toBe(50);
  });
  it('linha quebra em dia sem dado', () => {
    expect(linePath([[0, 0], [10, 5], null, [20, 7.25]])).toBe('M0 0L10 5M20 7.3');
    expect(linePath([])).toBe('');
  });
  it('marcas redondas', () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(1234, 1876, 4)).toEqual([1400, 1600, 1800]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });
  it('domínio de datas', () => {
    const d = dateDomain([{ days: [{ date: '2026-10-02' }, { date: '2026-10-01' }] }, { days: [{ date: '2026-10-03T00:00:00' }] }], 2);
    expect(d).toEqual(['2026-10-02', '2026-10-03']);
  });
});
