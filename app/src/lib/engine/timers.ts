// Despertador local (plantação, animal, foco): com o app aberto, avisa quando `endsAt` passa.
// Um setTimeout para o próximo vencimento (sem varrer a cada segundo) e, ao abrir o app, avisa de uma vez os que
// venceram enquanto ele estava fechado. Fechou o app, parou: nada fica agendado no Windows.
// Dono: módulo (b). Fronteira: proximoTimer, vencidos, atrasoMin, esperaAte, avisoTimer, assinaturaTimers (puras) e
// criarMotorTimers.
//
// Duas pegadinhas tratadas aqui:
// - setTimeout com atraso acima de 2^31-1 ms (~24,8 dias) dispara NA HORA no Chromium: o atraso é limitado e o
//   motor reagenda ao acordar.
// - Com o painel minimizado ou na bandeja, o WebView2 segura timers encadeados a cerca de 1 por minuto depois de
//   5 min escondido (docs/ARMADILHAS.md). O motor tolera: a cada acordada confere todos os vencidos e, se chegou
//   atrasado, diz "venceu há N min".
import type { TimerKind } from '../../../../shared/types';
import type { GuaritaConfig, TimerLocal } from '../config';
import type { Aviso } from '../notify';
import { fmtTime } from '../format';
import { minutosFalados } from '../fala';

/** Maior atraso seguro de setTimeout (2^31-1 ms). */
export const MAX_ATRASO_TIMEOUT = 2 ** 31 - 1;
/** Rede de segurança: mesmo sem vencimento perto, o motor acorda a cada tanto para conferir (relógio do PC mudou etc.). */
export const VARREDURA_MS = 60_000;
/** Atraso a partir do qual o aviso diz "venceu há N min". */
export const ATRASO_AVISO_MIN = 2;

/** O timer ainda não disparado que vence primeiro. */
export function proximoTimer(timers: TimerLocal[]): TimerLocal | null {
  let best: TimerLocal | null = null;
  let bestAt = Infinity;
  for (const t of timers) {
    if (t.firedAt) continue;
    const at = Date.parse(t.endsAt);
    if (Number.isFinite(at) && at < bestAt) {
      best = t;
      bestAt = at;
    }
  }
  return best;
}

/** Timers vencidos e ainda não disparados, do mais antigo para o mais novo. */
export function vencidos(timers: TimerLocal[], now: number): TimerLocal[] {
  return timers.filter((t) => !t.firedAt && Date.parse(t.endsAt) <= now).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
}

/** Quantos minutos depois do vencimento o aviso está saindo. */
export function atrasoMin(t: TimerLocal, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(t.endsAt)) / 60000));
}

/** Quanto esperar até a próxima acordada do motor (limitado ao máximo seguro e à varredura). Pura. */
export function esperaAte(timers: TimerLocal[], now: number): number {
  const p = proximoTimer(timers);
  if (!p) return VARREDURA_MS;
  const ms = Date.parse(p.endsAt) - now;
  return Math.max(0, Math.min(ms, VARREDURA_MS, MAX_ATRASO_TIMEOUT));
}

const TITULO: Record<TimerKind, string> = {
  plantacao: 'Plantação pronta',
  animal: 'Animais prontos',
  foco: 'Foco recarregado',
  outro: 'Despertador',
};

/**
 * Aviso de um timer vencido. `fechado` = venceu antes de o app abrir (o aviso diz isso);
 * senão, se saiu com atraso de 2 min ou mais (painel escondido), diz há quanto tempo venceu. Pura.
 */
export function avisoTimer(t: TimerLocal, now: number, fechado: boolean): Aviso {
  const nome = t.label || TITULO[t.kind];
  const hora = fmtTime(t.endsAt, undefined, false);
  const atraso = atrasoMin(t, now);
  if (fechado) {
    return {
      titulo: TITULO[t.kind],
      corpo: `${nome}: venceu às ${hora} (horário de Brasília), enquanto o app estava fechado.`,
      voz: `${nome}: venceu enquanto o app estava fechado.`,
      prioridade: 'normal',
    };
  }
  if (atraso >= ATRASO_AVISO_MIN) {
    return {
      titulo: TITULO[t.kind],
      corpo: `${nome}: venceu às ${hora} (horário de Brasília), há ${atraso} min.`,
      voz: `${nome}: venceu há ${minutosFalados(atraso)}.`,
      prioridade: 'alta',
    };
  }
  return {
    titulo: TITULO[t.kind],
    corpo: `${nome}: venceu agora, às ${hora} (horário de Brasília).`,
    voz: nome === TITULO[t.kind] ? `${nome}.` : `${TITULO[t.kind]}: ${nome}.`,
    prioridade: 'alta',
  };
}

const PLURAL: Record<TimerKind, [um: string, varios: string]> = {
  plantacao: ['plantação', 'plantações'],
  animal: ['lote de animais', 'lotes de animais'],
  foco: ['foco', 'focos'],
  outro: ['outro lembrete', 'outros lembretes'],
};

/**
 * Um aviso só para vários lembretes que venceram com o app fechado (ao abrir, nada de N notificações e N falas
 * seguidas). Pura. Com um só, use avisoTimer.
 */
export function avisoTimersFechados(lista: TimerLocal[]): Aviso {
  const conta = new Map<TimerKind, number>();
  for (const t of lista) conta.set(t.kind, (conta.get(t.kind) ?? 0) + 1);
  const ordem: TimerKind[] = ['plantacao', 'animal', 'foco', 'outro'];
  const partes = ordem.filter((k) => conta.has(k)).map((k) => {
    const n = conta.get(k)!;
    return `${n} ${PLURAL[k][n === 1 ? 0 : 1]}`;
  });
  const juntar = (p: string[]) => (p.length <= 1 ? p.join('') : `${p.slice(0, -1).join(', ')} e ${p.at(-1)}`);
  return {
    titulo: 'Lembretes vencidos',
    corpo: `${lista.length} lembretes venceram enquanto o app estava fechado: ${juntar(partes)}.`,
    voz: `${lista.length} lembretes venceram enquanto o app estava fechado.`,
    prioridade: 'normal',
  };
}

/** Assinatura da lista de timers que importa para o agendamento (para reagendar só quando muda). */
export function assinaturaTimers(timers: TimerLocal[]): string {
  return timers.map((t) => `${t.id}|${t.endsAt}|${t.firedAt ?? ''}`).sort().join(';');
}

export interface MotorTimersDeps {
  avisar: (a: Aviso) => Promise<void>;
  getConfig: () => GuaritaConfig;
  marcarDisparo: (timerId: string, quando: string) => Promise<void>;
  now?: () => number;
  onErro?: (e: unknown) => void;
}

export interface MotorTimers {
  iniciar(): void;
  parar(): void;
  rodando(): boolean;
  /** Recalcula o próximo vencimento (chamar quando a lista mudar). */
  reagendar(): void;
  /** Confere e avisa os vencidos agora (testes e acordar do painel). Devolve os ids avisados. */
  conferir(): Promise<string[]>;
}

export function criarMotorTimers(deps: MotorTimersDeps): MotorTimers {
  const now = deps.now ?? (() => Date.now());
  let on = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abertoEm = 0;
  /** Ids já avisados nesta sessão (a gravação de firedAt pode demorar a voltar pelo store). */
  const avisados = new Set<string>();
  let conferindo: Promise<string[]> | null = null;

  async function conferirAgora(): Promise<string[]> {
    const t0 = now();
    const lista = vencidos(deps.getConfig().timers, t0).filter((t) => !avisados.has(t.id));
    const ids: string[] = [];
    const quando = new Date(t0).toISOString();
    // Vencidos com o app fechado, dois ou mais: um aviso só. Os demais, um por um.
    const fechados = lista.filter((t) => Date.parse(t.endsAt) < abertoEm);
    const juntar = fechados.length > 1;
    for (const t of lista) {
      avisados.add(t.id);
      ids.push(t.id);
      const fechado = Date.parse(t.endsAt) < abertoEm;
      await deps.marcarDisparo(t.id, quando).catch((e) => deps.onErro?.(e));
      if (fechado && juntar) continue;
      await deps.avisar(avisoTimer(t, t0, fechado)).catch((e) => deps.onErro?.(e));
    }
    if (juntar) await deps.avisar(avisoTimersFechados(fechados)).catch((e) => deps.onErro?.(e));
    return ids;
  }

  function conferir(): Promise<string[]> {
    if (!conferindo) conferindo = conferirAgora().finally(() => (conferindo = null));
    return conferindo;
  }

  function agendar() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!on) return;
    const pendentes = deps.getConfig().timers.filter((t) => !avisados.has(t.id));
    timer = setTimeout(async () => {
      timer = null;
      await conferir().catch((e) => deps.onErro?.(e));
      agendar();
    }, esperaAte(pendentes, now()));
  }

  return {
    iniciar: () => {
      if (on) return;
      on = true;
      abertoEm = now();
      // Os vencidos enquanto o app estava fechado são avisados já (esperaAte devolve 0 para eles).
      agendar();
    },
    parar: () => {
      on = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    rodando: () => on,
    reagendar: () => agendar(),
    conferir,
  };
}
