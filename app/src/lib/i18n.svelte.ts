// Línguas do app de PC (português padrão, espanhol). Mesmo contrato do site (src/lib/i18n/index.svelte.ts):
// - tx('texto pt', 'texto es'): texto na língua atual; reativo em template e $derived.
// - getLocale(), intlLocale() (Intl/toLocaleString; datas seguem no horário de Brasília nas duas línguas).
//
// Diferença do site: lá a língua vem do caminho (/es/...); aqui vem da preferência guardada na config
// (`config.lingua`: 'auto' | 'pt' | 'es'; 'auto' = língua do Windows, pelo navigator.languages do WebView2).
// Todas as janelas ouvem a mesma config, então a troca feita no painel chega aos widgets pelo evento do store.
//
// Ao aplicar a língua, três espelhos acompanham:
// - o estado deste módulo (tx e getLocale do app);
// - o espelho não reativo de src/lib/i18n/core.ts (setCurrentLocale), que vira o padrão de format.ts,
//   src/lib/timers/presets.ts e src/lib/player/*: rótulos de servidor, idade do preço, qualidade, cidade...;
// - o estado reativo do site (syncLocale com um caminho de mentira, "/es" ou "/"), que os componentes do site
//   importados pelo app (Patient.svelte, AgeDot.svelte) leem. O app não usa o histórico do navegador, então
//   nenhum popstate desfaz a escolha.
// A troca remonta a tela (App.svelte: {#key getLocale()}), e o texto calculado fora do template se refaz.
import {
  browserPrefersSpanish, htmlLangFor, intlLocaleFor, localizePath, setCurrentLocale, type Locale,
} from '../../../src/lib/i18n/core';
import { syncLocale } from '../../../src/lib/i18n/index.svelte';

export type { Locale } from '../../../src/lib/i18n/core';

/** Preferência guardada na config: automático (língua do Windows), português ou espanhol. */
export type PrefLingua = 'auto' | 'pt' | 'es';
export const PREFS_LINGUA: readonly PrefLingua[] = ['auto', 'pt', 'es'];

export function normalizarPrefLingua(v: unknown): PrefLingua {
  return v === 'pt' || v === 'es' ? v : 'auto';
}

/** Línguas do sistema: navigator.languages do WebView2 (segue o idioma de exibição do Windows). */
function linguasDoSistema(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  const n = navigator as Navigator;
  if (Array.isArray(n.languages) && n.languages.length) return n.languages;
  return n.language ? [n.language] : [];
}

/**
 * Língua efetiva da preferência. Automático: espanhol se o sistema pede espanhol antes de português; qualquer outra
 * coisa (português, inglês, nada) fica em português, o padrão do produto. Pura (com `linguas` dado).
 */
export function resolverLingua(pref: PrefLingua, linguas: readonly string[] | null | undefined = linguasDoSistema()): Locale {
  if (pref === 'pt' || pref === 'es') return pref;
  return browserPrefersSpanish(linguas) ? 'es' : 'pt';
}

const state = $state<{ locale: Locale }>({ locale: 'pt' });

export function getLocale(): Locale {
  return state.locale;
}

/** Texto na língua atual. Plural e variável: template string dentro de cada lado. */
export function tx(pt: string, es: string): string {
  return state.locale === 'es' ? es : pt;
}

export function intlLocale(): 'pt-BR' | 'es-419' {
  return intlLocaleFor(state.locale);
}

/** Rótulo do fuso entre parênteses depois de data e hora: "Brasília" (es: "hora de Brasilia"). */
export function brasilia(): string {
  return tx('Brasília', 'hora de Brasilia');
}

export const SITE = 'https://guarita.pages.dev';

/** Endereço de uma página do site na língua pedida (padrão: a atual): "/permitido" → ".../es/permitido". Pura. */
export function linkSite(path: string, loc: Locale = state.locale): string {
  return SITE + localizePath(path, loc);
}

/** Aplica a língua em todos os espelhos (ver o topo). Devolve se mudou. */
export function aplicarLingua(l: Locale): boolean {
  const mudou = state.locale !== l;
  state.locale = l;
  syncLocale(l === 'es' ? '/es' : '/');
  setCurrentLocale(l); // syncLocale já faz; repetido para não depender disso
  if (typeof document !== 'undefined') document.documentElement.lang = htmlLangFor(l);
  return mudou;
}

/** Aplica a língua da preferência (resolvendo o automático). Devolve a língua efetiva. */
export function aplicarPreferencia(pref: PrefLingua): Locale {
  const l = resolverLingua(pref);
  aplicarLingua(l);
  return l;
}
