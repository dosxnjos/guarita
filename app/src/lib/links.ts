// Links externos abrem no navegador padrão (tauri-plugin-opener, escopo nas capabilities), nunca dentro do app.
import { isTauri } from './windows';

export async function abrirUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Para onclick de <a href>: impede a navegação dentro da janela e abre fora. */
export function abrirLink(e: MouseEvent, url: string): void {
  e.preventDefault();
  void abrirUrl(url);
}
