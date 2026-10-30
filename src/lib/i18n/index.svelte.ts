// Línguas da interface (português padrão, espanhol em /es/...). Contrato fixo para todas as telas:
// - tx('texto pt', 'texto es'): devolve o texto da língua atual; reativo em template e $derived.
// - href('/x'): link interno na língua atual ('/x' → '/es/x' em espanhol, '/' → '/es'). Use com onclick={go}.
// - getLocale(), setLocale(l), intlLocale() (para Intl/toLocaleString; datas seguem no horário de Brasília).
// A língua vem só do caminho (link compartilhado abre na língua do link); o seletor lembra a escolha em
// localStorage 'guarita.lingua', mas nada redireciona sozinho. Lógica pura em ./core.ts.
import {
  LOCALE_KEY, htmlLangFor, intlLocaleFor, localeFromPath, localizePath, setCurrentLocale, switchPath, type Locale,
} from './core';

export type { Locale } from './core';
export { LOCALE_KEY, LOCALES, browserPrefersSpanish, htmlLangFor, localeFromPath, localizePath, stripLocale, switchPath } from './core';

const hasWindow = typeof window !== 'undefined' && typeof location !== 'undefined';

const state = $state<{ locale: Locale }>({ locale: hasWindow ? localeFromPath(location.pathname) : 'pt' });
setCurrentLocale(state.locale);

export function getLocale(): Locale {
  return state.locale;
}

/** Texto na língua atual. Plural e variável: template string dentro de cada lado. */
export function tx(pt: string, es: string): string {
  return state.locale === 'es' ? es : pt;
}

/** Link interno na língua atual (idempotente: já prefixado não muda). */
export function href(path: string): string {
  return localizePath(path, state.locale);
}

export function intlLocale(): 'pt-BR' | 'es-419' {
  return intlLocaleFor(state.locale);
}

/** Valor do <html lang> da língua atual. */
export function htmlLang(): 'pt-BR' | 'es' {
  return htmlLangFor(state.locale);
}

/** Relê a língua do caminho (o roteador chama em toda navegação; popstate também). */
export function syncLocale(pathname: string = hasWindow ? location.pathname : '/'): Locale {
  const l = localeFromPath(pathname);
  if (l !== state.locale) state.locale = l;
  setCurrentLocale(l);
  if (typeof document !== 'undefined') document.documentElement.lang = htmlLangFor(l);
  return l;
}

/** Preferência salva no seletor (ou null). */
export function savedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v === 'pt' || v === 'es' ? v : null;
  } catch {
    return null;
  }
}

export function rememberLocale(l: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, l);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/**
 * Troca de língua: vai para o mesmo caminho (com query e âncora) na outra língua e lembra a escolha.
 * Navega por conta própria: o navigate do roteador mantém o prefixo da língua ATUAL, e aqui o caminho ainda é o da
 * língua antiga (voltar de /es/x para /x pelo navigate daria /es/x de novo).
 */
export function setLocale(l: Locale): void {
  rememberLocale(l);
  if (!hasWindow) {
    state.locale = l;
    setCurrentLocale(l);
    return;
  }
  const to = switchPath(location.pathname, location.search + location.hash, l);
  if (to !== location.pathname + location.search + location.hash) {
    // Defesa extra: nunca navegar para fora do site (pushState de outra origem lança SecurityError).
    try {
      if (new URL(to, location.href).origin !== location.origin) return;
    } catch {
      return;
    }
    history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } else {
    syncLocale();
  }
}

// Voltar/avançar do navegador e navigate() disparam popstate: a língua acompanha o caminho. Registrado no carregamento
// do módulo, antes do ouvinte do App, então a língua já está certa quando a tela recalcula a rota.
if (hasWindow) window.addEventListener('popstate', () => syncLocale());
