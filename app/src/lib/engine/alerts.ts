// Motor das regras de preço locais: com o app aberto, a cada `intervaloRegrasMin` (2 a 5 min, padrão 3) consulta
// /api/prices em lote e dispara aviso (notify.ts) quando a regra casa, respeitando o cooldown.
// Roda só na janela do painel (engine/motor.ts). Fechou o app, parou: nada fica agendado no Windows.
// Dono: módulo (b). Fronteira: avaliarRegra, cooldownOk, mensagemDisparo, vozDisparo, medianaCidade (puras)
// e criarMotorAlertas.
//
// Régua igual à do servidor (guarita-core/src/rules.ts → evaluateRule), para o aviso do app e o do site/bot
// concordarem: preço visto há mais de 6 h não dispara; a mesma observação não avisa duas vezes; entre cidades vale a
// melhor (mais barata para "abaixo", mais cara para "acima"); a mediana é a da própria cidade, com pelo menos 3 dias
// de venda nos últimos 7.
import type { City, CityHistory, PriceRow, Quality } from '../../../../shared/types';
import { weightedQuantile } from '../../../../shared/confidence';
import { QUALITY_LABEL } from '../../../../shared/quality';
import { MAX_PRICE_IDS, type GuaritaApi } from '../api';
import type { GuaritaConfig, RegraLocal } from '../config';
import { cityName, fmtAge, fmtSilver, qualityName } from '../format';
import { currentLocale, type Locale } from '../../../../src/lib/i18n/core';
import type { Aviso } from '../notify';
import { precoFalado } from '../fala';

/** Preço visto há mais que isso não dispara (a ordem provavelmente já saiu do livro). */
export const MAX_IDADE_PRECO_MIN = 6 * 60;
/** Dias com venda exigidos para a mediana de uma cidade valer. */
export const MEDIANA_MIN_DIAS = 3;
/** Quanto tempo o motor reaproveita a mediana de 7 dias de um item (muda devagar; poupa uma chamada por ciclo). */
export const MEDIANA_TTL_MS = 60 * 60_000;
/** Primeira checagem depois de abrir o app. */
export const PRIMEIRA_CHECAGEM_MS = 5_000;

export interface DisparoLocal {
  regraId: string;
  itemId: string;
  city: City;
  price: number;
  /** ISO UTC do preço visto (mesmo selo de idade do site). */
  seenAt: string | null;
  /** Idade do preço em minutos quando disparou. */
  ageMin: number | null;
  /** Mediana de 7 dias da cidade usada (só em belowMedianPct). */
  median?: number;
  /** Texto da notificação, com número exato. */
  mensagem: string;
  /** Frase curta para a voz, com número por extenso. */
  voz: string;
}

/** Mediana de 7 dias por cidade (ausente ou null = sem mediana confiável). */
export type MedianasPorCidade = Partial<Record<City, number | null>>;

const minutosDesde = (iso: string | null, now: number): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : null;
};

/** A regra pode disparar de novo? (cooldown cumprido desde o último disparo). Pura. */
export function cooldownOk(regra: Pick<RegraLocal, 'cooldownMin' | 'lastFiredAt'>, now: number): boolean {
  if (!regra.lastFiredAt) return true;
  const last = Date.parse(regra.lastFiredAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= regra.cooldownMin * 60000;
}

/** Nome do item para o aviso: o nome dado na regra, ou o id; qualidade acima de Normal entra junto. */
export function rotuloItem(
  regra: Pick<RegraLocal, 'itemId' | 'itemName' | 'quality'>,
  sep: 'parenteses' | 'virgula' = 'parenteses',
  loc: Locale = currentLocale(),
): string {
  const nome = regra.itemName || regra.itemId;
  if (regra.quality <= 1) return nome;
  const q = loc === 'es' ? qualityName(regra.quality as Quality, 'es') : QUALITY_LABEL[regra.quality as Quality];
  // Na voz, vírgulas dos dois lados viram pausa: "Bolsa do Adepto, excelente, a três mil...".
  return sep === 'parenteses' ? `${nome} (${q})` : `${nome}, ${q.toLowerCase()},`;
}

/**
 * "Bolsa do Adepto a 3.550 em Lymhurst (visto há 4 min). Abaixo do seu alvo de 3.600."
 * es: "Bolsa del iniciado a 3,550 en Lymhurst (visto hace 4 min). Por debajo de tu objetivo de 3,600."
 */
export function mensagemDisparo(
  regra: RegraLocal,
  d: Pick<DisparoLocal, 'city' | 'price' | 'ageMin' | 'median'>,
  loc: Locale = currentLocale(),
): string {
  if (loc === 'es') return mensagemDisparoEs(regra, d);
  const rotulo = rotuloItem(regra, 'parenteses', loc);
  const preco = fmtSilver(d.price, false, loc);
  const cabeca = regra.side === 'sell' ? `${rotulo} a ${preco} em ${d.city}` : `${rotulo}: pedido de compra a ${preco} em ${d.city}`;
  const idade = d.ageMin == null ? '' : d.ageMin < 1 ? ' (visto agora)' : ` (visto ${fmtAge(d.ageMin, loc)})`;
  const c = regra.condition;
  let cauda: string;
  if (c.kind === 'below') cauda = `Abaixo do seu alvo de ${fmtSilver(c.price, false, loc)}.`;
  else if (c.kind === 'above') cauda = `Acima do seu alvo de ${fmtSilver(c.price, false, loc)}.`;
  else {
    const m = d.median ?? 0;
    const pct = m > 0 ? Math.round((1 - d.price / m) * 100) : c.pct;
    cauda = `${pct}% abaixo da mediana de 7 dias da cidade (${fmtSilver(m, false, loc)}).`;
  }
  return `${cabeca}${idade}. ${cauda}`;
}

function mensagemDisparoEs(regra: RegraLocal, d: Pick<DisparoLocal, 'city' | 'price' | 'ageMin' | 'median'>): string {
  const rotulo = rotuloItem(regra, 'parenteses', 'es');
  const preco = fmtSilver(d.price, false, 'es');
  const ciudad = cityName(d.city, 'es');
  const cabeca = regra.side === 'sell' ? `${rotulo} a ${preco} en ${ciudad}` : `${rotulo}: orden de compra a ${preco} en ${ciudad}`;
  const idade = d.ageMin == null ? '' : d.ageMin < 1 ? ' (visto ahora)' : ` (visto ${fmtAge(d.ageMin, 'es')})`;
  const c = regra.condition;
  let cauda: string;
  if (c.kind === 'below') cauda = `Por debajo de tu objetivo de ${fmtSilver(c.price, false, 'es')}.`;
  else if (c.kind === 'above') cauda = `Por encima de tu objetivo de ${fmtSilver(c.price, false, 'es')}.`;
  else {
    const m = d.median ?? 0;
    const pct = m > 0 ? Math.round((1 - d.price / m) * 100) : c.pct;
    cauda = `${pct}% por debajo de la mediana de 7 días de la ciudad (${fmtSilver(m, false, 'es')}).`;
  }
  return `${cabeca}${idade}. ${cauda}`;
}

/** Frase curta para a voz: "Bolsa do Adepto a três mil e quinhentos em Lymhurst" (es: "... a tres mil quinientos en ..."). */
export function vozDisparo(regra: RegraLocal, d: Pick<DisparoLocal, 'city' | 'price'>, loc: Locale = currentLocale()): string {
  const rotulo = rotuloItem(regra, 'virgula', loc);
  const preco = precoFalado(d.price, loc);
  if (loc === 'es') {
    const ciudad = cityName(d.city, 'es');
    return regra.side === 'sell' ? `${rotulo} a ${preco} en ${ciudad}` : `Orden de compra de ${rotulo} a ${preco} en ${ciudad}`;
  }
  return regra.side === 'sell' ? `${rotulo} a ${preco} em ${d.city}` : `Pedido de compra de ${rotulo} a ${preco} em ${d.city}`;
}

/** Título da notificação do disparo. */
export function tituloDisparo(side: RegraLocal['side'], loc: Locale = currentLocale()): string {
  if (loc === 'es') return side === 'sell' ? 'Precio en tu objetivo' : 'Orden de compra en tu objetivo';
  return side === 'sell' ? 'Preço no alvo' : 'Pedido de compra no alvo';
}

/**
 * Decide se a regra dispara com as linhas de preço dadas. Pura: sem rede, sem relógio implícito.
 * `medianas` (por cidade) só é usado em belowMedianPct; um número só vale para todas as cidades.
 * Linhas de outro item ou outra qualidade são ignoradas, então dá para passar o lote inteiro.
 */
export function avaliarRegra(
  regra: RegraLocal,
  rows: PriceRow[],
  now: number,
  medianas: MedianasPorCidade | number | null = null,
): DisparoLocal | null {
  if (!regra.ativa || !cooldownOk(regra, now)) return null;
  const lastFired = regra.lastFiredAt ? Date.parse(regra.lastFiredAt) : NaN;
  const id = regra.itemId.toUpperCase();
  const c = regra.condition;
  type Achado = Omit<DisparoLocal, 'mensagem' | 'voz'>;
  let best: Achado | null = null as Achado | null;
  for (const row of rows) {
    if (row.id.toUpperCase() !== id || row.quality !== regra.quality || !regra.cities.includes(row.city)) continue;
    const price = regra.side === 'sell' ? row.sellMin : row.buyMax;
    const seenAt = regra.side === 'sell' ? row.sellMinAt : row.buyMaxAt;
    if (price == null || price <= 0) continue;
    const ageMin = minutosDesde(seenAt, now);
    if (ageMin == null || ageMin > MAX_IDADE_PRECO_MIN) continue;
    // Mesma observação do último disparo (ou anterior): já avisou.
    if (Number.isFinite(lastFired) && seenAt && Date.parse(seenAt) <= lastFired) continue;

    let hit: Achado | null = null;
    const base = { regraId: regra.id, itemId: id, city: row.city, price, seenAt, ageMin };
    if (c.kind === 'below' && price < c.price) hit = base;
    else if (c.kind === 'above' && price > c.price) hit = base;
    else if (c.kind === 'belowMedianPct') {
      const m = typeof medianas === 'number' ? medianas : (medianas?.[row.city] ?? null);
      if (m != null && m > 0 && price <= m * (1 - c.pct / 100)) hit = { ...base, median: m };
    }
    if (!hit) continue;
    const melhor = c.kind === 'above' ? !best || hit.price > best.price : !best || hit.price < best.price;
    if (melhor) best = hit;
  }
  if (!best) return null;
  return { ...best, mensagem: mensagemDisparo(regra, best), voz: vozDisparo(regra, best) };
}

/**
 * Mediana de 7 dias de cada cidade a partir do histórico do /api/item (média diária ponderada pela quantidade
 * vendida; mesma conta da "mediana da própria cidade" da página de item). Menos de 3 dias com venda: null. Pura.
 */
export function medianaCidade(history: CityHistory[], now: number): MedianasPorCidade {
  const desde = now - 7 * 24 * 3600 * 1000;
  const out: MedianasPorCidade = {};
  for (const h of history) {
    const semana = h.days.filter((d) => {
      const t = Date.parse(`${d.date.slice(0, 10)}T00:00:00Z`);
      return Number.isFinite(t) && t >= desde && d.avg > 0;
    });
    const m = semana.length >= MEDIANA_MIN_DIAS ? weightedQuantile(semana.map((d) => ({ value: d.avg, weight: d.count > 0 ? d.count : 1 })), 0.5) : null;
    out[h.city] = m == null ? null : Math.round(m);
  }
  return out;
}

/** Regras ativas, em lotes de até MAX_PRICE_IDS ids, com as cidades e qualidades que o lote precisa. Pura. */
export function montarLotes(regras: RegraLocal[]): { ids: string[]; cities: City[]; qualities: Quality[]; regras: RegraLocal[] }[] {
  const ativas = regras.filter((r) => r.ativa);
  const ids = [...new Set(ativas.map((r) => r.itemId.toUpperCase()))];
  const lotes = [];
  for (let i = 0; i < ids.length; i += MAX_PRICE_IDS) {
    const parte = new Set(ids.slice(i, i + MAX_PRICE_IDS));
    const rs = ativas.filter((r) => parte.has(r.itemId.toUpperCase()));
    lotes.push({
      ids: [...parte],
      cities: [...new Set(rs.flatMap((r) => r.cities))],
      qualities: [...new Set(rs.map((r) => r.quality))].sort(),
      regras: rs,
    });
  }
  return lotes;
}

export interface MotorAlertasDeps {
  api: GuaritaApi;
  avisar: (a: Aviso) => Promise<void>;
  getConfig: () => GuaritaConfig;
  /** Grava lastFiredAt da regra disparada (e o histórico). Recebe o disparo para registrar a mensagem. */
  marcarDisparo: (regraId: string, quando: string, disparo?: DisparoLocal) => Promise<void>;
  now?: () => number;
  /** Erro de rede ou de API num ciclo (o motor segue no próximo). */
  onErro?: (e: unknown) => void;
}

export interface EstadoAlertas {
  /** ISO da última checagem completa; null antes da primeira. */
  ultimaChecagem: string | null;
  /** ISO da próxima checagem agendada (com o app aberto). */
  proximaChecagem: string | null;
  /** Mensagem do último erro (limpa quando uma checagem dá certo). */
  erro: string | null;
}

export interface MotorAlertas {
  iniciar(): void;
  parar(): void;
  rodando(): boolean;
  /** Checa todas as regras ativas agora (botão "checar agora" e testes). Mesmo caminho do ciclo. */
  checarAgora(): Promise<DisparoLocal[]>;
  /** Reagenda o próximo ciclo (chamar quando o intervalo mudar). */
  reagendar(): void;
  estado(): EstadoAlertas;
  onEstado(cb: (e: EstadoAlertas) => void): () => void;
}

export function criarMotorAlertas(deps: MotorAlertasDeps): MotorAlertas {
  const now = deps.now ?? (() => Date.now());
  let on = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let checando: Promise<DisparoLocal[]> | null = null;
  const medianas = new Map<string, { at: number; m: MedianasPorCidade }>();
  let est: EstadoAlertas = { ultimaChecagem: null, proximaChecagem: null, erro: null };
  const subs = new Set<(e: EstadoAlertas) => void>();
  const mudar = (p: Partial<EstadoAlertas>) => {
    est = { ...est, ...p };
    for (const s of subs) s(est);
  };

  async function medianasDe(itemId: string, q: Quality): Promise<MedianasPorCidade> {
    const k = `${itemId}|${q}`;
    const hit = medianas.get(k);
    if (hit && now() - hit.at < MEDIANA_TTL_MS) return hit.m;
    const r = await deps.api.item(itemId, q);
    const m = medianaCidade(r.data.history ?? [], now());
    medianas.set(k, { at: now(), m });
    return m;
  }

  async function checar(): Promise<DisparoLocal[]> {
    const cfg = deps.getConfig();
    const disparos: DisparoLocal[] = [];
    let erro: string | null = null;
    for (const lote of montarLotes(cfg.regras)) {
      let rows: PriceRow[];
      try {
        rows = (await deps.api.prices({ ids: lote.ids, cities: lote.cities, qualities: lote.qualities })).data.rows;
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
        deps.onErro?.(e);
        continue;
      }
      for (const regra of lote.regras) {
        let med: MedianasPorCidade | null = null;
        if (regra.condition.kind === 'belowMedianPct') {
          try {
            med = await medianasDe(regra.itemId.toUpperCase(), regra.quality);
          } catch (e) {
            erro = e instanceof Error ? e.message : String(e);
            deps.onErro?.(e);
            continue;
          }
        }
        // Lê a regra de novo: o usuário pode ter desligado ou apagado enquanto a rede respondia.
        const atual = deps.getConfig().regras.find((r) => r.id === regra.id);
        if (!atual) continue;
        const t = now();
        const d = avaliarRegra(atual, rows, t, med);
        if (!d) continue;
        disparos.push(d);
        const quando = new Date(t).toISOString();
        await deps.marcarDisparo(regra.id, quando, d).catch((e) => deps.onErro?.(e));
        await deps
          .avisar({
            titulo: tituloDisparo(regra.side),
            corpo: d.mensagem,
            voz: atual.voz ? d.voz : false,
            prioridade: 'normal',
          })
          .catch((e) => deps.onErro?.(e));
      }
    }
    mudar({ ultimaChecagem: new Date(now()).toISOString(), erro });
    return disparos;
  }

  function checarAgora(): Promise<DisparoLocal[]> {
    if (!checando) checando = checar().finally(() => (checando = null));
    return checando;
  }

  function agendar(ms: number) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!on) return;
    mudar({ proximaChecagem: new Date(now() + ms).toISOString() });
    timer = setTimeout(async () => {
      timer = null;
      try {
        await checarAgora();
      } catch (e) {
        deps.onErro?.(e);
      }
      agendar(intervaloMs());
    }, ms);
  }

  const intervaloMs = () => Math.min(5, Math.max(2, deps.getConfig().intervaloRegrasMin || 3)) * 60_000;

  return {
    iniciar: () => {
      if (on) return;
      on = true;
      agendar(PRIMEIRA_CHECAGEM_MS);
    },
    parar: () => {
      on = false;
      if (timer) clearTimeout(timer);
      timer = null;
      mudar({ proximaChecagem: null });
    },
    rodando: () => on,
    checarAgora,
    reagendar: () => {
      if (on && timer) agendar(intervaloMs());
    },
    estado: () => est,
    onEstado: (cb) => {
      subs.add(cb);
      cb(est);
      return () => subs.delete(cb);
    },
  };
}
