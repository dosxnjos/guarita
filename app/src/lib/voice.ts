// Voz em PT-BR (ou espanhol, com o app em espanhol) pelo speechSynthesis do WebView2 (vozes do Windows, ex.:
// "Microsoft Maria", "Microsoft Sabina"). Cada fala guarda a língua em que foi escrita e sai numa voz dessa língua.
// Fila: uma fala por vez, nunca uma por cima da outra; prioridade "alta" passa na frente e interrompe fala de
// prioridade menor. Silenciar (bandeja, atalho ou ajustes) esvazia a fila e cala na hora. Dono: módulo (b).
//
// Fronteira fixa (os outros módulos chamam só isto):
//   falar(texto, prioridade?)  calar()  setSilenciada(on)  isSilenciada()  tamanhoFila()  vozesPtBr()  escolherVoz()
//
// Pegadinhas do Chromium tratadas aqui: utterance sem referência viva é recolhida e o onend nunca chega (guardamos
// a atual); onend às vezes não chega mesmo assim (vigia por tempo); cancel() dispara o onend da fala cancelada
// depois que a próxima já começou (cada fala tem um número e o fim só vale para a fala atual).
import { currentLocale, type Locale } from '../../../src/lib/i18n/core';
import { getConfig } from './config';
import { isTauri } from './windows';

/** Linha no log do app (Guarita.log), para diagnosticar "a voz não fala". Nunca o texto falado. */
function registrar(nivel: 'info' | 'warn', msg: string) {
  if (!isTauri()) return;
  void import('@tauri-apps/plugin-log').then((l) => (nivel === 'info' ? l.info(msg) : l.warn(msg))).catch(() => {});
}

export type Prioridade = 'baixa' | 'normal' | 'alta';
const PESO: Record<Prioridade, number> = { baixa: 0, normal: 1, alta: 2 };

/** Fila máxima: aviso velho perde o sentido; o mais antigo de menor prioridade sai. */
export const MAX_FILA = 8;

interface Fala {
  texto: string;
  prioridade: Prioridade;
  n: number;
  /** Língua do texto (a do app quando entrou na fila). */
  loc: Locale;
}

const fila: Fala[] = [];
let falando: Fala | null = null;
let atual: SpeechSynthesisUtterance | null = null;
let vigia: ReturnType<typeof setTimeout> | null = null;
let silenciada = false;
let contador = 0;
/** Muda a cada calar(): fala que estava esperando a lista de vozes não começa depois de um calar. */
let geracao = 0;

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);

const ehPtBr = (v: SpeechSynthesisVoice) => /^pt[-_]br$/i.test(v.lang);
const ehPt = (v: SpeechSynthesisVoice) => /^pt([-_]|$)/i.test(v.lang);
const ehEs = (v: SpeechSynthesisVoice) => /^es([-_]|$)/i.test(v.lang);
/** Espanhol da América (México, EUA, 419...): tudo que não é es-ES. */
const ehEsAmerica = (v: SpeechSynthesisVoice) => ehEs(v) && !/^es[-_]es$/i.test(v.lang);

/** `lang` da fala quando não há voz da língua instalada (o Windows tenta a voz padrão com esta língua). */
export function langDaFala(loc: Locale = currentLocale()): string {
  return loc === 'es' ? 'es-MX' : 'pt-BR';
}

async function todasAsVozes(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return [];
  let vs = s.getVoices();
  if (!vs.length) {
    await new Promise<void>((ok) => {
      const t = setTimeout(ok, 1500);
      s.addEventListener('voiceschanged', () => (clearTimeout(t), ok()), { once: true });
    });
    vs = s.getVoices();
  }
  return vs;
}

/** Vozes pt-BR instaladas no Windows (a lista chega assíncrona no WebView2). */
export async function vozesPtBr(): Promise<SpeechSynthesisVoice[]> {
  return (await todasAsVozes()).filter(ehPtBr);
}

/** Vozes da língua do app: pt-BR em português; qualquer espanhol em espanhol (as da América primeiro). */
export async function vozesDaLingua(loc: Locale = currentLocale()): Promise<SpeechSynthesisVoice[]> {
  return filtrarVozes(await todasAsVozes(), loc);
}

/** Vozes da língua (pura). Espanhol: as da América antes das da Espanha. */
export function filtrarVozes(vozes: SpeechSynthesisVoice[], loc: Locale = currentLocale()): SpeechSynthesisVoice[] {
  if (loc !== 'es') return vozes.filter(ehPtBr);
  return [...vozes.filter(ehEsAmerica), ...vozes.filter((v) => ehEs(v) && !ehEsAmerica(v))];
}

/**
 * Espanhol: a da config só se for uma voz em espanhol (a guardada pode ser a portuguesa de antes da troca de língua,
 * e texto em espanhol lido por voz portuguesa sai errado) → espanhol da América instalada no PC → online → da
 * Espanha → null (fala na voz padrão com lang es-MX; a tela avisa que não há voz em espanhol). Pura.
 */
function escolherVozEs(vozes: SpeechSynthesisVoice[], preferida: string | null): SpeechSynthesisVoice | null {
  if (preferida) {
    const v = vozes.find((x) => x.name === preferida && ehEs(x));
    if (v) return v;
  }
  const am = vozes.filter(ehEsAmerica);
  return am.find((v) => v.localService) ?? am[0] ?? vozes.find(ehEs) ?? null;
}

/**
 * Escolhe a voz: a da config pelo nome (salvo se for espanhola) → Francisca (neural, quando existir) → Maria → qualquer pt-BR → qualquer
 * português. Sem nenhuma, null (a fala sai na voz padrão do Windows com lang pt-BR; nunca fica muda por isso). Pura.
 * Em espanhol, ver escolherVozEs.
 */
export function escolherVoz(vozes: SpeechSynthesisVoice[], preferida: string | null, loc: Locale = currentLocale()): SpeechSynthesisVoice | null {
  if (loc === 'es') return escolherVozEs(vozes, preferida);
  if (preferida) {
    // A guardada pode ser a espanhola escolhida com o app em espanhol: texto em português não sai nela.
    const v = vozes.find((x) => x.name === preferida && !ehEs(x));
    if (v) return v;
  }
  const br = vozes.filter(ehPtBr);
  return (
    br.find((v) => /francisca/i.test(v.name)) ??
    br.find((v) => /maria/i.test(v.name)) ??
    br.find((v) => v.localService) ??
    br[0] ??
    vozes.find(ehPt) ??
    null
  );
}

function limparVigia() {
  if (vigia) clearTimeout(vigia);
  vigia = null;
}

function terminou(f: Fala) {
  if (falando !== f) return; // onend atrasado de uma fala cancelada
  limparVigia();
  falando = null;
  atual = null;
  void proxima();
}

async function proxima(): Promise<void> {
  const s = synth();
  if (!s || falando || silenciada) return;
  const f = fila.shift();
  if (!f) return;
  const cfg = getConfig().voz;
  if (!cfg.ligada) {
    fila.length = 0;
    return;
  }
  falando = f;
  const g = geracao;
  const todas = s.getVoices().length ? s.getVoices() : await todasAsVozes();
  if (g !== geracao || falando !== f) return; // calaram enquanto a lista de vozes chegava
  const u = new SpeechSynthesisUtterance(f.texto);
  u.lang = langDaFala(f.loc);
  u.volume = cfg.volume;
  u.rate = cfg.velocidade;
  const voz = escolherVoz(todas, cfg.voz, f.loc);
  if (voz) u.voice = voz;
  u.onstart = () => registrar('info', `voz: falando com ${voz?.name ?? 'a voz padrão'} (${f.texto.length} caracteres)`);
  u.onend = () => terminou(f);
  u.onerror = (e) => {
    if (e?.error !== 'interrupted' && e?.error !== 'canceled') registrar('warn', `voz: erro ${e?.error ?? 'desconhecido'}`);
    terminou(f);
  };
  atual = u;
  // Vigia: ~80 ms por caractere na velocidade 1, mais folga. Se o onend não vier, segue a fila.
  const ms = Math.max(4000, (f.texto.length * 80) / Math.max(0.5, cfg.velocidade) + 3000);
  vigia = setTimeout(() => {
    if (falando === f) {
      s.cancel();
      terminou(f);
    }
  }, ms);
  s.speak(u);
}

/** Põe a frase na fila. Silenciada ou voz desligada: descarta. */
export function falar(texto: string, prioridade: Prioridade = 'normal'): void {
  const t = texto.trim();
  if (!t || silenciada || !getConfig().voz.ligada || !synth()) return;
  // Mesma frase já esperando: não repete.
  if (fila.some((x) => x.texto === t) || falando?.texto === t) return;
  const f: Fala = { texto: t, prioridade, n: ++contador, loc: currentLocale() };
  const i = fila.findIndex((x) => PESO[x.prioridade] < PESO[prioridade]);
  if (i === -1) fila.push(f);
  else fila.splice(i, 0, f);
  while (fila.length > MAX_FILA) {
    // Sai o mais antigo entre os de menor prioridade.
    let pior = 0;
    for (let k = 1; k < fila.length; k++) {
      if (PESO[fila[k].prioridade] < PESO[fila[pior].prioridade]) pior = k;
    }
    fila.splice(pior, 1);
  }
  if (falando && PESO[prioridade] === 2 && PESO[falando.prioridade] < 2) {
    // Interrompe a fala menos importante; ela não volta (aviso curto, já está na notificação).
    const velho = falando;
    synth()?.cancel();
    terminou(velho);
    return;
  }
  void proxima();
}

/** Esvazia a fila e cala a fala atual. */
export function calar(): void {
  geracao++;
  fila.length = 0;
  limparVigia();
  falando = null;
  atual = null;
  synth()?.cancel();
}

export function setSilenciada(on: boolean): void {
  silenciada = on;
  if (on) calar();
}

export function isSilenciada(): boolean {
  return silenciada;
}

export function tamanhoFila(): number {
  return fila.length + (falando ? 1 : 0);
}

/** Só para os testes: a utterance em curso (mantida viva de propósito). */
export function _falaAtual(): SpeechSynthesisUtterance | null {
  return atual;
}
