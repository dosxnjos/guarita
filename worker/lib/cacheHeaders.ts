// Cache do navegador para os arquivos estáticos. O `_headers` do Pages não vale para resposta que passa pelo
// `_worker.js` (modo avançado; aqui todo pedido passa por ele, porque não há `_routes.json`), então o cabeçalho é
// posto aqui. Só `/assets/*`: o Vite põe hash do conteúdo no nome (index-B0DYXyAU.js), então o arquivo nunca muda
// e pode ficar um ano no cache. `/data/*`, `/icons/*`, `sw.js` e as páginas não têm hash e seguem o padrão do Pages
// (max-age=0, must-revalidate). O mesmo valor está em `public/_headers`, que vale se um dia o asset for servido
// direto (sem passar pelo worker).

export const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Cache-Control a impor, ou null para manter o do Pages. Pura. */
export function cacheControlFor(pathname: string, status: number): string | null {
  if (status !== 200 && status !== 304) return null;
  return /^\/assets\/[^/]+\.[a-z0-9]+$/i.test(pathname) ? IMMUTABLE : null;
}

export function withCacheHeaders(pathname: string, res: Response): Response {
  const cc = cacheControlFor(pathname, res.status);
  if (!cc) return res;
  // 304 não pode ter corpo (o construtor lança se receber um).
  const out = new Response(res.status === 304 ? null : res.body, res);
  out.headers.set('cache-control', cc);
  return out;
}
