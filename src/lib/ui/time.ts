// Atalhos de tempo usados pelos componentes de UI.
export { fmtAge, fmtDateTime } from '../format';

export function minutesSinceIso(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null;
}
