import { describe, expect, it } from 'vitest';
import { flipProfit, ticksToIso, aodpDate } from '../shared/market';

describe('market', () => {
  it('converte ticks .NET', () => expect(ticksToIso(639283464000000000)).toBe('2026-10-23T10:00:00.000Z'));
  it('normaliza data vazia do AODP', () => expect(aodpDate('0001-01-01T00:00:00')).toBeNull());
  it('lucro de flip com e sem premium', () => {
    expect(flipProfit(4572, 5056, true)).toBe(282);
    expect(flipProfit(4572, 5056, false)).toBe(80);
  });
});
