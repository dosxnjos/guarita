// Contrato da API da Guarita: o front (src/), o bot (worker/discord/) e a API (worker/api/) importam daqui.
// Mudar um tipo aqui é mudar o contrato: os três lados precisam acompanhar.

export type City =
  | 'Bridgewatch'
  | 'Caerleon'
  | 'Fort Sterling'
  | 'Lymhurst'
  | 'Martlock'
  | 'Thetford'
  | 'Brecilien'
  | 'Black Market';

export type Quality = 1 | 2 | 3 | 4 | 5;

export type Verdict = 'barato' | 'normal' | 'caro' | 'sem dado';

/** Uma linha de preço como o AODP devolve, já normalizada (datas em ISO UTC, 0 vira null). */
export interface PriceRow {
  id: string;
  city: City;
  quality: Quality;
  sellMin: number | null;
  sellMinAt: string | null;
  buyMax: number | null;
  buyMaxAt: string | null;
}

export interface PricesResponse {
  fetchedAt: string;
  rows: PriceRow[];
}

export interface Confidence {
  /** 0 a 100: quanto dá para confiar no preço mostrado. */
  score: number;
  label: 'alta' | 'média' | 'baixa' | 'sem dado';
  /** Motivos curtos em PT-BR, ex.: "visto há 3 h", "livro raso". */
  reasons: string[];
}

export interface CityQuote {
  city: City;
  sellMin: number | null;
  sellMinAt: string | null;
  buyMax: number | null;
  buyMaxAt: string | null;
  /** Idade em minutos do sellMin (ou do buyMax se não houver venda). */
  ageMin: number | null;
  confidence: Confidence;
  verdict: Verdict;
}

export interface HistoryDay {
  date: string; // AAAA-MM-DD
  avg: number;
  count: number;
}

export interface CityHistory {
  city: City;
  days: HistoryDay[];
}

export interface BookLevel {
  price: number;
  amount: number;
  updatedAt?: string;
}

export interface CityBook {
  city: City;
  sell: BookLevel[];
  buy: BookLevel[];
}

export interface Flip {
  from: City;
  /** Preço para comprar na cidade de origem (sell order mais barata). */
  buyAt: number;
  /** Buy order do Black Market (venda instantânea). */
  sellAt: number;
  profitPremium: number;
  profitNoPremium: number;
  /** Retorno sobre o custo, em fração (0.12 = 12%), com Premium. */
  roi: number;
  ageMin: number | null;
}

export interface ItemResponse {
  id: string;
  quality: Quality;
  fetchedAt: string;
  cities: CityQuote[];
  history: CityHistory[];
  median7d: number | null;
  p25: number | null;
  p75: number | null;
  book: CityBook[];
  flips: Flip[];
}

export interface BookFillResponse {
  city: City;
  side: 'buy' | 'sell';
  n: number;
  avgPrice: number | null;
  filled: number;
  levels: BookLevel[];
}

export interface Festivity {
  kind: number;
  category: string;
  name: string;
  /** Rótulo em PT-BR (ex.: "Bônus de produção: bestas"). */
  labelPt: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
}

export interface ClockResponse {
  now: string;
  server: { status: 'online' | 'offline' | 'manutenção' | 'desconhecido'; message: string; checkedAt: string };
  festivities: Festivity[];
  gold: { price: number | null; at: string | null; p30: number | null; trend: 'subindo' | 'caindo' | 'estável' | 'sem dado' };
  /** Preço do Premium de 30 dias convertido em prata pelo ouro atual. */
  premiumSilver: number | null;
  season: { name: string; end: string; approx: true };
}

export interface PlayerHit {
  id: string;
  name: string;
  guild: string;
  alliance: string;
  killFame: number;
  deathFame: number;
}

export interface PlayerSearchResponse {
  players: PlayerHit[];
}

export interface GearPiece {
  slot: string;
  id: string;
  quality: number;
}

export interface EventSide {
  id: string;
  name: string;
  guild: string;
  alliance: string;
  ip: number;
  gear: GearPiece[];
}

export interface KillEvent {
  id: number;
  time: string;
  killer: EventSide;
  victim: EventSide;
  participants: number;
  totalFame: number;
  /** Valor estimado do equipamento da vítima em prata (AODP), null se sem dado. */
  estValue: number | null;
}

export interface Danger {
  score: number; // 0 a 100
  label: 'tranquilo' | 'atenção' | 'perigoso' | 'sem dado';
  reasons: string[];
}

export interface PlayerDossier {
  id: string;
  name: string;
  guild: string;
  alliance: string;
  killFame: number;
  deathFame: number;
  ratio: number;
  pve: Record<string, number>;
  gathering: Record<string, number>;
  recentKills: KillEvent[];
  recentDeaths: KillEvent[];
  weapons: { type: string; labelPt: string; count: number }[];
  /** Fração das kills recentes feitas sozinho (participants === 1). */
  soloRate: number | null;
  avgGroup: number | null;
  avgIp: number | null;
  danger: Danger;
  fetchedAt: string;
}

export interface RebuyLine {
  id: string;
  slot: string;
  quality: number;
  cheapestCity: City | null;
  price: number | null;
  ageMin: number | null;
}

export interface AutopsyResponse {
  death: KillEvent | null;
  killerDossier: PlayerDossier | null;
  lessons: string[];
  rebuy: RebuyLine[];
  rebuyTotal: number | null;
}

// ---------- alertas ----------

export type AlertCondition =
  | { kind: 'below'; price: number } // dispara se o preço ficar abaixo de X
  | { kind: 'above'; price: number }
  | { kind: 'belowMedianPct'; pct: number }; // X% abaixo da mediana de 7 dias

export interface AlertRule {
  id: string;
  itemId: string;
  quality: Quality;
  cities: City[];
  side: 'sell' | 'buy';
  condition: AlertCondition;
  /** Minutos entre dois disparos da mesma regra. */
  cooldownMin: number;
  channel: 'push' | 'discord';
  /** Dono: id da inscrição push ou id do usuário no Discord. */
  owner: string;
  createdAt: string;
  lastFiredAt?: string;
}

export interface AlertFire {
  ruleId: string;
  itemId: string;
  city: City;
  price: number;
  seenAt: string | null;
  message: string;
}
