// Módulo institucional em espanhol (Rodada 2, b4): golpes, glossário, /status, live e appRelease.
// O português continua o de sempre (os testes antigos de cada módulo seguem valendo); aqui, o espelho em espanhol e
// a lógica nova.
import { describe, expect, it } from 'vitest';
import { SCAMS, SCAM_REPORT_NOTE } from '../shared/scams';
import { GLOSSARY, GLOSSARY_CATEGORY_LABEL, searchGlossary } from '../shared/glossary';
import { SCAMS_ES, nickKindLabel, nickReason, scamReportNote, scamsFor } from '../src/lib/institucional/golpes';
import { GLOSSARY_CATEGORY_LABEL_ES, GLOSSARY_ES, glossaryCategoryLabel, glossaryFor } from '../src/lib/institucional/glossario';
import { CRON_ATRASO_MIN, fetchHealth, fontes, limites, parseHealth, planos, tomMotor } from '../src/lib/institucional/status';
import { LIVE_BLOCKS, LIVE_BLOCK_LABEL, buildLiveUrl, liveBlockLabel, parseLiveConfig } from '../src/lib/live/config';
import { fmtTamanho, rotuloBaixar, type Instalador } from '../src/lib/appRelease';
import { match } from '../src/lib/router';

describe('golpes em espanhol', () => {
  it('todo golpe do catálogo tem tradução com a mesma estrutura', () => {
    expect(Object.keys(SCAMS_ES).sort()).toEqual(SCAMS.map((s) => s.id).sort());
    for (const s of SCAMS) {
      const e = SCAMS_ES[s.id];
      expect(e.signs).toHaveLength(s.signs.length);
      expect(e.protect).toHaveLength(s.protect.length);
      for (const t of [e.title, e.summary, e.how, ...e.signs, ...e.protect]) expect(t.trim()).not.toBe('');
    }
  });

  it('scamsFor: pt é o catálogo original; es mantém ids e ordem', () => {
    expect(scamsFor('pt')).toBe(SCAMS);
    const es = scamsFor('es');
    expect(es.map((s) => s.id)).toEqual(SCAMS.map((s) => s.id));
    expect(es[0].title).toBe(SCAMS_ES[SCAMS[0].id].title);
    expect(scamReportNote('pt')).toBe(SCAM_REPORT_NOTE);
    expect(scamReportNote('es')).toMatch(/^La moderación/);
  });

  it('o espanhol usa os termos do jogo (sem "Brumas", "guilda", "prata")', () => {
    const all = JSON.stringify(SCAMS_ES);
    expect(all).not.toMatch(/\bguilda|\bprata\b|\bBrumas\b|\bloot\b/i);
    expect(all).toMatch(/gremio/);
    expect(all).toMatch(/plata/);
  });

  it('nickReason: pt devolve o texto pronto; es monta pelo tipo e reaproveita os pares', () => {
    const r = { kind: 'homoglifo' as const, distance: 0, reason: 'Igual na tela, com letras que se confundem: “l” virou “I”, “O” virou “0”.' };
    expect(nickReason(r, 'pt')).toBe(r.reason);
    expect(nickReason(r, 'es')).toBe('Igual en la pantalla, con letras que se confunden: “l” cambió a “I”, “O” cambió a “0”.');
    expect(nickReason({ kind: 'homoglifo', distance: 0, reason: 'Igual na tela, com letras que se confundem.' }, 'es'))
      .toBe('Igual en la pantalla, con letras que se confunden.');
    expect(nickReason({ kind: 'exato', distance: 0, reason: 'x' }, 'es')).toBe('El nombre exacto que escribiste.');
    expect(nickReason({ kind: 'caixa', distance: 0, reason: 'x' }, 'es')).toMatch(/mayúsculas/);
    expect(nickReason({ kind: 'edicao', distance: 1, reason: 'x' }, 'es')).toBe('Cambia una letra.');
    expect(nickReason({ kind: 'edicao', distance: 2, reason: 'x' }, 'es')).toBe('Cambian 2 letras.');
  });

  it('nickKindLabel: o português é o de antes', () => {
    expect(nickKindLabel('homoglifo', 'pt')).toBe('Igual na tela');
    expect(nickKindLabel('caixa', 'pt')).toBe('Muda a caixa');
    expect(nickKindLabel('edicao', 'pt')).toBe('Parecido');
    expect(nickKindLabel('homoglifo', 'es')).toBe('Igual en la pantalla');
  });
});

describe('glossário em espanhol', () => {
  it('todo termo tem tradução e toda categoria tem rótulo', () => {
    expect(Object.keys(GLOSSARY_ES).sort()).toEqual(GLOSSARY.map((t) => t.id).sort());
    expect(Object.keys(GLOSSARY_CATEGORY_LABEL_ES).sort()).toEqual(Object.keys(GLOSSARY_CATEGORY_LABEL).sort());
    for (const t of Object.values(GLOSSARY_ES)) {
      expect(t.term.trim()).not.toBe('');
      expect(t.def.trim()).not.toBe('');
    }
  });

  it('glossaryFor: pt é o original; es troca texto e mantém id e categoria', () => {
    expect(glossaryFor('pt')).toBe(GLOSSARY);
    expect(glossaryCategoryLabel('pt')).toBe(GLOSSARY_CATEGORY_LABEL);
    const es = glossaryFor('es');
    expect(es.map((t) => [t.id, t.cat])).toEqual(GLOSSARY.map((t) => [t.id, t.cat]));
  });

  it('a busca em espanhol acha pelo termo do cliente oficial', () => {
    const es = glossaryFor('es');
    expect(searchGlossary('gremio', es)[0].id).toBe('guilda');
    expect(searchGlossary('nieblas', es)[0].id).toBe('brumas');
    expect(searchGlossary('zona negra', es)[0].id).toBe('zona-preta');
    expect(searchGlossary('mercado negro', es)[0].id).toBe('black-market');
    // Quem chega com o termo em inglês continua achando.
    expect(searchGlossary('mists', es)[0].id).toBe('brumas');
  });

  it('qualidades e tiers seguem o jogo em espanhol (Notable, Sobresaliente; iniciado = T4)', () => {
    expect(GLOSSARY_ES.qualidade.def).toMatch(/Normal, Bueno, Notable, Sobresaliente y Obra maestra/);
    expect(GLOSSARY_ES.tier.def).toMatch(/T3 obrero, T4 iniciado/);
  });
});

describe('/status', () => {
  it('rota /status e /es/status', () => {
    expect(match('/status')).toMatchObject({ name: 'status', locale: 'pt' });
    expect(match('/es/status')).toMatchObject({ name: 'status', locale: 'es' });
  });

  it('limites, fontes e planos nas duas línguas, com os números do plano grátis', () => {
    for (const loc of ['pt', 'es'] as const) {
      expect(limites(loc)).toHaveLength(6);
      expect(fontes(loc)).toHaveLength(4);
      expect(planos(loc)).toHaveLength(3);
    }
    expect(limites('pt').map((l) => l.valor)).toEqual(['100 mil por dia', '10 ms', '50', '5 milhões por dia', '100 mil por dia', '5 GB']);
    expect(limites('es')[0].nome).toBe('Solicitudes al Worker');
    expect(planos('pt')[0].custo).toBe('US$ 5 a 10 por mês');
    expect(fontes('es').every((f) => f.url.startsWith('https://'))).toBe(true);
  });

  const cron = (v: object, at = '2026-10-30T07:42:51.057Z') => ({ ok: true, hub: { ok: true, lastCron: { v: JSON.stringify(v), at }, alerts: 0, subs: 0 }, at });

  it('parseHealth lê a resposta real de /api/health', () => {
    const s = parseHealth(cron({ cron: '2,7 * * * *', job: 'killboard', killboard: { pages: 1 }, wallMs: 931 }));
    expect(s).toEqual({ api: true, motor: true, ultimoCron: '2026-10-30T07:42:51.057Z', trabalho: 'killboard', erroNoCron: false });
  });

  it('parseHealth: erro no cron, hub fora e resposta estranha', () => {
    expect(parseHealth(cron({ job: 'alerts', alerts: { error: 'Error: x' } })).erroNoCron).toBe(true);
    expect(parseHealth({ ok: true, hub: { error: 'boom' } })).toMatchObject({ api: true, motor: false, ultimoCron: null });
    expect(parseHealth({ ok: true, hub: { ok: true, lastCron: null } })).toMatchObject({ motor: true, ultimoCron: null });
    expect(parseHealth({ ok: true, hub: { ok: true, lastCron: { v: '{quebrado', at: 'ontem' } } })).toMatchObject({ motor: true, ultimoCron: null, trabalho: null });
    for (const lixo of [null, undefined, 'x', 42, []]) expect(parseHealth(lixo)).toMatchObject({ api: false, motor: false });
  });

  it('tomMotor: verde recente, amarelo atrasado ou com erro, vermelho sem motor', () => {
    const at = Date.parse('2026-10-30T07:42:51.057Z');
    const s = parseHealth(cron({ job: 'killboard' }));
    expect(tomMotor(s, at + 4 * 60000)).toBe('good');
    expect(tomMotor(s, at + (CRON_ATRASO_MIN + 1) * 60000)).toBe('warn');
    expect(tomMotor({ ...s, erroNoCron: true }, at + 60000)).toBe('warn');
    expect(tomMotor({ ...s, ultimoCron: null }, at)).toBe('warn');
    expect(tomMotor({ ...s, motor: false }, at)).toBe('bad');
  });

  it('fetchHealth: falha de rede ou HTTP vira "fora", sem exceção', async () => {
    const ok = (async () => new Response(JSON.stringify(cron({ job: 'alerts' })), { status: 200 })) as unknown as typeof fetch;
    expect((await fetchHealth(ok)).trabalho).toBe('alerts');
    const http500 = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    expect(await fetchHealth(http500)).toMatchObject({ api: false, motor: false });
    const rede = (async () => { throw new TypeError('rede'); }) as unknown as typeof fetch;
    expect(await fetchHealth(rede)).toMatchObject({ api: false, motor: false });
  });
});

describe('live em espanhol', () => {
  it('rótulo dos blocos: pt é o de antes, es em espanhol', () => {
    for (const b of LIVE_BLOCKS) expect(liveBlockLabel(b, 'pt')).toBe(LIVE_BLOCK_LABEL[b]);
    expect(liveBlockLabel('guilda', 'es')).toBe('Historial del gremio');
    // Sem língua: a atual do site (fora do navegador, pt).
    expect(liveBlockLabel('relogio')).toBe('Relógio do servidor');
  });

  it('buildLiveUrl em espanhol aponta para /es/live (o painel no OBS abre em espanhol)', () => {
    const cfg = parseLiveConfig('blocos=relogio');
    expect(buildLiveUrl(cfg, 'https://guarita.pages.dev/')).toBe('https://guarita.pages.dev/live?blocos=relogio');
    expect(buildLiveUrl(cfg, 'https://guarita.pages.dev', 'es')).toBe('https://guarita.pages.dev/es/live?blocos=relogio');
  });
});

describe('appRelease em espanhol', () => {
  const inst: Instalador = { versao: '0.1.0', nome: 'x-setup.exe', url: 'u', tamanhoBytes: 2_563_343, sha256: null, paginaRelease: 'p' };
  it('tamanho e rótulo do botão: pt como antes, es com número es-419', () => {
    expect(fmtTamanho(2_563_343, 'pt')).toBe('2,4 MB');
    expect(fmtTamanho(2_563_343, 'es')).toBe('2.4 MB');
    expect(rotuloBaixar(inst)).toBe('Baixar para Windows (versão 0.1.0, 2,4 MB)');
    expect(rotuloBaixar(inst, 'es')).toBe('Descargar para Windows (versión 0.1.0, 2.4 MB)');
    expect(rotuloBaixar({ ...inst, versao: '', tamanhoBytes: 0 }, 'es')).toBe('Descargar para Windows');
  });
});
