// Língua do bot: o mesmo contrato do site (tx, href, intlLocale), só que com a língua explícita por interação.
// O Worker não pode importar src/lib/i18n/index.svelte.ts (runes; o esbuild do _worker.js não compila) e várias
// interações rodam ao mesmo tempo no mesmo isolate: por isso nada de língua global, cada função recebe `loc`.
// A língua vem de interaction.locale (a do cliente de quem usou o comando): "es-ES", "es-419" etc. → espanhol;
// o resto → português, que continua o padrão e idêntico ao de antes.
import { intlLocaleFor, localizePath, type Locale } from '../../src/lib/i18n/core';

export type { Locale } from '../../src/lib/i18n/core';

export const SITE = 'https://guarita.pages.dev';

/** Locale do Discord (interaction.locale) → língua do bot. Só "es…" vira espanhol. */
export function discordLocale(raw: string | null | undefined): Locale {
  return typeof raw === 'string' && raw.toLowerCase().startsWith('es') ? 'es' : 'pt';
}

/** Texto na língua pedida. Plural e variável: template string dentro de cada lado. */
export function tx(loc: Locale, pt: string, es: string): string {
  return loc === 'es' ? es : pt;
}

/** Caminho interno na língua pedida ('/x' → '/es/x' em espanhol, '/' → '/es'). */
export function href(loc: Locale, path: string): string {
  return localizePath(path, loc);
}

/** Endereço completo no site, na língua pedida (os links dos embeds e botões). A raiz em PT é o SITE sem barra. */
export function siteUrl(loc: Locale, path: string): string {
  const p = href(loc, path);
  return p === '/' ? SITE : SITE + p;
}

/** Locale do Intl para números e datas (datas seguem no horário de Brasília). */
export function intlLocale(loc: Locale): 'pt-BR' | 'es-419' {
  return intlLocaleFor(loc);
}
