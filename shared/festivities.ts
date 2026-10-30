// Rótulos em PT-BR das festividades do AODP (/festivities). Lógica pura.
//   Kind 0: evento sazonal (HALLOWEEN2026 → "Halloween 2026").
//   Kind 1: bônus de atividade, categoria ACTIVITIES (FACTIONPOINTS → "Pontos de facção em dobro").
//   Kind 2: bônus de produção do dia (COMMON_CROSSBOW → "Bônus de produção: bestas comuns").
// Nome desconhecido não quebra: vira um rótulo genérico legível.

const SEASONAL: Record<string, string> = {
  HALLOWEEN: 'Halloween',
  CHRISTMAS: 'Natal',
  WINTER: 'Festival de inverno',
  WINTERFESTIVAL: 'Festival de inverno',
  LUNARNEWYEAR: 'Ano Novo Lunar',
  LUNAR: 'Ano Novo Lunar',
  EASTER: 'Páscoa',
  SPRING: 'Festival da primavera',
  SUMMER: 'Festival de verão',
  ANNIVERSARY: 'Aniversário do Albion',
  BIRTHDAY: 'Aniversário do Albion',
  CARNIVAL: 'Carnaval',
};

const ACTIVITIES: Record<string, string> = {
  FACTIONPOINTS: 'Pontos de facção em dobro',
  FAME: 'Bônus de fama',
  SILVER: 'Bônus de prata',
  LOOT: 'Bônus de saque',
  GATHERING: 'Bônus de coleta',
  FISHING: 'Bônus de pesca',
  CRAFTING: 'Bônus de produção',
  REFINING: 'Bônus de refino',
  FARMING: 'Bônus de plantação',
  MIGHT: 'Bônus de poder (Might)',
  FAVOR: 'Bônus de favor',
};

/** Famílias de item do bônus de produção, no plural. */
const FAMILIES: Record<string, string> = {
  // armas
  SWORD: 'espadas', AXE: 'machados', MACE: 'maças', HAMMER: 'martelos', CROSSBOW: 'bestas', BOW: 'arcos',
  SPEAR: 'lanças', DAGGER: 'adagas', QUARTERSTAFF: 'bordões', KNUCKLES: 'manoplas de combate',
  WAR_GLOVES: 'manoplas de combate', NATURESTAFF: 'cajados da natureza', NATURE_STAFF: 'cajados da natureza',
  FIRESTAFF: 'cajados de fogo', FIRE_STAFF: 'cajados de fogo', FROSTSTAFF: 'cajados de gelo',
  FROST_STAFF: 'cajados de gelo', ARCANESTAFF: 'cajados arcanos', ARCANE_STAFF: 'cajados arcanos',
  HOLYSTAFF: 'cajados sagrados', HOLY_STAFF: 'cajados sagrados', CURSEDSTAFF: 'cajados amaldiçoados',
  CURSED_STAFF: 'cajados amaldiçoados', SHAPESHIFTER: 'cajados metamorfos', SHAPESHIFTER_STAFF: 'cajados metamorfos',
  // armaduras
  CLOTH_ARMOR: 'armaduras de tecido', CLOTH_HELMET: 'capuzes de tecido', CLOTH_SHOES: 'sandálias de tecido',
  LEATHER_ARMOR: 'armaduras de couro', LEATHER_HELMET: 'capuzes de couro', LEATHER_SHOES: 'sapatos de couro',
  PLATE_ARMOR: 'armaduras de placa', PLATE_HELMET: 'elmos de placa', PLATE_SHOES: 'botas de placa',
  // mão secundária e acessórios
  SHIELD: 'escudos', TORCH: 'tochas', BOOK: 'tomos', ORB: 'orbes', TOTEM: 'totens', HORN: 'trompas',
  OFFHAND: 'itens de mão secundária', CAPE: 'capas', BAG: 'bolsas', TOOL: 'ferramentas', TOOLS: 'ferramentas',
  GATHERER: 'equipamentos de coleta', MOUNT: 'montarias', POTION: 'poções', FOOD: 'comidas', MEAL: 'comidas',
  FURNITURE: 'mobília',
  // recursos refinados e brutos
  METALBAR: 'barras de metal', PLANKS: 'tábuas', CLOTH: 'tecidos', LEATHER: 'couros', STONEBLOCK: 'blocos de pedra',
  ORE: 'minério', WOOD: 'madeira', FIBER: 'fibra', HIDE: 'peles', ROCK: 'pedra',
};

/** Adjetivo de raridade da família (prefixo do UniqueName). */
const RARITY: Record<string, string> = {
  COMMON: 'comuns',
  ARTIFACT: 'de artefato',
  RARE: 'raras',
  AVALONIAN: 'avalonianas',
  CRYSTAL: 'de cristal',
};

/** "COMMON_LEATHER_ARMOR" → "Common leather armor". */
export function readableName(unique: string): string {
  const s = unique.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : unique;
}

function seasonalLabel(name: string): string {
  const m = /^([A-Z_]+?)_?(\d{4})?$/.exec(name);
  const base = (m?.[1] ?? name).replace(/_+$/, '');
  const year = m?.[2];
  const pt = SEASONAL[base] ?? readableName(base);
  return year ? `${pt} ${year}` : pt;
}

function activityLabel(name: string): string {
  return ACTIVITIES[name] ?? `Bônus de atividade: ${readableName(name).toLowerCase()}`;
}

function productionLabel(name: string): string {
  const [first, ...rest] = name.split('_');
  const rarity = RARITY[first];
  const family = rarity ? rest.join('_') : name;
  const pt = FAMILIES[family];
  if (!pt) return `Bônus: ${readableName(name).toLowerCase()}`;
  return rarity ? `Bônus de produção: ${pt} ${rarity}` : `Bônus de produção: ${pt}`;
}

/** Rótulo em PT-BR de uma festividade pelo Kind, categoria e UniqueName. */
export function festivityLabelPt(kind: number, category: string, name: string): string {
  if (kind === 0) return seasonalLabel(name);
  if (kind === 1) return category && category !== 'ACTIVITIES' ? `Bônus: ${readableName(name).toLowerCase()}` : activityLabel(name);
  if (kind === 2) return productionLabel(name);
  return `Bônus: ${readableName(name).toLowerCase()}`;
}
