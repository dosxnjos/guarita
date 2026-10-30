// Nomes das qualidades como o cliente do Albion mostra em PT-BR (localization.xml do jogo,
// chaves @ITEMDETAILS_STATS_QUALITY_1..5, conferido em 30/10/2026). Fonte única do front e da API;
// o bot (worker/discord/commands.ts) e o core (guarita-core/src/rules.ts) têm cópia literal conferida em teste.
import type { Quality } from './types';

export const QUALITY_LABEL: Record<Quality, string> = { 1: 'Normal', 2: 'Bom', 3: 'Excepcional', 4: 'Excelente', 5: 'Obra-prima' };

export function qualityLabel(q: number): string {
  return QUALITY_LABEL[q as Quality] ?? `Qualidade ${q}`;
}
