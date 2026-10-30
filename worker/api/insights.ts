// Fachada da Fase 2 para o bot e o MCP: (a) perdas PvP e guilda (./insightsA.ts), (c) risco do set (./risk.ts),
// (d) ouro e saúde do dado (./goldHealth.ts). As rotas HTTP ficam em ./routesF2.ts.
import type { Env } from '../env';
import { getRisk as riskQuote } from './risk';
import { getLosses as lossesA, getGuild as guildA } from './insightsA';
import type { DataHealthResponse, GoldResponse, GuildSummary, LossesResponse, RiskQuote, Quality } from '../../shared/types';
import type { ApiLang } from '../../shared/lang';

/** (a) Itens mais perdidos no PvP nos últimos `days` dias (1–7); `lang` 'es' = nomes de item em espanhol. Em ./insightsA.ts. */
export async function getLosses(env: Env, ctx: ExecutionContext, days: number, limit = 50, lang: ApiLang = 'pt'): Promise<LossesResponse> {
  return lossesA(env, ctx, days, limit, lang);
}
/** (a) Resumo da guilda pelo nome exato. Implementação em ./insightsA.ts. */
export async function getGuild(env: Env, ctx: ExecutionContext, name: string): Promise<GuildSummary> {
  return guildA(env, ctx, name);
}
/** (c) Custo do set e o que se perde por zona; `lang` 'es' = zonas em espanhol. */
export async function getRisk(env: Env, ctx: ExecutionContext, items: { id: string; quality: Quality }[], lang: ApiLang = 'pt'): Promise<RiskQuote> {
  return riskQuote(env, ctx, items, lang); // implementação em ./risk.ts (módulo c)
}
// (d) Série do ouro e veredito · saúde do dado do AODP por cidade: implementados em goldHealth.ts.
export { getGold, getDataHealth } from './goldHealth';
