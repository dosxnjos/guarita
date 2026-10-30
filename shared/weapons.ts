// Família de arma em PT-BR a partir do id do item (ex.: 'T6_2H_CLAYMORE@2' → Espada). Dono: módulo (c).
// Tabela exata montada dos ids reais do ao-bin-dumps (items.json de 29/10/2026); arma nova que ainda não
// estiver na tabela cai na regra por pedaço do nome e, se nada bater, em 'Outra'.

export type WeaponFamily =
  | 'sword' | 'bow' | 'crossbow' | 'dagger' | 'spear' | 'axe' | 'mace' | 'hammer' | 'quarterstaff'
  | 'knuckles' | 'firestaff' | 'froststaff' | 'arcanestaff' | 'holystaff' | 'naturestaff' | 'cursedstaff'
  | 'shapeshifter' | 'tool' | 'other';

export const WEAPON_LABEL_PT: Record<WeaponFamily, string> = {
  sword: 'Espada',
  bow: 'Arco',
  crossbow: 'Besta',
  dagger: 'Adaga',
  spear: 'Lança',
  axe: 'Machado',
  mace: 'Maça',
  hammer: 'Martelo',
  quarterstaff: 'Bastão',
  knuckles: 'Manoplas',
  firestaff: 'Cajado de fogo',
  froststaff: 'Cajado de gelo',
  arcanestaff: 'Cajado arcano',
  holystaff: 'Cajado sagrado',
  naturestaff: 'Cajado da natureza',
  cursedstaff: 'Cajado amaldiçoado',
  shapeshifter: 'Metamorfo',
  tool: 'Ferramenta de coleta',
  other: 'Outra',
};

// Base do id (sem tier e sem encantamento) → família. Cada linha é uma árvore de arma do jogo.
const TABLE: Record<Exclude<WeaponFamily, 'tool' | 'other'>, string[]> = {
  sword: ['MAIN_SWORD', '2H_CLAYMORE', '2H_DUALSWORD', 'MAIN_SCIMITAR_MORGANA', '2H_CLEAVER_HELL',
    '2H_DUALSCIMITAR_UNDEAD', '2H_CLAYMORE_AVALON', 'MAIN_SWORD_CRYSTAL'],
  bow: ['2H_BOW', '2H_WARBOW', '2H_LONGBOW', '2H_LONGBOW_UNDEAD', '2H_BOW_HELL', '2H_BOW_KEEPER',
    '2H_BOW_AVALON', '2H_BOW_CRYSTAL'],
  crossbow: ['2H_CROSSBOW', '2H_CROSSBOWLARGE', 'MAIN_1HCROSSBOW', '2H_REPEATINGCROSSBOW_UNDEAD',
    '2H_DUALCROSSBOW_HELL', '2H_CROSSBOWLARGE_MORGANA', '2H_CROSSBOW_CANNON_AVALON', '2H_DUALCROSSBOW_CRYSTAL'],
  dagger: ['MAIN_DAGGER', '2H_DAGGERPAIR', '2H_CLAWPAIR', 'MAIN_RAPIER_MORGANA', 'MAIN_DAGGER_HELL',
    '2H_DUALSICKLE_UNDEAD', '2H_IRONGAUNTLETS_HELL', '2H_DAGGER_KATAR_AVALON', '2H_DAGGERPAIR_CRYSTAL'],
  spear: ['MAIN_SPEAR', '2H_SPEAR', '2H_GLAIVE', 'MAIN_SPEAR_KEEPER', '2H_HARPOON_HELL', '2H_TRIDENT_UNDEAD',
    'MAIN_SPEAR_LANCE_AVALON', '2H_GLAIVE_CRYSTAL'],
  axe: ['MAIN_AXE', '2H_AXE', '2H_HALBERD', '2H_HALBERD_MORGANA', '2H_SCYTHE_HELL', '2H_DUALAXE_KEEPER',
    '2H_AXE_AVALON', '2H_SCYTHE_CRYSTAL'],
  mace: ['MAIN_MACE', '2H_MACE', '2H_FLAIL', 'MAIN_ROCKMACE_KEEPER', 'MAIN_MACE_HELL', '2H_MACE_MORGANA',
    '2H_DUALMACE_AVALON', 'MAIN_MACE_CRYSTAL'],
  hammer: ['MAIN_HAMMER', '2H_POLEHAMMER', '2H_HAMMER', '2H_HAMMER_UNDEAD', '2H_DUALHAMMER_HELL',
    '2H_RAM_KEEPER', '2H_HAMMER_AVALON', '2H_HAMMER_CRYSTAL'],
  quarterstaff: ['2H_QUARTERSTAFF', '2H_IRONCLADEDSTAFF', '2H_DOUBLEBLADEDSTAFF', '2H_COMBATSTAFF_MORGANA',
    '2H_TWINSCYTHE_HELL', '2H_ROCKSTAFF_KEEPER', '2H_QUARTERSTAFF_AVALON', '2H_DOUBLEBLADEDSTAFF_CRYSTAL'],
  knuckles: ['2H_KNUCKLES_SET1', '2H_KNUCKLES_SET2', '2H_KNUCKLES_SET3', '2H_KNUCKLES_KEEPER',
    '2H_KNUCKLES_HELL', '2H_KNUCKLES_MORGANA', '2H_KNUCKLES_AVALON', '2H_KNUCKLES_CRYSTAL'],
  firestaff: ['MAIN_FIRESTAFF', '2H_FIRESTAFF', '2H_INFERNOSTAFF', 'MAIN_FIRESTAFF_KEEPER', '2H_FIRESTAFF_HELL',
    '2H_INFERNOSTAFF_MORGANA', '2H_FIRE_RINGPAIR_AVALON', 'MAIN_FIRESTAFF_CRYSTAL'],
  froststaff: ['MAIN_FROSTSTAFF', '2H_FROSTSTAFF', '2H_GLACIALSTAFF', 'MAIN_FROSTSTAFF_KEEPER',
    '2H_ICEGAUNTLETS_HELL', '2H_ICECRYSTAL_UNDEAD', 'MAIN_FROSTSTAFF_AVALON', '2H_FROSTSTAFF_CRYSTAL'],
  arcanestaff: ['MAIN_ARCANESTAFF', '2H_ARCANESTAFF', '2H_ENIGMATICSTAFF', 'MAIN_ARCANESTAFF_UNDEAD',
    '2H_ARCANESTAFF_HELL', '2H_ENIGMATICORB_MORGANA', '2H_ARCANE_RINGPAIR_AVALON', '2H_ARCANESTAFF_CRYSTAL'],
  holystaff: ['MAIN_HOLYSTAFF', '2H_HOLYSTAFF', '2H_DIVINESTAFF', 'MAIN_HOLYSTAFF_MORGANA', '2H_HOLYSTAFF_HELL',
    '2H_HOLYSTAFF_UNDEAD', 'MAIN_HOLYSTAFF_AVALON', '2H_HOLYSTAFF_CRYSTAL'],
  naturestaff: ['MAIN_NATURESTAFF', '2H_NATURESTAFF', '2H_WILDSTAFF', 'MAIN_NATURESTAFF_KEEPER',
    '2H_NATURESTAFF_HELL', '2H_NATURESTAFF_KEEPER', 'MAIN_NATURESTAFF_AVALON', 'MAIN_NATURESTAFF_CRYSTAL'],
  cursedstaff: ['MAIN_CURSEDSTAFF', '2H_CURSEDSTAFF', '2H_DEMONICSTAFF', 'MAIN_CURSEDSTAFF_UNDEAD',
    '2H_SKULLORB_HELL', '2H_CURSEDSTAFF_MORGANA', 'MAIN_CURSEDSTAFF_AVALON', 'MAIN_CURSEDSTAFF_CRYSTAL'],
  shapeshifter: ['2H_SHAPESHIFTER_SET1', '2H_SHAPESHIFTER_SET2', '2H_SHAPESHIFTER_SET3', '2H_SHAPESHIFTER_KEEPER',
    '2H_SHAPESHIFTER_HELL', '2H_SHAPESHIFTER_MORGANA', '2H_SHAPESHIFTER_AVALON', '2H_SHAPESHIFTER_CRYSTAL'],
};

const EXACT = new Map<string, WeaponFamily>();
for (const [fam, bases] of Object.entries(TABLE)) for (const b of bases) EXACT.set(b, fam as WeaponFamily);

// Reserva por pedaço do nome, na ordem: o mais específico primeiro (GLACIALSTAFF antes de STAFF etc.).
const TOKENS: [RegExp, WeaponFamily][] = [
  [/TOOL_/, 'tool'],
  [/SHAPESHIFTER/, 'shapeshifter'],
  [/KNUCKLES|GAUNTLETS|BRACERS/, 'knuckles'],
  [/FIRESTAFF|INFERNOSTAFF|FIRE_RINGPAIR/, 'firestaff'],
  [/FROSTSTAFF|GLACIALSTAFF|ICECRYSTAL|ICEGAUNTLETS/, 'froststaff'],
  [/ARCANESTAFF|ENIGMATIC|ARCANE_RINGPAIR/, 'arcanestaff'],
  [/HOLYSTAFF|DIVINESTAFF/, 'holystaff'],
  [/NATURESTAFF|WILDSTAFF/, 'naturestaff'],
  [/CURSEDSTAFF|DEMONICSTAFF|SKULLORB/, 'cursedstaff'],
  [/QUARTERSTAFF|IRONCLADEDSTAFF|DOUBLEBLADEDSTAFF|COMBATSTAFF|ROCKSTAFF|TWINSCYTHE/, 'quarterstaff'],
  [/CROSSBOW/, 'crossbow'],
  [/BOW/, 'bow'],
  [/DAGGER|CLAWPAIR|RAPIER|SICKLE|KATAR/, 'dagger'],
  [/SPEAR|HARPOON|GLAIVE|TRIDENT|LANCE/, 'spear'],
  [/AXE|HALBERD|SCYTHE/, 'axe'],
  [/HAMMER|RAM_KEEPER/, 'hammer'],
  [/MACE|FLAIL/, 'mace'],
  [/SWORD|CLAYMORE|SCIMITAR|CLEAVER/, 'sword'],
];

/** Base do id: tira o tier ('T6_'), o encantamento ('@2') e o sufixo de nível de encantamento antigo ('_LEVEL2'). */
export function weaponBase(id: string): string {
  return id.toUpperCase().replace(/@\d+$/, '').replace(/^T\d+_/, '').replace(/_LEVEL\d+$/, '');
}

/** Família da arma pelo id; 'other' quando não é arma conhecida. */
export function weaponFamily(id: string | null | undefined): WeaponFamily {
  if (!id) return 'other';
  const base = weaponBase(id);
  const exact = EXACT.get(base);
  if (exact) return exact;
  if (!/^(MAIN|2H)_/.test(base)) return 'other';
  for (const [re, fam] of TOKENS) if (re.test(base)) return fam;
  return 'other';
}

/** Rótulo PT-BR da família da arma (ex.: 'Espada'); 'Outra' quando desconhecida. */
export function weaponLabelPt(id: string | null | undefined): string {
  return WEAPON_LABEL_PT[weaponFamily(id)];
}
