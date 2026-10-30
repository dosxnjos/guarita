// Regras puras da sessão (testes em tests/captura.test.ts): ritmo por hora, valor estimado do loot e textos.
// O Rust manda os agregados (RetratoSessao); aqui só se calcula o que depende de preço e de relógio.
import type { City, PriceRow } from '../../../../shared/types';
import type { FaseCaptura, ItemLoot, PrefCaptura, RetratoSessao } from './tipos';

/** Abaixo disto o "por hora" engana (1 baú em 20 s viraria milhões por hora). */
export const DURACAO_MIN_RITMO_MS = 60_000;
/** O /api/prices aceita até 300 ids por consulta. */
export const MAX_IDS_PRECO = 300;
/** Cidades usadas na estimativa: as de mercado comum. O Black Market só compra e tem preço próprio: fica fora. */
export const CIDADES_ESTIMATIVA: City[] = ['Bridgewatch', 'Caerleon', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Brecilien'];

/** Duração "agora": o retrato vem com a duração do momento em que o Rust gerou; somamos o que passou desde então. */
export function duracaoAgora(r: RetratoSessao, agora = Date.now()): number {
  return r.ativa ? r.duracaoMs + Math.max(0, agora - r.geradoEm) : r.duracaoMs;
}

/**
 * Marca do loot para saber quando buscar preço de novo: muda quando entra item, quando muda a quantidade e quando
 * um item ganha o id textual (a lista de itens do ao-bin-dumps pode chegar depois do loot).
 */
export function marcaDoLoot(loot: ItemLoot[]): string {
  return loot.map((l) => `${l.indice}:${l.itemId ?? ''}:${l.quantidade}`).join(',');
}

/** Valor por hora, ou null com menos de 1 minuto de sessão. */
export function porHora(valor: number, duracaoMs: number): number | null {
  if (!Number.isFinite(valor) || duracaoMs < DURACAO_MIN_RITMO_MS) return null;
  return (valor * 3_600_000) / duracaoMs;
}

/** "1 h 05 min", "12 min", "45 s". */
export function fmtDuracao(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} min`;
}

export interface PrecoEstimado {
  /** Mediana da venda mais barata entre as cidades com preço. */
  preco: number;
  cidades: number;
  /** Idade (min) do preço mais novo usado. */
  idadeMin: number | null;
}

/**
 * Preço de referência de um item: mediana do `sellMin` (qualidade normal) entre as cidades de mercado comum com
 * preço. Mediana e não mínimo: um preço velho ou isolado numa cidade não puxa a estimativa.
 */
export function precoEstimado(rows: PriceRow[], id: string, agora = Date.now()): PrecoEstimado | null {
  const alvo = id.toUpperCase();
  const linhas = rows.filter(
    (r) => r.id.toUpperCase() === alvo && r.quality === 1 && CIDADES_ESTIMATIVA.includes(r.city) && r.sellMin !== null && r.sellMin > 0,
  );
  if (!linhas.length) return null;
  const precos = linhas.map((r) => r.sellMin as number).sort((a, b) => a - b);
  const m = Math.floor(precos.length / 2);
  const preco = precos.length % 2 ? precos[m] : Math.round((precos[m - 1] + precos[m]) / 2);
  const datas = linhas.map((r) => (r.sellMinAt ? Date.parse(r.sellMinAt) : NaN)).filter(Number.isFinite);
  const idadeMin = datas.length ? Math.max(0, Math.round((agora - Math.max(...datas)) / 60_000)) : null;
  return { preco, cidades: linhas.length, idadeMin };
}

/** Ids de item do loot para consultar preço (sem repetir, sem os desconhecidos, até 300). */
export function idsParaPreco(loot: ItemLoot[]): string[] {
  const ids = new Set<string>();
  for (const l of loot) if (l.itemId) ids.add(l.itemId.toUpperCase());
  return [...ids].slice(0, MAX_IDS_PRECO);
}

export interface LinhaLoot {
  indice: number;
  itemId: string | null;
  quantidade: number;
  unitario: number | null;
  total: number | null;
  idadeMin: number | null;
}

export interface ValorLoot {
  linhas: LinhaLoot[];
  /** Soma das linhas com preço. */
  total: number;
  /** Linhas sem preço conhecido (ficam fora do total). */
  semPreco: number;
}

/** Valor estimado do loot: linhas com preço primeiro (maior total no topo), depois as sem preço. */
export function valorLoot(loot: ItemLoot[], rows: PriceRow[], agora = Date.now()): ValorLoot {
  const linhas: LinhaLoot[] = loot.map((l) => {
    const p = l.itemId ? precoEstimado(rows, l.itemId, agora) : null;
    return {
      indice: l.indice,
      itemId: l.itemId,
      quantidade: l.quantidade,
      unitario: p?.preco ?? null,
      total: p ? p.preco * l.quantidade : null,
      idadeMin: p?.idadeMin ?? null,
    };
  });
  linhas.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || b.quantidade - a.quantidade);
  return {
    linhas,
    total: linhas.reduce((s, l) => s + (l.total ?? 0), 0),
    semPreco: linhas.filter((l) => l.total === null).length,
  };
}

export const ROTULO_FASE: Record<FaseCaptura, [texto: string, tom: '' | 'info' | 'good' | 'warn' | 'bad']> = {
  desligada: ['Desligada', ''],
  'sem-npcap': ['Npcap não encontrado', 'warn'],
  'npcap-invalido': ['Npcap com problema', 'bad'],
  'sem-interface': ['Nenhuma rede encontrada', 'warn'],
  'sem-permissao': ['Sem acesso à rede', 'warn'],
  'aguardando-jogo': ['Aguardando o jogo', 'info'],
  'aguardando-mapa': ['Troque de mapa uma vez', 'info'],
  capturando: ['Capturando', 'good'],
};

/** A fase é de "ligada" (threads rodando)? */
export function faseLigada(f: FaseCaptura): boolean {
  return f === 'aguardando-jogo' || f === 'aguardando-mapa' || f === 'capturando';
}

export function prefPadrao(): PrefCaptura {
  return { ligada: false, avisoAceitoEm: null, diagnostico: false };
}

/** Lê a escolha gravada; qualquer coisa estragada volta ao padrão (desligada, sem aceite). */
export function normalizarPref(raw: unknown): PrefCaptura {
  const d = prefPadrao();
  if (typeof raw !== 'object' || raw === null) return d;
  const o = raw as Record<string, unknown>;
  const aceite = typeof o.avisoAceitoEm === 'string' && Number.isFinite(Date.parse(o.avisoAceitoEm)) ? o.avisoAceitoEm : null;
  return {
    // Sem aceite não existe "ligada".
    ligada: aceite !== null && o.ligada === true,
    avisoAceitoEm: aceite,
    diagnostico: o.diagnostico === true,
  };
}
