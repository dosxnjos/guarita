// Módulo C (acessibilidade e performance): regiões com rolagem focáveis, recarga única quando um arquivo de tela
// some depois do deploy, e cache longo só para /assets/*.
import { describe, expect, it } from 'vitest';
import { applyScrollFocus, isScrollable } from '../src/lib/ui/scrollFocus';
import { RETRY_WINDOW_MS, shouldRetryChunk } from '../src/lib/lazyView';
import { IMMUTABLE, cacheControlFor, withCacheHeaders } from '../worker/lib/cacheHeaders';

function fakeEl(dims: { sw: number; cw: number; sh?: number; ch?: number }, caption: string | null = null) {
  const attrs = new Map<string, string>();
  return {
    attrs,
    scrollWidth: dims.sw,
    clientWidth: dims.cw,
    scrollHeight: dims.sh ?? 100,
    clientHeight: dims.ch ?? 100,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    querySelector: (sel: string) => (sel === 'caption' && caption !== null ? ({ textContent: caption } as Element) : null),
  };
}

describe('scrollFocus', () => {
  it('só considera rolagem acima da folga de 1 px', () => {
    expect(isScrollable({ scrollWidth: 400, clientWidth: 400, scrollHeight: 10, clientHeight: 10 })).toBe(false);
    expect(isScrollable({ scrollWidth: 401, clientWidth: 400, scrollHeight: 10, clientHeight: 10 })).toBe(false);
    expect(isScrollable({ scrollWidth: 402, clientWidth: 400, scrollHeight: 10, clientHeight: 10 })).toBe(true);
    expect(isScrollable({ scrollWidth: 10, clientWidth: 10, scrollHeight: 400, clientHeight: 320 })).toBe(true);
  });

  it('tabela que rola vira região focável com o rótulo dado', () => {
    const el = fakeEl({ sw: 700, cw: 360 });
    applyScrollFocus(el as never, 'Tabela de flips');
    expect(el.attrs.get('tabindex')).toBe('0');
    expect(el.attrs.get('role')).toBe('region');
    expect(el.attrs.get('aria-label')).toBe('Tabela de flips');
  });

  it('sem rótulo usa o caption da tabela', () => {
    const el = fakeEl({ sw: 700, cw: 360 }, '  Preço por cidade  ');
    applyScrollFocus(el as never);
    expect(el.attrs.get('aria-label')).toBe('Preço por cidade');
  });

  it('sem rótulo nem caption fica só focável, sem região anônima', () => {
    const el = fakeEl({ sw: 700, cw: 360 });
    applyScrollFocus(el as never);
    expect(el.attrs.get('tabindex')).toBe('0');
    expect(el.attrs.has('role')).toBe(false);
  });

  it('tabela que cabe (ou <details> fechado, tamanho 0) não ganha parada de Tab e perde a que tinha', () => {
    const el = fakeEl({ sw: 700, cw: 360 });
    applyScrollFocus(el as never, 'x');
    el.scrollWidth = 0;
    el.clientWidth = 0;
    el.scrollHeight = 0;
    el.clientHeight = 0;
    applyScrollFocus(el as never, 'x');
    expect([...el.attrs.keys()]).toEqual([]);
  });
});

describe('recarga quando o arquivo da tela some (deploy novo)', () => {
  const now = 1_800_000_000_000;
  it('recarrega se nunca recarregou ou se a última foi há mais de um minuto', () => {
    expect(shouldRetryChunk(null, now)).toBe(true);
    expect(shouldRetryChunk('lixo', now)).toBe(true);
    expect(shouldRetryChunk(String(now - RETRY_WINDOW_MS - 1), now)).toBe(true);
  });
  it('não recarrega em laço dentro da janela', () => {
    expect(shouldRetryChunk(String(now - 5_000), now)).toBe(false);
    expect(shouldRetryChunk(String(now), now)).toBe(false);
  });
  it('carimbo no futuro (relógio mudou) não trava a recarga', () => {
    expect(shouldRetryChunk(String(now + 3_600_000), now)).toBe(true);
  });
});

describe('cache de /assets/*', () => {
  it('um ano e immutable só para arquivo com hash em /assets/', () => {
    expect(cacheControlFor('/assets/index-B0DYXyAU.js', 200)).toBe(IMMUTABLE);
    expect(cacheControlFor('/assets/Hoje-Cx1.css', 304)).toBe(IMMUTABLE);
    expect(cacheControlFor('/assets/index-B0DYXyAU.js', 404)).toBeNull();
    for (const p of ['/', '/item/T4_BAG', '/sw.js', '/data/items-index.json', '/icons/icon.svg', '/assets/', '/assets/sub/x.js']) {
      expect(cacheControlFor(p, 200)).toBeNull();
    }
  });

  it('troca o Cache-Control e mantém corpo e demais cabeçalhos', async () => {
    const res = new Response('ok', { status: 200, headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=0, must-revalidate', etag: '"x"' } });
    const out = withCacheHeaders('/assets/a-1.js', res);
    expect(out.headers.get('cache-control')).toBe(IMMUTABLE);
    expect(out.headers.get('etag')).toBe('"x"');
    expect(await out.text()).toBe('ok');
    const notModified = withCacheHeaders('/assets/a-1.js', new Response(null, { status: 304, headers: { etag: '"x"' } }));
    expect(notModified.status).toBe(304);
    expect(notModified.headers.get('cache-control')).toBe(IMMUTABLE);
    const page = new Response('<html>', { headers: { 'cache-control': 'public, max-age=0, must-revalidate' } });
    expect(withCacheHeaders('/item/T4_BAG', page)).toBe(page);
  });
});
