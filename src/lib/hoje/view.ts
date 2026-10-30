// Lógica pura da tela "O que fazer hoje" (src/routes/Hoje.svelte): conta aberta, consulta na URL, rótulos e selo.
import type { Confidence, HojeTrilha } from '../../../shared/types';
import { scoreLabel } from '../../../shared/confidence';
import type { HojeConta, HojeOpcao as HojeOpcaoX } from '../../../shared/types';

export const PRATA_ATALHOS = [1_000_000, 5_000_000, 10_000_000] as const;
export const MINUTOS_OPCOES = [30, 60, 120] as const;
export const MINUTOS_PADRAO = 60;
export const PRATA_MIN = 1_000;

export interface HojeForm {
  prata: number | null;
  minutos: number;
  premium: boolean;
}

const TRILHA: Record<HojeTrilha, string> = {
  flip: 'Flip para o Black Market',
  refino: 'Refino com bônus',
  transporte: 'Transporte entre cidades',
};
export const TRILHAS: HojeTrilha[] = ['flip', 'refino', 'transporte'];

export function trilhaLabel(t: HojeTrilha): string {
  return TRILHA[t];
}

/** Conta da opção: a que a API manda ou, sem ela, derivada dos itens (venda − compra − lucro = taxas). */
export function contaDe(op: Pick<HojeOpcaoX, 'itens' | 'lucro' | 'conta'>): HojeConta {
  if (op.conta) return op.conta;
  let compra = 0;
  let venda = 0;
  for (const it of op.itens) {
    if (it.compra != null) compra += it.compra * it.qtd;
    if (it.venda != null) venda += it.venda * it.qtd;
  }
  return { compra, venda, taxas: Math.max(0, venda - compra - op.lucro), lucro: op.lucro };
}

/** Selo no formato do ConfidenceBadge a partir do número 0–100 e dos motivos. */
export function confidenceOf(score: number, motivos: string[] = []): Confidence {
  return { score, label: scoreLabel(score), reasons: motivos };
}

/** "?prata=5000000&minutos=120&premium=1" → formulário (valores inválidos caem no padrão). */
export function parseHojeQuery(search: string): HojeForm {
  const q = new URLSearchParams(search);
  const p = Number(q.get('prata'));
  const m = Number(q.get('minutos'));
  return {
    prata: Number.isFinite(p) && p >= PRATA_MIN ? Math.round(p) : null,
    minutos: (MINUTOS_OPCOES as readonly number[]).includes(m) ? m : MINUTOS_PADRAO,
    premium: q.get('premium') === '1',
  };
}

/**
 * Frase curta para o leitor de tela (região role="status"): o resultado inteiro não fica dentro de aria-live, senão
 * o leitor tentaria ler dezenas de linhas a cada consulta.
 */
export function anuncioHoje(s: { loading: boolean; error: string | null; contagem: Record<HojeTrilha, number> | null }): string {
  if (s.loading) return 'Consultando os preços de agora…';
  if (s.error) return `Não deu para montar as opções: ${s.error}`;
  if (!s.contagem) return '';
  const parte = (n: number, rotulo: string) => (n === 0 ? `nenhuma de ${rotulo}` : `${n} de ${rotulo}`);
  const c = s.contagem;
  return `Opções prontas: ${parte(c.flip, 'flip')}, ${parte(c.refino, 'refino')} e ${parte(c.transporte, 'transporte')}.`;
}

export function hojeQuery(f: { prata: number; minutos: number; premium: boolean }): string {
  return `?prata=${Math.round(f.prata)}&minutos=${f.minutos}&premium=${f.premium ? 1 : 0}`;
}

/** "1.500.000", "1,5 mi", "2kk" e "300k" → número. Vazio ou inválido → null. */
export function parsePrata(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '').replace(/prata$/, '');
  if (!s) return null;
  const m = /^(\d+(?:[.,]\d+)*)(kk|mi|m|k|mil)?$/.exec(s);
  if (!m) return null;
  let num = m[1];
  const mult = m[2] === 'kk' || m[2] === 'mi' || m[2] === 'm' ? 1_000_000 : m[2] === 'k' || m[2] === 'mil' ? 1_000 : 1;
  if (mult === 1) num = num.replace(/[.,]/g, '');
  else num = num.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(num) * mult;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Pior idade (minutos) entre os preços da opção; null se algum não tem data ou a API não mandou idade. */
export function idadeMaxima(op: HojeOpcaoX): number | null {
  const ages: (number | null | undefined)[] = [];
  for (const it of op.itens) {
    if (it.compra != null) ages.push(it.idadeCompraMin);
    if (it.venda != null) ages.push(it.idadeVendaMin);
  }
  if (!ages.length || ages.some((a) => a == null)) return null;
  return Math.max(...(ages as number[]));
}
