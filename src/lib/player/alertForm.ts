// Lógica pura do formulário de alertas: estado inicial, validação em PT-BR, montagem da regra e descrição.
// Línguas: quem devolve texto aceita `loc` no fim (padrão: a língua atual, pelo espelho não reativo de i18n/core.ts,
// como format.ts). O português sai byte a byte como sempre; nada de runes, porque o app de PC importa este arquivo.
import { ROYAL_CITIES } from '../../../shared/market';
import { BM_CITY, MEDIAN_PCT_MAX, MEDIAN_PCT_MIN, sideAllowsCities } from '../../../shared/alertLimits';
import type { AlertCondition, AlertRule, City, Quality } from '../../../shared/types';
import { fmtNum, qualityLabel } from './format';
import { cityName, fmtInt, qualityName } from '../format';
import { currentLocale, type Locale } from '../i18n/core';

const pick = (loc: Locale, pt: string, es: string): string => (loc === 'es' ? es : pt);

/** Limite de regras por aparelho (o core também barra; aqui só avisamos antes). */
export const MAX_RULES = 20;
export const COOLDOWNS = [30, 60, 180] as const;
export const DEFAULT_CITIES: City[] = [...ROYAL_CITIES, 'Caerleon'];

export type CondKind = AlertCondition['kind'];

export interface AlertFormState {
  itemId: string;
  itemName: string;
  quality: Quality;
  cities: City[];
  /** 'sell' = olhar ordens de venda (comprar barato); 'buy' = olhar ordens de compra (vender caro). */
  side: 'sell' | 'buy';
  kind: CondKind;
  /** Texto do campo, para aceitar "12.000" e "12000". */
  value: string;
  cooldownMin: number;
}

/** Estado inicial; item e qualidade podem vir da página do item (/alertas?item=T6_BAG&q=3). */
export function defaultForm(itemId = '', quality: Quality = 1): AlertFormState {
  return {
    itemId, itemName: '', quality, cities: [...DEFAULT_CITIES], side: 'sell', kind: 'below', value: '', cooldownMin: 60,
  };
}

/** Cidades válidas para o lado: comprar barato tira o Black Market (ele só compra). Pura. */
export function citiesForSide(side: 'sell' | 'buy', cities: City[]): City[] {
  // Sempre cópia: a regra enviada não pode mudar se o formulário mudar depois.
  return side === 'sell' ? cities.filter((c) => c !== BM_CITY) : [...cities];
}

/**
 * Lê número digitado em pt-BR: "12.000", "12 000", "1,5" (decimal só para porcentagem).
 * Em espanhol o site mostra o milhar com vírgula ("12,000", es-419): lá "12,000" e "1,234,567" (grupos de 3 depois
 * da vírgula) valem milhar; "1,5" continua decimal. Em português nada muda.
 */
export function parseNumberBR(s: string, loc: Locale = currentLocale()): number | null {
  const t = s.trim().replace(/\s| /g, '');
  if (!t) return null;
  if (loc === 'es' && /^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, ''));
  // ponto como milhar, vírgula como decimal
  const n = Number(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const ITEM_ID = /^[A-Z0-9_@]{3,80}$/;

/** Erros por campo (vazio = pode enviar), na língua pedida. */
export function validate(f: AlertFormState, currentCount: number, loc: Locale = currentLocale()): Record<string, string> {
  const e: Record<string, string> = {};
  if (currentCount >= MAX_RULES) {
    e.form = pick(loc,
      `Este aparelho já tem ${MAX_RULES} regras, o limite. Apague uma para criar outra.`,
      `Este dispositivo ya tiene ${MAX_RULES} reglas, el límite. Borra una para crear otra.`);
  }
  if (!f.itemId) e.item = pick(loc, 'Escolha um item.', 'Elige un objeto.');
  else if (!ITEM_ID.test(f.itemId)) e.item = pick(loc, 'Código de item inválido (ex.: T4_BAG ou T6_MAIN_SWORD@1).', 'Código de objeto no válido (ej.: T4_BAG o T6_MAIN_SWORD@1).');
  if (!f.cities.length) e.cities = pick(loc, 'Marque pelo menos uma cidade.', 'Marca al menos una ciudad.');
  else if (!sideAllowsCities(f.side, f.cities)) {
    e.cities = pick(loc,
      'O Black Market só compra: ele vale para "Vender caro", não para "Comprar barato".',
      'El Mercado Negro solo compra: sirve para "Vender caro", no para "Comprar barato".');
  }
  const n = parseNumberBR(f.value, loc);
  if (f.kind === 'belowMedianPct') {
    if (n === null || Math.round(n) < MEDIAN_PCT_MIN || Math.round(n) > MEDIAN_PCT_MAX) {
      e.value = pick(loc,
        `Informe uma porcentagem entre ${MEDIAN_PCT_MIN} e ${MEDIAN_PCT_MAX}.`,
        `Indica un porcentaje entre ${MEDIAN_PCT_MIN} y ${MEDIAN_PCT_MAX}.`);
    }
  } else if (n === null || n <= 0 || !Number.isInteger(n)) {
    e.value = pick(loc,
      'Informe um preço inteiro em prata, maior que zero.',
      'Indica un precio entero en plata, mayor que cero.');
  } else if (n > 1_000_000_000) {
    e.value = pick(loc, 'Preço alto demais para um alerta (máximo 1 bilhão).', 'Precio demasiado alto para una alerta (máximo mil millones).');
  }
  if (!(COOLDOWNS as readonly number[]).includes(f.cooldownMin)) e.cooldown = pick(loc, 'Escolha 30, 60 ou 180 minutos.', 'Elige 30, 60 o 180 minutos.');
  return e;
}

export function toCondition(f: AlertFormState, loc: Locale = currentLocale()): AlertCondition {
  const n = parseNumberBR(f.value, loc) ?? 0;
  if (f.kind === 'belowMedianPct') return { kind: 'belowMedianPct', pct: Math.round(n) };
  return { kind: f.kind, price: Math.round(n) };
}

/** Regra pronta para api.createAlert (itemName é opcional no contrato). */
export type NewAlertPayload = Omit<AlertRule, 'id' | 'createdAt' | 'lastFiredAt'>;

export function toRule(f: AlertFormState, owner: string, loc: Locale = currentLocale()): NewAlertPayload {
  const rule: NewAlertPayload = {
    itemId: f.itemId,
    quality: f.quality,
    cities: citiesForSide(f.side, f.cities),
    side: f.side,
    condition: toCondition(f, loc),
    cooldownMin: f.cooldownMin,
    channel: 'push',
    owner,
  };
  if (f.itemName.trim()) rule.itemName = f.itemName.trim();
  return rule;
}

export function conditionText(c: AlertCondition, loc: Locale = currentLocale()): string {
  if (loc === 'es') {
    switch (c.kind) {
      case 'below': return `por debajo de ${fmtInt(c.price, loc)} de plata`;
      case 'above': return `por encima de ${fmtInt(c.price, loc)} de plata`;
      case 'belowMedianPct': return `${fmtInt(c.pct, loc)}% por debajo de la mediana de 7 días de la ciudad`;
    }
  }
  switch (c.kind) {
    case 'below': return `abaixo de ${fmtNum(c.price)} prata`;
    case 'above': return `acima de ${fmtNum(c.price)} prata`;
    case 'belowMedianPct': return `${fmtNum(c.pct)}% abaixo da mediana de 7 dias da cidade`;
  }
}

export function sideText(side: 'sell' | 'buy', loc: Locale = currentLocale()): string {
  if (loc === 'es') return side === 'sell' ? 'comprar barato (órdenes de venta)' : 'vender caro (órdenes de compra)';
  return side === 'sell' ? 'comprar barato (ordens de venda)' : 'vender caro (ordens de compra)';
}

export function citiesText(cities: City[], loc: Locale = currentLocale()): string {
  const royalAndCaerleon = DEFAULT_CITIES.every((c) => cities.includes(c)) && cities.length === DEFAULT_CITIES.length;
  if (royalAndCaerleon) return pick(loc, 'cidades reais e Caerleon', 'ciudades reales y Caerleon');
  if (cities.length <= 3) return loc === 'es' ? cities.map((c) => cityName(c, loc)).join(', ') : cities.join(', ');
  return pick(loc, `${cities.length} cidades`, `${cities.length} ciudades`);
}

/** Resumo de uma linha para a lista de regras (com o nome do item na frente). */
export function describeRule(r: AlertRule, name?: string, loc: Locale = currentLocale()): string {
  return `${name || r.itemId} · ${ruleDetails(r, loc)}`;
}

/** Detalhes da regra sem o nome do item. */
export function ruleDetails(r: AlertRule, loc: Locale = currentLocale()): string {
  const parts = [
    r.quality > 1 ? (loc === 'es' ? qualityName(r.quality, loc) : qualityLabel(r.quality)) : null,
    sideText(r.side, loc),
    conditionText(r.condition, loc),
    citiesText(r.cities, loc),
    pick(loc, `no máximo 1 aviso a cada ${r.cooldownMin} min`, `como máximo 1 aviso cada ${r.cooldownMin} min`),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Ao trocar o lado, a condição natural acompanha (comprar → abaixo; vender → acima). */
export function kindForSide(side: 'sell' | 'buy', current: CondKind): CondKind {
  if (current === 'belowMedianPct') return current;
  return side === 'sell' ? 'below' : 'above';
}
