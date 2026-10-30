// Módulo (e): /api/alerts (criar, listar, apagar) e /api/push/* — repassa ao Durable Object Hub do guarita-core.
// Exporta as funções que o bot usa para /alerta.
import type { Env } from '../env';
import type { AlertRule } from '../../shared/types';

export type NewAlert = Omit<AlertRule, 'id' | 'createdAt' | 'lastFiredAt'>;

export async function createAlert(_env: Env, _rule: NewAlert): Promise<AlertRule> {
  throw new Error('não implementado: módulo (e)');
}
export async function listAlerts(_env: Env, _owner: string): Promise<AlertRule[]> {
  throw new Error('não implementado: módulo (e)');
}
export async function deleteAlert(_env: Env, _owner: string, _id: string): Promise<boolean> {
  throw new Error('não implementado: módulo (e)');
}
export async function routeAlerts(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null;
}
