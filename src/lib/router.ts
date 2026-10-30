// Roteador por caminho (History API). O _worker.js devolve index.html para qualquer caminho sem extensão.
// Línguas: o espanhol mora em /es/... (src/lib/i18n). match() tira o prefixo e devolve a língua; navigate()/go()
// mantêm o prefixo da língua atual (só setLocale troca de língua).
import { currentLocale, localeFromPath, localizePath, stripLocale, type Locale } from './i18n/core';

export interface Match {
  name: string;
  params: Record<string, string>;
  locale: Locale;
}

const TABLE: [name: string, pattern: RegExp, keys: string[]][] = [
  ['inicio', /^\/$/, []],
  ['item', /^\/item\/([^/]+)$/, ['id']],
  ['relogio', /^\/relogio$/, []],
  ['janela', /^\/janela$/, []],
  ['jogadores', /^\/jogador$/, []],
  ['dossie', /^\/jogador\/([^/]+)$/, ['id']],
  ['autopsia', /^\/jogador\/([^/]+)\/morte$/, ['id']],
  ['alertas', /^\/alertas$/, []],
  ['apoie', /^\/apoie$/, []],
  ['permitido', /^\/permitido$/, []],
  // Fase 2
  ['mais', /^\/mais$/, []],
  ['perdas', /^\/perdas$/, []],
  ['guilda', /^\/guilda\/([^/]+)$/, ['nome']],
  ['guildas', /^\/guilda$/, []],
  ['arriscar', /^\/arriscar$/, []],
  ['golpes', /^\/golpes$/, []],
  ['glossario', /^\/glossario$/, []],
  ['ouro', /^\/ouro$/, []],
  ['saude', /^\/saude$/, []],
  ['mcp', /^\/mcp$/, []],
  ['despertador', /^\/despertador$/, []],
  ['app', /^\/app$/, []],
  // Fase 3
  ['hoje', /^\/hoje$/, []],
  ['previsao', /^\/previsao$/, []],
  ['previsao', /^\/previsao\/([^/]+)$/, ['id']],
  ['live', /^\/live$/, []],
  ['extensao', /^\/extensao$/, []],
  // Rodada 2
  ['status', /^\/status$/, []],
];

export function match(pathname: string): Match {
  const locale = localeFromPath(pathname);
  const path = stripLocale(pathname);
  for (const [name, re, keys] of TABLE) {
    const m = re.exec(path);
    if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), locale };
  }
  return { name: 'nao-encontrado', params: {}, locale };
}

/**
 * Navega sem recarregar, na língua atual ('/x' vira '/es/x' em espanhol; já prefixado não muda).
 * Links internos: <a href={href('/x')} onclick={go}>.
 */
export function navigate(to: string): void {
  history.pushState({}, '', localizePath(to, currentLocale()));
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function go(e: MouseEvent): void {
  const a = (e.currentTarget as HTMLAnchorElement | null) ?? null;
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href') ?? '/');
}
