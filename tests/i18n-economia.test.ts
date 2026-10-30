// Espanhol do grupo de economia (módulo b3): "O que fazer hoje" (API com lang=es e tela), previsão (método traduzido
// e tela), ouro, saúde do dado, arriscar e nick parecido. O português de cada função continua igual (os testes de
// sempre em hoje.test.ts, forecast.test.ts, gold.test.ts e novato.test.ts cobrem isso); aqui entra o lado es e a
// prova de que pt e es dão os mesmos números.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPublic } from './helpers/public';
import type { City, ForecastResponse, PriceRow } from '../shared/types';
import { buildHoje, combinedConfidence, hojeLang, parseHojeParams, planFlip, planRefino, planTransporte, routeHojeImpl, type HojeParams, type HojeSnapshot } from '../worker/api/hoje';
import { NOMES, NOMES_ES, basketIds, nomeDe } from '../shared/hoje';
import { addDays, buildForecast, type DayPoint } from '../shared/forecast';
import { forecastFromHistory, forecastLang, forecastMethodEs, handleForecast } from '../worker/api/forecast';
import { anuncioHoje, parsePrata, trilhaLabel } from '../src/lib/hoje/view';
import { anuncioPrevisao, dayLabel, scoreText } from '../src/lib/forecast/view';
import { cityToneLabel, goldVerdictText, joinPt } from '../src/lib/gold/view';
import { fmtBrl, fmtHours, parseDecimalBr } from '../src/lib/gold/premium';
import { PRESETS, ZONE_TEXT_ES, coverageText, loseLabel, presetPieces, presetText, zoneText } from '../src/lib/novato/arriscar';
import { classifyNick } from '../src/lib/novato/similar';
import { ZONE_RULES } from '../shared/zones';
import { api, langParam } from '../src/lib/api';
import { jsonRes, mockFetch } from './helpers/net';

const NOW = Date.parse('2026-10-30T15:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function row(id: string, city: City, sellMin: number | null, buyMax: number | null = null, ageMin = 5): PriceRow {
  return { id, city, quality: 1, sellMin, sellMinAt: sellMin == null ? null : ago(ageMin), buyMax, buyMaxAt: buyMax == null ? null : ago(ageMin) };
}
function snap(rows: PriceRow[], extra: Partial<HojeSnapshot> = {}): HojeSnapshot {
  return { at: ago(3), stale: false, rows, volume: {}, daily: [], festOk: true, ...extra };
}
const P: HojeParams = { prata: 1_000_000, minutos: 60, premium: true };
const ES: HojeParams = { ...P, lang: 'es' };

/** Palavras que só existem no português da Guarita: não podem sobrar num texto em espanhol. */
const PT_MARKERS = /\b(compre|Leve|Anuncie|Venda|cidade|você|não|prata|taxa de anúncio|imposto|Brumas|Black Market|zona vermelha|cerca de|bônus|histórico|Refino|Limitado a [\d.,]+ unidades: é|visto há|sem data|preço|dias)\b/;
const textos = (ops: { titulo: string; passos: string[]; riscos: string[]; motivos?: string[]; itens: { nome: string }[] }[]) =>
  ops.flatMap((o) => [o.titulo, ...o.passos, ...o.riscos, ...(o.motivos ?? []), ...o.itens.map((i) => i.nome)]);

describe('hoje em espanhol (API)', () => {
  const flipRows = [row('T4_BAG', 'Martlock', 10_000), row('T4_BAG', 'Caerleon', 11_000), row('T4_BAG', 'Black Market', null, 14_000)];
  const refRows = [row('T4_ORE', 'Thetford', 300), row('T3_METALBAR', 'Thetford', 200), row('T4_METALBAR', 'Thetford', 1_000)];
  const trRows = [
    row('T5_PLANKS', 'Fort Sterling', 1_000), row('T5_PLANKS', 'Martlock', 1_300),
    row('T6_PLANKS', 'Caerleon', 1_000), row('T6_PLANKS', 'Martlock', 1_500),
    row('T4_CLOTH', 'Brecilien', 1_000, null, 300), row('T4_CLOTH', 'Lymhurst', 1_500, null, 300),
  ];
  const all = snap([...flipRows, ...refRows, ...trRows], { daily: [{ name: 'COMMON_ORE', start: ago(60), end: ago(-600) }] });

  it('mesmos números em pt e es; só o texto muda', () => {
    const pt = buildHoje(all, P, NOW);
    const es = buildHoje(all, ES, NOW);
    expect(pt.opcoes.length).toBeGreaterThan(3);
    const nums = (r: typeof pt) => r.opcoes.map((o) => [o.trilha, o.lucro, o.capital, o.minutos, o.confianca, o.conta, o.itens.map((i) => [i.id, i.qtd, i.compra, i.venda, i.cidadeCompra, i.cidadeVenda])]);
    expect(nums(es)).toEqual(nums(pt));
    expect(es.opcoes.map((o) => o.titulo)).not.toEqual(pt.opcoes.map((o) => o.titulo));
  });

  it('sem lang (ou lang pt) a resposta é idêntica à de antes', () => {
    expect(buildHoje(all, { ...P, lang: 'pt' }, NOW)).toEqual(buildHoje(all, P, NOW));
  });

  it('títulos, passos, riscos, motivos, notas e nomes em espanhol, sem sobra de português', () => {
    const es = buildHoje(all, ES, NOW);
    const t = [...textos(es.opcoes), ...(es.notas ?? [])];
    for (const s of t) expect(s, s).not.toMatch(PT_MARKERS);
    const flip = es.opcoes.find((o) => o.trilha === 'flip')!;
    expect(flip.titulo).toBe('Reventa: Bolsa del iniciado (T4), de Martlock al Mercado Negro');
    expect(flip.passos[1]).toBe('Llévalo al Mercado Negro, en Caerleon (unos 10 min, cruzando zona roja).');
    const fromCaerleon = planFlip(snap([row('T4_BAG', 'Caerleon', 10_000), row('T4_BAG', 'Black Market', null, 14_000)]), ES, NOW)[0];
    expect(fromCaerleon.passos[1]).toBe('Llévalo al Mercado Negro, que está dentro de Caerleon.');
    expect(flip.passos[2]).toMatch(/Impuesto de 4% con Premium; la venta directa no paga cuota de preparación\./);
    const ref = es.opcoes.find((o) => o.trilha === 'refino')!;
    expect(ref.titulo).toBe('Refinado: Lingote de acero (T4) en Thetford (bonificación del día)');
    expect(ref.passos[0]).toMatch(/^Hoy hay bonificación de refinado de mineral \(\+10%\) hasta /);
    expect(es.notas!.join(' ')).toMatch(/Bonificación de refinado hoy: mineral \(\+10%, en Thetford vale más\)/);
  });

  it('cada trilha sozinha também respeita a língua (bot e MCP chamam getHoje com lang)', () => {
    const red = planTransporte(snap([row('T6_PLANKS', 'Caerleon', 1_000), row('T6_PLANKS', 'Martlock', 1_500)]), ES, NOW)[0];
    expect(red.riscos[0]).toMatch(/^La ruta cruza zona roja: si mueres, pierdes toda la carga \([\d,]+ de plata\)/);
    expect(red.motivos).toContain('ruta por zona roja');
    const mist = planTransporte(snap([row('T5_PLANKS', 'Brecilien', 1_000), row('T5_PLANKS', 'Martlock', 1_500)]), ES, NOW)[0];
    expect(mist.riscos[0]).toMatch(/Nieblas/);
    expect(mist.passos[1]).toMatch(/por el portal de las Nieblas/);
    expect(planFlip(snap(flipRows), ES, NOW)[0].itens[0].nome).toBe('Bolsa del iniciado (T4)');
    expect(planRefino(snap(refRows), ES, NOW)[0].itens.map((i) => i.nome)).toEqual([
      'Mineral de hierro (T4)', 'Lingote de bronce (T3)', 'Lingote de acero (T4)',
    ]);
  });

  it('números em es-419: milhar com vírgula e decimal com ponto', () => {
    const [op] = planRefino(snap(refRows, { volume: { T4_METALBAR: { Thetford: 5_000 } } }), { ...ES, prata: 80_000 }, NOW);
    expect(op.passos.join(' ')).toMatch(/Con foco, la devolución sube a 53\.9%/);
    expect(op.passos.join(' ')).toMatch(/1,000 cada uno/);
    const [lim] = planRefino(snap(refRows, { volume: { T4_METALBAR: { Thetford: 5_000 } } }), { ...ES, minutos: 30 }, NOW);
    expect(lim.riscos.join(' ')).toMatch(/unos 2\.5 s por objeto/);
  });

  it('notas de trilha vazia e de festividade indisponível', () => {
    const r = buildHoje(snap([], { festOk: false, stale: true }), { ...ES, minutos: 15 }, NOW);
    expect(r.notas).toEqual([
      'El Albion Data Project no respondió ahora: parte de los precios viene de la última copia guardada.',
      'No se pudo consultar la bonificación del día; el refinado se calculó solo con la bonificación de la ciudad.',
      'Ninguna reventa al Mercado Negro da ganancia ahora con la plata y el tiempo indicados.',
      'Con menos de 20 minutos no alcanza para cerrar un ciclo de refinado (comprar, refinar y publicar).',
      'Ningún transporte entre ciudades da ganancia, después de los impuestos, con la plata y el tiempo indicados ahora.',
    ]);
  });

  it('selo: motivos traduzidos, mesmo número', () => {
    const sides = [{ price: 100, ageMin: 5 }, { price: 100, ageMin: 200, vol: 1 }];
    const pt = combinedConfidence(sides, 'brumas', true);
    const es = combinedConfidence(sides, 'brumas', true, 'es');
    expect(es.score).toBe(pt.score);
    expect(es.motivos).toEqual(['precio más antiguo visto hace 3 h', 'poco volumen', 'ruta por las Nieblas', 'parte de los datos es una copia guardada']);
    expect(combinedConfidence([{ price: 1, ageMin: null }], 'nenhuma', false, 'es').motivos[0]).toBe('uno de los precios no tiene fecha');
  });

  it('?lang: padrão pt (sem campo lang), es em espanhol, lixo vira pt; erro na língua pedida', () => {
    expect(parseHojeParams(new URLSearchParams('prata=5000000'))).toEqual({ prata: 5_000_000, minutos: 60, premium: false });
    expect(parseHojeParams(new URLSearchParams('prata=5000000&lang=xx'))).toEqual({ prata: 5_000_000, minutos: 60, premium: false });
    expect(parseHojeParams(new URLSearchParams('prata=5000000&premium=sí&lang=ES'))).toEqual({ prata: 5_000_000, minutos: 60, premium: true, lang: 'es' });
    expect(parseHojeParams(new URLSearchParams('lang=es'))).toEqual({ error: 'Indica cuánta plata tienes (parámetro prata).' });
    expect(parseHojeParams(new URLSearchParams('prata=10&lang=es'))).toEqual({ error: 'La plata tiene que ser un número de 1,000 a 100,000,000,000.' });
    expect(parseHojeParams(new URLSearchParams('prata=100000&minutos=5&lang=es'))).toEqual({ error: 'Los minutos tienen que ser un número entero de 15 a 480.' });
    expect(hojeLang('es')).toBe('es');
    expect(hojeLang('es-419')).toBe('pt'); // o bot converte o locale do Discord antes
    expect(hojeLang(undefined)).toBe('pt');
  });

  it('rota: erro 400 em espanhol com ?lang=es', async () => {
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
    const r = (await routeHojeImpl(new Request('https://x/api/hoje?lang=es'), new URL('https://x/api/hoje?lang=es'), {} as never, ctx))!;
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/plata/);
  });
});

describe('nomes da cesta em espanhol', () => {
  it('cobrem a cesta inteira, com o tier no formato de sempre', () => {
    for (const id of basketIds()) {
      expect(NOMES_ES[id], id).toBeTruthy();
      expect(NOMES_ES[id], id).not.toMatch(/ do | Incomuns?\b|Barra|Tábuas|Tecido|Couro|Bloco/);
      expect(NOMES_ES[id].match(/\(T\d(\.\d)?\)$/)?.[0]).toBe(NOMES[id].match(/\(T\d(\.\d)?\)$/)?.[0]);
    }
    expect(NOMES_ES['T4_BAG@1']).toBe('Bolsa del iniciado (T4.1)');
    expect(NOMES_ES['T4_METALBAR_LEVEL1@1']).toBe('Lingote de acero poco común (T4.1)');
    expect(nomeDe('T4_BAG', 'es')).toBe('Bolsa del iniciado (T4)');
    expect(nomeDe('T4_BAG')).toBe('Bolsa do Adepto (T4)');
    expect(nomeDe('XYZ', 'es')).toBe('XYZ');
  });

  it('batem com o nome do jogo em items-index-es.json (sem encantamento: o jogo abrevia um .1)', () => {
    const raw = readPublic('/data/items-index-es.json');
    if (!raw) return; // índice ES gerado pelo build-items (fase Base)
    const idx = new Map((JSON.parse(raw) as { items: [string, string][] }).items.map((i) => [i[0], i[1]]));
    for (const id of basketIds()) {
      if (id.includes('@')) continue;
      const jogo = idx.get(id);
      if (!jogo) continue;
      expect(NOMES_ES[id].replace(/ \(T\d\)$/, ''), id).toBe(jogo);
    }
  });
});

describe('previsão em espanhol (API)', () => {
  const NOWF = Date.parse('2026-10-30T12:00:00Z');
  function series(values: number[], end = '2026-10-29'): DayPoint[] {
    return values.map((v, i) => ({ date: addDays(end, i - values.length + 1), avg: v, count: 100 }));
  }
  const rng = (seed: number) => {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  };
  const r1 = rng(7);
  const r2 = rng(11);
  const weekly = Array.from({ length: 30 }, (_, i) => Math.round((i % 7 === 2 || i % 7 === 3 ? 1300 : 1000) * (1 + (r1() - 0.5) * 0.04)));
  const noisy = Array.from({ length: 20 }, () => Math.round(1000 * (1 + (r2() - 0.5) * 0.4)));
  const cases: [string, DayPoint[], string][] = [
    ['nenhum dia', [], 'Lymhurst'],
    ['só 1 dia', series([100]), 'Lymhurst'],
    ['só 13 dias', series(Array(13).fill(100)), 'Fort Sterling'],
    ['desatualizado', series(Array(25).fill(100), '2026-10-20'), 'Thetford'],
    ['ingênuo (empate)', series(Array(30).fill(500)), 'Lymhurst'],
    ['ingênuo (tendência)', series(Array.from({ length: 30 }, (_, i) => 1000 + i * 40)), 'Caerleon'],
    ['MME semanal', series(weekly), 'Martlock'],
    ['mediana com ruído', series(noisy), 'Black Market'],
    ['último dia anteontem', series(Array(20).fill(100), '2026-10-27'), 'Bridgewatch'],
  ];

  it('todo molde de shared/forecast.ts é traduzido (deriva no texto pt quebra aqui)', () => {
    for (const [nome, pts, place] of cases) {
      const pt = buildForecast(pts, NOWF, place).method;
      const es = forecastMethodEs(pt, place);
      expect(es, `${nome}: ${pt}`).not.toBe(pt);
      expect(es, nome).not.toMatch(/\b(dias|venda|rodadas|teste|errou|prata|Previsão|Dados|Sem venda|Black Market)\b/);
    }
  });

  it('frases exatas', () => {
    expect(forecastMethodEs(buildForecast([], NOWF, 'Lymhurst').method, 'Lymhurst'))
      .toBe('Datos insuficientes: ningún día con venta registrada en Lymhurst en el período (mínimo de 14).');
    expect(forecastMethodEs(buildForecast(series(Array(25).fill(100), '2026-10-20'), NOWF, 'Black Market').method, 'Black Market'))
      .toBe('No hay ventas registradas en Mercado Negro desde el 20/10: prever los próximos días a partir de ahí sería adivinar.');
    expect(forecastMethodEs('Dados insuficientes: só 1 rodada de teste nos últimos 14 dias em Martlock (mínimo de 5).', 'Martlock'))
      .toBe('Datos insuficientes: solo 1 ronda de prueba en los últimos 14 días en Martlock (mínimo de 5).');
    expect(forecastMethodEs(
      'Modelo: média móvel exponencial com ajuste por dia da semana (peso 0,35 para o dia mais recente), sobre 30 dias com venda em Martlock. No teste dos últimos 14 dias (14 rodadas, 1 a 3 dias à frente) errou em média 1.234 prata; repetir o último dia errou 2.345. Último dia com venda: 27/10.',
      'Martlock',
    )).toBe(
      'Modelo: media móvil exponencial con ajuste por día de la semana (peso 0.35 para el día más reciente), sobre 30 días con venta en Martlock. En la prueba de los últimos 14 días (14 rondas, de 1 a 3 días hacia adelante) se equivocó en promedio 1,234 de plata; repetir el último día se equivocó 2,345. Último día con venta: 27/10.',
    );
    expect(forecastMethodEs('algo novo que ninguém traduziu', 'Lymhurst')).toBe('algo novo que ninguém traduziu');
  });

  it('forecastFromHistory: pt por padrão, es pede o método traduzido', () => {
    const hist = [{ city: 'Thetford' as City, points: series(Array(25).fill(100), '2026-10-20') }];
    const pt = forecastFromHistory('T4_BAG', 1, 'Thetford', hist, NOWF, 'x');
    const es = forecastFromHistory('T4_BAG', 1, 'Thetford', hist, NOWF, 'x', 'es');
    expect(pt.method).toMatch(/^Sem venda registrada em Thetford desde 20\/10/);
    expect(es.method).toMatch(/^No hay ventas registradas en Thetford desde el 20\/10/);
    expect({ ...es, method: '' }).toEqual({ ...pt, method: '' });
    expect(forecastLang('es')).toBe('es');
    expect(forecastLang('pt-BR')).toBe('pt');
  });

  it('rota: erros 400 em espanhol com ?lang=es, pt sem ele', async () => {
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const call = (p: string) => handleForecast(new Request('https://x' + p), new URL('https://x' + p), {} as never, ctx);
    const es = (await call('/api/forecast/T4_BAG?q=9&lang=es'))!;
    expect(es.status).toBe(400);
    expect(((await es.json()) as { error: string }).error).toBe('Calidad no válida (usa de 1 a 5).');
    const pt = (await call('/api/forecast/T4_BAG?q=9'))!;
    expect(((await pt.json()) as { error: string }).error).toBe('Qualidade inválida (use de 1 a 5).');
    const city = (await call('/api/forecast/T4_BAG?city=Narnia&lang=es'))!;
    expect(((await city.json()) as { error: string }).error).toBe('Ciudad desconocida: "Narnia".');
  });
});

describe('cliente da API: lang só aparece em espanhol', () => {
  it('URL pt idêntica à de antes; es ganha &lang=es', async () => {
    expect(langParam('pt')).toBe('');
    expect(langParam(undefined)).toBe('');
    expect(langParam('es')).toBe('&lang=es');
    const urls: string[] = [];
    mockFetch((url) => {
      urls.push(url);
      return jsonRes({});
    });
    await api.hoje(1000, 60, true);
    await api.hoje(1000, 60, true, 'es');
    await api.forecast('T4_BAG', null, 2);
    await api.forecast('T4_BAG', 'Martlock', 1, 'es');
    expect(urls.map((u) => u.replace(/^https?:\/\/[^/]+/, ''))).toEqual([
      '/api/hoje?prata=1000&minutos=60&premium=1',
      '/api/hoje?prata=1000&minutos=60&premium=1&lang=es',
      '/api/forecast/T4_BAG?city=&q=2',
      '/api/forecast/T4_BAG?city=Martlock&q=1&lang=es',
    ]);
  });
});

describe('telas: textos em espanhol', () => {
  it('hoje: rótulos, anúncio e prata digitada no jeito do espanhol', () => {
    expect(trilhaLabel('flip', 'es')).toBe('Reventa al Mercado Negro');
    expect(trilhaLabel('flip', 'pt')).toBe('Flip para o Black Market');
    expect(anuncioHoje({ loading: true, error: null, contagem: null }, 'es')).toBe('Consultando los precios de ahora…');
    expect(anuncioHoje({ loading: false, error: null, contagem: { flip: 0, refino: 2, transporte: 1 } }, 'es'))
      .toBe('Opciones listas: ninguna de reventa, 2 de refinado y 1 de transporte.');
    // exemplos que a tela em espanhol mostra (placeholder e ajuda) e o que fmtSilver es-419 escreve no campo
    expect(parsePrata('2,500,000')).toBe(2_500_000);
    expect(parsePrata('2.5 M')).toBe(2_500_000);
    expect(parsePrata('1.5 M')).toBe(1_500_000);
    expect(parsePrata('1,500,000')).toBe(1_500_000);
    expect(parsePrata('300k')).toBe(300_000);
    expect(parsePrata('5,000,000 plata')).toBe(5_000_000);
  });

  it('previsão: dia da semana, placar e anúncio', () => {
    expect(dayLabel('2026-10-30', 'es')).toBe('30/10 (vie)');
    expect(dayLabel('2026-10-31', 'pt')).toBe('31/10 (sáb)');
    const r: ForecastResponse = {
      id: 'T4_BAG', quality: 1, city: 'Black Market', history: [{ date: '2026-10-29', avg: 1000, count: 5 }],
      forecast: [{ date: '2026-10-30', p10: 900, p50: 1000, p90: 1100 }],
      backtest: { days: 12, maeModel: 1500, maeNaive: 2000, beatsNaive: true }, method: 'm', fetchedAt: 'x',
    };
    expect(scoreText(r, 'es')).toBe(
      'En la prueba de los últimos 14 días (12 rondas), el modelo se equivocó en promedio 1,500 de plata y repetir el último día se equivocó 2,000. Es un 25% menos de error.',
    );
    expect(scoreText(r, 'pt')).toMatch(/^No teste dos últimos 14 dias \(12 rodadas\), o modelo errou em média 1\.500 prata/);
    expect(anuncioPrevisao({ loading: false, error: '', data: r }, 'es')).toBe('Previsión cargada para Mercado Negro.');
  });

  it('ouro e saúde do dado', () => {
    expect(goldVerdictText('caro', 30, 'es')).toBe('Caro: por encima del 3.er cuartil de los últimos 30 días.');
    expect(goldVerdictText('sem dado', 30, 'es')).toBe('No hay datos suficientes para comparar.');
    expect(cityToneLabel('bad', 'es')).toBe('Faltan escaneos');
    expect(joinPt(['A', 'B', 'C'], 'es')).toBe('A, B y C');
    expect(joinPt(['A', 'B', 'C'], 'pt')).toBe('A, B e C');
    expect(fmtHours(52, 'es')).toBe('2 días y 4 h');
    expect(fmtBrl(29.9, false, 'es')).toBe('29.90');
    expect(fmtBrl(0.00797, true, 'es')).toBe('0.008');
    expect(fmtBrl(29.9, false, 'pt')).toMatch(/^R\$\s29,90$/);
  });

  it('número digitado: vírgula em grupos de 3 é milhar só em espanhol', () => {
    expect(parseDecimalBr('1,000', 'es')).toBe(1000);
    expect(parseDecimalBr('1,234.5', 'es')).toBe(1234.5);
    expect(parseDecimalBr('29.90', 'es')).toBe(29.9);
    expect(parseDecimalBr('29,90', 'es')).toBe(29.9);
    expect(parseDecimalBr('1.000', 'es')).toBe(1000);
    expect(parseDecimalBr('1,000', 'pt')).toBe(1);
    expect(parseDecimalBr('1.000', 'pt')).toBe(1000);
  });

  it('arriscar: presets, perda, cobertura e zonas', () => {
    const p = PRESETS[0];
    expect(presetText(p, 'es').label).toBe('Set barato de recolección (T4)');
    expect(presetText(p, 'pt')).toEqual({ label: p.label, hint: p.hint });
    for (const pr of PRESETS) for (const it of pr.items) expect(it.nameEs, it.id).toBeTruthy();
    expect(presetPieces(PRESETS[1], 'es')[0].itemName).toBe('Espada ancha del iniciado (T4)');
    expect(presetPieces(PRESETS[1], 'pt')[0].itemName).toBe('Espada Larga do Adepto (T4)');
    expect(loseLabel('tudo', 'es')).toBe('Lo pierdes todo');
    const item = { id: 'X', quality: 1 as const, price: 1, city: null, ageMin: null };
    expect(coverageText({ items: [item, item, item], missing: 1 }, 'es')).toBe('2 de 3 piezas con precio; el total no incluye la pieza sin precio.');
    expect(Object.keys(ZONE_TEXT_ES).sort()).toEqual(ZONE_RULES.map((r) => r.zone).sort());
    for (const r of ZONE_RULES) {
      expect(zoneText(r.zone, 'pt')).toEqual({ label: r.labelPt, who: r.who, death: r.death, note: r.note });
      expect(zoneText(r.zone, 'es').label).not.toBe('');
    }
    expect(zoneText('brumas', 'es').label).toBe('Nieblas');
  });

  it('nick parecido: motivo em espanhol', () => {
    const hit = (name: string) => ({ id: name, name, guild: null, alliance: null, killFame: 0, deathFame: 0 }) as never;
    expect(classifyNick('CalangoPeto', hit('CalangoPeto'), 2, 'es')?.reason).toBe('El nombre exacto que escribiste.');
    expect(classifyNick('CalangoPeto', hit('CaIangoPeto'), 2, 'es')?.reason).toBe('Igual en pantalla, con letras que se confunden: “l” pasó a ser “I”.');
    expect(classifyNick('CalangoPeto', hit('CalangoPetoo'), 2, 'es')?.reason).toBe('Cambia una letra.');
    expect(classifyNick('CalangoPeto', hit('CalangoPetoo'))?.reason).toBe('Muda uma letra.');
  });
});
