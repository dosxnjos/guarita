// Atalhos globais (tauri-plugin-global-shortcut), configuráveis e vazios por padrão.
// Um atalho = uma ação na Guarita (abrir ou focar um widget, mostrar/esconder, silenciar a voz); nunca manda tecla
// ou clique ao jogo. Registrados só pelo painel (engine/motor.ts), a partir da config.
// Dono: módulo (b). Fronteira: ROTULO_ACAO, normalizarAtalho, validarAtalho, conflitosAtalhos (puras),
// aplicarAtalhos, limparAtalhos.
//
// Formato: o mesmo que a tela de captura monta (ui-atalhos.ts) e o plugin entende: "Ctrl+Shift+P", "Alt+F2",
// "Ctrl+Numpad1". Modificadores na ordem Ctrl, Alt, Shift, Super; depois uma tecla só.
import { currentLocale, type Locale } from '../../../src/lib/i18n/core';
import type { AcaoAtalho } from './config';
import { isTauri } from './windows';

export const ROTULO_ACAO: Record<AcaoAtalho, string> = {
  abrirPreco: 'Abrir o preço rápido',
  abrirDossie: 'Abrir o dossiê',
  alternarWidgets: 'Mostrar e esconder os widgets',
  silenciarVoz: 'Silenciar ou religar a voz',
};

export const ROTULO_ACAO_ES: Record<AcaoAtalho, string> = {
  abrirPreco: 'Abrir el precio rápido',
  abrirDossie: 'Abrir el dosier',
  alternarWidgets: 'Mostrar y ocultar los widgets',
  silenciarVoz: 'Silenciar o reactivar la voz',
};

/** Rótulo da ação na língua pedida (padrão: a do app). */
export function rotuloAcao(a: AcaoAtalho, loc: Locale = currentLocale()): string {
  return (loc === 'es' ? ROTULO_ACAO_ES : ROTULO_ACAO)[a];
}

const L = (loc: Locale, pt: string, es: string) => (loc === 'es' ? es : pt);

export interface FalhaAtalho {
  acao: AcaoAtalho;
  atalho: string;
  erro: string;
}

const MOD_ALIAS: Record<string, 'Ctrl' | 'Alt' | 'Shift' | 'Super'> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  commandorcontrol: 'Ctrl',
  commandorctrl: 'Ctrl',
  cmdorctrl: 'Ctrl',
  cmdorcontrol: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  super: 'Super',
  win: 'Super',
  windows: 'Super',
  meta: 'Super',
  cmd: 'Super',
  command: 'Super',
};
const ORDEM_MOD = ['Ctrl', 'Alt', 'Shift', 'Super'] as const;

// Teclas aceitas (nomes do plugin). Letras, números e F1–F24 entram por regex.
const TECLAS: Record<string, string> = Object.fromEntries(
  [
    'Space', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma',
    'Period', 'Slash', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal', 'Pause',
    ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
  ].map((k) => [k.toLowerCase(), k]),
);

function tecla(p: string): string | null {
  const s = p.trim();
  if (/^[a-z]$/i.test(s)) return s.toUpperCase();
  if (/^key[a-z]$/i.test(s)) return s.slice(3).toUpperCase();
  if (/^[0-9]$/.test(s)) return s;
  if (/^digit[0-9]$/i.test(s)) return s.slice(5);
  const f = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(s);
  if (f) return `F${f[1]}`;
  return TECLAS[s.toLowerCase()] ?? null;
}

/** Forma canônica ("ctrl + shift + p" → "Ctrl+Shift+P"), ou null se não for um atalho bem formado. Pura. */
export function normalizarAtalho(atalho: string): string | null {
  const partes = atalho.split('+').map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return null;
  const mods = new Set<string>();
  let key: string | null = null;
  for (const p of partes) {
    const m = MOD_ALIAS[p.toLowerCase()];
    if (m) {
      mods.add(m);
      continue;
    }
    if (key) return null; // duas teclas
    key = tecla(p);
    if (!key) return null;
  }
  if (!key) return null;
  return [...ORDEM_MOD.filter((m) => mods.has(m)), key].join('+');
}

// Combinações do Windows ou de edição que não podem virar atalho global (o atalho roubaria a tecla de todo
// programa, inclusive do chat do jogo). Na forma canônica.
const RESERVADOS = new Set([
  'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+A', 'Ctrl+S', 'Ctrl+F', 'Ctrl+P', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N',
  'Ctrl+Shift+Z', 'Alt+F4', 'Alt+Space', 'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Super+L', 'Super+D', 'Super+E',
  'Super+R', 'Super+Space', 'Alt+Shift', 'Super+V', 'Super+Shift+S', 'Super+G',
]);

/**
 * Valida o texto do atalho. Devolve a mensagem de erro em PT-BR, ou null se ok. Pura.
 * Regras: uma tecla só; precisa de Ctrl, Alt ou Win (Shift sozinho não basta), menos F13 a F24, que nenhum jogo
 * usa; atalhos do Windows e de edição (Ctrl+C, Alt+F4...) ficam de fora.
 */
export function validarAtalho(atalho: string, loc: Locale = currentLocale()): string | null {
  if (!atalho.trim()) return L(loc, 'Escolha uma combinação de teclas.', 'Elige una combinación de teclas.');
  const n = normalizarAtalho(atalho);
  if (!n) {
    return L(
      loc,
      'Atalho inválido. Use modificadores e uma tecla, por exemplo Ctrl+Shift+P.',
      'Atajo no válido. Usa modificadores y una tecla, por ejemplo Ctrl+Shift+P.',
    );
  }
  const partes = n.split('+');
  const key = partes[partes.length - 1];
  const forte = partes.some((p) => p === 'Ctrl' || p === 'Alt' || p === 'Super');
  if (!forte && !/^F(1[3-9]|2[0-4])$/.test(key)) {
    return L(
      loc,
      'Use Ctrl, Alt ou Win junto com a tecla, para o atalho não roubar uma tecla do jogo.',
      'Usa Ctrl, Alt o Win junto con la tecla, para que el atajo no le quite una tecla al juego.',
    );
  }
  if (RESERVADOS.has(n)) {
    const w = n.replace('Super', 'Win');
    return L(loc, `${w} é um atalho do Windows ou de edição. Escolha outra combinação.`, `${w} es un atajo de Windows o de edición. Elige otra combinación.`);
  }
  return null;
}

/** Ações que dividem o mesmo atalho (comparação na forma canônica). Pura. */
export function conflitosAtalhos(atalhos: Record<AcaoAtalho, string | null>): AcaoAtalho[][] {
  const por = new Map<string, AcaoAtalho[]>();
  for (const [a, v] of Object.entries(atalhos) as [AcaoAtalho, string | null][]) {
    const n = v ? normalizarAtalho(v) : null;
    if (!n) continue;
    por.set(n, [...(por.get(n) ?? []), a]);
  }
  return [...por.values()].filter((g) => g.length > 1);
}

/** Assinatura dos atalhos (para reaplicar só quando mudam). Pura. */
export function assinaturaAtalhos(atalhos: Record<AcaoAtalho, string | null>): string {
  return (Object.keys(atalhos) as AcaoAtalho[])
    .sort()
    .map((a) => `${a}=${atalhos[a] ? normalizarAtalho(atalhos[a]!) ?? '' : ''}`)
    .join(';');
}

/** Ponte com o plugin (injetável nos testes). */
export interface PluginAtalhos {
  register(atalho: string, handler: (e: { shortcut: string; state: 'Pressed' | 'Released' }) => void): Promise<void>;
  unregisterAll(): Promise<void>;
}

async function pluginPadrao(): Promise<PluginAtalhos | null> {
  if (!isTauri()) return null;
  const p = await import('@tauri-apps/plugin-global-shortcut');
  return { register: (a, h) => p.register(a, h), unregisterAll: () => p.unregisterAll() };
}

/**
 * Troca todos os atalhos registrados pelos da config. Atalho inválido, repetido ou recusado pelo Windows (já em uso
 * por outro programa) volta em `falhas`, com a mensagem em PT-BR; os outros continuam valendo.
 * A ação roda só no "apertou" (o plugin avisa também o "soltou").
 */
export async function aplicarAtalhos(
  atalhos: Record<AcaoAtalho, string | null>,
  acoes: Record<AcaoAtalho, () => void>,
  plugin?: PluginAtalhos | null,
): Promise<{ falhas: FalhaAtalho[]; registrados: AcaoAtalho[] }> {
  const p = plugin === undefined ? await pluginPadrao() : plugin;
  const falhas: FalhaAtalho[] = [];
  const registrados: AcaoAtalho[] = [];
  if (!p) return { falhas, registrados };
  const loc = currentLocale();
  await p.unregisterAll();
  const usados = new Map<string, AcaoAtalho>();
  for (const [acao, bruto] of Object.entries(atalhos) as [AcaoAtalho, string | null][]) {
    if (!bruto) continue;
    const erro = validarAtalho(bruto, loc);
    if (erro) {
      falhas.push({ acao, atalho: bruto, erro });
      continue;
    }
    const n = normalizarAtalho(bruto)!;
    const dono = usados.get(n);
    if (dono) {
      const r = rotuloAcao(dono, loc);
      falhas.push({ acao, atalho: bruto, erro: L(loc, `Esse atalho já está em "${r}".`, `Ese atajo ya está en "${r}".`) });
      continue;
    }
    try {
      await p.register(n, (e) => {
        if (e.state === 'Pressed') acoes[acao]();
      });
      usados.set(n, acao);
      registrados.push(acao);
    } catch (e) {
      console.warn('atalho recusado', n, e);
      const w = n.replace('Super', 'Win');
      falhas.push({
        acao,
        atalho: bruto,
        erro: L(loc, `O Windows não liberou ${w}: outro programa já usa essa combinação.`, `Windows no liberó ${w}: otro programa ya usa esa combinación.`),
      });
    }
  }
  return { falhas, registrados };
}

/** Solta todos os atalhos globais. */
export async function limparAtalhos(plugin?: PluginAtalhos | null): Promise<void> {
  const p = plugin === undefined ? await pluginPadrao() : plugin;
  await p?.unregisterAll();
}
