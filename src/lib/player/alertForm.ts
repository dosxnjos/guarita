// Lógica pura do formulário de alertas: estado inicial, validação em PT-BR, montagem da regra e descrição.
import { ROYAL_CITIES } from '../../../shared/market';
import { BM_CITY, MEDIAN_PCT_MAX, MEDIAN_PCT_MIN, sideAllowsCities } from '../../../shared/alertLimits';
import type { AlertCondition, AlertRule, City, Quality } from '../../../shared/types';
import { fmtNum, qualityLabel } from './format';

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

/** Lê número digitado em pt-BR: "12.000", "12 000", "1,5" (decimal só para porcentagem). */
export function parseNumberBR(s: string): number | null {
  const t = s.trim().replace(/\s| /g, '');
  if (!t) return null;
  // ponto como milhar, vírgula como decimal
  const n = Number(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const ITEM_ID = /^[A-Z0-9_@]{3,80}$/;

/** Erros por campo (vazio = pode enviar). */
export function validate(f: AlertFormState, currentCount: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (currentCount >= MAX_RULES) e.form = `Este aparelho já tem ${MAX_RULES} regras, o limite. Apague uma para criar outra.`;
  if (!f.itemId) e.item = 'Escolha um item.';
  else if (!ITEM_ID.test(f.itemId)) e.item = 'Código de item inválido (ex.: T4_BAG ou T6_MAIN_SWORD@1).';
  if (!f.cities.length) e.cities = 'Marque pelo menos uma cidade.';
  else if (!sideAllowsCities(f.side, f.cities)) e.cities = 'O Black Market só compra: ele vale para "Vender caro", não para "Comprar barato".';
  const n = parseNumberBR(f.value);
  if (f.kind === 'belowMedianPct') {
    if (n === null || Math.round(n) < MEDIAN_PCT_MIN || Math.round(n) > MEDIAN_PCT_MAX) {
      e.value = `Informe uma porcentagem entre ${MEDIAN_PCT_MIN} e ${MEDIAN_PCT_MAX}.`;
    }
  } else if (n === null || n <= 0 || !Number.isInteger(n)) {
    e.value = 'Informe um preço inteiro em prata, maior que zero.';
  } else if (n > 1_000_000_000) {
    e.value = 'Preço alto demais para um alerta (máximo 1 bilhão).';
  }
  if (!(COOLDOWNS as readonly number[]).includes(f.cooldownMin)) e.cooldown = 'Escolha 30, 60 ou 180 minutos.';
  return e;
}

export function toCondition(f: AlertFormState): AlertCondition {
  const n = parseNumberBR(f.value) ?? 0;
  if (f.kind === 'belowMedianPct') return { kind: 'belowMedianPct', pct: Math.round(n) };
  return { kind: f.kind, price: Math.round(n) };
}

/** Regra pronta para api.createAlert (itemName é opcional no contrato). */
export type NewAlertPayload = Omit<AlertRule, 'id' | 'createdAt' | 'lastFiredAt'>;

export function toRule(f: AlertFormState, owner: string): NewAlertPayload {
  const rule: NewAlertPayload = {
    itemId: f.itemId,
    quality: f.quality,
    cities: citiesForSide(f.side, f.cities),
    side: f.side,
    condition: toCondition(f),
    cooldownMin: f.cooldownMin,
    channel: 'push',
    owner,
  };
  if (f.itemName.trim()) rule.itemName = f.itemName.trim();
  return rule;
}

export function conditionText(c: AlertCondition): string {
  switch (c.kind) {
    case 'below': return `abaixo de ${fmtNum(c.price)} prata`;
    case 'above': return `acima de ${fmtNum(c.price)} prata`;
    case 'belowMedianPct': return `${fmtNum(c.pct)}% abaixo da mediana de 7 dias da cidade`;
  }
}

export function sideText(side: 'sell' | 'buy'): string {
  return side === 'sell' ? 'comprar barato (ordens de venda)' : 'vender caro (ordens de compra)';
}

export function citiesText(cities: City[]): string {
  const royalAndCaerleon = DEFAULT_CITIES.every((c) => cities.includes(c)) && cities.length === DEFAULT_CITIES.length;
  if (royalAndCaerleon) return 'cidades reais e Caerleon';
  if (cities.length <= 3) return cities.join(', ');
  return `${cities.length} cidades`;
}

/** Resumo de uma linha para a lista de regras (com o nome do item na frente). */
export function describeRule(r: AlertRule, name?: string): string {
  return `${name || r.itemId} · ${ruleDetails(r)}`;
}

/** Detalhes da regra sem o nome do item. */
export function ruleDetails(r: AlertRule): string {
  const parts = [
    r.quality > 1 ? qualityLabel(r.quality) : null,
    sideText(r.side),
    conditionText(r.condition),
    citiesText(r.cities),
    `no máximo 1 aviso a cada ${r.cooldownMin} min`,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Ao trocar o lado, a condição natural acompanha (comprar → abaixo; vender → acima). */
export function kindForSide(side: 'sell' | 'buy', current: CondKind): CondKind {
  if (current === 'belowMedianPct') return current;
  return side === 'sell' ? 'below' : 'above';
}
