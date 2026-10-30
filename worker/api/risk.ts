// Módulo (c) da Fase 2: "Quanto vale arriscar". Custo do set pelo AODP (menor venda entre as cidades reais e
// Caerleon, mesma regra da recompra da autópsia) e o que se perde por tipo de zona (shared/zones.ts).
// Reexportado por insights.ts com a assinatura do contrato.
import type { Env } from '../env';
import type { PriceRow, Quality, RiskQuote } from '../../shared/types';
import { aodpPricesMeta } from '../lib/aodp';
import { acLabel } from '../lib/acIndex';
import { json, badRequest, upstreamError } from '../lib/respond';
import { minutesSince } from '../../shared/market';
import { zonesFor } from '../../shared/zones';
import { GEAR_CITIES, pickCheapest } from './player';

/** Teto de peças por pedido: um set completo (arma, secundária, cabeça, peito, pés, capa, bolsa, montaria,
 *  comida, poção) com folga; 12 ids sempre cabem numa só URL do AODP. */
export const MAX_RISK_ITEMS = 12;
const ID_RE = /^T[1-8]_[A-Z0-9_]+(@[1-4])?$/;

export interface RiskPiece {
  id: string;
  quality: Quality;
}

/** Valida o corpo do POST /api/risk (só formato; a existência do id é conferida depois por acLabel). */
export function parseRiskBody(body: unknown): { items: RiskPiece[] } | { error: string } {
  const raw = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) return { error: 'Envie {"items": [{"id": "T4_BAG", "quality": 1}]}.' };
  if (raw.length === 0) return { error: 'Escolha pelo menos uma peça.' };
  if (raw.length > MAX_RISK_ITEMS) return { error: `No máximo ${MAX_RISK_ITEMS} peças por cálculo.` };
  const items: RiskPiece[] = [];
  const bad: string[] = [];
  for (const it of raw) {
    const id = typeof (it as { id?: unknown })?.id === 'string' ? (it as { id: string }).id.trim().toUpperCase() : '';
    const q = (it as { quality?: unknown })?.quality ?? 1;
    if (!ID_RE.test(id)) { bad.push(id || '(vazio)'); continue; }
    if (q !== 1 && q !== 2 && q !== 3 && q !== 4 && q !== 5) return { error: `Qualidade inválida em ${id}: use de 1 (Normal) a 5 (Obra-prima).` };
    items.push({ id, quality: q });
  }
  if (bad.length) return { error: `Código de item inválido: ${bad.slice(0, 5).join(', ')}.` };
  return { items };
}

/** Monta a cotação a partir das linhas de preço (pura, testável). */
export function buildRiskQuote(items: RiskPiece[], rows: PriceRow[], fetchedAt: string, now = Date.now()): RiskQuote {
  let total = 0;
  let missing = 0;
  const out = items.map((it) => {
    const c = pickCheapest(rows, it.id, it.quality, now);
    if (c) total += c.price;
    else missing++;
    return { id: it.id, quality: it.quality, price: c?.price ?? null, city: c?.city ?? null, ageMin: c ? minutesSince(c.at, now) : null };
  });
  return { items: out, total, missing, zones: zonesFor(total), fetchedAt };
}

/** Custo do set e o que se perde por zona. Uma chamada ao AODP (com cache de 2 min). */
export async function getRisk(_env: Env, ctx: ExecutionContext, items: RiskPiece[]): Promise<RiskQuote> {
  // Quem chama direto (bot, MCP) pode mandar id em minúsculas ou qualidade fora da faixa: normaliza aqui também.
  const list = items.slice(0, MAX_RISK_ITEMS).map((i) => ({
    id: String(i.id).trim().toUpperCase(),
    quality: ([1, 2, 3, 4, 5] as number[]).includes(i.quality) ? i.quality : (1 as Quality),
  }));
  const ids = [...new Set(list.map((i) => i.id))];
  const minQ = Math.min(...list.map((i) => i.quality)) as Quality;
  // pickCheapest aceita qualidade igual ou maior que a pedida: busca da menor pedida até a 5.
  const qualities = ([1, 2, 3, 4, 5] as Quality[]).filter((q) => q >= minQ);
  if (!ids.length) return buildRiskQuote([], [], new Date().toISOString());
  const res = await aodpPricesMeta(ids, GEAR_CITIES, qualities, ctx);
  return buildRiskQuote(list, res.data, res.at);
}

/** POST /api/risk {items:[{id,quality}]} (até 12 peças). */
export async function handleRisk(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  if (url.pathname !== '/api/risk') return null;
  if (request.method !== 'POST') return json({ error: 'Use POST com {"items": [...]}.' }, 405, 0, { Allow: 'POST' });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Corpo inválido: envie JSON.');
  }
  const parsed = parseRiskBody(body);
  if ('error' in parsed) return badRequest(parsed.error);
  const labels = await Promise.all(parsed.items.map((i) => acLabel(env, i.id).catch(() => null)));
  const unknown = parsed.items.filter((_, i) => !labels[i]).map((i) => i.id);
  if (unknown.length) return badRequest(`Item não encontrado: ${unknown.slice(0, 5).join(', ')}.`);
  try {
    return json(await getRisk(env, ctx, parsed.items), 200, 0);
  } catch (err) {
    return upstreamError(err);
  }
}
