// Núcleo puro das línguas (sem runes, sem DOM): caminho ↔ língua e o locale do Intl.
// Usado pelo módulo reativo (index.svelte.ts), pelo roteador, por format.ts (também importado pelo app de PC) e pelo
// _worker.js (worker/seo.ts, empacotado pelo esbuild, que não compila runes). Testado em tests/i18n.test.ts.
//
// Regra: português é o padrão e não tem prefixo; espanhol mora em /es e /es/... (nenhuma URL em português muda).

export type Locale = 'pt' | 'es';
export const LOCALES: readonly Locale[] = ['pt', 'es'];
/** Chave do localStorage com a língua escolhida no seletor (ou "pt" ao dispensar o aviso em espanhol). */
export const LOCALE_KEY = 'guarita.lingua';

const ES_PREFIX = /^\/es(?=\/|$)/;

/** Língua do caminho: "/es" ou "/es/..." = es; o resto (inclusive "/estrada") = pt. */
export function localeFromPath(pathname: string): Locale {
  return ES_PREFIX.test(pathname) ? 'es' : 'pt';
}

/** Caminho sem o prefixo da língua: "/es/item/X" → "/item/X", "/es" e "/es/" → "/". */
export function stripLocale(pathname: string): string {
  if (!ES_PREFIX.test(pathname)) return pathname;
  // Barras repetidas depois do prefixo ("/es//host") viram uma só: "//host" seria endereço de outro domínio.
  const rest = pathname.replace(ES_PREFIX, '').replace(/^\/{2,}/, '/');
  return rest === '' || rest === '/' ? '/' : rest;
}

/**
 * O mesmo endereço da página atual na outra língua (seletor PT|ES e aviso de língua). O caminho vem do navegador e
 * pode começar com "//" ("guarita.pages.dev//host"): aqui é sempre caminho interno, então as barras iniciais viram
 * uma só antes de localizar (localizePath deixaria "//host" intacto, e o link sairia para outro domínio).
 */
export function switchPath(pathname: string, tail: string, locale: Locale): string {
  const p = '/' + pathname.replace(/^\/+/, '');
  return localizePath(p + tail, locale);
}

/**
 * Caminho interno na língua pedida. Aceita query e âncora ("/alertas?item=X" → "/es/alertas?item=X") e é idempotente
 * (já prefixado não ganha outro prefixo). Para "pt" tira o prefixo. Endereço externo, protocolo, "//host" e "#âncora"
 * passam intactos.
 */
export function localizePath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const tail = cut === -1 ? '' : path.slice(cut);
  const base = stripLocale(pathname);
  if (locale === 'pt') return base + tail;
  return (base === '/' ? '/es' : `/es${base}`) + tail;
}

/** Locale do Intl (números, datas): pt-BR ou espanhol latino. */
export function intlLocaleFor(locale: Locale): 'pt-BR' | 'es-419' {
  return locale === 'es' ? 'es-419' : 'pt-BR';
}

/** Valor do <html lang>. */
export function htmlLangFor(locale: Locale): 'pt-BR' | 'es' {
  return locale === 'es' ? 'es' : 'pt-BR';
}

/** O navegador pede espanhol antes de português? (lista de navigator.languages, na ordem de preferência). */
export function browserPrefersSpanish(languages: readonly string[] | null | undefined): boolean {
  for (const raw of languages ?? []) {
    const l = raw.toLowerCase();
    if (l.startsWith('es')) return true;
    if (l.startsWith('pt')) return false;
  }
  return false;
}

// Espelho não reativo da língua atual, para código puro que não pode importar runes (format.ts). Quem escreve é só
// o módulo reativo (index.svelte.ts). Fora do navegador (vitest, app de PC, Worker) fica em "pt".
// A troca de língua remonta a tela (App.svelte: {#key getLocale()}), então quem lê daqui dentro dela se atualiza.
let current: Locale = 'pt';

export function currentLocale(): Locale {
  return current;
}

/** Só para o módulo reativo e os testes. */
export function setCurrentLocale(l: Locale): void {
  current = l;
}
