// Despertador (módulo f): tempos-padrão confirmados, cálculo do foco cheio e validação do formulário. Puro (sem DOM),
// testado em tests/timers-ui.test.ts.
//
// FONTE dos tempos: dump do cliente do jogo em https://github.com/ao-data/ao-bin-dumps (master, conferido em 30/10/2026).
// O wiki oficial (wiki.albiononline.com) bloqueou a leitura automática com desafio da Cloudflare; ficou só o dump.
// - items.xml, <farmableitem kind="plant">: <harvest growtime="79200"> em todas as 15 sementes (8 plantações
//   T1_FARM_CARROT_SEED…T8_FARM_PUMPKIN_SEED e 7 ervas T2_FARM_AGARIC_SEED…T8_FARM_YARROW_SEED) = 22 h.
// - items.xml, adultos de granja que produzem (galinha T3, cabra T4, ganso T5, ovelha T6, vaca T8; o porco T7 não tem
//   <product>): <product productiontime="79200"> = ovos e leite a cada 22 h (a ovelha dá leite:
//   farmingmodifiers.xml, T6_FARM_SHEEP_GROWN → @ITEMS_T6_MILK).
// - items.xml, filhotes de granja (T3_FARM_CHICKEN_BABY…T8_FARM_COW_BABY): <grownitem growtime="158400"> = 44 h.
// - items.xml, filhotes de montaria (boi, cavalo, cervo gigante, puma, lobo atroz, javali atroz, urso atroz, mamute, dragão do
//   pântano e os de facção): growtime por tier T3 158400 (44 h), T4 331200 (92 h), T5 504000 (140 h),
//   T6 676800 (188 h), T7 849600 (236 h), T8 1022400 (284 h). Exceções fora do preset: T8 coelho de Páscoa (44 h) e
//   filhote de draco T8 (2404800 = 668 h).
// - characters.xml, <DefaultValues>: craftingfocusmax="30000", premiumcraftingfocusmax="30000",
//   craftingfocusregenerationperday="0", premiumcraftingfocusregenerationperday="10000". Sem Premium o foco não
//   regenera; com Premium, 10.000 por dia (≈ 416,7 por hora), até 30.000.
//
// Línguas: o texto mora aqui em PT (byte a byte o de sempre) e em ES; quem mostra texto aceita `loc` no fim (padrão: a
// língua atual, pelo espelho não reativo de i18n/core.ts, como format.ts). Nada de runes: o app de PC importa este
// arquivo (app/src/lib/ui-timers.ts), e lá a língua é sempre pt.
import type { TimerKind } from '../../../shared/types';
import { currentLocale, intlLocaleFor, type Locale } from '../i18n/core';

const H = 60; // minutos
const pick = (loc: Locale, pt: string, es: string): string => (loc === 'es' ? es : pt);
const int = (n: number, loc: Locale): string => new Intl.NumberFormat(intlLocaleFor(loc), { maximumFractionDigits: 0 }).format(n);

export const PLANT_MIN = 22 * H;
export const PRODUCT_MIN = 22 * H;
export const FARM_BABY_MIN = 44 * H;
/** Filhote de montaria → adulto, por tier (minutos). */
export const MOUNT_BABY_MIN: Record<number, number> = { 3: 44 * H, 4: 92 * H, 5: 140 * H, 6: 188 * H, 7: 236 * H, 8: 284 * H };
export const MOUNT_TIERS = [3, 4, 5, 6, 7, 8] as const;

export const FOCUS_MAX = 30_000;
export const FOCUS_PER_DAY_PREMIUM = 10_000;
export const FOCUS_PER_DAY_FREE = 0;

/** Limites do servidor (guarita-core/src/timers.ts). */
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 30 * 24 * H;
export const MAX_TIMERS = 30;
export const LABEL_MAX = 60;

export type PresetId = 'plantacao' | 'produto' | 'filhote-granja' | 'filhote-montaria' | 'foco' | 'livre';

export interface Preset {
  id: PresetId;
  kind: TimerKind;
  /** Texto do botão. */
  title: string;
  /** Explicação curta embaixo do título. */
  hint: string;
  /** Rótulo sugerido para o timer. */
  label: string;
  /** Duração fixa em minutos (null = depende de outro campo: tier, foco atual ou tempo livre). */
  minutes: number | null;
  /** Os três textos acima em espanhol (ler com presetText). */
  es: { title: string; hint: string; label: string };
}

export const PRESETS: Preset[] = [
  {
    id: 'plantacao', kind: 'plantacao', title: 'Plantação ou ervas (22 h)', hint: 'Todas as sementes, do T1 ao T8.', label: 'Plantação', minutes: PLANT_MIN,
    es: { title: 'Cultivos o hierbas (22 h)', hint: 'Todas las semillas, del T1 al T8.', label: 'Cultivos' },
  },
  {
    id: 'produto', kind: 'animal', title: 'Ovos e leite (22 h)', hint: 'Galinha, cabra, ganso, ovelha e vaca adultas (o porco não produz).', label: 'Ovos e leite', minutes: PRODUCT_MIN,
    es: { title: 'Huevos y leche (22 h)', hint: 'Gallina, cabra, ganso, oveja y vaca adultas (el cerdo no produce).', label: 'Huevos y leche' },
  },
  {
    id: 'filhote-granja', kind: 'animal', title: 'Filhote de granja (44 h)', hint: 'Galinha, cabra, ganso, ovelha, porco e vaca até virar adulto.', label: 'Filhotes da granja', minutes: FARM_BABY_MIN,
    es: { title: 'Cría de granja (44 h)', hint: 'Gallina, cabra, ganso, oveja, cerdo y vaca hasta volverse adultos.', label: 'Crías de la granja' },
  },
  {
    id: 'filhote-montaria', kind: 'animal', title: 'Filhote de montaria (44 a 284 h)', hint: 'Boi, cavalo e montarias do canil: o tempo depende do tier.', label: 'Filhote de montaria', minutes: null,
    es: { title: 'Cría de montura (44 a 284 h)', hint: 'Buey, caballo y monturas de la perrera: el tiempo depende del tier.', label: 'Cría de montura' },
  },
  {
    id: 'foco', kind: 'foco', title: 'Foco cheio', hint: 'Calcula a hora a partir do foco que você tem agora (precisa de Premium).', label: 'Foco cheio', minutes: null,
    es: { title: 'Foco lleno', hint: 'Calcula la hora a partir del foco que tienes ahora (requiere Premium).', label: 'Foco lleno' },
  },
  {
    id: 'livre', kind: 'outro', title: 'Tempo livre', hint: 'Você escolhe as horas e os minutos.', label: '', minutes: null,
    es: { title: 'Tiempo libre', hint: 'Tú eliges las horas y los minutos.', label: '' },
  },
];

export function presetById(id: PresetId): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
}

/** Título, explicação e rótulo sugerido do preset na língua pedida. Pura. */
export function presetText(p: Preset, loc: Locale = currentLocale()): { title: string; hint: string; label: string } {
  return loc === 'es' ? p.es : { title: p.title, hint: p.hint, label: p.label };
}

/**
 * Lê um número digitado ("12.500", "12500", "1,5"). Vazio ou inválido = null. Pura.
 * Em espanhol o site mostra o milhar com vírgula ("30,000", es-419), então lá "12,500" também vale 12500; em português
 * nada muda ("12,5" continua 12,5).
 */
export function parseNumberBR(raw: string | number | null | undefined, loc: Locale = currentLocale()): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s/g, '');
  if (!s) return null;
  if (loc === 'es' && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  // "12.500" ou "1.234.567": ponto como milhar; vírgula como decimal.
  const norm = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export type FocusResult = { ok: true; minutes: number } | { ok: false; reason: 'sem-premium' | 'cheio' | 'invalido' };

/**
 * Minutos até o foco encher, com regeneração linear de 10.000 por dia (Premium). Arredonda para cima, para o aviso
 * nunca chegar antes do foco estar cheio. Pura.
 */
export function focusFullMinutes(current: number | null, premium: boolean, max = FOCUS_MAX): FocusResult {
  if (current === null || !Number.isFinite(current) || current < 0 || current > max) return { ok: false, reason: 'invalido' };
  if (current >= max) return { ok: false, reason: 'cheio' };
  const perDay = premium ? FOCUS_PER_DAY_PREMIUM : FOCUS_PER_DAY_FREE;
  if (perDay <= 0) return { ok: false, reason: 'sem-premium' };
  return { ok: true, minutes: Math.max(MIN_MINUTES, Math.ceil(((max - current) / perDay) * 24 * H)) };
}

export interface TimerFormState {
  preset: PresetId;
  label: string;
  /** Tempo livre. */
  hours: string;
  minutes: string;
  /** Filhote de montaria. */
  tier: number;
  /** Foco cheio. */
  focus: string;
  premium: boolean;
}

export function defaultTimerForm(): TimerFormState {
  return { preset: 'plantacao', label: '', hours: '', minutes: '', tier: 4, focus: '', premium: true };
}

export type DurationResult = { ok: true; minutes: number } | { ok: false; error: string };

/** Duração em minutos do formulário, ou o erro pronto para a tela (na língua pedida). Pura. */
export function formDuration(f: TimerFormState, loc: Locale = currentLocale()): DurationResult {
  const p = presetById(f.preset);
  if (p.minutes !== null) return { ok: true, minutes: p.minutes };
  if (p.id === 'filhote-montaria') {
    const m = MOUNT_BABY_MIN[f.tier];
    return m ? { ok: true, minutes: m } : { ok: false, error: pick(loc, 'Escolha o tier do filhote.', 'Elige el tier de la cría.') };
  }
  if (p.id === 'foco') {
    const r = focusFullMinutes(parseNumberBR(f.focus, loc), f.premium);
    if (r.ok) return r;
    if (r.reason === 'sem-premium') {
      return { ok: false, error: pick(loc, 'Sem Premium o foco não se recupera sozinho, então não há hora para avisar.', 'Sin Premium el foco no se recupera solo, así que no hay una hora para avisarte.') };
    }
    if (r.reason === 'cheio') return { ok: false, error: pick(loc, 'Com 30.000 de foco ele já está cheio.', `Con ${int(FOCUS_MAX, loc)} de foco ya está lleno.`) };
    return { ok: false, error: pick(loc, 'Informe o foco que você tem agora, de 0 a 30.000.', `Indica el foco que tienes ahora, de 0 a ${int(FOCUS_MAX, loc)}.`) };
  }
  const hRaw = f.hours.trim();
  const mRaw = f.minutes.trim();
  if (!hRaw && !mRaw) return { ok: false, error: pick(loc, 'Informe as horas e os minutos.', 'Indica las horas y los minutos.') };
  const h = hRaw ? parseNumberBR(hRaw, loc) : 0;
  const m = mRaw ? parseNumberBR(mRaw, loc) : 0;
  if (h === null || m === null || !Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0) {
    return { ok: false, error: pick(loc, 'Use números inteiros para horas e minutos.', 'Usa números enteros para las horas y los minutos.') };
  }
  const total = h * H + m;
  if (total < MIN_MINUTES || total > MAX_MINUTES) {
    return { ok: false, error: pick(loc, 'Escolha um tempo entre 1 minuto e 30 dias.', 'Elige un tiempo entre 1 minuto y 30 días.') };
  }
  return { ok: true, minutes: total };
}

/** Rótulo final: o digitado (limpo e cortado) ou o sugerido pelo preset, na língua pedida. Pura. */
export function formLabel(f: TimerFormState, loc: Locale = currentLocale()): string {
  const typed = f.label.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
  if (typed) return typed;
  const p = presetById(f.preset);
  if (p.id === 'filhote-montaria') return pick(loc, `Filhote de montaria T${f.tier}`, `Cría de montura T${f.tier}`);
  return presetText(p, loc).label || 'Despertador';
}

/** Instante do aviso: agora + duração. Pura. */
export function endsAtFrom(minutes: number, now = Date.now()): string {
  return new Date(now + minutes * 60_000).toISOString();
}

/** "22 h", "1 h 30 min", "45 min", "11 d 20 h" para mostrar a duração escolhida. Pura. */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / (24 * H));
  const h = Math.floor((m % (24 * H)) / H);
  const min = m % H;
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return min ? `${h} h ${min} min` : `${h} h`;
  return `${min} min`;
}

export const KIND_LABEL: Record<TimerKind, string> = {
  plantacao: 'Plantação',
  animal: 'Animais',
  foco: 'Foco',
  outro: 'Outro',
};

export const KIND_LABEL_ES: Record<TimerKind, string> = {
  plantacao: 'Cultivos',
  animal: 'Animales',
  foco: 'Foco',
  outro: 'Otro',
};

/** Tipo do timer para mostrar, na língua pedida. Pura. */
export function kindLabel(kind: TimerKind, loc: Locale = currentLocale()): string {
  return (loc === 'es' ? KIND_LABEL_ES : KIND_LABEL)[kind] ?? kind;
}

/** Pendentes (por vencimento) e já avisados (mais recente primeiro). Pura. */
export function splitTimers<T extends { endsAt: string; firedAt?: string }>(list: T[]): { pending: T[]; fired: T[] } {
  const pending = list.filter((t) => !t.firedAt).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
  const fired = list.filter((t) => !!t.firedAt).sort((a, b) => Date.parse(b.firedAt as string) - Date.parse(a.firedAt as string));
  return { pending, fired };
}
