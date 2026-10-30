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

// ---------------------------------------------------------------------------------------------------------------------
// Espanhol (es-419, termos do cliente oficial: docs/glossario-es.md e nomes de item ES-ES do dump). Mesma lógica do PT;
// nome desconhecido vira rótulo genérico legível ("Bonificación: ..."), nunca o português.

const SEASONAL_ES: Record<string, string> = {
  HALLOWEEN: 'Halloween',
  CHRISTMAS: 'Navidad',
  WINTER: 'Festival de invierno',
  WINTERFESTIVAL: 'Festival de invierno',
  LUNARNEWYEAR: 'Año Nuevo Lunar',
  LUNAR: 'Año Nuevo Lunar',
  EASTER: 'Pascua',
  SPRING: 'Festival de primavera',
  SUMMER: 'Festival de verano',
  ANNIVERSARY: 'Aniversario de Albion',
  BIRTHDAY: 'Aniversario de Albion',
  CARNIVAL: 'Carnaval',
};

const ACTIVITIES_ES: Record<string, string> = {
  FACTIONPOINTS: 'Puntos de facción dobles',
  FAME: 'Bonificación de fama',
  SILVER: 'Bonificación de plata',
  LOOT: 'Bonificación de botín',
  GATHERING: 'Bonificación de recolección',
  FISHING: 'Bonificación de pesca',
  CRAFTING: 'Bonificación de producción',
  REFINING: 'Bonificación de refinado',
  FARMING: 'Bonificación de cultivo',
  MIGHT: 'Bonificación de poderío (Might)',
  FAVOR: 'Bonificación de favor',
};

/** Família no plural e o gênero (o adjetivo de raridade concorda: "ballestas raras", "arcos raros"). */
type FamilyEs = [plural: string, gender: 'm' | 'f'];
const FAMILIES_ES: Record<string, FamilyEs> = {
  // armas (famílias como em WEAPON_LABEL_ES: "Vara", "Bastón ígneo", "Guantes", "Cambiaformas")
  SWORD: ['espadas', 'f'], AXE: ['hachas', 'f'], MACE: ['mazas', 'f'], HAMMER: ['martillos', 'm'],
  CROSSBOW: ['ballestas', 'f'], BOW: ['arcos', 'm'], SPEAR: ['lanzas', 'f'], DAGGER: ['dagas', 'f'],
  QUARTERSTAFF: ['varas', 'f'], KNUCKLES: ['guantes', 'm'], WAR_GLOVES: ['guantes', 'm'],
  NATURESTAFF: ['bastones naturales', 'm'], NATURE_STAFF: ['bastones naturales', 'm'],
  FIRESTAFF: ['bastones ígneos', 'm'], FIRE_STAFF: ['bastones ígneos', 'm'],
  FROSTSTAFF: ['bastones de hielo', 'm'], FROST_STAFF: ['bastones de hielo', 'm'],
  ARCANESTAFF: ['bastones arcanos', 'm'], ARCANE_STAFF: ['bastones arcanos', 'm'],
  HOLYSTAFF: ['bastones sagrados', 'm'], HOLY_STAFF: ['bastones sagrados', 'm'],
  CURSEDSTAFF: ['bastones malditos', 'm'], CURSED_STAFF: ['bastones malditos', 'm'],
  // Família inteira como em WEAPON_LABEL_ES (shared/weapons.ts): "merodeador"/"peleador" são só a primeira arma da árvore.
  SHAPESHIFTER: ['bastones cambiaformas', 'm'], SHAPESHIFTER_STAFF: ['bastones cambiaformas', 'm'],
  // armaduras
  CLOTH_ARMOR: ['túnicas de tela', 'f'], CLOTH_HELMET: ['capuchas de tela', 'f'], CLOTH_SHOES: ['sandalias de tela', 'f'],
  LEATHER_ARMOR: ['chaquetas de cuero', 'f'], LEATHER_HELMET: ['capuchas de cuero', 'f'],
  LEATHER_SHOES: ['zapatos de cuero', 'm'],
  PLATE_ARMOR: ['armaduras de placas', 'f'], PLATE_HELMET: ['cascos de placas', 'm'], PLATE_SHOES: ['botas de placas', 'f'],
  // mano secundaria y accesorios
  SHIELD: ['escudos', 'm'], TORCH: ['antorchas', 'f'], BOOK: ['libros de hechizos', 'm'], ORB: ['orbes', 'm'],
  TOTEM: ['tótems', 'm'], HORN: ['cuernos', 'm'], OFFHAND: ['objetos de mano secundaria', 'm'], CAPE: ['capas', 'f'],
  BAG: ['bolsas', 'f'], TOOL: ['herramientas', 'f'], TOOLS: ['herramientas', 'f'],
  GATHERER: ['equipos de recolección', 'm'], MOUNT: ['monturas', 'f'], POTION: ['pociones', 'f'],
  FOOD: ['comidas', 'f'], MEAL: ['comidas', 'f'], FURNITURE: ['muebles', 'm'],
  // recursos refinados y en bruto ("Lingote", "Tablas", "Tela", "Cuero trabajado", "Troncos" no cliente)
  METALBAR: ['lingotes', 'm'], PLANKS: ['tablas', 'f'], CLOTH: ['telas', 'f'], LEATHER: ['cueros', 'm'],
  STONEBLOCK: ['bloques de piedra', 'm'], ORE: ['mineral', 'm'], WOOD: ['troncos', 'm'], FIBER: ['fibra', 'f'],
  HIDE: ['pieles', 'f'], ROCK: ['piedra', 'f'],
};

const RARITY_ES: Record<string, { m: string; f: string }> = {
  COMMON: { m: 'comunes', f: 'comunes' },
  ARTIFACT: { m: 'de artefacto', f: 'de artefacto' },
  RARE: { m: 'raros', f: 'raras' },
  AVALONIAN: { m: 'avalonianos', f: 'avalonianas' },
  CRYSTAL: { m: 'de cristal', f: 'de cristal' },
};

function seasonalLabelEs(name: string): string {
  const m = /^([A-Z_]+?)_?(\d{4})?$/.exec(name);
  const base = (m?.[1] ?? name).replace(/_+$/, '');
  const year = m?.[2];
  const es = SEASONAL_ES[base] ?? readableName(base);
  return year ? `${es} ${year}` : es;
}

function productionLabelEs(name: string): string {
  const [first, ...rest] = name.split('_');
  const rarity = RARITY_ES[first];
  const family = rarity ? rest.join('_') : name;
  const fam = FAMILIES_ES[family];
  if (!fam) return `Bonificación: ${readableName(name).toLowerCase()}`;
  const [plural, gender] = fam;
  return rarity ? `Bonificación de producción: ${plural} ${rarity[gender]}` : `Bonificación de producción: ${plural}`;
}

/** Rótulo em espanhol de uma festividade pelo Kind, categoria e UniqueName. */
export function festivityLabelEs(kind: number, category: string, name: string): string {
  if (kind === 0) return seasonalLabelEs(name);
  if (kind === 1) {
    if (category && category !== 'ACTIVITIES') return `Bonificación: ${readableName(name).toLowerCase()}`;
    return ACTIVITIES_ES[name] ?? `Bonificación de actividad: ${readableName(name).toLowerCase()}`;
  }
  if (kind === 2) return productionLabelEs(name);
  return `Bonificación: ${readableName(name).toLowerCase()}`;
}

/**
 * Rótulo da festividade na língua pedida. Em português devolve o `labelPt` da API como sempre (sem recalcular);
 * em espanhol monta pelo Kind/categoria/nome.
 */
export function festivityLabel(
  f: { kind: number; category: string; name: string; labelPt?: string | null },
  locale: 'pt' | 'es',
): string {
  if (locale === 'es') return festivityLabelEs(f.kind, f.category ?? '', f.name ?? '');
  return f.labelPt || f.name;
}
