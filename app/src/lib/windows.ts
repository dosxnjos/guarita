// Janelas do app: rótulos, títulos e a ponte para os comandos Rust (src-tauri/src/lib.rs).
// Arquitetura: um bundle só; cada janela descobre o que desenhar pelo próprio rótulo (getCurrentWindow().label).
// Fora do Tauri (vite:dev no navegador), o rótulo vem de ?w=<rótulo> para desenvolver a tela.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const PAINEL = 'painel' as const;
export const WIDGET_LABELS = ['preco', 'dossie', 'relogio', 'alertas', 'despertador', 'lente'] as const;
export type WidgetLabel = (typeof WIDGET_LABELS)[number];
export type WindowLabel = typeof PAINEL | WidgetLabel;

/** Mesmos títulos do WIDGETS em lib.rs (o menu da bandeja usa os de lá). */
export const WIDGET_TITLES: Record<WidgetLabel, string> = {
  preco: 'Preço rápido',
  dossie: 'Dossiê',
  relogio: 'Relógio',
  alertas: 'Alertas',
  despertador: 'Despertador',
  lente: 'Lente de mercado',
};

export interface WidgetInfo {
  label: WidgetLabel;
  title: string;
  open: boolean;
  visible: boolean;
}

/** Evento que a bandeja (e tray_set_muted) emite a todas as janelas; payload: true = voz silenciada. */
export const EV_VOZ_SILENCIADA = 'guarita://voz-silenciada';

export function isWidgetLabel(s: unknown): s is WidgetLabel {
  return typeof s === 'string' && (WIDGET_LABELS as readonly string[]).includes(s);
}

/** Roda dentro do app (WebView2 com Tauri) e não num navegador comum? */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Rótulo desta janela: o do Tauri; no navegador, ?w=<rótulo> ou o painel. */
export function currentLabel(): WindowLabel {
  if (isTauri()) {
    const l = getCurrentWindow().label;
    return isWidgetLabel(l) ? l : PAINEL;
  }
  const w = new URLSearchParams(location.search).get('w');
  return isWidgetLabel(w) ? w : PAINEL;
}

// ---------- comandos Rust (permissão por janela em src-tauri/capabilities) ----------

export const openWidget = (label: WidgetLabel) => invoke<void>('widget_open', { label });
export const closeWidget = (label: WidgetLabel) => invoke<void>('widget_close', { label });
export const focusWidget = (label: WidgetLabel) => invoke<void>('widget_focus', { label });
/** Abre se fechado ou escondido; fecha se visível. Devolve se ficou aberto. */
export const toggleWidget = (label: WidgetLabel) => invoke<boolean>('widget_toggle', { label });
export const listWidgets = () => invoke<WidgetInfo[]>('widget_list');
/**
 * "Sempre por cima". Ligar exige `config.avisoSbiAceitoEm` preenchido: o Rust confere e recusa com mensagem
 * em PT-BR se o aviso não foi aceito. Só a tela (AvisoSbi) grava o aceite.
 */
export const setOnTop = (label: WindowLabel, on: boolean) => invoke<void>('widget_set_on_top', { label, on });
export const hideAllWidgets = () => invoke<void>('widgets_hide_all');
export const showAllWidgets = () => invoke<void>('widgets_show_all');
/** Fechar o painel: true esconde na bandeja; false (padrão) encerra o app. */
export const setCloseToTray = (on: boolean) => invoke<void>('set_close_to_tray', { on });
/** Marca/desmarca "Silenciar voz" na bandeja e avisa todas as janelas (EV_VOZ_SILENCIADA). */
export const traySetMuted = (on: boolean) => invoke<void>('tray_set_muted', { on });

// ---------- a própria janela ----------

export async function minimizeSelf(): Promise<void> {
  if (isTauri()) await getCurrentWindow().minimize();
}

export async function closeSelf(): Promise<void> {
  if (!isTauri()) return;
  const l = currentLabel();
  if (l === PAINEL) await getCurrentWindow().close();
  else await closeWidget(l);
}

// ---------- opacidade ----------
// O Tauri 2 não tem opacidade de janela inteira no Windows. Os widgets nascem com janela transparente
// (transparent: true, sem moldura) e a opacidade é do FUNDO, via CSS: --janela-alpha no <html>.
// O texto continua 100% legível; só o fundo fica translúcido.

export const OPACITY_MIN = 0.35;
export const OPACITY_MAX = 1;

export function clampOpacity(v: number): number {
  if (!Number.isFinite(v)) return OPACITY_MAX;
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, v));
}

/** Aplica a opacidade do fundo nesta janela. */
export function applyOpacity(v: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--janela-alpha', String(clampOpacity(v)));
}
