// Lógica pura da página "Quanto vale arriscar" (/arriscar): peças do set, presets e textos dos cards por zona.
// Textos nas duas línguas: `loc` no fim (padrão: a língua atual do site, como em format.ts).
import type { Quality, RiskQuote, RiskZone, ZoneKind } from '../../../shared/types';
import { zoneRule } from '../../../shared/zones';
import { currentLocale, type Locale } from '../i18n/core';

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
  /** Espanhol (opcional; sem ele, a tela em espanhol mostra o português). */
  labelEs?: string;
  hintEs?: string;
  items: { id: string; name: string; nameEs?: string; quality?: Quality }[];
}

// Ids conferidos em public/data/names/ (30/10/2026). Nomes no PT-BR do jogo; nameEs de public/data/items-index-es.json.
export const PRESETS: Preset[] = [
  {
    id: 'coleta-t4',
    label: 'Set barato de coleta (T4)',
    hint: 'Coleta de fibra com equipamento de ceifeiro, bolsa e cavalo.',
    labelEs: 'Set barato de recolección (T4)',
    hintEs: 'Recolección de fibra con equipo de cosechador, bolsa y caballo.',
    items: [
      { id: 'T4_2H_TOOL_SICKLE', name: 'Foice do Adepto (T4)', nameEs: 'Hoz del iniciado (T4)' },
      { id: 'T4_HEAD_GATHERER_FIBER', name: 'Chapéu do Ceifeiro Adepto (T4)', nameEs: 'Gorro de cosechador del iniciado (T4)' },
      { id: 'T4_ARMOR_GATHERER_FIBER', name: 'Traje do Ceifeiro Adepto (T4)', nameEs: 'Atuendo de cosechador del iniciado (T4)' },
      { id: 'T4_SHOES_GATHERER_FIBER', name: 'Botas de Trabalho do Ceifeiro Adepto (T4)', nameEs: 'Botas de trabajo de cosechador del iniciado (T4)' },
      { id: 'T4_BACKPACK_GATHERER_FIBER', name: 'Mochila do Ceifeiro Adepto (T4)', nameEs: 'Mochila de cosechador del iniciado (T4)' },
      { id: 'T4_MOUNT_HORSE', name: 'Cavalo de Montar do Adepto (T4)', nameEs: 'Caballo de montar del iniciado (T4)' },
    ],
  },
  {
    id: 'pve-t4',
    label: 'Primeiro set de masmorra (T4)',
    hint: 'Espada e escudo com placa: aguenta bem os monstros.',
    labelEs: 'Primer set de mazmorra (T4)',
    hintEs: 'Espada y escudo con placas: aguanta bien a los monstruos.',
    items: [
      { id: 'T4_MAIN_SWORD', name: 'Espada Larga do Adepto (T4)', nameEs: 'Espada ancha del iniciado (T4)' },
      { id: 'T4_OFF_SHIELD', name: 'Escudo do Adepto (T4)', nameEs: 'Escudo del iniciado (T4)' },
      { id: 'T4_HEAD_PLATE_SET1', name: 'Elmo de Soldado do Adepto (T4)', nameEs: 'Casco de soldado del iniciado (T4)' },
      { id: 'T4_ARMOR_PLATE_SET1', name: 'Armadura de Soldado do Adepto (T4)', nameEs: 'Armadura de soldado del iniciado (T4)' },
      { id: 'T4_SHOES_PLATE_SET1', name: 'Botas de Soldado do Adepto (T4)', nameEs: 'Botas de soldado del iniciado (T4)' },
      { id: 'T4_CAPE', name: 'Capa do Adepto (T4)', nameEs: 'Capa del iniciado (T4)' },
      { id: 'T4_BAG', name: 'Bolsa do Adepto (T4)', nameEs: 'Bolsa del iniciado (T4)' },
      { id: 'T4_MOUNT_HORSE', name: 'Cavalo de Montar do Adepto (T4)', nameEs: 'Caballo de montar del iniciado (T4)' },
      { id: 'T4_POTION_HEAL', name: 'Poção de Cura (T4)', nameEs: 'Poción de curación (T4)' },
    ],
  },
  {
    id: 'gank-t6',
    label: 'Set de gank (T6)',
    hint: 'Dessangrador com couro: dano alto e fuga rápida.',
    labelEs: 'Set de emboscada (T6)',
    hintEs: 'Sangradora con cuero: daño alto y huida rápida.',
    items: [
      { id: 'T6_MAIN_RAPIER_MORGANA', name: 'Dessangrador do Mestre (T6)', nameEs: 'Sangradora del maestro (T6)' },
      { id: 'T6_HEAD_LEATHER_SET2', name: 'Capuz de Caçador do Mestre (T6)', nameEs: 'Capucha de cazador del maestro (T6)' },
      { id: 'T6_ARMOR_LEATHER_SET1', name: 'Casaco de Mercenário do Mestre (T6)', nameEs: 'Chaqueta de mercenario del maestro (T6)' },
      { id: 'T6_SHOES_LEATHER_SET1', name: 'Sapatos de Mercenário do Mestre (T6)', nameEs: 'Zapatos de mercenario del maestro (T6)' },
      { id: 'T6_CAPEITEM_FW_MARTLOCK', name: 'Capa de Martlock do Mestre (T6)', nameEs: 'Capa de Martlock del maestro (T6)' },
      { id: 'T6_BAG', name: 'Bolsa do Mestre (T6)', nameEs: 'Bolsa del maestro (T6)' },
      { id: 'T6_MOUNT_DIREWOLF', name: 'Lobo-vil (T6)', nameEs: 'Huargo (T6)' },
      { id: 'T6_POTION_HEAL', name: 'Poção de Cura Maior (T6)', nameEs: 'Poción de curación mayor (T6)' },
      { id: 'T6_MEAL_STEW', name: 'Guisado de Carneiro (T6)', nameEs: 'Guiso de carnero (T6)' },
    ],
  },
  {
    id: 'transporte-t4',
    label: 'Transporte com boi (T4)',
    hint: 'Só a montaria e a bolsa; a carga você soma à parte.',
    labelEs: 'Transporte con buey (T4)',
    hintEs: 'Solo la montura y la bolsa; la carga la sumas aparte.',
    items: [
      { id: 'T4_MOUNT_OX', name: 'Boi de Transporte do Adepto (T4)', nameEs: 'Buey de transporte del iniciado (T4)' },
      { id: 'T4_BAG', name: 'Bolsa do Adepto (T4)', nameEs: 'Bolsa del iniciado (T4)' },
      { id: 'T4_CAPE', name: 'Capa do Adepto (T4)', nameEs: 'Capa del iniciado (T4)' },
    ],
  },
];

/** Rótulo e dica do preset na língua pedida. */
export function presetText(p: Preset, loc: Locale = currentLocale()): { label: string; hint: string } {
  return loc === 'es' ? { label: p.labelEs ?? p.label, hint: p.hintEs ?? p.hint } : { label: p.label, hint: p.hint };
}

let nextKey = 1;
export function newPiece(itemId = '', itemName = '', quality: Quality = 1): Piece {
  return { key: nextKey++, itemId, itemName, quality };
}

export function presetPieces(p: Preset, loc: Locale = currentLocale()): Piece[] {
  return p.items.slice(0, MAX_PIECES).map((i) => newPiece(i.id, loc === 'es' ? (i.nameEs ?? i.name) : i.name, i.quality ?? 1));
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

export function loseLabel(lose: RiskZone['lose'], loc: Locale = currentLocale()): string {
  if (loc === 'es') return lose === 'tudo' ? 'Lo pierdes todo' : lose === 'durabilidade' ? 'Pierdes durabilidad' : 'No pierdes nada';
  return lose === 'tudo' ? 'Perde tudo' : lose === 'durabilidade' ? 'Perde durabilidade' : 'Não perde nada';
}

/**
 * Regras de cada zona em espanhol, espelho de shared/zones.ts (que é só pt e vem também na resposta de /api/risk).
 * Mudou o texto lá, muda aqui: tests/i18n-economia.test.ts confere que as duas listas têm as mesmas zonas.
 */
export const ZONE_TEXT_ES: Record<ZoneKind, { label: string; who: string; death: string; note: string }> = {
  azul: {
    label: 'Zona azul',
    who: 'Nadie puede atacarte: no hay combate entre jugadores.',
    death: 'Morir ante un monstruo solo te derriba. El equipo se queda contigo y pierde durabilidad.',
    note: 'No pierdes el set, solo pagas la reparación. El costo de la reparación no entra en el cálculo.',
  },
  amarela: {
    label: 'Zona amarilla',
    who: 'Solo quien activó la bandera de PvP (el ícono de espadas) puede atacar, y puede atacarte aunque no tengas bandera (quien ataca a alguien sin bandera pierde un poco de reputación).',
    death: 'Una derrota ante un jugador o un monstruo solo te derriba. Nadie saquea tu set; el equipo pierde durabilidad.',
    note: 'Pueden derribarte y echarte del lugar, pero no pierdes el set. El costo de la reparación no entra en el cálculo.',
  },
  vermelha: {
    label: 'Zona roja',
    who: 'Cualquier jugador con bandera puede atacarte, tengas o no tu bandera. Quien ataca a alguien sin bandera pierde reputación, pero eso no impide el ataque.',
    death: 'Al morir, ante un jugador o un monstruo, todo lo que llevas puesto y en la bolsa queda en el suelo para quien pase.',
    note: 'Botín completo: el set entero y la bolsa quedan en el suelo. Parte de los objetos puede destruirse al morir.',
  },
  preta: {
    label: 'Zona negra (Tierras Lejanas)',
    who: 'Cualquiera fuera de tu gremio, alianza y grupo puede atacarte, sin bandera y sin perder reputación.',
    death: 'Al morir, ante un jugador o un monstruo, dejas todo lo que llevas puesto y en la bolsa.',
    note: 'Botín completo, sin aviso de bandera. Cuanto más cerca del centro del mapa, más gente y más riesgo.',
  },
  avalon: {
    label: 'Caminos de Avalon',
    who: 'Siguen la regla de la zona negra: cualquiera fuera de tu gremio, alianza y grupo puede atacarte.',
    death: 'Al morir dejas todo lo que llevas puesto y en la bolsa. Los portales cambian de lugar y de tiempo de cierre, y la salida puede desaparecer.',
    note: 'Botín completo. Revisa el tiempo del portal de regreso antes de entrar.',
  },
  brumas: {
    label: 'Nieblas',
    who: 'Hechas para jugar solo o en pareja. En las Nieblas letales, cualquiera fuera de tu grupo puede atacarte.',
    death: 'En las Nieblas letales (entrada por zona roja o negra) al morir lo dejas todo. En las no letales (entrada por zona azul o amarilla) solo te derriban.',
    note: 'El valor considera las Nieblas letales. En las no letales solo pierdes durabilidad.',
  },
};

/** Textos da zona na língua pedida: em pt, os de shared/zones.ts (iguais aos da API); em es, ZONE_TEXT_ES. */
export function zoneText(zone: ZoneKind, loc: Locale = currentLocale()): { label: string; who: string; death: string; note: string } {
  const r = zoneRule(zone);
  if (loc === 'es' && ZONE_TEXT_ES[zone]) return ZONE_TEXT_ES[zone];
  return { label: r.labelPt, who: r.who, death: r.death, note: r.note };
}

export function loseTone(lose: RiskZone['lose']): 'bad' | 'warn' | 'good' {
  return lose === 'tudo' ? 'bad' : lose === 'durabilidade' ? 'warn' : 'good';
}

/** Frase de cobertura do preço: "8 de 9 peças com preço". */
export function coverageText(q: Pick<RiskQuote, 'items' | 'missing'>, loc: Locale = currentLocale()): string {
  const n = q.items.length;
  const ok = n - q.missing;
  if (loc === 'es') {
    if (!n) return 'Ninguna pieza.';
    if (q.missing === 0) return n === 1 ? 'La pieza tiene precio.' : `Las ${n} piezas tienen precio.`;
    return `${ok} de ${n} ${n === 1 ? 'pieza' : 'piezas'} con precio; el total no incluye ${q.missing === 1 ? 'la pieza sin precio' : `las ${q.missing} piezas sin precio`}.`;
  }
  if (!n) return 'Nenhuma peça.';
  if (q.missing === 0) return n === 1 ? 'A peça tem preço.' : `As ${n} peças têm preço.`;
  return `${ok} de ${n} ${n === 1 ? 'peça' : 'peças'} com preço; o total não inclui ${q.missing === 1 ? 'a peça sem preço' : `as ${q.missing} peças sem preço`}.`;
}
