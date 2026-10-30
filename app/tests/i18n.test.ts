// App de PC em português e espanhol: preferência de língua, espelhos (format.ts e componentes do site), textos do
// motor e da tela, voz, API e mensagens do Rust. Regra: espanhol devolve espanhol; português fica idêntico ao de antes.
// Texto do Rust pelo import ?raw do Vite (o app não tem os tipos de node nem de vite/client).
// @ts-expect-error: módulo de texto do Vite
import capturaModRs from '../src-tauri/src/capture/mod.rs?raw';
// @ts-expect-error: módulo de texto do Vite
import capturaCodigosRs from '../src-tauri/src/capture/codigos.rs?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Festivity } from '../../shared/types';
import { currentLocale, setCurrentLocale } from '../../src/lib/i18n/core';
import { tx as txSite, getLocale as getLocaleSite } from '../../src/lib/i18n/index.svelte';
import { createApi, type Fetcher } from '../src/lib/api';
import { mensagemCaptura, rotuloFase, ROTULO_FASE, ROTULO_FASE_ES } from '../src/lib/capture/sessao';
import { defaultConfig, normalizeConfig, type RegraLocal, type TimerLocal } from '../src/lib/config';
import { avisoRelogio } from '../src/lib/engine/clock';
import { mensagemDisparo, tituloDisparo, vozDisparo } from '../src/lib/engine/alerts';
import { avisoTimer, avisoTimersFechados } from '../src/lib/engine/timers';
import { diasFalados, minutosFalados, porExtenso, porExtensoEs, precoFalado } from '../src/lib/fala';
import { articuloHora, fmtAge, serverLabel } from '../src/lib/format';
import {
  aplicarLingua, aplicarPreferencia, getLocale, linkSite, normalizarPrefLingua, resolverLingua, tx,
} from '../src/lib/i18n.svelte';
import { rotuloAcao, validarAtalho } from '../src/lib/shortcuts';
import { capturarAtalho, partesAtalho } from '../src/lib/ui-atalhos';
import { validarFormRegra, formRegraPadrao } from '../src/lib/ui-alertas';
import { nomeTema } from '../src/lib/ui-janelas';
import { urlItemNoSite, urlJogadorNoSite } from '../src/lib/ui-preco';
import { montarTimer } from '../src/lib/ui-timers';
import { escolherVoz, filtrarVozes, langDaFala } from '../src/lib/voice';
import { WIDGET_LABELS, WIDGET_TITLES, WIDGET_TITLES_ES, tituloWidget } from '../src/lib/windows';

const NOW = Date.parse('2026-10-30T15:00:00Z'); // 12:00 em Brasília
const iso = (ms: number) => new Date(ms).toISOString();

afterEach(() => {
  aplicarLingua('pt');
  setCurrentLocale('pt');
});

describe('preferência de língua', () => {
  it('automático segue a língua do sistema; o resto do mundo fica em português', () => {
    expect(resolverLingua('auto', ['es-MX', 'en-US'])).toBe('es');
    expect(resolverLingua('auto', ['es-419'])).toBe('es');
    expect(resolverLingua('auto', ['pt-BR', 'es'])).toBe('pt');
    expect(resolverLingua('auto', ['en-US'])).toBe('pt');
    expect(resolverLingua('auto', [])).toBe('pt');
    expect(resolverLingua('es', ['pt-BR'])).toBe('es');
    expect(resolverLingua('pt', ['es-MX'])).toBe('pt');
  });

  it('config: padrão automático; valor estragado volta ao automático', () => {
    expect(defaultConfig().lingua).toBe('auto');
    expect(normalizeConfig({ lingua: 'es' }).lingua).toBe('es');
    expect(normalizeConfig({ lingua: 'pt' }).lingua).toBe('pt');
    expect(normalizeConfig({ lingua: 'fr' }).lingua).toBe('auto');
    expect(normalizeConfig({}).lingua).toBe('auto');
    expect(normalizarPrefLingua(3)).toBe('auto');
  });

  it('aplicar espanhol vira tx, format.ts (espelho do core) e os componentes do site juntos', () => {
    expect(tx('Fechar', 'Cerrar')).toBe('Fechar');
    aplicarLingua('es');
    expect(getLocale()).toBe('es');
    expect(tx('Fechar', 'Cerrar')).toBe('Cerrar');
    expect(currentLocale()).toBe('es');
    expect(fmtAge(5)).toBe('hace 5 min');
    expect(serverLabel('online')).toBe('En línea');
    expect(getLocaleSite()).toBe('es');
    expect(txSite('pt', 'es')).toBe('es');
    aplicarLingua('pt');
    expect(fmtAge(5)).toBe('há 5 min');
    expect(txSite('pt', 'es')).toBe('pt');
  });

  it('aplicarPreferencia resolve e aplica', () => {
    expect(aplicarPreferencia('es')).toBe('es');
    expect(getLocale()).toBe('es');
    expect(aplicarPreferencia('pt')).toBe('pt');
  });
});

describe('número por extenso em espanhol (voz)', () => {
  it.each([
    [0, 'cero'], [1, 'uno'], [15, 'quince'], [16, 'dieciséis'], [21, 'veintiuno'], [22, 'veintidós'], [30, 'treinta'],
    [31, 'treinta y uno'], [99, 'noventa y nueve'], [100, 'cien'], [101, 'ciento uno'], [115, 'ciento quince'],
    [200, 'doscientos'], [500, 'quinientos'], [999, 'novecientos noventa y nueve'], [1000, 'mil'], [1001, 'mil uno'],
    [2000, 'dos mil'], [3500, 'tres mil quinientos'], [21000, 'veintiún mil'], [31000, 'treinta y un mil'],
    [100000, 'cien mil'], [101000, 'ciento un mil'], [1_000_000, 'un millón'], [2_000_000, 'dos millones'],
    [1_500_000, 'un millón quinientos mil'], [21_000_000, 'veintiún millones'], [1_000_000_000, 'mil millones'],
    [2_500_000_000, 'dos mil quinientos millones'], [1e12, 'un billón'],
  ])('%i → %s', (n, txt) => expect(porExtensoEs(n)).toBe(txt));

  it('negativo, inválido e "un" antes de substantivo', () => {
    expect(porExtensoEs(-2)).toBe('menos dos');
    expect(porExtensoEs(Number.NaN)).toBe('');
    expect(porExtensoEs(21, true)).toBe('veintiún');
    expect(porExtensoEs(1, true)).toBe('un');
    expect(minutosFalados(1, 'es')).toBe('un minuto');
    expect(minutosFalados(21, 'es')).toBe('veintiún minutos');
    expect(minutosFalados(30, 'es')).toBe('treinta minutos');
    expect(diasFalados(1, 'es')).toBe('un día');
    expect(diasFalados(3, 'es')).toBe('tres días');
    expect(precoFalado(1_234_567, 'es')).toBe('un millón doscientos treinta y cinco mil');
    expect(porExtenso(3500, 'es')).toBe('tres mil quinientos');
  });

  it('português continua igual', () => {
    expect(porExtenso(3500)).toBe('três mil e quinhentos');
    expect(minutosFalados(25)).toBe('vinte e cinco minutos');
    expect(diasFalados(1)).toBe('um dia');
  });
});

describe('voz em espanhol', () => {
  const vz = (name: string, lang: string, localService = true) => ({ name, lang, localService }) as SpeechSynthesisVoice;
  const lista = [vz('Maria', 'pt-BR'), vz('Helena', 'es-ES'), vz('Sabina', 'es-MX'), vz('Zira', 'en-US')];

  it('escolhe espanhol da América; ignora a voz guardada se ela não é espanhola', () => {
    expect(escolherVoz(lista, 'Maria', 'es')?.name).toBe('Sabina');
    expect(escolherVoz(lista, 'Helena', 'es')?.name).toBe('Helena');
    expect(escolherVoz(lista, null, 'es')?.name).toBe('Sabina');
    expect(escolherVoz([vz('Helena', 'es-ES'), vz('Maria', 'pt-BR')], null, 'es')?.name).toBe('Helena');
    expect(escolherVoz([vz('Maria', 'pt-BR')], null, 'es')).toBeNull();
    expect(filtrarVozes(lista, 'es').map((v) => v.name)).toEqual(['Sabina', 'Helena']);
    expect(langDaFala('es')).toBe('es-MX');
  });

  it('português continua igual (a guardada vale mesmo se não for pt, salvo se for espanhola)', () => {
    expect(escolherVoz(lista, 'Zira', 'pt')?.name).toBe('Zira');
    // Escolhida com o app em espanhol e o app voltou ao português: a fala não sai na voz espanhola.
    expect(escolherVoz(lista, 'Sabina', 'pt')?.name).toBe('Maria');
    expect(escolherVoz(lista, 'Helena', 'pt')?.name).toBe('Maria');
    expect(escolherVoz([...lista, vz('Francisca Online', 'pt-BR')], 'Sabina', 'pt')?.name).toBe('Francisca Online');
    expect(escolherVoz(lista, null, 'pt')?.name).toBe('Maria');
    expect(filtrarVozes(lista, 'pt').map((v) => v.name)).toEqual(['Maria']);
    expect(langDaFala('pt')).toBe('pt-BR');
  });

  describe('a fala sai na língua em que entrou na fila', () => {
    class Utter {
      lang = '';
      volume = 1;
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    const faladas: Utter[] = [];
    beforeEach(() => {
      vi.resetModules();
      faladas.length = 0;
      vi.stubGlobal('speechSynthesis', {
        speak: (u: Utter) => faladas.push(u),
        cancel: () => {},
        getVoices: () => lista,
        addEventListener: () => {},
      });
      vi.stubGlobal('SpeechSynthesisUtterance', Utter);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('espanhol com voz espanhola, português com voz portuguesa', async () => {
      const core = await import('../../src/lib/i18n/core');
      const v = await import('../src/lib/voice');
      core.setCurrentLocale('es');
      v.falar('El servidor volvió.');
      await new Promise((r) => setTimeout(r, 0));
      expect(faladas[0].lang).toBe('es-MX');
      expect((faladas[0].voice as SpeechSynthesisVoice).name).toBe('Sabina');
      core.setCurrentLocale('pt');
      v.falar('O servidor voltou.');
      faladas[0].onend!();
      await new Promise((r) => setTimeout(r, 0));
      expect(faladas[1].lang).toBe('pt-BR');
      expect((faladas[1].voice as SpeechSynthesisVoice).name).toBe('Maria');
    });
  });
});

describe('textos do motor (notificação e voz)', () => {
  const regra = (p: Partial<RegraLocal> = {}): RegraLocal => ({
    id: 'r1', itemId: 'T4_BAG', itemName: 'Bolsa del iniciado', quality: 1, cities: ['Lymhurst'], side: 'sell',
    condition: { kind: 'below', price: 4000 }, cooldownMin: 60, createdAt: iso(NOW), ativa: true, voz: true, ...p,
  });

  it('alerta de preço em espanhol', () => {
    expect(mensagemDisparo(regra(), { city: 'Lymhurst', price: 3550, ageMin: 4 }, 'es')).toBe(
      'Bolsa del iniciado a 3,550 en Lymhurst (visto hace 4 min). Por debajo de tu objetivo de 4,000.',
    );
    expect(mensagemDisparo(regra({ side: 'buy', cities: ['Black Market'], condition: { kind: 'above', price: 3000 }, quality: 4 }), { city: 'Black Market', price: 3550, ageMin: 0 }, 'es')).toBe(
      'Bolsa del iniciado (Sobresaliente): orden de compra a 3,550 en Mercado Negro (visto ahora). Por encima de tu objetivo de 3,000.',
    );
    expect(mensagemDisparo(regra({ condition: { kind: 'belowMedianPct', pct: 10 } }), { city: 'Lymhurst', price: 900, ageMin: 1, median: 1000 }, 'es')).toBe(
      'Bolsa del iniciado a 900 en Lymhurst (visto hace 1 min). 10% por debajo de la mediana de 7 días de la ciudad (1,000).',
    );
    expect(vozDisparo(regra(), { city: 'Lymhurst', price: 3500 }, 'es')).toBe('Bolsa del iniciado a tres mil quinientos en Lymhurst');
    expect(tituloDisparo('sell', 'es')).toBe('Precio en tu objetivo');
  });

  it('alerta de preço em português continua igual', () => {
    const r = regra({ itemName: 'Bolsa do Adepto' });
    expect(mensagemDisparo(r, { city: 'Lymhurst', price: 3550, ageMin: 4 }, 'pt')).toBe(
      'Bolsa do Adepto a 3.550 em Lymhurst (visto há 4 min). Abaixo do seu alvo de 4.000.',
    );
    expect(vozDisparo(r, { city: 'Lymhurst', price: 3500 }, 'pt')).toBe('Bolsa do Adepto a três mil e quinhentos em Lymhurst');
    expect(tituloDisparo('sell', 'pt')).toBe('Preço no alvo');
    expect(tituloDisparo('buy', 'pt')).toBe('Pedido de compra no alvo');
  });

  const fest: Festivity = {
    kind: 2, category: 'PRODUCTION', name: 'T4_WOOD', labelPt: 'Bônus de produção: madeira', start: iso(NOW - 3600_000), end: iso(NOW + 25 * 60000),
  } as Festivity;

  it('relógio em espanhol, com o nome da festividade montado em espanhol e hora de Brasília', () => {
    const a = avisoRelogio({ tipo: 'bonusAcabando', festividade: fest, faltamMin: 25 }, 'es');
    expect(a.titulo).toBe('Bonificación por terminar');
    expect(a.corpo).toMatch(/^Bonificación.* termina en 25 min, a las 12:25 \(hora de Brasilia\)\.$/);
    expect(a.voz).toMatch(/termina en veinticinco minutos\.$/);
    expect(a.corpo).not.toContain('Bônus');
    expect(avisoRelogio({ tipo: 'servidorVoltou' }, 'es')).toMatchObject({ titulo: 'Servidor de vuelta', voz: 'El servidor volvió.' });
    expect(avisoRelogio({ tipo: 'servidorCaiu', mensagem: '', status: 'manutenção' }, 'es').titulo).toBe('Servidor en mantenimiento');
    const t = avisoRelogio({ tipo: 'temporadaAcabando', faltamDias: 3, nome: 'Temporada 34', fim: iso(NOW + 3 * 86400_000), marco: 3 }, 'es');
    expect(t.corpo).toContain('faltan cerca de 3 días');
    expect(t.voz).toBe('La temporada termina en unos tres días.');
    const um = avisoRelogio({ tipo: 'temporadaAcabando', faltamDias: 1, nome: 'Temporada 34', fim: iso(NOW + 86400_000), marco: 1 }, 'es');
    expect(um.voz).toBe('La temporada termina en un día.');
    expect(um.corpo).toContain('falta cerca de 1 día');
  });

  it('relógio em português continua igual', () => {
    const a = avisoRelogio({ tipo: 'bonusAcabando', festividade: fest, faltamMin: 25 }, 'pt');
    expect(a.corpo).toBe('Bônus de produção: madeira termina em 25 min, às 12:25 (horário de Brasília).');
    expect(a.voz).toBe('Bônus de produção: madeira acaba em vinte e cinco minutos.');
  });

  const timer = (id: string, endsAt: number, p: Partial<TimerLocal> = {}): TimerLocal => ({
    id, kind: 'plantacao', label: '', endsAt: iso(endsAt), createdAt: iso(NOW - 3600_000), ...p,
  });

  it('despertador em espanhol', () => {
    expect(avisoTimer(timer('a', NOW), NOW, false, 'es')).toMatchObject({
      titulo: 'Cultivos listos', corpo: 'Cultivos listos: terminó ahora, a las 12:00 (hora de Brasilia).', voz: 'Cultivos listos.',
    });
    expect(avisoTimer(timer('b', NOW - 5 * 60000, { label: 'Isla' }), NOW, false, 'es').voz).toBe('Isla: terminó hace cinco minutos.');
    expect(avisoTimer(timer('c', NOW - 90 * 60000), NOW, true, 'es').corpo).toContain('mientras la app estaba cerrada');
    // 1 da manhã leva o artigo no singular ("a la 01:20"); o português não muda ("às 01:20").
    const t0120 = NOW - (10 * 60 + 40) * 60000;
    expect(avisoTimer(timer('d', t0120), t0120, false, 'es').corpo).toBe('Cultivos listos: terminó ahora, a la 01:20 (hora de Brasilia).');
    expect(avisoTimer(timer('d', t0120), t0120, true, 'es').corpo).toBe('Cultivos listos: terminó a la 01:20 (hora de Brasilia), mientras la app estaba cerrada.');
    expect(avisoTimer(timer('d', t0120), t0120, false, 'pt').corpo).toBe('Plantação pronta: venceu agora, às 01:20 (horário de Brasília).');
    expect(articuloHora('01:05')).toBe('la');
    expect(articuloHora('00:30')).toBe('las');
    expect(articuloHora('11:00')).toBe('las');
    expect(articuloHora('21:15')).toBe('las');
    expect(avisoTimersFechados([timer('x', NOW), timer('y', NOW, { kind: 'foco' }), timer('z', NOW, { kind: 'outro' })], 'es').corpo).toBe(
      '3 recordatorios terminaron mientras la app estaba cerrada: 1 cultivo, 1 foco y 1 otro recordatorio.',
    );
  });

  it('despertador em português continua igual', () => {
    expect(avisoTimer(timer('a', NOW), NOW, false, 'pt').corpo).toBe('Plantação pronta: venceu agora, às 12:00 (horário de Brasília).');
  });
});

describe('telas: rótulos, atalhos e formulários', () => {
  it('títulos dos widgets nas duas línguas (mesmas chaves)', () => {
    expect(Object.keys(WIDGET_TITLES_ES).sort()).toEqual([...WIDGET_LABELS].sort());
    expect(tituloWidget('loot', 'es')).toBe('Botín');
    expect(tituloWidget('dossie', 'es')).toBe('Dosier');
    expect(tituloWidget('preco', 'pt')).toBe(WIDGET_TITLES.preco);
    expect(tituloWidget('preco', 'pt')).toBe('Preço rápido');
  });

  it('fase da captura, tema e ação de atalho', () => {
    expect(rotuloFase('aguardando-mapa', 'es')).toEqual(['Cambia de mapa una vez', 'info']);
    expect(rotuloFase('aguardando-mapa', 'pt')).toEqual(ROTULO_FASE['aguardando-mapa']);
    expect(Object.keys(ROTULO_FASE_ES).sort()).toEqual(Object.keys(ROTULO_FASE).sort());
    expect(nomeTema('sistema', 'es')).toBe('Igual que Windows');
    expect(nomeTema('sistema', 'pt')).toBe('Igual ao Windows');
    expect(rotuloAcao('abrirDossie', 'es')).toBe('Abrir el dosier');
    expect(rotuloAcao('abrirDossie', 'pt')).toBe('Abrir o dossiê');
  });

  it('atalhos: validação e captura em espanhol; português igual', () => {
    expect(validarAtalho('P', 'es')).toMatch(/Ctrl, Alt o Win/);
    expect(validarAtalho('Ctrl+C', 'es')).toMatch(/atajo de Windows/);
    expect(validarAtalho('', 'es')).toBe('Elige una combinación de teclas.');
    expect(validarAtalho('', 'pt')).toBe('Escolha uma combinação de teclas.');
    const q = capturarAtalho({ key: 'q', code: 'KeyQ', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, 'es');
    expect(q).toMatchObject({ tipo: 'invalido', motivo: expect.stringMatching(/^Usa Ctrl/) });
    expect(partesAtalho('Ctrl+Space', 'es')).toEqual(['Ctrl', 'Espacio']);
    expect(partesAtalho('Ctrl+Space', 'pt')).toEqual(['Ctrl', 'Espaço']);
  });

  it('formulários de alerta e de lembrete em espanhol', () => {
    const base = { ...formRegraPadrao(), itemId: 'T4_BAG', valor: '12000' };
    expect(validarFormRegra({ ...base, itemId: '' }, 0, 'es').item).toBe('Elige un objeto de la lista.');
    expect(validarFormRegra({ ...base, cities: ['Black Market'] }, 0, 'es').cities).toContain('Mercado Negro');
    expect(validarFormRegra({ ...base, valor: '12,000' }, 0, 'es')).toEqual({}); // milhar com vírgula em es-419
    expect(validarFormRegra({ ...base, itemId: '' }, 0, 'pt').item).toBe('Escolha um item na lista.');
    const cheio = montarTimer({ preset: 'plantacao', label: '', hours: '', minutes: '', tier: 4, focus: '', premium: true }, 50, NOW, 'x', 'es');
    expect(cheio).toEqual({ ok: false, erro: 'La app ya tiene 50 recordatorios. Borra uno para crear otro.' });
    const ok = montarTimer({ preset: 'plantacao', label: '', hours: '', minutes: '', tier: 4, focus: '', premium: true }, 0, NOW, 'x', 'es');
    expect(ok.ok && ok.timer.label).toBe('Cultivos');
  });

  it('links do site na língua do app', () => {
    expect(urlItemNoSite('T4_BAG@1', 3, 'es')).toBe('https://guarita.pages.dev/es/item/T4_BAG%401?q=3');
    expect(urlJogadorNoSite('ab c', 'es')).toBe('https://guarita.pages.dev/es/jogador/ab%20c');
    expect(urlItemNoSite('T4_BAG', 1, 'pt')).toBe('https://guarita.pages.dev/item/T4_BAG');
    expect(linkSite('/permitido', 'es')).toBe('https://guarita.pages.dev/es/permitido');
    expect(linkSite('/permitido', 'pt')).toBe('https://guarita.pages.dev/permitido');
  });
});

describe('API em espanhol', () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('rotas /api ganham lang=es; índice de itens ES; português sem mudança', async () => {
    const f = vi.fn<Fetcher>(async () => ok({ v: 1, items: [['T4_BAG', 'x', 'y', 4, 0]] }));
    const es = createApi({ fetcher: f, lingua: () => 'es' });
    await es.item('t4_bag', 2);
    await es.dossier('abc');
    await es.clock();
    await es.itemsIndex();
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://guarita.pages.dev/api/item/T4_BAG?q=2&lang=es',
      'https://guarita.pages.dev/api/player/abc?lang=es',
      'https://guarita.pages.dev/api/clock?lang=es',
      'https://guarita.pages.dev/data/items-index-es.json',
    ]);
    f.mockClear();
    const pt = createApi({ fetcher: f, lingua: () => 'pt' });
    await pt.item('t4_bag', 2);
    await pt.itemsIndex();
    expect(f.mock.calls.map((c) => c[0])).toEqual(['https://guarita.pages.dev/api/item/T4_BAG?q=2', 'https://guarita.pages.dev/data/items-index.json']);
  });

  it('erro de rede explicado em espanhol; em português igual', async () => {
    const falha: Fetcher = async () => {
      throw new TypeError('x');
    };
    await expect(createApi({ fetcher: falha, lingua: () => 'es' }).clock()).rejects.toMatchObject({ message: 'Sin conexión con la Guarita. Revisa tu internet e inténtalo de nuevo.' });
    await expect(createApi({ fetcher: falha, lingua: () => 'pt' }).clock()).rejects.toMatchObject({ message: 'Sem conexão com a Guarita. Verifique a internet e tente de novo.' });
  });
});

describe('mensagens do Rust da captura', () => {
  const rust = String(capturaModRs) + String(capturaCodigosRs);
  const ligar = 'Para ligar a captura, leia e aceite o aviso sobre a leitura do tráfego de rede.';
  const caiu = 'A leitura da rede parou (o computador suspendeu, o Wi-Fi reiniciou ou a placa de rede sumiu). Ligue a captura de novo.';

  it('os textos traduzidos ainda são os que o Rust manda (mudou lá, muda em sessao.ts)', () => {
    expect(rust).toContain(ligar);
    expect(rust).toContain(caiu);
    expect(rust).toContain('tabela remota recusada (assinatura)');
  });

  it('espanhol traduz as conhecidas; o resto passa igual; português não mexe', () => {
    expect(mensagemCaptura(ligar, 'es')).toBe('Para activar la captura, lee y acepta el aviso sobre la lectura del tráfico de red.');
    expect(mensagemCaptura(caiu, 'es')).toMatch(/^La lectura de la red se detuvo/);
    expect(mensagemCaptura('porta 1234 não é do Albion na tabela de códigos', 'es')).toBe('el puerto 1234 no es de Albion en la tabla de códigos');
    expect(mensagemCaptura('wpcap.dll: erro 126', 'es')).toBe('wpcap.dll: erro 126');
    expect(mensagemCaptura(caiu, 'pt')).toBe(caiu);
  });
});
