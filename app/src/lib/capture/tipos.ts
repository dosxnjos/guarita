// Tipos da captura do próprio jogador, espelho dos `Serialize` de src-tauri/src/capture (mod.rs e sessao.rs).
// Mudou lá, muda aqui. Só agregados do próprio jogador: nada de nome, guilda ou posição de ninguém.

/** Evento com o estado da captura (payload: EstadoCaptura). */
export const EV_CAPTURA_ESTADO = 'guarita://captura-estado';
/** Evento com o retrato da sessão (payload: RetratoSessao). */
export const EV_CAPTURA_SESSAO = 'guarita://captura-sessao';

export type FaseCaptura =
  | 'desligada'
  | 'sem-npcap'
  | 'npcap-invalido'
  | 'sem-interface'
  | 'sem-permissao'
  | 'aguardando-jogo'
  | 'aguardando-mapa'
  | 'capturando';

export interface TabelaInfo {
  versao: number;
  atualizadoEm: string;
  origem: 'embutida' | 'remota';
  /** Por que a última tabela do GitHub foi recusada (ex.: "tabela remota recusada (assinatura)"); null se aceita. */
  recusa: string | null;
}

export interface NumerosCaptura {
  datagramas: number;
  descartadosFilaCheia: number;
  pacotesPhoton: number;
  pacotesInvalidos: number;
  criptografados: number;
  mensagens: number;
  fatosProprios: number;
  // Sem contagem de eventos de outros jogadores: um número ao vivo que sobe quando alguém age por perto seria
  // indicador de presença. Ela fica só no arquivo de diagnóstico.
}

export interface EstadoCaptura {
  fase: FaseCaptura;
  mensagem: string | null;
  interfaces: number;
  npcapVersao: string | null;
  tabela: TabelaInfo;
  identificado: boolean;
  /** ms desde 1970 */
  ultimoPacoteEm: number | null;
  diagnostico: boolean;
  arquivoDiagnostico: string | null;
  numeros: NumerosCaptura;
}

export interface ItemLoot {
  /** Índice numérico do item no jogo. */
  indice: number;
  /** Ex.: T4_BAG, T5_2H_BOW@1; null sem a lista de itens do ao-bin-dumps. */
  itemId: string | null;
  quantidade: number;
}

export interface ZonaSessao {
  id: string;
  /** Nome do mapa (em inglês, do ao-bin-dumps). */
  nome: string | null;
}

export interface RetratoSessao {
  /** ms desde 1970 */
  iniciadaEm: number;
  /** ms desde 1970 em que o Rust gerou este retrato */
  geradoEm: number;
  /** Tempo com a captura ligada e o jogo mandando pacote (ms); jogo fechado não conta. */
  duracaoMs: number;
  /** Contando tempo agora (tráfego do jogo nos últimos segundos). */
  ativa: boolean;
  zona: ZonaSessao | null;
  prata: number;
  fama: number;
  mortes: number;
  saldoVariacao: number | null;
  loot: ItemLoot[];
  ultimoLootEm: number | null;
  fatos: number;
  ultimoFatoEm: number | null;
}

/** Escolha do usuário, no store `captura.json`, chave `captura`. O Rust confere `avisoAceitoEm` antes de ligar. */
export interface PrefCaptura {
  ligada: boolean;
  /** ISO de quando o usuário leu e aceitou o aviso; null = nunca. */
  avisoAceitoEm: string | null;
  diagnostico: boolean;
}
