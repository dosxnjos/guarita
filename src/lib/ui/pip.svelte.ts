// Janela flutuante via Document Picture-in-Picture (Chrome/Edge 116+, só desktop).
// A janela é do navegador, separada do jogo: nada lê ou desenha no cliente do Albion.
// O estado mora no módulo para a janela sobreviver à troca de rota dentro do site.
import { mount, unmount } from 'svelte';
import MiniPainel from './MiniPainel.svelte';
import { htmlLang, tx } from '../i18n/index.svelte';

interface DocumentPiP {
  requestWindow(opts?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  window: Window | null;
}

function dpip(): DocumentPiP | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture ?? null;
}

export function pipSupported(): boolean {
  return dpip() !== null;
}

export const pip = $state({ open: false, error: '' });

let win: Window | null = null;
let app: Record<string, unknown> | null = null;

/** Copia as folhas de estilo da página para a janela (regras inline; se for de outra origem, o <link>). */
function copyStyles(to: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const style = to.createElement('style');
      style.textContent = css;
      to.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = to.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        to.head.appendChild(link);
      }
    }
  }
}

function cleanup() {
  if (app) {
    try {
      unmount(app);
    } catch {
      /* a janela já foi destruída */
    }
  }
  app = null;
  win = null;
  pip.open = false;
}

/** Abre (ou traz para frente) a janela flutuante. Precisa ser chamado direto de um clique. */
export async function openPip(): Promise<void> {
  pip.error = '';
  const api = dpip();
  if (!api) {
    pip.error = tx(
      'Este navegador não tem janela flutuante. Use Chrome ou Edge atualizados no computador.',
      'Este navegador no tiene ventana flotante. Usa Chrome o Edge actualizados en la computadora.',
    );
    return;
  }
  if (win && !win.closed) {
    win.focus();
    return;
  }
  try {
    const w = await api.requestWindow({ width: 360, height: 520 });
    win = w;
    const doc = w.document;
    doc.documentElement.lang = htmlLang();
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) doc.documentElement.setAttribute('data-theme', theme);
    doc.title = 'Guarita';
    copyStyles(doc);
    doc.body.classList.add('pip-body');
    app = mount(MiniPainel, { target: doc.body });
    pip.open = true;
    w.addEventListener('pagehide', cleanup, { once: true });
  } catch (e) {
    cleanup();
    pip.error =
      e instanceof Error && e.name === 'NotAllowedError'
        ? tx('O navegador bloqueou a janela. Clique de novo no botão para abrir.', 'El navegador bloqueó la ventana. Haz clic de nuevo en el botón para abrirla.')
        : tx('Não deu para abrir a janela flutuante neste navegador.', 'No se pudo abrir la ventana flotante en este navegador.');
  }
}

export function closePip(): void {
  if (win && !win.closed) win.close();
  cleanup();
}
