import { describe, expect, it } from 'vitest';
import { clampOpacity, isWidgetLabel } from '../src/lib/windows';
import { proximoTimer, vencidos } from '../src/lib/engine/timers';

describe('janelas', () => {
  it('opacidade fica entre 0,35 e 1', () => {
    expect(clampOpacity(0)).toBe(0.35);
    expect(clampOpacity(2)).toBe(1);
    expect(clampOpacity(Number.NaN)).toBe(1);
  });
  it('só rótulos conhecidos são widget', () => {
    expect(isWidgetLabel('preco')).toBe(true);
    expect(isWidgetLabel('painel')).toBe(false);
    expect(isWidgetLabel('qualquer')).toBe(false);
  });
});

describe('timers (funções puras da fronteira)', () => {
  const t = (id: string, endsAt: string, firedAt?: string) => ({ id, kind: 'foco' as const, label: id, endsAt, createdAt: endsAt, firedAt });
  const lista = [t('a', '2026-10-30T12:00:00Z'), t('b', '2026-10-30T10:00:00Z', '2026-10-30T10:00:01Z'), t('c', '2026-10-30T11:00:00Z')];
  it('próximo ignora os já disparados', () => expect(proximoTimer(lista)?.id).toBe('c'));
  it('vencidos', () => expect(vencidos(lista, Date.parse('2026-10-30T11:30:00Z')).map((x) => x.id)).toEqual(['c']));
});
