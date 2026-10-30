// Captura de atalho global na tela de ajustes: transforma a tecla apertada no texto que o
// tauri-plugin-global-shortcut entende ("Ctrl+Shift+P", "Alt+F2"). Puro, testado em tests/ui.test.ts.
// Quem registra o atalho é o motor (shortcuts.ts, módulo b); aqui só se monta e se mostra o texto.
import { currentLocale, type Locale } from '../../../src/lib/i18n/core';

export interface TeclaEvento {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export type Captura =
  | { tipo: 'atalho'; atalho: string }
  /** Só modificadores apertados até agora (mostra "Ctrl + Shift + …"). */
  | { tipo: 'parcial'; texto: string }
  /** Esc: desistir; Backspace/Delete sem modificador: limpar o atalho. */
  | { tipo: 'cancelar' }
  | { tipo: 'limpar' }
  | { tipo: 'invalido'; motivo: string };

const MODIFICADORES = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph']);

/** Nome da tecla pelo código físico (independe do layout ABNT/US). null = tecla não aceita. */
export function teclaDoCodigo(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^F([1-9]|1\d|2[0-4])$/.exec(code);
  if (m) return code;
  m = /^Numpad(\d)$/.exec(code);
  if (m) return code;
  const outros: Record<string, string> = {
    Space: 'Space', Backquote: 'Backquote', Minus: 'Minus', Equal: 'Equal', BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight', Backslash: 'Backslash', Semicolon: 'Semicolon', Quote: 'Quote', Comma: 'Comma',
    Period: 'Period', Slash: 'Slash', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp',
    PageDown: 'PageDown', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    NumpadAdd: 'NumpadAdd', NumpadSubtract: 'NumpadSubtract', NumpadMultiply: 'NumpadMultiply', NumpadDivide: 'NumpadDivide',
    Pause: 'Pause',
  };
  return outros[code] ?? null;
}

function mods(e: TeclaEvento): string[] {
  const out: string[] = [];
  if (e.ctrlKey) out.push('Ctrl');
  if (e.altKey) out.push('Alt');
  if (e.shiftKey) out.push('Shift');
  if (e.metaKey) out.push('Super');
  return out;
}

/**
 * Interpreta um keydown no campo de atalho. Exige Ctrl, Alt ou Super (Shift sozinho não basta), exceto F13 a F24,
 * que nenhum jogo usa: um atalho global sem modificador roubaria a tecla do jogo.
 */
export function capturarAtalho(e: TeclaEvento, loc: Locale = currentLocale()): Captura {
  const es = loc === 'es';
  const m = mods(e);
  if (e.key === 'Escape' && !m.length) return { tipo: 'cancelar' };
  if ((e.key === 'Backspace' || e.key === 'Delete') && !m.length) return { tipo: 'limpar' };
  if (MODIFICADORES.has(e.key)) return { tipo: 'parcial', texto: m.length ? `${m.join(' + ')} + …` : '…' };
  const tecla = teclaDoCodigo(e.code);
  if (!tecla) {
    return {
      tipo: 'invalido',
      motivo: es
        ? 'Esa tecla no se puede usar en un atajo. Prueba una letra, un número o de F1 a F12.'
        : 'Essa tecla não pode ser usada em atalho. Tente uma letra, número ou F1 a F12.',
    };
  }
  const forte = e.ctrlKey || e.altKey || e.metaKey;
  if (!forte && !/^F(1[3-9]|2[0-4])$/.test(tecla)) {
    return {
      tipo: 'invalido',
      motivo: es
        ? 'Usa Ctrl, Alt o Win junto con la tecla, para que el atajo no le quite una tecla al juego.'
        : 'Use Ctrl, Alt ou Win junto com a tecla, para o atalho não roubar uma tecla do jogo.',
    };
  }
  return { tipo: 'atalho', atalho: [...m, tecla].join('+') };
}

/** Nomes de tecla que mudam em espanhol (o resto é igual nas duas línguas). */
const NOME_TECLA_ES: Record<string, string> = { Space: 'Espacio' };

const NOME_TECLA: Record<string, string> = {
  Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win', Space: 'Espaço', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'Page Up', PageDown: 'Page Down',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /',
};

/** Texto para mostrar ao usuário: "Ctrl+Shift+P" → ["Ctrl", "Shift", "P"]; Numpad1 → "Num 1". */
export function partesAtalho(atalho: string | null | undefined, loc: Locale = currentLocale()): string[] {
  if (!atalho) return [];
  const es = loc === 'es';
  return atalho
    .split('+')
    .filter(Boolean)
    .map((p) => (es ? NOME_TECLA_ES[p] : undefined) ?? NOME_TECLA[p] ?? p.replace(/^Numpad(\d)$/, 'Num $1'));
}

/** Atalho já usado por outra ação (comparação sem diferença de caixa). Devolve a ação, ou null. */
export function atalhoRepetido<A extends string>(atalhos: Record<A, string | null>, acao: A, atalho: string): A | null {
  const alvo = atalho.toLowerCase();
  for (const [a, v] of Object.entries(atalhos) as [A, string | null][]) {
    if (a !== acao && v && v.toLowerCase() === alvo) return a;
  }
  return null;
}
