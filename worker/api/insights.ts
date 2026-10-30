// Módulos (a) e (d) da Fase 2: perdas PvP, guilda, ouro, saúde do dado. Exporta funções para o bot e o MCP.
import type { Env } from '../env';
import type { DataHealthResponse, GoldResponse, GuildSummary, LossesResponse, RiskQuote, Quality } from '../../shared/types';

/** (a) Itens mais perdidos no PvP nos últimos `days` dias (1–7). */
export async function getLosses(_env: Env, _ctx: ExecutionContext, _days: number, _limit = 50): Promise<LossesResponse> {
  throw new Error('não implementado: módulo (a) da Fase 2');
}
/** (a) Resumo da guilda pelo nome exato. */
export async function getGuild(_env: Env, _ctx: ExecutionContext, _name: string): Promise<GuildSummary> {
  throw new Error('não implementado: módulo (a) da Fase 2');
}
/** (c) Custo do set e o que se perde por zona. */
export async function getRisk(_env: Env, _ctx: ExecutionContext, _items: { id: string; quality: Quality }[]): Promise<RiskQuote> {
  throw new Error('não implementado: módulo (c) da Fase 2');
}
/** (d) Série do ouro e veredito. */
export async function getGold(_env: Env, _ctx: ExecutionContext, _days: number): Promise<GoldResponse> {
  throw new Error('não implementado: módulo (d) da Fase 2');
}
/** (d) Saúde do dado do AODP por cidade. */
export async function getDataHealth(_env: Env, _ctx: ExecutionContext): Promise<DataHealthResponse> {
  throw new Error('não implementado: módulo (d) da Fase 2');
}
