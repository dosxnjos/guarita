// Regras puras das janelas na interface: o que reabrir ao iniciar, opacidade rápida da barra e tema.
// Testado em tests/ui.test.ts.
import type { GuaritaConfig } from './config';
import { OPACITY_MIN, WIDGET_LABELS, clampOpacity, type WidgetLabel } from './windows';

/** Widgets que estavam abertos quando o app fechou (o painel reabre ao iniciar). */
export function widgetsParaReabrir(cfg: GuaritaConfig): WidgetLabel[] {
  return WIDGET_LABELS.filter((l) => cfg.janelas[l]?.aberta);
}

/** Degraus do botão de opacidade da barra do widget (o painel tem o ajuste fino). */
export const DEGRAUS_OPACIDADE = [1, 0.85, 0.7, 0.5, OPACITY_MIN] as const;

/** Próximo degrau, do mais opaco ao mais transparente, voltando ao início. */
export function proximaOpacidade(atual: number): number {
  const v = clampOpacity(atual);
  const prox = DEGRAUS_OPACIDADE.find((d) => d < v - 0.001);
  return prox ?? DEGRAUS_OPACIDADE[0];
}

export const fmtOpacidade = (v: number) => `${Math.round(clampOpacity(v) * 100)}%`;

/** Mesma opacidade em todos os widgets (a "opacidade padrão" do painel). Muta o rascunho. */
export function opacidadeEmTodos(draft: GuaritaConfig, v: number): void {
  for (const l of WIDGET_LABELS) draft.janelas[l].opacidade = clampOpacity(v);
}

// ---------- tema ----------
// Preferência visual guardada no localStorage do WebView2 (todas as janelas do app dividem a mesma origem, e o
// evento `storage` leva a troca às outras janelas na hora). Não fica na config de propósito: é só aparência.

export type Tema = 'escuro' | 'claro' | 'sistema';
export const TEMAS: { id: Tema; nome: string }[] = [
  { id: 'escuro', nome: 'Escuro' },
  { id: 'claro', nome: 'Claro' },
  { id: 'sistema', nome: 'Igual ao Windows' },
];
export const TEMA_CHAVE = 'guarita-app-tema';

export function lerTema(raw: string | null | undefined): Tema {
  return raw === 'claro' || raw === 'sistema' ? raw : 'escuro';
}

/** Valor do atributo data-theme do <html> (null = seguir o Windows). */
export function atributoTema(t: Tema): 'dark' | 'light' | null {
  return t === 'escuro' ? 'dark' : t === 'claro' ? 'light' : null;
}

function guardado(): string | null {
  try {
    return localStorage.getItem(TEMA_CHAVE);
  } catch {
    return null;
  }
}

export function temaAtual(): Tema {
  return lerTema(guardado());
}

export function aplicarTema(t: Tema, root: HTMLElement = document.documentElement): void {
  const a = atributoTema(t);
  if (a) root.dataset.theme = a;
  else delete root.dataset.theme;
}

export function escolherTema(t: Tema): void {
  try {
    localStorage.setItem(TEMA_CHAVE, t);
  } catch {
    // sem armazenamento: vale só nesta janela até fechar
  }
  aplicarTema(t);
}

/** Aplica o tema guardado e acompanha trocas feitas em outras janelas. Devolve a função para parar. */
export function acompanharTema(): () => void {
  aplicarTema(temaAtual());
  const ouvir = (e: StorageEvent) => {
    if (e.key === TEMA_CHAVE) aplicarTema(lerTema(e.newValue));
  };
  window.addEventListener('storage', ouvir);
  return () => window.removeEventListener('storage', ouvir);
}
