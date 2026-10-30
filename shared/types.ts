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
  /** Só com `?lang=es`: rótulo em espanhol (festivityLabelEs). */
  label?: string;
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
  /** Tamanho do grupo: max(numberOfParticipants, groupMemberCount); a gameinfo corta numberOfParticipants em 4. */
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
  /** Fração das kills recentes feitas sozinho (um só causou dano e grupo de no máximo 1). */
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
  /** Custo de repor o espaço inteiro (preço unitário × count). */
  price: number | null;
  ageMin: number | null;
  /** Quantidade da peça (comida e poção vêm com mais de 1). Ausente = 1. */
  count?: number;
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
  /** Nome legível do item (PT-BR) enviado por quem criou a regra; o core usa na mensagem do alerta. */
  itemName?: string;
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

// ---------- Fase 2 (roadmap/2026-10-30-guarita-fase2.md) ----------

/** Itens mais perdidos no PvP do Americas (KillLog próprio, coletado desde 30/10/2026). */
export interface LossItem {
  id: string;
  name: string;
  count: number;
  /** Preço unitário atual (menor venda entre Royal + Caerleon), null sem dado. */
  price: number | null;
  /** count × price: valor perdido nas mortes, em prata (parte é saqueada e volta ao mercado). */
  value: number | null;
  ageMin: number | null;
}

export interface LossesResponse {
  /** Janela em dias (1 = hoje UTC). */
  days: number;
  /** Primeiro dia com coleta (AAAA-MM-DD). */
  since: string | null;
  /** Kills que entraram na conta da janela. */
  sampleKills: number;
  items: LossItem[];
  fetchedAt: string;
}

export interface GuildSummary {
  name: string;
  id: string | null;
  alliance: string | null;
  members: number | null;
  killFame: number | null;
  deathFame: number | null;
  /** Por dia (AAAA-MM-DD), do KillLog. */
  days: { date: string; kills: number; deaths: number }[];
  topKillers: { name: string; id: string; kills: number }[];
  weapons: { type: string; labelPt: string; count: number }[];
  /** 24 posições: kills por hora do dia em horário de Brasília. */
  hoursBrt: number[];
  coverageSince: string | null;
  fetchedAt: string;
}

/** Um resultado da busca de guilda (/api/guilds?q=). A busca da gameinfo é aproximada: confira o nome. */
export interface GuildHit {
  id: string;
  name: string;
  alliance: string | null;
  deathFame: number | null;
}

export interface GuildSearchResponse {
  guilds: GuildHit[];
  fetchedAt: string;
}

export type ZoneKind = 'azul' | 'amarela' | 'vermelha' | 'preta' | 'avalon' | 'brumas';

export interface RiskZone {
  zone: ZoneKind;
  labelPt: string;
  /** O que acontece com o equipamento ao morrer nessa zona. */
  lose: 'nada' | 'durabilidade' | 'tudo';
  /** Prata em risco (estimada) nessa zona. */
  amount: number;
  /** Observação na língua pedida (pt padrão; `?lang=es` em espanhol). */
  note: string;
  /** Só com `?lang=es`: rótulo da zona em espanhol (labelPt continua o português). */
  label?: string;
}

export interface RiskQuote {
  items: { id: string; quality: Quality; price: number | null; city: City | null; ageMin: number | null }[];
  total: number;
  missing: number;
  zones: RiskZone[];
  fetchedAt: string;
}

export interface GoldResponse {
  /** Do mais antigo para o mais recente. */
  points: { at: string; price: number }[];
  current: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  verdict: 'barato' | 'normal' | 'caro' | 'sem dado';
  fetchedAt: string;
}

export interface DataHealthCity {
  city: City;
  /** Idade mediana do menor preço de venda na cesta, em minutos. */
  medianAgeMin: number | null;
  fresh1h: number;
  stale24h: number;
  missing: number;
}

export interface DataHealthResponse {
  basket: number;
  cities: DataHealthCity[];
  fetchedAt: string;
}

export type TimerKind = 'plantacao' | 'animal' | 'foco' | 'outro';

export interface Timer {
  id: string;
  /** Dono: id da inscrição push deste aparelho. */
  owner: string;
  kind: TimerKind;
  label: string;
  endsAt: string;
  createdAt: string;
  /** Quando o aviso saiu, ou quando o serviço desistiu de avisar (ver `delivery`). */
  firedAt?: string;
  /** Só nos já avisados: 'ok' = o serviço de push aceitou o aviso; 'falhou' = não deu para avisar. */
  delivery?: 'ok' | 'falhou';
}

// ---------- Fase 3 (roadmap/2026-10-30-guarita-fase3.md) ----------

export type HojeTrilha = 'flip' | 'refino' | 'transporte';

export interface HojeOpcao {
  trilha: HojeTrilha;
  titulo: string;
  /** Passo a passo curto em PT-BR (em espanhol com `lang=es`). */
  passos: string[];
  /** Lucro estimado em prata para o capital e o tempo informados (pode ser negativo: a tela mostra). */
  lucro: number;
  /** Prata investida no ciclo. */
  capital: number;
  minutos: number;
  /** 0 a 100: quão confiável é a estimativa (idade do preço, volume, risco). */
  confianca: number;
  riscos: string[];
  itens: HojeItem[];
  /** Conta aberta do ciclo (compra, venda, taxas, lucro). */
  conta?: HojeConta;
  /** Motivos do selo de confiança ("visto há 2 h", "pouco volume", "zona vermelha"). */
  motivos?: string[];
  /** Minutos de deslocamento estimados (ida) no ciclo; estimativa, não medida. */
  deslocamentoMin?: number;
}

export interface HojeItem {
  id: string;
  nome: string;
  qtd: number;
  compra: number | null;
  venda: number | null;
  cidadeCompra: City | null;
  cidadeVenda: City | null;
  /** Idade em minutos do preço de compra usado na conta (null = sem data). */
  idadeCompraMin?: number | null;
  /** Idade em minutos do preço de venda usado na conta. */
  idadeVendaMin?: number | null;
}

export interface HojeConta {
  /** Prata gasta comprando (no refino, já descontado o retorno médio de material). */
  compra: number;
  /** Prata bruta das vendas. */
  venda: number;
  /** Taxa de anúncio (2,5% na ordem de venda) + imposto sobre a venda (4% com Premium, 8% sem). */
  taxas: number;
  lucro: number;
}

export interface HojeResponse {
  prata: number;
  minutos: number;
  premium: boolean;
  opcoes: HojeOpcao[];
  /** Avisos gerais: trilha sem opção, bônus do dia, fonte que falhou. */
  notas?: string[];
  /** true se algum dado veio da reserva porque o AODP falhou. */
  stale?: boolean;
  fetchedAt: string;
}

export interface ForecastResponse {
  id: string;
  quality: Quality;
  /** Cidade usada. Sem `city` no pedido, a API escolhe a de mais unidades vendidas em 14 dias (sem Black Market). */
  city: City;
  /** Histórico diário usado (média de venda e volume). */
  history: { date: string; avg: number; count: number }[];
  /** Previsão para os próximos 1 a 3 dias com faixa P10–P90. Se `beatsNaive` não for true, é a previsão ingênua. */
  forecast: { date: string; p10: number; p50: number; p90: number }[];
  /** Erro médio absoluto em backtest: modelo vs ingênuo (repetir o último valor). `days` = rodadas do teste, não dias corridos. */
  backtest: { days: number; maeModel: number | null; maeNaive: number | null; beatsNaive: boolean | null };
  /** Em texto: qual previsão foi publicada e por quê. */
  method: string;
  fetchedAt: string;
}
