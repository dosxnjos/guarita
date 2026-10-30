// Formulário do despertador local (widget "Despertador"). Reaproveita os tempos confirmados do site
// (src/lib/timers/presets.ts: plantação 22 h, ovos e leite 22 h, filhotes, foco cheio) e monta o TimerLocal que o
// motor (engine/timers.ts) avisa com o app aberto. Puro, testado em tests/ui.test.ts.
import {
  KIND_LABEL, MOUNT_TIERS, PRESETS, defaultTimerForm, endsAtFrom, fmtDuration, formDuration, formLabel, presetById, splitTimers,
  type PresetId, type TimerFormState,
} from '../../../src/lib/timers/presets';
import { MAX_TIMERS_LOCAIS, normalizarTimerLocal, type TimerLocal } from './config';

export { KIND_LABEL, MOUNT_TIERS, PRESETS, defaultTimerForm, fmtDuration, formDuration, presetById, splitTimers };
export type { PresetId, TimerFormState };

export type NovoTimer = { ok: true; timer: TimerLocal } | { ok: false; erro: string };

function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function montarTimer(f: TimerFormState, pendentes: number, now = Date.now(), id = novoId()): NovoTimer {
  if (pendentes >= MAX_TIMERS_LOCAIS) return { ok: false, erro: `O app já tem ${MAX_TIMERS_LOCAIS} lembretes. Apague um para criar outro.` };
  const d = formDuration(f);
  if (!d.ok) return { ok: false, erro: d.error };
  const t = normalizarTimerLocal({
    id,
    kind: presetById(f.preset).kind,
    label: formLabel(f),
    endsAt: endsAtFrom(d.minutes, now),
    createdAt: new Date(now).toISOString(),
  });
  return t ? { ok: true, timer: t } : { ok: false, erro: 'Não foi possível criar o lembrete.' };
}

/** Fração já passada (0 a 1) para a barrinha de progresso. */
export function progresso(t: TimerLocal, now = Date.now()): number {
  const ini = Date.parse(t.createdAt);
  const fim = Date.parse(t.endsAt);
  if (!(fim > ini)) return 1;
  return Math.min(1, Math.max(0, (now - ini) / (fim - ini)));
}
