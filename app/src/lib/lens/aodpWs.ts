// Lente de mercado (experimental, desligada por padrão): se o usuário rodar o cliente OFICIAL do Albion Data
// Project com websocket ligado (EnableWebsockets), o app só ESCUTA o que esse cliente publica e mostra o preço nas
// outras cidades do item aberto no mercado. A Guarita não captura rede, não lê o jogo e não manda nada ao cliente
// (nem uma mensagem: o servidor do cliente fecha a conexão com qualquer coisa acima de 512 bytes).
// Sem cliente rodando: estado "sem-cliente" e a tela explica como ligar.
//
// Formato conferido no código do cliente (github.com/ao-data/albiondata-client, 30/10/2026):
// - o servidor é `http.HandleFunc("/ws")` em `:8099`, então a URL é ws://localhost:8099/ws (sem /ws dá 404);
// - cada mensagem é `{"topic": "<tópico>", "data": <o mesmo JSON enviado ao AODP>}`; mensagens que chegam juntas
//   vêm no mesmo quadro separadas por "\n" (writePump do gorilla/websocket);
// - mercado: tópico `marketorders.ingest`, `data.Orders[]` com ItemTypeId (já com "@N" do encantamento),
//   LocationId (texto: "3005", "BLACKBANK-3003", "0000-HellDen", "3005-Auction2", "x@3005"), QualityLevel,
//   UnitPriceSilver (multiplicado por 10000 pelo jogo; o servidor do AODP divide), Amount, AuctionType
//   ("offer" = ordem de venda, "request" = ordem de compra);
// - tópicos privados (`marketnotifications`, `skills`) também passam pelo websocket com nome e id do personagem:
//   são descartados aqui, nunca guardados nem registrados em log;
// - o cliente só aceita o handshake se o hostname do Origin estiver em AllowedWebsocketHosts: no app instalado
//   é `tauri.localhost`; no `tauri dev`, `localhost`. Recusado ou fechado, o navegador vê o mesmo erro (1006).
import type { City, Quality } from '../../../../shared/types';

export type EstadoLente = 'desligada' | 'conectando' | 'conectada' | 'sem-cliente' | 'erro';

export interface OfertaVista {
  itemId: string;
  city: City | null;
  quality: Quality;
  /** Prata por unidade (o jogo manda multiplicado por 10000; já dividido). */
  price: number;
  amount: number;
  kind: 'sell' | 'buy';
  /** ISO UTC de quando o cliente viu (chegada da mensagem). */
  at: string;
}

/** Websocket do cliente oficial (porta fixa do cliente; a CSP do app só libera esta origem). */
export const LENTE_URL_PADRAO = 'ws://localhost:8099/ws';
export const TOPICO_MERCADO = 'marketorders.ingest';
/** O jogo manda UnitPriceSilver multiplicado por 10000 (o AODP divide no servidor). */
export const FATOR_PRECO = 10_000;
/** Espera entre tentativas, em ms (a última se repete enquanto a lente estiver ligada). */
export const ESPERAS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000] as const;
/** Quadro maior que isso é descartado sem ler (o maior lote real do mercado fica bem abaixo). */
const MAX_QUADRO = 2_000_000;

/**
 * URL válida da lente: só ws://localhost:8099 (é o que a CSP libera). Sem caminho, acrescenta /ws (o padrão antigo
 * do esqueleto, "ws://localhost:8099", dava 404 no cliente). Qualquer outra coisa volta ao padrão.
 */
export function normalizarUrlLente(v: unknown): string {
  if (typeof v !== 'string') return LENTE_URL_PADRAO;
  const m = /^ws:\/\/localhost:8099(\/[A-Za-z0-9._~\-/]*)?$/.exec(v.trim());
  if (!m) return LENTE_URL_PADRAO;
  const caminho = m[1] && m[1] !== '/' ? m[1] : '/ws';
  return `ws://localhost:8099${caminho}`;
}

// ---------- local do mercado → cidade ----------

const CIDADE_POR_LOCAL: Record<number, City> = {
  7: 'Thetford',
  1002: 'Lymhurst',
  2004: 'Bridgewatch',
  3003: 'Black Market',
  3005: 'Caerleon',
  3008: 'Martlock',
  4002: 'Fort Sterling',
  5003: 'Brecilien',
};
/** Portais das cidades reais caem na cidade (mesma tabela do servidor do AODP). */
const PORTAL: Record<number, number> = { 301: 7, 1301: 1002, 2301: 2004, 3301: 3008, 4301: 4002, 3013: 3005 };
/** Toca do Inferno (HellDen) → mercado da cidade. "3003-HellDen" é o de Caerleon, não o Black Market. */
const HELLDEN: Record<string, number> = {
  '0000-HellDen': 7,
  '1000-HellDen': 1002,
  '2000-HellDen': 2004,
  '3004-HellDen': 3008,
  '3003-HellDen': 3005,
  '4000-HellDen': 4002,
  '5000-HellDen': 5003,
};

/** Cidade do LocationId do cliente; null para esconderijo de contrabandista, posto avançado ou formato novo. */
export function cidadeDoLocal(loc: unknown): City | null {
  let n: number | null = null;
  if (typeof loc === 'number' && Number.isInteger(loc)) n = loc;
  else if (typeof loc === 'string') {
    let id = loc.trim();
    if (id.endsWith('-Auction2')) id = id.slice(0, -'-Auction2'.length);
    else if (id.endsWith('-HellDen')) {
      const h = HELLDEN[id];
      if (h === undefined) return null;
      id = String(h);
    } else if (id.includes('@')) id = id.slice(id.indexOf('@') + 1).replace('BLACKBANK-', '');
    else if (id.startsWith('BLACKBANK-')) id = id.slice('BLACKBANK-'.length);
    if (/^\d+$/.test(id)) n = Number(id);
  }
  if (n === null) return null;
  return CIDADE_POR_LOCAL[PORTAL[n] ?? n] ?? null;
}

// ---------- mensagens ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function oferta(o: unknown, at: string): OfertaVista | null {
  if (!isObj(o)) return null;
  const itemId = typeof o.ItemTypeId === 'string' ? o.ItemTypeId.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_@]+$/.test(itemId)) return null;
  const bruto = o.UnitPriceSilver;
  if (typeof bruto !== 'number' || !Number.isFinite(bruto) || bruto <= 0) return null;
  const kind = o.AuctionType === 'offer' ? 'sell' : o.AuctionType === 'request' ? 'buy' : null;
  if (!kind) return null;
  const q = typeof o.QualityLevel === 'number' && Number.isFinite(o.QualityLevel) ? Math.round(o.QualityLevel) : 1;
  const amount = typeof o.Amount === 'number' && Number.isFinite(o.Amount) && o.Amount > 0 ? Math.round(o.Amount) : 1;
  return {
    itemId,
    city: cidadeDoLocal(o.LocationId),
    quality: Math.min(5, Math.max(1, q)) as Quality,
    price: Math.round(bruto / FATOR_PRECO),
    amount,
    kind,
    at,
  };
}

/**
 * Converte um quadro do websocket do cliente AODP em ofertas; null se não houver mensagem de mercado no quadro.
 * Aceita várias mensagens no mesmo quadro (separadas por "\n"); linha estragada ou de outro tópico é ignorada.
 */
export function parseMensagemAodp(raw: string, agora: Date = new Date()): OfertaVista[] | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_QUADRO) return null;
  const at = agora.toISOString();
  let achou = false;
  const ofertas: OfertaVista[] = [];
  for (const linha of raw.split('\n')) {
    const t = linha.trim();
    if (!t || !t.includes(TOPICO_MERCADO)) continue; // nem faz parse de tópico privado
    let msg: unknown;
    try {
      msg = JSON.parse(t);
    } catch {
      continue;
    }
    if (!isObj(msg) || msg.topic !== TOPICO_MERCADO || !isObj(msg.data) || !Array.isArray(msg.data.Orders)) continue;
    achou = true;
    for (const o of msg.data.Orders) {
      const v = oferta(o, at);
      if (v) ofertas.push(v);
    }
  }
  return achou ? ofertas : null;
}

/** O item aberto no mercado: todas as ofertas do quadro são do mesmo item. Lista de categoria (vários) → null. */
export function itemUnico(ofertas: readonly OfertaVista[]): string | null {
  if (!ofertas.length) return null;
  const id = ofertas[0].itemId;
  return ofertas.every((o) => o.itemId === id) ? id : null;
}

export interface ResumoVisto {
  city: City | null;
  /** Ordem de venda mais barata vista (o que se paga comprando agora). */
  venda: OfertaVista | null;
  /** Ordem de compra mais alta vista (o que se recebe vendendo agora). */
  compra: OfertaVista | null;
  /** Qualidade para comparar com as outras cidades: a da venda mais barata, senão a da compra mais alta. */
  quality: Quality;
}

/** Resume as ofertas vistas de um item (já filtradas por qualidade, se for o caso). */
export function resumirOfertas(ofertas: readonly OfertaVista[]): ResumoVisto {
  let venda: OfertaVista | null = null;
  let compra: OfertaVista | null = null;
  const contagem = new Map<City | null, number>();
  for (const o of ofertas) {
    contagem.set(o.city, (contagem.get(o.city) ?? 0) + 1);
    if (o.kind === 'sell' && (!venda || o.price < venda.price)) venda = o;
    if (o.kind === 'buy' && (!compra || o.price > compra.price)) compra = o;
  }
  let city: City | null = null;
  let max = 0;
  for (const [c, n] of contagem) if (n > max) [city, max] = [c, n];
  return { city, venda, compra, quality: venda?.quality ?? compra?.quality ?? 1 };
}

// ---------- conexão ----------

/** O mínimo do WebSocket que a lente usa (o global do WebView2 serve; os testes injetam um falso). */
export interface SocketLike {
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}
export type SocketCtor = new (url: string) => SocketLike;

export interface LenteOpts {
  url?: string;
  /** Injeção para testes. */
  WebSocketImpl?: SocketCtor | typeof WebSocket;
  agora?: () => Date;
}

export interface Lente {
  conectar(url?: string): void;
  desconectar(): void;
  estado(): EstadoLente;
  onEstado(cb: (e: EstadoLente) => void): () => void;
  /** Item aberto no mercado do jogo (o último que o cliente AODP publicou) e as ofertas vistas. */
  onItemAberto(cb: (itemId: string, ofertas: OfertaVista[]) => void): () => void;
  /** Quando será a próxima tentativa (ms desde epoch), ou null se não há tentativa marcada. */
  proximaTentativa(): number | null;
}

export function criarLente(opts: LenteOpts = {}): Lente {
  const agora = opts.agora ?? (() => new Date());
  let url = normalizarUrlLente(opts.url);
  let estado: EstadoLente = 'desligada';
  let ligada = false;
  let ws: SocketLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let proxima: number | null = null;
  let falhas = 0;
  const subsEstado = new Set<(e: EstadoLente) => void>();
  const subsItem = new Set<(itemId: string, ofertas: OfertaVista[]) => void>();

  function mudar(e: EstadoLente) {
    if (e === estado) return;
    estado = e;
    for (const cb of subsEstado) cb(e);
  }

  function limparTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    proxima = null;
  }

  function soltar(s: SocketLike | null) {
    if (!s) return;
    s.onopen = s.onclose = s.onerror = s.onmessage = null;
    try {
      s.close();
    } catch {
      /* já fechado */
    }
  }

  function agendar() {
    limparTimer();
    if (!ligada) return;
    const espera = ESPERAS_MS[Math.min(falhas, ESPERAS_MS.length - 1)];
    falhas++;
    proxima = agora().getTime() + espera;
    timer = setTimeout(() => {
      timer = null;
      proxima = null;
      abrir();
    }, espera);
  }

  function abrir() {
    if (!ligada) return;
    const Impl = (opts.WebSocketImpl ?? (globalThis as { WebSocket?: SocketCtor }).WebSocket) as SocketCtor | undefined;
    if (!Impl) {
      mudar('erro');
      return;
    }
    let s: SocketLike;
    try {
      s = new Impl(url);
    } catch {
      mudar('erro');
      agendar();
      return;
    }
    ws = s;
    let abriu = false;
    s.onopen = () => {
      abriu = true;
      falhas = 0;
      mudar('conectada');
    };
    s.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      const ofertas = parseMensagemAodp(ev.data, agora());
      if (!ofertas?.length) return;
      const id = itemUnico(ofertas);
      if (!id) return;
      for (const cb of subsItem) cb(id, ofertas);
    };
    s.onerror = () => {
      /* o close vem logo depois; é ele que decide o estado */
    };
    s.onclose = () => {
      if (ws === s) ws = null;
      if (!ligada) return;
      // Fechou sem abrir: cliente fechado, websocket desligado no config.yaml ou origem não autorizada
      // (o navegador não distingue). Caiu depois de aberta: o cliente foi fechado ou reiniciado.
      mudar(abriu ? 'erro' : 'sem-cliente');
      agendar();
    };
  }

  return {
    conectar(novaUrl?: string) {
      if (novaUrl !== undefined) url = normalizarUrlLente(novaUrl);
      limparTimer();
      soltar(ws);
      ws = null;
      ligada = true;
      falhas = 0;
      mudar('conectando');
      abrir();
    },
    desconectar() {
      ligada = false;
      limparTimer();
      soltar(ws);
      ws = null;
      falhas = 0;
      mudar('desligada');
    },
    estado: () => estado,
    onEstado(cb) {
      subsEstado.add(cb);
      return () => void subsEstado.delete(cb);
    },
    onItemAberto(cb) {
      subsItem.add(cb);
      return () => void subsItem.delete(cb);
    },
    proximaTentativa: () => proxima,
  };
}
