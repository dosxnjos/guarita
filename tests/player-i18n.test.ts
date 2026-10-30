// Espanhol das telas de jogador, guilda e perdas (src/lib/player/format.ts e src/lib/insights/format.ts).
// O português continua coberto, sem mudança, em player-ui.test.ts, losses.test.ts e guild.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import {
  dangerHeadline, famBars, fmtAgo, fmtAgoMin, fmtCompact, fmtDec, fmtNum, gatherLabel, plural, pveLabel, slotLabel,
  weaponLabel,
} from '../src/lib/player/format';
import { coverageText, hourBands, hoursAria, periodLabel } from '../src/lib/insights/format';
import { setCurrentLocale } from '../src/lib/i18n/core';
import { WEAPON_LABEL_PT } from '../shared/weapons';

const NOW = Date.parse('2026-10-29T18:00:00Z');

afterEach(() => setCurrentLocale('pt'));

describe('player/format em espanhol', () => {
  it('números no formato es-419', () => {
    expect(fmtNum(1234567, 'es')).toBe('1,234,567');
    expect(fmtDec(1.5, 'es')).toBe('1.5');
    expect(fmtNum(null, 'es')).toBe('—');
  });
  it('compacto montado como o fmtSilver (nunca "k" nem "2000 M")', () => {
    expect(fmtCompact(9999, 'es')).toBe('9,999');
    expect(fmtCompact(350_000, 'es')).toBe('350 mil');
    expect(fmtCompact(2_421_977, 'es')).toBe('2.4 M');
    expect(fmtCompact(2e9, 'es')).toBe('2 mil M');
    expect(fmtCompact(-1_500_000, 'es')).toBe('-1.5 M');
  });
  it('tempo relativo', () => {
    expect(fmtAgoMin(0, 'es')).toBe('ahora');
    expect(fmtAgoMin(5, 'es')).toBe('hace 5 min');
    expect(fmtAgoMin(185, 'es')).toBe('hace 3 h');
    expect(fmtAgoMin(60 * 72, 'es')).toBe('hace 3 días');
    expect(fmtAgoMin(60 * 24 * 90, 'es')).toBe('hace 3 meses');
    expect(fmtAgoMin(null, 'es')).toBe('sin fecha');
    expect(fmtAgo('2026-10-29T15:00:00Z', NOW, 'es')).toBe('hace 3 h');
  });
  it('rótulos com os termos do jogo em espanhol', () => {
    expect(dangerHeadline('atenção', 'es')).toBe('Atención');
    expect(dangerHeadline('perigoso', 'es')).toBe('Peligroso');
    expect(dangerHeadline('sem dado', 'es')).toBe('Sin datos suficientes');
    expect(slotLabel('MainHand', 'es')).toBe('Arma');
    expect(slotLabel('armor', 'es')).toBe('Pecho');
    expect(slotLabel('XYZ', 'es')).toBe('XYZ');
    expect(pveLabel('Mists', 'es')).toBe('Nieblas'); // nunca "Brumas" (glossário)
    expect(pveLabel('Outlands', 'es')).toBe('Tierras Lejanas');
    expect(gatherLabel('Hide', 'es')).toBe('Piel');
    expect(plural(1, 'muerte', 'muertes', 'es')).toBe('1 muerte');
    expect(plural(1234, 'muerte', 'muertes', 'es')).toBe('1,234 muertes');
  });
  it('família de arma: rótulo PT da API vira o termo ES; PT e desconhecido passam intactos', () => {
    expect(weaponLabel('Cajado de fogo', 'es')).toBe('Bastón ígneo');
    expect(weaponLabel('Bastão', 'es')).toBe('Vara');
    expect(weaponLabel('Besta', 'es')).toBe('Ballesta');
    expect(weaponLabel('Cajado de fogo', 'pt')).toBe('Cajado de fogo');
    expect(weaponLabel('Arma nova', 'es')).toBe('Arma nova');
    // toda família tem tradução (nenhum rótulo PT sai igual em ES, exceto os que já são iguais nas duas línguas)
    const same = new Set(['Espada', 'Arco']);
    for (const pt of Object.values(WEAPON_LABEL_PT)) {
      if (!same.has(pt)) expect(weaponLabel(pt, 'es'), pt).not.toBe(pt);
    }
  });
  it('sem loc, segue a língua atual do site (e volta ao PT)', () => {
    setCurrentLocale('es');
    expect(fmtAgoMin(5)).toBe('hace 5 min');
    expect(famBars({ Mists: 3, Royal: 1 }, (k) => pveLabel(k)).bars.map((b) => b.label)).toEqual(['Nieblas', 'Continente Real']);
    setCurrentLocale('pt');
    expect(fmtAgoMin(5)).toBe('há 5 min');
    expect(pveLabel('Mists')).toBe('Névoas');
  });
});

describe('insights/format em espanhol', () => {
  it('cobertura e período', () => {
    expect(coverageText('2026-10-30', 1234, 'es')).toBe('Recopilando desde 30/10/2026; muestra de 1,234 muertes.');
    expect(coverageText(null, 1, 'es')).toBe('Recopilación recién iniciada; muestra de 1 muerte.');
    expect(coverageText('2026-10-30', undefined, 'es')).toBe('Recopilando desde 30/10/2026.');
    expect(periodLabel(1, 'es')).toBe('hoy');
    expect(periodLabel(7, 'es')).toBe('últimos 7 días');
  });
  it('horas da guilda', () => {
    const h = Array(24).fill(0);
    h[21] = 5;
    h[8] = 3;
    expect(hourBands(h, 'es').map((b) => b.label)).toEqual(['Madrugada (0h–5h)', 'Mañana (6h–11h)', 'Tarde (12h–17h)', 'Noche (18h–23h)']);
    expect(hoursAria(h, 'es')).toBe('Asesinatos por hora en horario de Brasilia: 8 en total; pico a las 21h.');
    expect(hoursAria(Array(24).fill(0), 'es')).toBe('Sin asesinatos registrados por hora.');
  });
  it('o PT continua igual', () => {
    expect(coverageText('2026-10-30', 1234, 'pt')).toBe('Coletando desde 30/10/2026; amostra de 1.234 mortes.');
    expect(periodLabel(7, 'pt')).toBe('últimos 7 dias');
    expect(hourBands(Array(24).fill(1), 'pt')[1].label).toBe('Manhã (6h–11h)');
  });
});
