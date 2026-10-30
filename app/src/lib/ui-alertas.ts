// Formulário das regras de preço locais (widget "Alertas"): validação em PT-BR e montagem da RegraLocal.
// A regra é checada pelo motor (engine/alerts.ts) só com o app aberto. Puro, testado em tests/ui.test.ts.
import { BM_CITY, MEDIAN_PCT_MAX, MEDIAN_PCT_MIN, sideAllowsCities } from '../../../shared/alertLimits';
import { ALL_CITIES, ROYAL_CITIES } from '../../../shared/market';
import type { AlertCondition, City, Quality } from '../../../shared/types';
import { citiesForSide, kindForSide, parseNumberBR, ruleDetails } from '../../../src/lib/player/alertForm';
import { MAX_REGRAS_LOCAIS, PRECO_MAX, normalizarRegraLocal, type DisparoRegistrado, type RegraLocal } from './config';

export { citiesForSide, kindForSide };

export const CIDADES_ALERTA: City[] = ALL_CITIES;
export const CIDADES_PADRAO: City[] = [...ROYAL_CITIES, 'Caerleon'];
/** Minutos entre dois avisos da mesma regra. */
export const ESPERAS = [15, 30, 60, 180] as const;
export const INTERVALOS = [2, 3, 4, 5] as const;

export interface FormRegra {
  itemId: string;
  itemName: string;
  quality: Quality;
  cities: City[];
  side: 'sell' | 'buy';
  kind: AlertCondition['kind'];
  /** Texto do campo ("12.000" ou "12000"). */
  valor: string;
  cooldownMin: number;
  voz: boolean;
}

export function formRegraPadrao(): FormRegra {
  return { itemId: '', itemName: '', quality: 1, cities: [...CIDADES_PADRAO], side: 'sell', kind: 'below', valor: '', cooldownMin: 60, voz: true };
}

/** Erros por campo; objeto vazio = pode salvar. */
export function validarFormRegra(f: FormRegra, totalAtual: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (totalAtual >= MAX_REGRAS_LOCAIS) e.form = `O app já tem ${MAX_REGRAS_LOCAIS} regras, o limite. Apague uma para criar outra.`;
  if (!f.itemId) e.item = 'Escolha um item na lista.';
  const cidades = citiesForSide(f.side, f.cities);
  if (!cidades.length) e.cities = f.cities.includes(BM_CITY) && f.side === 'sell'
    ? 'O Black Market só compra: para ele, escolha "Vender caro".'
    : 'Marque pelo menos uma cidade.';
  else if (!sideAllowsCities(f.side, cidades)) e.cities = 'O Black Market só compra: para ele, escolha "Vender caro".';
  const n = parseNumberBR(f.valor);
  if (f.kind === 'belowMedianPct') {
    if (n === null || Math.round(n) < MEDIAN_PCT_MIN || Math.round(n) > MEDIAN_PCT_MAX) {
      e.valor = `Informe uma porcentagem entre ${MEDIAN_PCT_MIN} e ${MEDIAN_PCT_MAX}.`;
    }
  } else if (n === null || n <= 0 || !Number.isInteger(n)) {
    e.valor = 'Informe um preço inteiro em prata, maior que zero.';
  } else if (n > PRECO_MAX) {
    e.valor = 'Preço alto demais para um alerta.';
  }
  if (!(ESPERAS as readonly number[]).includes(f.cooldownMin)) e.cooldown = 'Escolha um intervalo da lista.';
  return e;
}

function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Monta a regra local a partir do formulário já validado. null se a config recusaria (não deveria acontecer). */
export function montarRegra(f: FormRegra, now = Date.now(), id = novoId()): RegraLocal | null {
  const n = parseNumberBR(f.valor) ?? 0;
  const condition: AlertCondition =
    f.kind === 'belowMedianPct' ? { kind: 'belowMedianPct', pct: Math.round(n) } : { kind: f.kind, price: Math.round(n) };
  return normalizarRegraLocal({
    id,
    itemId: f.itemId,
    itemName: f.itemName.trim() || undefined,
    quality: f.quality,
    cities: citiesForSide(f.side, f.cities),
    side: f.side,
    condition,
    cooldownMin: f.cooldownMin,
    createdAt: new Date(now).toISOString(),
    ativa: true,
    voz: f.voz,
  });
}

/** Resumo de uma linha da regra (sem o nome do item). */
export function detalhesRegra(r: RegraLocal): string {
  return ruleDetails({ ...r, channel: 'push', owner: '' });
}

/** Últimos disparos com o nome do item da regra (a regra pode ter sido apagada: aí só a mensagem). */
export function ultimosDisparos(disparos: DisparoRegistrado[], regras: RegraLocal[], n = 5): (DisparoRegistrado & { item: string | null })[] {
  const nome = new Map(regras.map((r) => [r.id, r.itemName || r.itemId]));
  return [...disparos]
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .slice(0, n)
    .map((d) => ({ ...d, item: nome.get(d.regraId) ?? null }));
}
