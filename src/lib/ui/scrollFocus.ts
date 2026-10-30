// Ação Svelte para contêineres com rolagem (`.table-wrap`): quem usa só o teclado precisa conseguir focar a área para
// rolar a tabela com as setas (WCAG 2.1.1; regra `scrollable-region-focusable` do axe). Só vira parada de Tab quando
// de fato rola: tabela que cabe na tela não ganha uma parada inútil. Tabela dentro de <details> fechado tem tamanho 0
// e passa a rolar quando abre; o ResizeObserver percebe as duas coisas.
//
// Uso: <div class="table-wrap" use:scrollFocus={tx('Tabela de …', 'Tabla de …')}>. Sem rótulo, usa o <caption>.

/** Rola em algum eixo? Pura (folga de 1 px para arredondamento de zoom). */
export function isScrollable(d: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }): boolean {
  return d.scrollWidth > d.clientWidth + 1 || d.scrollHeight > d.clientHeight + 1;
}

type El = Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'scrollHeight' | 'clientHeight' | 'setAttribute' | 'removeAttribute' | 'querySelector'>;

/** Liga ou desliga foco, papel e nome da região conforme a rolagem. Exportada para teste. */
export function applyScrollFocus(node: El, label?: string): void {
  if (isScrollable(node)) {
    const name = label?.trim() || node.querySelector('caption')?.textContent?.trim() || '';
    node.setAttribute('tabindex', '0');
    if (name) {
      node.setAttribute('role', 'region');
      node.setAttribute('aria-label', name);
    }
  } else {
    node.removeAttribute('tabindex');
    node.removeAttribute('role');
    node.removeAttribute('aria-label');
  }
}

export function scrollFocus(node: HTMLElement, label?: string) {
  let current = label;
  const update = () => applyScrollFocus(node, current);
  update();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
  if (ro) {
    ro.observe(node);
    if (node.firstElementChild) ro.observe(node.firstElementChild);
  }
  return {
    update(next?: string) {
      current = next;
      update();
    },
    destroy() {
      ro?.disconnect();
    },
  };
}
