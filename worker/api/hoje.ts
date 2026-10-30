// Módulo (c) da Fase 3: "O que fazer hoje" (GET /api/hoje?prata=&minutos=&premium=0|1). Também exporta getHoje para o
// bot (/hoje) e o MCP (o_que_fazer).
//
// Três trilhas com dado ao vivo do AODP: flip para o Black Market, refino na cidade com bônus (mais o bônus do dia) e
// transporte entre cidades. Nunca promete lucro: cada opção traz a conta aberta, a idade dos preços, o selo de
// confiança e os riscos. Cesta, receitas, bônus e fontes: shared/hoje.ts.
//
// Orçamento do plano grátis (50 subrequests, e cada match/put da Cache API conta): um lote de /prices com a cesta
// inteira (1–2 URLs), as festividades (mesma chave do /api/clock) e o histórico de no máximo 9 itens (os 3 melhores
// de cada trilha pela margem bruta), tudo guardado num "retrato" único por 5 min. A conta por prata/minutos/Premium
// roda na CPU sobre o retrato, sem rede. Pior caso frio: ~6 + 3 + 27 + 2 = 38.
import type { Env } from '../env';
import type { City, HojeTrilha, PriceRow, Quality } from '../../shared/types';
import { ALL_CITIES, SALES_TAX, SALES_TAX_PREMIUM, SETUP_FEE, minutesSince } from '../../shared/market';
import { ageLabel, confidence } from '../../shared/confidence';
import { aodpFestivities, aodpHistoryMeta, aodpPricesMeta, type FestivityRaw, type HistoryPoint } from '../lib/aodp';
import { cachedJsonMeta } from '../lib/cache';
import { badRequest, json, upstreamError } from '../lib/respond';
import {
  CITY_REFINING_BONUS, DAILY_BONUS, FLIP_ITEMS, FOCUS_BONUS, NOMES, RECEITAS, RECURSOS, REFINE_TIME_MIN, ROUTE_FACTOR, ROYAL, SPECIALTY_BONUS,
  basketIds, routeRisk, travelMin, type Recurso, type RotaRisco,
} from '../../shared/hoje';
import type { HojeItem, HojeOpcao as HojeOpcaoX, HojeResponse as HojeResponseX } from '../../shared/types';

// ---------- constantes ----------

export const SNAPSHOT_KEY = 'hoje/snapshot/v1';
export const SNAPSHOT_TTL = 300;
const BM: City = 'Black Market';
/** Minutos de compra e venda no mercado em cada ciclo (além do deslocamento). */
export const TRADE_MIN = 10;
/** Minutos fixos de um ciclo de refino (comprar e anunciar); o refino em si soma REFINE_TIME_MIN por item. */
export const REFINO_MIN = 20;
/** Teto de unidades quando não há histórico de vendas para medir o volume. */
export const CAP_SEM_VOLUME = { flip: 5, refino: 200, transporte: 10 } as const;
export const MAX_POR_TRILHA = 3;
/** Itens com histórico buscado por trilha (cada um custa até 3 subrequests). */
export const HIST_POR_TRILHA = 3;
const HIST_DAYS = 7;
/** Cidades de origem do flip (Brecilien fica de fora: até Caerleon só pelas Brumas). */
const FLIP_FROM: City[] = [...ROYAL, 'Caerleon'];
const TRANSPORT_CITIES: City[] = [...ROYAL, 'Caerleon', 'Brecilien'];

export const LIMITS = { prataMin: 1_000, prataMax: 100_000_000_000, minutosMin: 15, minutosMax: 480, minutosPadrao: 60 } as const;

// ---------- retrato do mercado (o que vai para o cache) ----------

export interface DailyFest {
  name: string;
  start: string;
  end: string;
}

export interface HojeSnapshot {
  /** Carimbo do lote de preços mais antigo (ISO UTC). */
  at: string;
  stale: boolean;
  rows: PriceRow[];
  /** id → cidade → média de unidades vendidas por dia (7 dias). Só os itens que tiveram histórico buscado. */
  volume: Record<string, Partial<Record<City, number>>>;
  /** Festividades de produção (Kind 2), para achar o bônus de refino do dia. */
  daily: DailyFest[];
  festOk: boolean;
}

export interface HojeParams {
  prata: number;
  minutos: number;
  premium: boolean;
}

// ---------- utilidades puras ----------

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmt = (n: number) => intFmt.format(Math.round(n));
const decFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const fmtDec = (n: number) => decFmt.format(n);
const pct = (f: number) => pctFmt.format(f);
function fmtBr(iso: string): string {
  return timeFmt.format(new Date(iso)).replace(',', '');
}

/** Taxa de retorno de material: 1 − 1/(1 + soma dos bônus de produção). */
export function rrr(bonus: number): number {
  return 1 - 1 / (1 + Math.max(0, bonus));
}

export function salesTax(premium: boolean): number {
  return premium ? SALES_TAX_PREMIUM : SALES_TAX;
}

type PriceIndex = (id: string, city: City) => PriceRow | undefined;
function indexRows(rows: PriceRow[]): PriceIndex {
  const m = new Map<string, PriceRow>();
  for (const r of rows) if (r.quality === 1) m.set(`${r.id.toUpperCase()}|${r.city}`, r);
  return (id, city) => m.get(`${id.toUpperCase()}|${city}`);
}

/**
 * Média diária de unidades vendidas nos `days` dias completos antes de hoje (UTC), por cidade. O dia em andamento
 * fica fora: com ele, a soma cobriria até 8 datas divididas por 7 e o volume sairia inflado.
 */
export function avgDaily(history: { city: City; points: HistoryPoint[] }[], now: number, days = HIST_DAYS): Partial<Record<City, number>> {
  const today = new Date(now).toISOString().slice(0, 10);
  const since = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const out: Partial<Record<City, number>> = {};
  for (const h of history) {
    const sold = h.points.reduce((s, p) => {
      const d = p.date.slice(0, 10);
      return d >= since && d < today ? s + p.count : s;
    }, 0);
    out[h.city] = Math.round((sold / days) * 10) / 10;
  }
  return out;
}

/** Bônus de refino do dia (soma ao bônus de produção) por recurso, só o que está ativo agora. */
export function dailyRefining(daily: DailyFest[], now: number): Partial<Record<Recurso, { valor: number; fim: string }>> {
  const out: Partial<Record<Recurso, { valor: number; fim: string }>> = {};
  const byRaw = new Map(RECURSOS.map((r) => [r.raw, r.recurso]));
  for (const f of daily) {
    const start = Date.parse(f.start);
    const end = Date.parse(f.end);
    if (!(start <= now && now < end)) continue;
    const [prefix, ...rest] = f.name.toUpperCase().split('_');
    const valor = DAILY_BONUS[prefix];
    const recurso = byRaw.get(rest.join('_'));
    if (!valor || !recurso) continue;
    const cur = out[recurso];
    if (!cur || valor > cur.valor) out[recurso] = { valor, fim: f.end };
  }
  return out;
}

interface Side {
  price: number;
  ageMin: number | null;
  vol?: number | null;
}

/** Selo da opção: o lado mais fraco manda, vezes o risco da rota (e um desconto se o dado veio da reserva). */
export function combinedConfidence(sides: Side[], risco: RotaRisco, stale: boolean): { score: number; motivos: string[] } {
  let min = 100;
  const motivos: string[] = [];
  for (const s of sides) {
    const c = confidence({ price: s.price, ageMin: s.ageMin, avgDailyVolume: s.vol ?? null });
    min = Math.min(min, c.score);
    for (const r of c.reasons) if (!motivos.includes(r)) motivos.push(r);
  }
  const ages = sides.map((s) => s.ageMin).filter((a): a is number => a != null);
  // o pior motivo de idade primeiro; os outros "visto há" saem para não poluir
  const keep = motivos.filter((m) => !m.startsWith('visto ') && m !== 'sem data');
  const oldest = ages.length === sides.length ? ageLabel(Math.max(...ages)) : 'sem data';
  if (risco === 'vermelha') keep.push('rota por zona vermelha');
  if (risco === 'brumas') keep.push('rota pelas Brumas');
  if (stale) keep.push('parte do dado é cópia guardada');
  const score = Math.max(1, Math.min(100, Math.round(min * ROUTE_FACTOR[risco] * (stale ? 0.85 : 1))));
  return { score, motivos: [ages.length === sides.length ? `preço mais antigo ${oldest}` : 'um dos preços sem data', ...keep] };
}

function ageText(ageMin: number | null): string {
  return ageLabel(ageMin);
}

function staleRisk(ages: (number | null)[]): string | null {
  const known = ages.filter((a): a is number => a != null);
  if (known.length < ages.length) return 'Um dos preços não tem data: confirme no jogo antes de comprar.';
  const max = Math.max(...known);
  return max > 30 ? `O preço mais antigo da conta foi ${ageLabel(max)}: confirme no jogo antes de comprar.` : null;
}

function score(o: HojeOpcaoX): number {
  return o.lucro * (o.confianca / 100);
}

/** Melhor opção de cada item (chave), depois as `n` melhores por lucro × confiança. */
function topDistinct(cands: { key: string; op: HojeOpcaoX }[], n = MAX_POR_TRILHA): HojeOpcaoX[] {
  const best = new Map<string, HojeOpcaoX>();
  for (const c of cands) {
    const cur = best.get(c.key);
    if (!cur || score(c.op) > score(cur)) best.set(c.key, c.op);
  }
  return [...best.values()].sort((a, b) => score(b) - score(a)).slice(0, n);
}

function item(
  id: string, qtd: number, compra: number | null, venda: number | null, cidadeCompra: City | null, cidadeVenda: City | null,
  idadeCompraMin: number | null, idadeVendaMin: number | null,
): HojeItem {
  return { id, nome: NOMES[id] ?? id, qtd, compra, venda, cidadeCompra, cidadeVenda, idadeCompraMin, idadeVendaMin };
}

function capByVolume(vol: number | null | undefined, semVolume: number): { cap: number; known: boolean } {
  if (vol == null) return { cap: semVolume, known: false };
  return { cap: Math.max(1, Math.floor(vol)), known: true };
}

/** Mínimo que se supõe comprável na origem mesmo com volume baixo (há ordem de venda listada). */
export const MIN_ORIGEM = 5;

/**
 * Volume na cidade de origem. Com o histórico do item buscado, cidade ausente = nada vendido lá em 7 dias (0), e a
 * compra fica limitada: comprar mil unidades onde quase nada gira esvazia o livro e sobe o preço. Sem histórico do
 * item: sem teto extra (null).
 */
function originVol(volume: HojeSnapshot['volume'], id: string, city: City): { vol: number | null; cap: number } {
  const m = volume[id];
  if (!m) return { vol: null, cap: Infinity };
  const vol = m[city] ?? 0;
  return { vol, cap: Math.max(MIN_ORIGEM, Math.floor(vol)) };
}

// ---------- trilha 1: flip para o Black Market ----------

export function planFlip(s: HojeSnapshot, p: HojeParams, now: number): HojeOpcaoX[] {
  const get = indexRows(s.rows);
  const tax = salesTax(p.premium);
  const cands: { key: string; op: HojeOpcaoX }[] = [];
  for (const it of FLIP_ITEMS) {
    const bm = get(it.id, BM);
    if (!bm?.buyMax) continue;
    const sell = bm.buyMax;
    const ageSell = minutesSince(bm.buyMaxAt, now);
    for (const from of FLIP_FROM) {
      const r = get(it.id, from);
      if (!r?.sellMin) continue;
      const buy = r.sellMin;
      const unit = sell * (1 - tax) - buy;
      if (unit <= 0) continue;
      const travel = travelMin(from, BM);
      const cycle = 2 * travel + TRADE_MIN;
      if (cycle > p.minutos) continue;
      const perTrip = Math.floor(p.prata / buy);
      if (perTrip < 1) continue;
      const trips = Math.floor(p.minutos / cycle);
      // histórico do item buscado e BM ausente = nada vendido lá em 7 dias (0, não "desconhecido"), como no transporte
      const bmVol = s.volume[it.id] ? (s.volume[it.id][BM] ?? 0) : undefined;
      const { cap, known } = capByVolume(bmVol, CAP_SEM_VOLUME.flip);
      const orig = originVol(s.volume, it.id, from);
      const qty = Math.min(perTrip * trips, cap, orig.cap);
      const tripsUsed = Math.ceil(qty / perTrip);
      const capital = Math.min(qty, perTrip) * buy;
      const compra = qty * buy;
      const venda = qty * sell;
      const taxas = Math.round(venda * tax);
      const lucro = venda - taxas - compra;
      const ageBuy = minutesSince(r.sellMinAt, now);
      const risco = routeRisk(from, BM);
      const conf = combinedConfidence(
        [{ price: buy, ageMin: ageBuy, vol: orig.vol }, { price: sell, ageMin: ageSell, vol: bmVol }],
        risco,
        s.stale,
      );
      if (!known) conf.score = Math.max(1, Math.round(conf.score * 0.85));
      if (!known) conf.motivos.push('volume do Black Market desconhecido');

      const passos = [
        `Em ${from}, compre ${fmt(qty)} × ${it.nome} na ordem de venda mais barata (${fmt(buy)} cada, ${ageText(ageBuy)}).`,
        from === 'Caerleon'
          ? 'Leve até o Black Market, que fica dentro de Caerleon.'
          : `Leve até o Black Market, em Caerleon (cerca de ${travel} min, cruzando zona vermelha).`,
        `Venda na hora para a ordem de compra do Black Market (${fmt(sell)} cada, ${ageText(ageSell)}). Imposto de ${pct(tax)} ${p.premium ? 'com' : 'sem'} Premium; venda direta não paga taxa de anúncio.`,
      ];
      if (tripsUsed > 1) passos.push(`O capital cobre ${perTrip} por viagem: são ${tripsUsed} viagens de cerca de ${cycle} min cada.`);

      const riscos: string[] = [];
      if (risco === 'vermelha') {
        riscos.push(`A rota de ${from} até Caerleon cruza zona vermelha: se morrer, perde a carga (${fmt(capital)} de prata) e o que estiver vestindo.`);
      }
      riscos.push('O Black Market compra conforme a demanda: a ordem pode baixar ou sumir antes de você chegar.');
      const st = staleRisk([ageBuy, ageSell]);
      if (st) riscos.push(st);
      if (!known) riscos.push(`Sem histórico de vendas no Black Market para medir quanto ele absorve: a quantidade foi limitada a ${CAP_SEM_VOLUME.flip}.`);
      if (qty === orig.cap && orig.cap < Math.min(perTrip * trips, cap)) {
        riscos.push(`Limitado a ${fmt(qty)} unidades: ${from} vendeu ${orig.vol ? `cerca de ${fmt(orig.vol)}` : 'quase nada'} por dia nos últimos 7 dias, e comprar mais esvazia as ofertas baratas.`);
      } else if (known && qty === cap && cap < perTrip * trips) {
        riscos.push(`Limitado a ${fmt(qty)} unidades: é o que o Black Market comprou por dia, em média, nos últimos 7 dias.`);
      }

      cands.push({
        key: it.id,
        op: {
          trilha: 'flip',
          titulo: `Flip: ${it.nome}, de ${from} para o Black Market`,
          passos,
          lucro,
          capital,
          minutos: Math.min(p.minutos, tripsUsed * cycle),
          confianca: conf.score,
          riscos,
          itens: [item(it.id, qty, buy, sell, from, BM, ageBuy, ageSell)],
          conta: { compra, venda, taxas, lucro },
          motivos: conf.motivos,
          deslocamentoMin: travel,
        },
      });
    }
  }
  return topDistinct(cands);
}

// ---------- trilha 2: refino com o bônus da cidade e o do dia ----------

interface RefinoCalc {
  crafts: number; // compras iniciais (Q0)
  produz: number; // refinados no fim (N)
  compra: number;
  venda: number;
  taxas: number;
  lucro: number;
}

/** Conta de um ciclo de refino com reinvestimento do material devolvido (média). */
export function refinoCalc(
  inputCost: number, refPrice: number, retorno: number, prata: number, cap: number, feeRate: number,
): RefinoCalc | null {
  if (!(inputCost > 0) || !(refPrice > 0)) return null;
  let crafts = Math.floor(prata / inputCost);
  if (crafts < 1) return null;
  let produz = Math.floor(crafts / (1 - retorno) + 1e-9);
  if (produz > cap) {
    produz = cap;
    crafts = Math.max(1, Math.ceil(produz * (1 - retorno)));
  }
  const compra = crafts * inputCost;
  const venda = produz * refPrice;
  const taxas = Math.round(venda * feeRate);
  return { crafts, produz, compra, venda, taxas, lucro: venda - taxas - compra };
}

export function planRefino(s: HojeSnapshot, p: HojeParams, now: number): HojeOpcaoX[] {
  if (p.minutos < REFINO_MIN) return [];
  const get = indexRows(s.rows);
  const feeRate = SETUP_FEE + salesTax(p.premium);
  const daily = dailyRefining(s.daily, now);
  const cands: { key: string; op: HojeOpcaoX }[] = [];
  for (const r of RECEITAS) {
    const city = r.cidade;
    const raw = get(r.raw.id, city);
    const lower = get(r.lower.id, city);
    const ref = get(r.ref.id, city);
    if (!raw?.sellMin || !lower?.sellMin || !ref?.sellMin) continue;
    const def = RECURSOS.find((d) => d.recurso === r.recurso)!;
    const dia = daily[r.recurso];
    const bonus = CITY_REFINING_BONUS + SPECIALTY_BONUS + (dia?.valor ?? 0);
    const r0 = rrr(bonus);
    const rF = rrr(bonus + FOCUS_BONUS);
    const inputCost = r.rawPorCraft * raw.sellMin + lower.sellMin;
    const vol = s.volume[r.ref.id]?.[city];
    const { cap: volCap, known } = capByVolume(vol, CAP_SEM_VOLUME.refino);
    // tempo: cada refinado (inclusive os feitos com o material devolvido) leva REFINE_TIME_MIN do tier
    const tPorItem = REFINE_TIME_MIN[r.tier];
    const timeCap = Math.max(1, Math.floor((p.minutos - REFINO_MIN) / tPorItem));
    const cap = Math.min(volCap, timeCap);
    const c = refinoCalc(inputCost, ref.sellMin, r0, p.prata, cap, feeRate);
    if (!c || c.lucro <= 0) continue;
    const foco = refinoCalc(inputCost, ref.sellMin, rF, p.prata, cap, feeRate);
    const minutosCiclo = Math.min(p.minutos, REFINO_MIN + Math.ceil(c.produz * tPorItem));

    const ageRaw = minutesSince(raw.sellMinAt, now);
    const ageLower = minutesSince(lower.sellMinAt, now);
    const ageRef = minutesSince(ref.sellMinAt, now);
    const conf = combinedConfidence(
      [{ price: raw.sellMin, ageMin: ageRaw }, { price: lower.sellMin, ageMin: ageLower }, { price: ref.sellMin, ageMin: ageRef, vol }],
      'nenhuma',
      s.stale,
    );
    if (!known) conf.motivos.push('volume de venda desconhecido');

    const passos: string[] = [];
    if (dia) passos.push(`Hoje há bônus de refino de ${def.bruto} (+${pct(dia.valor)}) até ${fmtBr(dia.fim)} (horário de Brasília).`);
    passos.push(
      `Em ${city} (cidade com bônus de ${def.rotulo}), compre ${fmt(c.crafts * r.rawPorCraft)} × ${r.raw.nome} (${fmt(raw.sellMin)} cada, ${ageText(ageRaw)}) e ${fmt(c.crafts)} × ${r.lower.nome} (${fmt(lower.sellMin)} cada, ${ageText(ageLower)}).`,
      `Refine sem foco: com o bônus da cidade${dia ? ' e o do dia' : ''}, o retorno médio de material é de ${pct(r0)}; reinvestindo o que volta, sai cerca de ${fmt(c.produz)} × ${r.ref.nome}.`,
      `Anuncie em ordem de venda por ${fmt(ref.sellMin)} cada (${ageText(ageRef)}): taxa de anúncio de ${pct(SETUP_FEE)} e imposto de ${pct(salesTax(p.premium))} ${p.premium ? 'com' : 'sem'} Premium.`,
    );
    if (foco && foco.lucro > c.lucro) {
      passos.push(`Com foco, o retorno sobe para ${pct(rF)} e o lucro estimado para ${fmt(foco.lucro)} de prata. O foco gasto por item depende da sua especialização no refino.`);
    }

    const riscos = [
      'Venda por ordem de venda: pode levar horas para sair, e o preço pode cair até lá.',
      'O retorno de material é uma média: em poucos ciclos pode vir um pouco mais ou um pouco menos.',
      'A taxa de uso da estação de refino não entra na conta (cada estação cobra a sua).',
    ];
    const st = staleRisk([ageRaw, ageLower, ageRef]);
    if (st) riscos.push(st);
    if (c.produz === timeCap && timeCap < volCap) {
      riscos.push(`Limitado a ${fmt(timeCap)} unidades: é o que dá para refinar em ${p.minutos - REFINO_MIN} min (cerca de ${fmtDec(tPorItem * 60)} s por item, fora comprar e anunciar).`);
    } else if (!known) {
      riscos.push(`Sem histórico de vendas de ${r.ref.nome} em ${city}: a quantidade foi limitada a ${CAP_SEM_VOLUME.refino}.`);
    } else if (c.produz === volCap) {
      riscos.push(`Limitado a ${fmt(volCap)} unidades: é o que ${city} vendeu por dia, em média, nos últimos 7 dias.`);
    }
    riscos.push('Comprar muito de uma vez esgota as ofertas mais baratas e o preço médio de compra sobe.');

    cands.push({
      key: r.ref.id,
      op: {
        trilha: 'refino',
        titulo: `Refino: ${r.ref.nome} em ${city}${dia ? ' (bônus do dia)' : ''}`,
        passos,
        lucro: c.lucro,
        capital: c.compra,
        minutos: minutosCiclo,
        confianca: known ? conf.score : Math.max(1, Math.round(conf.score * 0.85)),
        riscos,
        itens: [
          item(r.raw.id, c.crafts * r.rawPorCraft, raw.sellMin, null, city, null, ageRaw, null),
          item(r.lower.id, c.crafts, lower.sellMin, null, city, null, ageLower, null),
          item(r.ref.id, c.produz, null, ref.sellMin, null, city, null, ageRef),
        ],
        conta: { compra: c.compra, venda: c.venda, taxas: c.taxas, lucro: c.lucro },
        motivos: conf.motivos,
        deslocamentoMin: 0,
      },
    });
  }
  return topDistinct(cands);
}

// ---------- trilha 3: transporte entre cidades ----------

const ROUTE_TEXT: Record<RotaRisco, string> = {
  nenhuma: '',
  segura: 'dá para ir só por zonas azuis e amarelas',
  vermelha: 'cruzando zona vermelha',
  brumas: 'pelo portal das Brumas, tempo variável',
};

export function planTransporte(s: HojeSnapshot, p: HojeParams, now: number): HojeOpcaoX[] {
  const get = indexRows(s.rows);
  const tax = salesTax(p.premium);
  const feeRate = SETUP_FEE + tax;
  const cands: { key: string; op: HojeOpcaoX }[] = [];
  for (const id of basketIds()) {
    for (const A of TRANSPORT_CITIES) {
      const a = get(id, A);
      if (!a?.sellMin) continue;
      const buy = a.sellMin;
      const perCapital = Math.floor(p.prata / buy);
      if (perCapital < 1) continue;
      for (const B of TRANSPORT_CITIES) {
        if (A === B) continue;
        const b = get(id, B);
        if (!b?.sellMin) continue;
        const sell = b.sellMin;
        if (sell * (1 - feeRate) - buy <= 0) continue;
        const travel = travelMin(A, B);
        if (travel + TRADE_MIN > p.minutos) continue;
        // histórico do item buscado e cidade ausente = nada vendido lá em 7 dias
        const vol = s.volume[id] ? (s.volume[id][B] ?? 0) : undefined;
        const { cap, known } = capByVolume(vol, CAP_SEM_VOLUME.transporte);
        const orig = originVol(s.volume, id, A);
        const qty = Math.min(perCapital, cap, orig.cap);
        const compra = qty * buy;
        const venda = qty * sell;
        const taxas = Math.round(venda * feeRate);
        const lucro = venda - taxas - compra;
        if (lucro <= 0) continue;
        const ageBuy = minutesSince(a.sellMinAt, now);
        const ageSell = minutesSince(b.sellMinAt, now);
        const risco = routeRisk(A, B);
        const conf = combinedConfidence(
          [{ price: buy, ageMin: ageBuy, vol: orig.vol }, { price: sell, ageMin: ageSell, vol }],
          risco,
          s.stale,
        );
        if (!known) conf.motivos.push('volume de venda desconhecido');
        const nome = NOMES[id] ?? id;

        const riscos: string[] = [];
        if (risco === 'vermelha') riscos.push(`A rota cruza zona vermelha: se morrer, perde a carga inteira (${fmt(compra)} de prata) e o que estiver vestindo.`);
        else if (risco === 'brumas') riscos.push('Brecilien só se alcança pelas Brumas: o caminho muda, pode passar por Brumas letais (perde tudo ao morrer) e o tempo é incerto.');
        else riscos.push('Indo só por zonas azuis e amarelas você não perde a carga; cortar caminho por zona vermelha arrisca tudo.');
        riscos.push('Venda por ordem de venda: pode levar horas para sair, e o preço pode cair até lá.');
        const st = staleRisk([ageBuy, ageSell]);
        if (st) riscos.push(st);
        if (!known) riscos.push(`Sem histórico de vendas em ${B}: a quantidade foi limitada a ${CAP_SEM_VOLUME.transporte}.`);
        else if (qty === cap && cap < Math.min(perCapital, orig.cap)) riscos.push(`Limitado a ${fmt(qty)} unidades: é o que ${B} vendeu por dia, em média, nos últimos 7 dias.`);
        if (qty === orig.cap && orig.cap < Math.min(perCapital, cap)) {
          riscos.push(`Limitado a ${fmt(qty)} unidades: ${A} vendeu ${orig.vol ? `cerca de ${fmt(orig.vol)}` : 'quase nada'} por dia nos últimos 7 dias, e comprar mais esvazia as ofertas baratas.`);
        }
        riscos.push('Confira o peso da carga: acima do limite a montaria fica lenta.');

        cands.push({
          key: id,
          op: {
            trilha: 'transporte',
            titulo: `Transporte: ${nome}, de ${A} para ${B}`,
            passos: [
              `Em ${A}, compre ${fmt(qty)} × ${nome} na ordem de venda mais barata (${fmt(buy)} cada, ${ageText(ageBuy)}).`,
              `Leve até ${B} (cerca de ${travel} min, ${ROUTE_TEXT[risco]}).`,
              `Anuncie em ordem de venda por ${fmt(sell)} cada (${ageText(ageSell)}): taxa de anúncio de ${pct(SETUP_FEE)} e imposto de ${pct(tax)} ${p.premium ? 'com' : 'sem'} Premium.`,
            ],
            lucro,
            capital: compra,
            minutos: travel + TRADE_MIN,
            confianca: known ? conf.score : Math.max(1, Math.round(conf.score * 0.85)),
            riscos,
            itens: [item(id, qty, buy, sell, A, B, ageBuy, ageSell)],
            conta: { compra, venda, taxas, lucro },
            motivos: conf.motivos,
            deslocamentoMin: travel,
          },
        });
      }
    }
  }
  return topDistinct(cands);
}

// ---------- seleção do histórico (no carregamento do retrato) ----------

/**
 * Até 3 itens por trilha pela margem bruta por unidade (com o imposto do Premium, só para ordenar), para buscar o
 * histórico (volume diário). Independe da prata e do tempo de quem pede: o retrato é um só para todos.
 */
export function selectHistoryIds(rows: PriceRow[], n = HIST_POR_TRILHA): string[] {
  const get = indexRows(rows);
  const tax = SALES_TAX_PREMIUM;
  const flip = new Map<string, number>();
  for (const it of FLIP_ITEMS) {
    const sell = get(it.id, BM)?.buyMax;
    if (!sell) continue;
    for (const from of FLIP_FROM) {
      const buy = get(it.id, from)?.sellMin;
      if (!buy) continue;
      const m = sell * (1 - tax) - buy;
      if (m > 0 && m > (flip.get(it.id) ?? 0)) flip.set(it.id, m);
    }
  }
  const refino = new Map<string, number>();
  for (const r of RECEITAS) {
    const raw = get(r.raw.id, r.cidade)?.sellMin;
    const lower = get(r.lower.id, r.cidade)?.sellMin;
    const ref = get(r.ref.id, r.cidade)?.sellMin;
    if (!raw || !lower || !ref) continue;
    const m = ref * (1 - SETUP_FEE - tax) - (1 - rrr(CITY_REFINING_BONUS + SPECIALTY_BONUS)) * (r.rawPorCraft * raw + lower);
    if (m > 0) refino.set(r.ref.id, m);
  }
  const transporte = new Map<string, number>();
  for (const id of basketIds()) {
    for (const A of TRANSPORT_CITIES) {
      const buy = get(id, A)?.sellMin;
      if (!buy) continue;
      for (const B of TRANSPORT_CITIES) {
        const sell = A === B ? null : get(id, B)?.sellMin;
        if (!sell) continue;
        const m = (sell * (1 - SETUP_FEE - tax) - buy) / buy; // retorno: não favorece só o item mais caro
        if (m > 0 && m > (transporte.get(id) ?? 0)) transporte.set(id, m);
      }
    }
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
  return [...new Set([...top(flip), ...top(refino), ...top(transporte)])];
}

// ---------- montagem ----------

export function buildHoje(s: HojeSnapshot, p: HojeParams, now: number): HojeResponseX {
  const flip = planFlip(s, p, now);
  const refino = planRefino(s, p, now);
  const transporte = planTransporte(s, p, now);
  const notas: string[] = [];
  if (s.stale) notas.push('O Albion Data Project não respondeu agora: parte dos preços veio da última cópia guardada.');
  const daily = dailyRefining(s.daily, now);
  const ativos = RECURSOS.filter((r) => daily[r.recurso]);
  if (!s.festOk) notas.push('Não deu para consultar o bônus do dia; o refino foi calculado só com o bônus da cidade.');
  else if (ativos.length) notas.push(`Bônus de refino hoje: ${ativos.map((r) => `${r.bruto} (+${pct(daily[r.recurso]!.valor)}, em ${r.cidade} vale mais)`).join('; ')}.`);
  else notas.push('Nenhum bônus de refino hoje; o refino usa só o bônus da cidade especializada.');
  const vazio: Record<HojeTrilha, string> = {
    flip: 'Nenhum flip para o Black Market dá lucro com a prata e o tempo informados agora.',
    refino:
      p.minutos < REFINO_MIN
        ? `Com menos de ${REFINO_MIN} minutos não dá para fechar um ciclo de refino (comprar, refinar e anunciar).`
        : 'Nenhum refino dá lucro agora com a prata informada (ou faltam preços nas cidades com bônus).',
    transporte: 'Nenhum transporte entre cidades dá lucro, depois das taxas, com a prata e o tempo informados agora.',
  };
  if (!flip.length) notas.push(vazio.flip);
  if (!refino.length) notas.push(vazio.refino);
  if (!transporte.length) notas.push(vazio.transporte);
  const opcoes = [...flip, ...refino, ...transporte].sort((a, b) => score(b) - score(a));
  return { prata: p.prata, minutos: p.minutos, premium: p.premium, opcoes, fetchedAt: s.at, notas, stale: s.stale };
}

/** Valida a consulta. Erro volta como texto pronto para o usuário. */
export function parseHojeParams(q: URLSearchParams): HojeParams | { error: string } {
  const rawPrata = (q.get('prata') ?? '').trim().replace(/[.\s_]/g, '').replace(',', '.');
  if (!rawPrata) return { error: 'Informe quanta prata você tem (parâmetro prata).' };
  const prata = Math.round(Number(rawPrata));
  if (!Number.isFinite(prata) || prata < LIMITS.prataMin || prata > LIMITS.prataMax) {
    return { error: `A prata precisa ser um número de ${fmt(LIMITS.prataMin)} a ${fmt(LIMITS.prataMax)}.` };
  }
  const rawMin = (q.get('minutos') ?? '').trim();
  const minutos = rawMin ? Number(rawMin) : LIMITS.minutosPadrao;
  if (!Number.isInteger(minutos) || minutos < LIMITS.minutosMin || minutos > LIMITS.minutosMax) {
    return { error: `Os minutos precisam ser um número inteiro de ${LIMITS.minutosMin} a ${LIMITS.minutosMax}.` };
  }
  const prem = (q.get('premium') ?? '').trim().toLowerCase();
  return { prata, minutos, premium: prem === '1' || prem === 'true' || prem === 'sim' };
}

// ---------- fontes ----------

export async function loadSnapshot(ctx: ExecutionContext | undefined): Promise<HojeSnapshot> {
  const r = await cachedJsonMeta<HojeSnapshot>(SNAPSHOT_KEY, SNAPSHOT_TTL, ctx, async () => {
    const [prices, fest] = await Promise.all([
      aodpPricesMeta(basketIds(), ALL_CITIES, [1 as Quality], ctx),
      aodpFestivities(ctx).then(
        (f) => ({ ok: true, f }),
        (e) => {
          console.warn('hoje: festividades indisponíveis', String(e));
          return { ok: false, f: [] as FestivityRaw[] };
        },
      ),
    ]);
    // só o que a conta usa (qualidade 1, com algum preço): retrato menor = JSON.parse mais barato no cache
    const rows = prices.data.filter((x) => x.quality === 1 && (x.sellMin != null || x.buyMax != null));
    const ids = selectHistoryIds(rows);
    const hist = await Promise.all(
      ids.map((id) =>
        aodpHistoryMeta(id, ALL_CITIES, 1, HIST_DAYS, ctx).then(
          (h) => [id, avgDaily(h.data, Date.now())] as const,
          (e) => {
            console.warn('hoje: histórico indisponível', id, String(e));
            return null;
          },
        ),
      ),
    );
    const volume: HojeSnapshot['volume'] = {};
    for (const h of hist) if (h) volume[h[0]] = h[1];
    return {
      at: prices.at,
      stale: prices.stale,
      rows,
      volume,
      daily: fest.f.filter((f) => f.kind === 2).map((f) => ({ name: f.name, start: f.start, end: f.end })),
      festOk: fest.ok,
    };
  });
  // retrato vindo da reserva (o carregamento falhou): marca como velho
  return r.stale ? { ...r.data, stale: true } : r.data;
}

export async function getHoje(_env: Env, ctx: ExecutionContext | undefined, p: HojeParams, now = Date.now()): Promise<HojeResponseX> {
  return buildHoje(await loadSnapshot(ctx), p, now);
}

export async function routeHojeImpl(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  if (url.pathname !== '/api/hoje' && url.pathname !== '/api/hoje/') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'método não permitido' }, 405, 0, { Allow: 'GET, HEAD' });
  }
  const p = parseHojeParams(url.searchParams);
  if ('error' in p) return badRequest(p.error);
  try {
    return json(await getHoje(env, ctx, p), 200, SNAPSHOT_TTL);
  } catch (err) {
    return upstreamError(err);
  }
}
