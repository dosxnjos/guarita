// Cesta fixa do "O que fazer hoje" (módulo c da Fase 3) e as constantes de refino. Dado puro, sem import de runtime:
// o Worker (worker/api/hoje.ts) e os testes importam daqui; nomes já em PT-BR para o Worker não ler índice nenhum
// (ler items-index.json ou names/*.json no Worker estoura a CPU do plano grátis, ver docs/ARMADILHAS.md).
//
// Nomes: public/data/items-index.json (dump ao-bin-dumps de 30/10/2026) + "(T4.1)" no padrão de tierLabel().
//
// Refino, fontes primárias (ao-bin-dumps, branch master, conferido em 30/10/2026; o wiki oficial responde 403):
// - craftingmodifiers.xml: <refiningbonus value="0.18"> nas cinco cidades reais, em Caerleon e em Brecilien; bônus de
//   recurso 0.40 só nas cidades reais (Thetford ore, Lymhurst fiber, Bridgewatch rock, Martlock hide,
//   Fort Sterling wood). Caerleon e Brecilien não têm bônus de recurso.
// - gamedata.xml <ActionFocus><CraftingEfficiency bonus="0.59">: foco soma 0.59 ao bônus de produção.
// - festivities.xml <dailyevents> categoria GENERAL (2 sorteados por dia): COMMON_<ORE|WOOD|FIBER|HIDE|ROCK> vale 0.10
//   e RARE_<...> 0.20 no refino daquela categoria. Tratado como soma ao bônus de produção (mesma régua das outras).
// - Taxa de retorno (RRR) = 1 − 1/(1 + soma dos bônus): 0,18 → 15,3%; 0,58 → 36,7%; 1,17 → 53,9% (os valores que a
//   comunidade usa). O retorno vale para todos os ingredientes da receita, inclusive a barra/tábua do tier abaixo
//   (premissa da Guarita; é como o jogo devolve material, mas não há linha no dump que diga isso).
// - items.xml: receita do refinado T4 = 2 brutos + 1 refinado T3; T5 = 3 + 1 T4; T6 = 4 + 1 T5. Encantado .1 usa
//   o bruto .1 e o refinado .1 do tier abaixo (T4.1 usa o T3 comum). Bloco de pedra não tem versão encantada.
// - Fora da conta, de propósito: taxa de uso da estação (varia por estação e dono) e o peso da carga.

import type { City } from './types';

export interface CestaItem {
  id: string;
  nome: string;
}

const TIER_NAME: Record<number, string> = { 3: 'Iniciante', 4: 'Adepto', 5: 'Perito', 6: 'Mestre' };

/** Itens de giro alto para o flip no Black Market: 10 bases × T4–T6 × comum e .1 = 60 itens. */
const FLIP_BASES: { base: string; nome: (tier: string) => string }[] = [
  { base: 'BAG', nome: (t) => `Bolsa do ${t}` },
  { base: 'CAPE', nome: (t) => `Capa do ${t}` },
  { base: 'MAIN_SWORD', nome: (t) => `Espada Larga do ${t}` },
  { base: '2H_BOW', nome: (t) => `Arco do ${t}` },
  { base: 'MAIN_CURSEDSTAFF', nome: (t) => `Cajado Amaldiçoado do ${t}` },
  { base: 'MAIN_HOLYSTAFF', nome: (t) => `Cajado Sagrado do ${t}` },
  { base: 'ARMOR_PLATE_SET1', nome: (t) => `Armadura de Soldado do ${t}` },
  { base: 'ARMOR_LEATHER_SET1', nome: (t) => `Casaco de Mercenário do ${t}` },
  { base: 'ARMOR_CLOTH_SET1', nome: (t) => `Robe de Erudito do ${t}` },
  { base: 'SHOES_LEATHER_SET1', nome: (t) => `Sapatos de Mercenário do ${t}` },
];

function label(nome: string, tier: number, ench: number): string {
  return `${nome} (T${tier}${ench ? '.' + ench : ''})`;
}

export const FLIP_ITEMS: CestaItem[] = FLIP_BASES.flatMap((b) =>
  [4, 5, 6].flatMap((t) => [0, 1].map((e) => ({ id: `T${t}_${b.base}${e ? `@${e}` : ''}`, nome: label(b.nome(TIER_NAME[t]), t, e) }))),
);

export type Recurso = 'ore' | 'wood' | 'fiber' | 'hide' | 'rock';

export interface RecursoDef {
  recurso: Recurso;
  /** Rótulo do refino na tela ("barras de metal"). */
  rotulo: string;
  /** Rótulo do recurso bruto, para o bônus do dia ("minério"). */
  bruto: string;
  raw: string;
  ref: string;
  cidade: City;
  /** Tiers com nome em PT-BR: [bruto, refinado] (o .1 acrescenta " Incomum"/" Incomuns"). */
  nomes: Record<number, [string, string]>;
  /** Plural do sufixo do encantado .1 ("Incomum" ou "Incomuns"), [bruto, refinado]. */
  incomum: [string, string];
  encantado: boolean;
}

export const RECURSOS: RecursoDef[] = [
  {
    recurso: 'ore', rotulo: 'barras de metal', bruto: 'minério', raw: 'ORE', ref: 'METALBAR', cidade: 'Thetford',
    nomes: { 3: ['', 'Barra de Bronze'], 4: ['Minério de Ferro', 'Barra de Aço'], 5: ['Minério de Titânio', 'Barra de Aço Titânio'], 6: ['Minério de Runita', 'Barra de Aço Runita'] },
    incomum: ['Incomum', 'Incomum'], encantado: true,
  },
  {
    recurso: 'wood', rotulo: 'tábuas', bruto: 'madeira', raw: 'WOOD', ref: 'PLANKS', cidade: 'Fort Sterling',
    nomes: { 3: ['', 'Tábuas de Castanheira'], 4: ['Troncos de Pinho', 'Tábuas de Pinho'], 5: ['Troncos de Cedro', 'Tábuas de Cedro'], 6: ['Troncos de Carvalho-sangue', 'Tábuas de Carvalho-sangue'] },
    incomum: ['Incomuns', 'Incomuns'], encantado: true,
  },
  {
    recurso: 'fiber', rotulo: 'tecidos', bruto: 'fibra', raw: 'FIBER', ref: 'CLOTH', cidade: 'Lymhurst',
    nomes: { 3: ['', 'Tecido Limpo'], 4: ['Cânhamo', 'Tecido Fino'], 5: ['Verbena', 'Tecido Ornado'], 6: ['Algodão-dourado', 'Tecido Rico'] },
    incomum: ['Incomum', 'Incomum'], encantado: true,
  },
  {
    recurso: 'hide', rotulo: 'couros', bruto: 'pele', raw: 'HIDE', ref: 'LEATHER', cidade: 'Martlock',
    nomes: { 3: ['', 'Couro Grosso'], 4: ['Pelego Médio', 'Couro Trabalhado'], 5: ['Pelego Pesado', 'Couro Curtido'], 6: ['Pelego Robusto', 'Couro Endurecido'] },
    incomum: ['Incomum', 'Incomum'], encantado: true,
  },
  {
    recurso: 'rock', rotulo: 'blocos de pedra', bruto: 'pedra', raw: 'ROCK', ref: 'STONEBLOCK', cidade: 'Bridgewatch',
    nomes: { 3: ['', 'Bloco de Arenito'], 4: ['Travertino', 'Bloco de Travertino'], 5: ['Granito', 'Bloco de Granito'], 6: ['Ardósia', 'Bloco de Ardósia'] },
    incomum: ['Incomum', 'Incomum'], encantado: false,
  },
];

/**
 * Tempo de refino por item, em minutos (items.xml craftingrequirements time="0.04167" no T4, 0.0625 no T5, 0.08333
 * no T6). Premissa da Guarita: a unidade é minuto (2,5 s, 3,75 s e 5 s por item), que é a ordem do que se vê no jogo;
 * o dump não diz a unidade.
 */
export const REFINE_TIME_MIN: Record<number, number> = { 4: 0.04167, 5: 0.0625, 6: 0.08333 };

/** Brutos por refinado (o refinado do tier abaixo é sempre 1). */
export const RAW_PER_CRAFT: Record<number, number> = { 4: 2, 5: 3, 6: 4 };

export interface Receita {
  recurso: Recurso;
  cidade: City;
  tier: number;
  ench: number;
  raw: CestaItem;
  lower: CestaItem;
  ref: CestaItem;
  rawPorCraft: number;
}

function resId(base: string, tier: number, ench: number): string {
  return ench ? `T${tier}_${base}_LEVEL${ench}@${ench}` : `T${tier}_${base}`;
}
function resNome(def: RecursoDef, tier: number, ench: number, which: 0 | 1): string {
  const base = def.nomes[tier][which];
  return label(ench ? `${base} ${def.incomum[which]}` : base, tier, ench);
}

/** Receitas T4–T6 (comum e .1) das cinco cidades com bônus de refino. */
export const RECEITAS: Receita[] = RECURSOS.flatMap((def) =>
  [4, 5, 6].flatMap((tier) =>
    (def.encantado ? [0, 1] : [0]).map((ench) => {
      const lowerEnch = tier > 4 ? ench : 0;
      return {
        recurso: def.recurso,
        cidade: def.cidade,
        tier,
        ench,
        raw: { id: resId(def.raw, tier, ench), nome: resNome(def, tier, ench, 0) },
        lower: { id: resId(def.ref, tier - 1, lowerEnch), nome: resNome(def, tier - 1, lowerEnch, 1) },
        ref: { id: resId(def.ref, tier, ench), nome: resNome(def, tier, ench, 1) },
        rawPorCraft: RAW_PER_CRAFT[tier],
      };
    }),
  ),
);

/** Bônus de produção de cidade real no refino (craftingmodifiers.xml). */
export const CITY_REFINING_BONUS = 0.18;
/** Bônus de recurso da cidade especializada (craftingmodifiers.xml). */
export const SPECIALTY_BONUS = 0.4;
/** Foco (gamedata.xml ActionFocus CraftingEfficiency). */
export const FOCUS_BONUS = 0.59;
/** Bônus do dia (festivities.xml dailyevents) por prefixo do UniqueName. */
export const DAILY_BONUS: Record<string, number> = { COMMON: 0.1, RARE: 0.2 };

/** Todos os ids da cesta (flip + refino), sem repetição. Vai num lote só de /prices. */
export function basketIds(): string[] {
  const ids = new Set<string>(FLIP_ITEMS.map((i) => i.id));
  for (const r of RECEITAS) {
    ids.add(r.raw.id);
    ids.add(r.lower.id);
    ids.add(r.ref.id);
  }
  return [...ids];
}

/** id → nome PT-BR com tier, para tudo da cesta. */
export const NOMES: Record<string, string> = Object.fromEntries([
  ...FLIP_ITEMS.map((i) => [i.id, i.nome] as const),
  ...RECEITAS.flatMap((r) => [[r.raw.id, r.raw.nome], [r.lower.id, r.lower.nome], [r.ref.id, r.ref.nome]] as const),
]);

// ---------- deslocamento ----------
// Estimativa da Guarita, NÃO medida: montaria comum, sem carga pesada, sem contratempo. A tela diz que é aproximada.
// Cidade real ↔ Caerleon: ~10 min cruzando zona vermelha. Cidade real ↔ cidade real: ~20 min por zonas azuis e
// amarelas (dá para encurtar pela vermelha, com risco). Brecilien só por portal das Brumas: tempo varia muito.

export type RotaRisco = 'segura' | 'vermelha' | 'brumas' | 'nenhuma';

export const ROYAL: City[] = ['Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford'];

export function travelMin(a: City, b: City): number {
  const A = a === 'Black Market' ? 'Caerleon' : a;
  const B = b === 'Black Market' ? 'Caerleon' : b;
  if (A === B) return 0;
  if (A === 'Brecilien' || B === 'Brecilien') return 30;
  if (A === 'Caerleon' || B === 'Caerleon') return 10;
  return 20;
}

export function routeRisk(a: City, b: City): RotaRisco {
  const A = a === 'Black Market' ? 'Caerleon' : a;
  const B = b === 'Black Market' ? 'Caerleon' : b;
  if (A === B) return 'nenhuma';
  if (A === 'Brecilien' || B === 'Brecilien') return 'brumas';
  if (A === 'Caerleon' || B === 'Caerleon') return 'vermelha';
  return 'segura';
}

/** Multiplicador da confiança pelo risco da rota (perder a carga no caminho derruba o lucro inteiro). */
export const ROUTE_FACTOR: Record<RotaRisco, number> = { nenhuma: 1, segura: 0.95, vermelha: 0.8, brumas: 0.65 };
