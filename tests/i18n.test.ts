// Línguas (src/lib/i18n): caminho ↔ língua, links, o formato dos números e textos em espanhol, e o roteador com /es.
// O português não muda (tests/format.test.ts segue igual); aqui o espanhol é pedido com `loc` explícito.
import { afterEach, describe, expect, it } from 'vitest';
import {
  browserPrefersSpanish, currentLocale, htmlLangFor, intlLocaleFor, localeFromPath, localizePath, setCurrentLocale, stripLocale, switchPath,
} from '../src/lib/i18n/core';
import * as i18n from '../src/lib/i18n/index.svelte';
import {
  ageToneLabel, alertConditionText, cityName, confidenceText, fmtAge, fmtCountdown, fmtInt, fmtLongDate, fmtPct, fmtSilver,
  qualityName, serverLabel, verdictText,
} from '../src/lib/format';
import { match } from '../src/lib/router';

afterEach(() => setCurrentLocale('pt'));

describe('caminho e língua', () => {
  it('só /es e /es/... são espanhol', () => {
    expect(localeFromPath('/es')).toBe('es');
    expect(localeFromPath('/es/')).toBe('es');
    expect(localeFromPath('/es/item/T4_BAG')).toBe('es');
    expect(localeFromPath('/')).toBe('pt');
    expect(localeFromPath('/estrada')).toBe('pt');
    expect(localeFromPath('/escola/es')).toBe('pt');
  });

  it('stripLocale', () => {
    expect(stripLocale('/es')).toBe('/');
    expect(stripLocale('/es/')).toBe('/');
    expect(stripLocale('/es/alertas')).toBe('/alertas');
    expect(stripLocale('/estrada')).toBe('/estrada');
    expect(stripLocale('/alertas')).toBe('/alertas');
  });

  it('localizePath: prefixo, query, âncora, idempotência e externos', () => {
    expect(localizePath('/', 'es')).toBe('/es');
    expect(localizePath('/x', 'es')).toBe('/es/x');
    expect(localizePath('/alertas?item=T4_BAG&q=2', 'es')).toBe('/es/alertas?item=T4_BAG&q=2');
    expect(localizePath('/golpes#golpe-x', 'es')).toBe('/es/golpes#golpe-x');
    expect(localizePath('/?a=1', 'es')).toBe('/es?a=1');
    expect(localizePath('/es/x', 'es')).toBe('/es/x');
    expect(localizePath('/es', 'es')).toBe('/es');
    expect(localizePath('/es/x?y=1', 'pt')).toBe('/x?y=1');
    expect(localizePath('/es', 'pt')).toBe('/');
    expect(localizePath('/x', 'pt')).toBe('/x');
    expect(localizePath('https://discord.com/x', 'es')).toBe('https://discord.com/x');
    expect(localizePath('//cdn.example/x', 'es')).toBe('//cdn.example/x');
    expect(localizePath('#conteudo', 'es')).toBe('#conteudo');
  });

  it('seletor de língua nunca aponta para outro domínio (caminho com "//")', () => {
    expect(stripLocale('/es//evil.com')).toBe('/evil.com');
    expect(localizePath('/es//evil.com', 'pt')).toBe('/evil.com');
    expect(localizePath('/es//evil.com', 'es')).toBe('/es/evil.com');
    expect(switchPath('//evil%2Ecom', '', 'es')).toBe('/es/evil%2Ecom');
    expect(switchPath('//evil%2Ecom', '?a=1', 'pt')).toBe('/evil%2Ecom?a=1');
    expect(switchPath('/es//evil.com', '', 'pt')).toBe('/evil.com');
    expect(switchPath('///x', '#y', 'es')).toBe('/es/x#y');
    expect(switchPath('/item/T4_BAG', '?q=3', 'es')).toBe('/es/item/T4_BAG?q=3');
    expect(switchPath('/es/item/T4_BAG', '?q=3', 'pt')).toBe('/item/T4_BAG?q=3');
    for (const p of ['//evil.com', '/es//evil.com', '///evil.com', '/es///evil.com']) {
      for (const l of ['pt', 'es'] as const) {
        const to = switchPath(p, '', l);
        expect(new URL(to, 'https://guarita.pages.dev/x').origin).toBe('https://guarita.pages.dev');
      }
    }
  });

  it('Intl e <html lang>', () => {
    expect(intlLocaleFor('pt')).toBe('pt-BR');
    expect(intlLocaleFor('es')).toBe('es-419');
    expect(htmlLangFor('pt')).toBe('pt-BR');
    expect(htmlLangFor('es')).toBe('es');
  });

  it('navegador em espanhol: só quando o espanhol vem antes do português', () => {
    expect(browserPrefersSpanish(['es-MX', 'en'])).toBe(true);
    expect(browserPrefersSpanish(['en-US', 'es-419'])).toBe(true);
    expect(browserPrefersSpanish(['pt-BR', 'es'])).toBe(false);
    expect(browserPrefersSpanish(['en-US'])).toBe(false);
    expect(browserPrefersSpanish([])).toBe(false);
    expect(browserPrefersSpanish(undefined)).toBe(false);
  });
});

describe('módulo reativo fora do navegador', () => {
  it('começa em português; tx, href e intlLocale seguem a língua', () => {
    expect(i18n.getLocale()).toBe('pt');
    expect(i18n.tx('Olá', 'Hola')).toBe('Olá');
    expect(i18n.href('/x')).toBe('/x');
    expect(i18n.intlLocale()).toBe('pt-BR');
    i18n.setLocale('es');
    expect(i18n.getLocale()).toBe('es');
    expect(currentLocale()).toBe('es');
    expect(i18n.tx('Olá', 'Hola')).toBe('Hola');
    expect(i18n.href('/x')).toBe('/es/x');
    expect(i18n.href('/')).toBe('/es');
    expect(i18n.intlLocale()).toBe('es-419');
    expect(i18n.htmlLang()).toBe('es');
    i18n.setLocale('pt');
    expect(i18n.tx('Olá', 'Hola')).toBe('Olá');
    expect(i18n.href('/es/x')).toBe('/x');
  });

  it('sem localStorage, lembrar não quebra', () => {
    expect(() => i18n.rememberLocale('es')).not.toThrow();
    expect(i18n.savedLocale()).toBeNull();
  });
});

describe('roteador com /es', () => {
  it('tira o prefixo e devolve a língua', () => {
    expect(match('/es')).toEqual({ name: 'inicio', params: {}, locale: 'es' });
    expect(match('/es/')).toEqual({ name: 'inicio', params: {}, locale: 'es' });
    expect(match('/es/item/T4_BAG@1')).toEqual({ name: 'item', params: { id: 'T4_BAG@1' }, locale: 'es' });
    expect(match('/es/jogador/abc/morte').name).toBe('autopsia');
    expect(match('/item/T4_BAG')).toEqual({ name: 'item', params: { id: 'T4_BAG' }, locale: 'pt' });
    expect(match('/es/nada')).toEqual({ name: 'nao-encontrado', params: {}, locale: 'es' });
    expect(match('/estrada').name).toBe('nao-encontrado');
    expect(match('/estrada').locale).toBe('pt');
  });
});

describe('formato em espanhol', () => {
  const es = 'es' as const;
  it('números com o Intl es-419 e sem "billón"', () => {
    const int = new Intl.NumberFormat('es-419', { maximumFractionDigits: 0 });
    const f1 = new Intl.NumberFormat('es-419', { maximumFractionDigits: 1 });
    const f2 = new Intl.NumberFormat('es-419', { maximumFractionDigits: 2 });
    expect(fmtInt(1234567, es)).toBe(int.format(1234567));
    expect(fmtSilver(1234567.6, false, es)).toBe(int.format(1234568));
    expect(fmtSilver(12345, true, es)).toBe(`${f1.format(12.3)} mil`);
    expect(fmtSilver(1250000, true, es)).toBe(`${f2.format(1.25)} M`);
    expect(fmtSilver(2_000_000_000, true, es)).toBe('2 mil M');
    expect(fmtSilver(2_000_000_000, true, es)).not.toMatch(/bi|bill/);
    expect(fmtPct(0.123, false, es)).toBe(`${f1.format(12.3)}%`);
    expect(fmtSilver(null, false, es)).toBe('—');
  });

  it('a língua atual vale quando `loc` não é passado', () => {
    setCurrentLocale('es');
    expect(fmtAge(12)).toBe('hace 12 min');
    setCurrentLocale('pt');
    expect(fmtAge(12)).toBe('há 12 min');
  });

  it('idade, contagem e rótulos', () => {
    expect(fmtAge(null, es)).toBe('sin datos');
    expect(fmtAge(0, es)).toBe('ahora');
    expect(fmtAge(12, es)).toBe('hace 12 min');
    expect(fmtAge(125, es)).toBe('hace 2 h 5 min');
    expect(fmtAge(60 * 24 * 3, es)).toBe('hace 3 días');
    expect(fmtCountdown(0, es)).toBe('ahora');
    expect(ageToneLabel('old', es)).toBe('precio antiguo');
    expect(serverLabel('manutenção', es)).toBe('En mantenimiento');
    expect(serverLabel('online', es)).toBe('En línea');
    expect(confidenceText('média', es)).toBe('media');
    expect(confidenceText('média', 'pt')).toBe('média');
    expect(verdictText('sem dado', es)).toBe('sin datos');
    expect(verdictText('caro', 'pt')).toBe('caro');
    expect(cityName('Black Market', es)).toBe('Mercado Negro');
    expect(cityName('Black Market', 'pt')).toBe('Black Market');
    expect(cityName('Caerleon', es)).toBe('Caerleon');
    expect(qualityName(5, es)).toBe('Obra maestra');
    expect(qualityName(5, 'pt')).toBe('Obra-prima');
  });

  it('data longa em espanhol, no horário de Brasília', () => {
    expect(fmtLongDate('2026-10-30T01:00:00Z', undefined, es)).toBe('jueves, 29 de octubre');
  });

  it('condição de alerta', () => {
    expect(alertConditionText({ kind: 'below', price: 12000 }, es)).toBe(`por debajo de ${fmtSilver(12000, false, es)}`);
    expect(alertConditionText({ kind: 'above', price: 12000 }, 'pt')).toBe('acima de 12.000');
    expect(alertConditionText({ kind: 'belowMedianPct', pct: 15 }, es)).toBe('15% por debajo de la mediana de 7 días de la ciudad');
  });
});

describe('mensagens próprias do cliente da API (src/lib/api.ts)', () => {
  it('resposta não JSON e erro sem corpo seguem a língua do site; o error do servidor passa como veio', async () => {
    const { api } = await import('../src/lib/api');
    const real = globalThis.fetch;
    const answer = (body: string, status: number) => (async () => new Response(body, { status })) as typeof fetch;
    try {
      globalThis.fetch = answer('<html>', 502);
      await expect(api.clock()).rejects.toThrow('resposta inválida');
      globalThis.fetch = answer('{}', 500);
      await expect(api.clock()).rejects.toThrow('erro 500');
      setCurrentLocale('es');
      globalThis.fetch = answer('<html>', 502);
      await expect(api.clock()).rejects.toThrow('respuesta no válida');
      globalThis.fetch = answer('{}', 500);
      await expect(api.clock()).rejects.toThrow('error 500');
      globalThis.fetch = answer('{"error":"id inválido"}', 400);
      await expect(api.clock()).rejects.toThrow('id inválido');
    } finally {
      globalThis.fetch = real;
      setCurrentLocale('pt');
    }
  });
});
