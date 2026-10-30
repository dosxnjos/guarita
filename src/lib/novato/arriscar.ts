// Lógica pura da página "Quanto vale arriscar" (/arriscar): peças do set, presets e textos dos cards por zona.
import type { Quality, RiskQuote, RiskZone } from '../../../shared/types';

export const MAX_PIECES = 12;

export interface Piece {
  /** Chave estável da linha na tela. */
  key: number;
  itemId: string;
  itemName: string;
  quality: Quality;
}

export interface Preset {
  id: string;
  label: string;
  hint: string;
  items: { id: string; name: string; quality?: Quality }[];
}

// Ids conferidos em public/data/names/ (30/10/2026). Nomes no PT-BR do jogo.
export const PRESETS: Preset[] = [
  {
    id: 'coleta-t4',
    label: 'Set barato de coleta (T4)',
    hint: 'Coleta de fibra com equipamento de ceifeiro, bolsa e cavalo.',
    items: [
      { id: 'T4_2H_TOOL_SICKLE', name: 'Foice do Adepto (T4)' },
      { id: 'T4_HEAD_GATHERER_FIBER', name: 'Chapéu do Ceifeiro Adepto (T4)' },
      { id: 'T4_ARMOR_GATHERER_FIBER', name: 'Traje do Ceifeiro Adepto (T4)' },
      { id: 'T4_SHOES_GATHERER_FIBER', name: 'Botas de Trabalho do Ceifeiro Adepto (T4)' },
      { id: 'T4_BACKPACK_GATHERER_FIBER', name: 'Mochila do Ceifeiro Adepto (T4)' },
      { id: 'T4_MOUNT_HORSE', name: 'Cavalo de Montar do Adepto (T4)' },
    ],
  },
  {
    id: 'pve-t4',
    label: 'Primeiro set de masmorra (T4)',
    hint: 'Espada e escudo com placa: aguenta bem os monstros.',
    items: [
      { id: 'T4_MAIN_SWORD', name: 'Espada Larga do Adepto (T4)' },
      { id: 'T4_OFF_SHIELD', name: 'Escudo do Adepto (T4)' },
      { id: 'T4_HEAD_PLATE_SET1', name: 'Elmo de Soldado do Adepto (T4)' },
      { id: 'T4_ARMOR_PLATE_SET1', name: 'Armadura de Soldado do Adepto (T4)' },
      { id: 'T4_SHOES_PLATE_SET1', name: 'Botas de Soldado do Adepto (T4)' },
      { id: 'T4_CAPE', name: 'Capa do Adepto (T4)' },
      { id: 'T4_BAG', name: 'Bolsa do Adepto (T4)' },
      { id: 'T4_MOUNT_HORSE', name: 'Cavalo de Montar do Adepto (T4)' },
      { id: 'T4_POTION_HEAL', name: 'Poção de Cura (T4)' },
    ],
  },
  {
    id: 'gank-t6',
    label: 'Set de gank (T6)',
    hint: 'Dessangrador com couro: dano alto e fuga rápida.',
    items: [
      { id: 'T6_MAIN_RAPIER_MORGANA', name: 'Dessangrador do Mestre (T6)' },
      { id: 'T6_HEAD_LEATHER_SET2', name: 'Capuz de Caçador do Mestre (T6)' },
      { id: 'T6_ARMOR_LEATHER_SET1', name: 'Casaco de Mercenário do Mestre (T6)' },
      { id: 'T6_SHOES_LEATHER_SET1', name: 'Sapatos de Mercenário do Mestre (T6)' },
      { id: 'T6_CAPEITEM_FW_MARTLOCK', name: 'Capa de Martlock do Mestre (T6)' },
      { id: 'T6_BAG', name: 'Bolsa do Mestre (T6)' },
      { id: 'T6_MOUNT_DIREWOLF', name: 'Lobo-vil (T6)' },
      { id: 'T6_POTION_HEAL', name: 'Poção de Cura Maior (T6)' },
      { id: 'T6_MEAL_STEW', name: 'Guisado de Carneiro (T6)' },
    ],
  },
  {
    id: 'transporte-t4',
    label: 'Transporte com boi (T4)',
    hint: 'Só a montaria e a bolsa; a carga você soma à parte.',
    items: [
      { id: 'T4_MOUNT_OX', name: 'Boi de Transporte do Adepto (T4)' },
      { id: 'T4_BAG', name: 'Bolsa do Adepto (T4)' },
      { id: 'T4_CAPE', name: 'Capa do Adepto (T4)' },
    ],
  },
];

let nextKey = 1;
export function newPiece(itemId = '', itemName = '', quality: Quality = 1): Piece {
  return { key: nextKey++, itemId, itemName, quality };
}

export function presetPieces(p: Preset): Piece[] {
  return p.items.slice(0, MAX_PIECES).map((i) => newPiece(i.id, i.name, i.quality ?? 1));
}

/** Peças prontas para mandar à API: com item escolhido, no máximo 12. */
export function readyPieces(pieces: Piece[]): { id: string; quality: Quality }[] {
  return pieces.filter((p) => p.itemId.trim()).slice(0, MAX_PIECES).map((p) => ({ id: p.itemId.trim().toUpperCase(), quality: p.quality }));
}

/** Assinatura do pedido (para saber se o resultado na tela corresponde às peças atuais). */
export function piecesSignature(items: { id: string; quality: Quality }[]): string {
  return items.map((i) => `${i.id}:${i.quality}`).join('|');
}

const ID_RE = /^T[1-8]_[A-Z0-9_]+(@[1-4])?$/;

/** "?set=T4_BAG:1,T4_CAPE:3" → peças (ignora o que não tem formato de id; no máximo 12). */
export function parseSetParam(raw: string | null | undefined): Piece[] {
  if (!raw) return [];
  const out: Piece[] = [];
  for (const part of raw.split(',')) {
    const [idRaw, qRaw] = part.split(':');
    const id = (idRaw ?? '').trim().toUpperCase();
    if (!ID_RE.test(id)) continue;
    const qn = Number(qRaw);
    const q = (qn >= 1 && qn <= 5 && Number.isInteger(qn) ? qn : 1) as Quality;
    out.push(newPiece(id, '', q));
    if (out.length >= MAX_PIECES) break;
  }
  return out;
}

export function setParam(items: { id: string; quality: Quality }[]): string {
  return items.map((i) => `${i.id}:${i.quality}`).join(',');
}

export function loseLabel(lose: RiskZone['lose']): string {
  return lose === 'tudo' ? 'Perde tudo' : lose === 'durabilidade' ? 'Perde durabilidade' : 'Não perde nada';
}

export function loseTone(lose: RiskZone['lose']): 'bad' | 'warn' | 'good' {
  return lose === 'tudo' ? 'bad' : lose === 'durabilidade' ? 'warn' : 'good';
}

/** Frase de cobertura do preço: "8 de 9 peças com preço". */
export function coverageText(q: Pick<RiskQuote, 'items' | 'missing'>): string {
  const n = q.items.length;
  const ok = n - q.missing;
  if (!n) return 'Nenhuma peça.';
  if (q.missing === 0) return n === 1 ? 'A peça tem preço.' : `As ${n} peças têm preço.`;
  return `${ok} de ${n} ${n === 1 ? 'peça' : 'peças'} com preço; o total não inclui ${q.missing === 1 ? 'a peça sem preço' : `as ${q.missing} peças sem preço`}.`;
}
