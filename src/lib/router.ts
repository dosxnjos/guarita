// Roteador por caminho (History API). O _worker.js devolve index.html para qualquer caminho sem extensão.
export interface Match {
  name: string;
  params: Record<string, string>;
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
];

export function match(pathname: string): Match {
  for (const [name, re, keys] of TABLE) {
    const m = re.exec(pathname);
    if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return { name: 'nao-encontrado', params: {} };
}

/** Navega sem recarregar. Links internos: <a href="/x" onclick={go}>. */
export function navigate(to: string): void {
  history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function go(e: MouseEvent): void {
  const a = (e.currentTarget as HTMLAnchorElement | null) ?? null;
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href') ?? '/');
}
