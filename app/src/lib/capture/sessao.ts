// Regras puras da sessão (testes em tests/captura.test.ts): ritmo por hora, valor estimado do loot e textos.
// O Rust manda os agregados (RetratoSessao); aqui só se calcula o que depende de preço e de relógio.
import type { City, PriceRow } from '../../../../shared/types';
import { currentLocale, type Locale } from '../../../../src/lib/i18n/core';
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

export const ROTULO_FASE_ES: Record<FaseCaptura, string> = {
  desligada: 'Desactivada',
  'sem-npcap': 'Npcap no encontrado',
  'npcap-invalido': 'Npcap con problemas',
  'sem-interface': 'No se encontró ninguna red',
  'sem-permissao': 'Sin acceso a la red',
  'aguardando-jogo': 'Esperando el juego',
  'aguardando-mapa': 'Cambia de mapa una vez',
  capturando: 'Capturando',
};

/** Texto e tom da fase na língua pedida (padrão: a do app). */
export function rotuloFase(f: FaseCaptura, loc: Locale = currentLocale()): [texto: string, tom: '' | 'info' | 'good' | 'warn' | 'bad'] {
  const [pt, tom] = ROTULO_FASE[f];
  return [loc === 'es' ? ROTULO_FASE_ES[f] : pt, tom];
}

// Mensagens que o Rust (src-tauri/src/capture, fora deste módulo) manda em português e chegam à tela: o erro de
// `captura_ligar` sem aceite, `EstadoCaptura.mensagem` quando a rede cai e `TabelaInfo.recusa`. Em espanhol, a
// tela traduz as conhecidas pelo texto exato; o resto (erro técnico do Npcap, nome de DLL) passa como veio.
// tests/i18n.test.ts confere que os textos daqui continuam iguais aos do Rust.
const MSG_RUST_ES: [RegExp, string][] = [
  [
    /^Para ligar a captura, leia e aceite o aviso sobre a leitura do tráfego de rede\.$/,
    'Para activar la captura, lee y acepta el aviso sobre la lectura del tráfico de red.',
  ],
  [
    /^A leitura da rede parou \(o computador suspendeu, o Wi-Fi reiniciou ou a placa de rede sumiu\)\. Ligue a captura de novo\.$/,
    'La lectura de la red se detuvo (la computadora se suspendió, el Wi-Fi se reinició o la tarjeta de red desapareció). Activa la captura de nuevo.',
  ],
  [/^tabela remota recusada \(assinatura\)$/, 'tabla remota rechazada (firma)'],
  [/^versão (\d+) da tabela de códigos fora do esperado$/, 'versión $1 de la tabla de códigos fuera de lo esperado'],
  [/^protocolo "([^"]*)" não suportado por esta versão do app$/, 'protocolo "$1" no compatible con esta versión de la app'],
  [/^porta (\d+) não é do Albion na tabela de códigos$/, 'el puerto $1 no es de Albion en la tabla de códigos'],
  [/^parâmetro do código inválido na tabela de códigos$/, 'parámetro de código no válido en la tabla de códigos'],
  [/^tabela de códigos sem o evento (.+)$/, 'tabla de códigos sin el evento $1'],
  [/^tabela de códigos sem a operação (.+)$/, 'tabla de códigos sin la operación $1'],
];

/** Mensagem da captura vinda do Rust na língua pedida (as conhecidas; o resto passa igual). Pura. */
export function mensagemCaptura(msg: string, loc: Locale = currentLocale()): string {
  if (loc !== 'es') return msg;
  for (const [re, es] of MSG_RUST_ES) if (re.test(msg)) return msg.replace(re, es);
  return msg;
}

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
