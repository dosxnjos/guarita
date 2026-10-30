import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ESPERAS_MS,
  LENTE_URL_PADRAO,
  cidadeDoLocal,
  criarLente,
  itemUnico,
  normalizarUrlLente,
  parseMensagemAodp,
  resumirOfertas,
  type EstadoLente,
  type OfertaVista,
  type SocketLike,
} from '../src/lib/lens/aodpWs';

// Ordem no formato do cliente (lib/market.go → MarketOrder), preço multiplicado por 10000 como o jogo manda.
const ordem = (o: Partial<Record<string, unknown>> = {}) => ({
  Id: 1,
  ItemTypeId: 'T4_BAG',
  ItemGroupTypeId: 'T4_BAG',
  LocationId: '3005',
  QualityLevel: 1,
  EnchantmentLevel: 0,
  UnitPriceSilver: 2_490_000,
  Amount: 15,
  AuctionType: 'offer',
  Expires: '2026-11-15T00:24:27.605927',
  ...o,
});
// Envelope de sendMsgToWebSockets: {"topic": "...", "data": <json>}
const msg = (topic: string, data: unknown) => `{"topic": "${topic}", "data": ${JSON.stringify(data)}}`;
const AGORA = new Date('2026-10-30T12:00:00Z');

describe('parseMensagemAodp', () => {
  it('lê ordens de venda e de compra e divide o preço por 10000', () => {
    const r = parseMensagemAodp(
      msg('marketorders.ingest', { Orders: [ordem(), ordem({ AuctionType: 'request', UnitPriceSilver: 1_800_000, Amount: 3 })] }),
      AGORA,
    );
    expect(r).toEqual<OfertaVista[]>([
      { itemId: 'T4_BAG', city: 'Caerleon', quality: 1, price: 249, amount: 15, kind: 'sell', at: AGORA.toISOString() },
      { itemId: 'T4_BAG', city: 'Caerleon', quality: 1, price: 180, amount: 3, kind: 'buy', at: AGORA.toISOString() },
    ]);
  });

  it('aceita várias mensagens no mesmo quadro (separadas por \\n) e ignora linha estragada', () => {
    const quadro = [
      msg('marketorders.ingest', { Orders: [ordem()] }),
      '{quebrado',
      msg('marketorders.ingest', { Orders: [ordem({ AuctionType: 'request' })] }),
    ].join('\n');
    expect(parseMensagemAodp(quadro, AGORA)?.map((o) => o.kind)).toEqual(['sell', 'buy']);
  });

  it('descarta tópicos que não são de mercado, inclusive os privados com nome do personagem', () => {
    expect(parseMensagemAodp(msg('goldprices.ingest', { Prices: [1], Timestamps: [1] }))).toBeNull();
    expect(
      parseMensagemAodp(msg('marketnotifications', { CharacterId: 'abc', CharacterName: 'Fulano', NotificationType: 'SalesNotification' })),
    ).toBeNull();
    expect(parseMensagemAodp(msg('markethistories.ingest', { AlbionId: 1, MarketHistories: [] }))).toBeNull();
    expect(parseMensagemAodp('não é json')).toBeNull();
    expect(parseMensagemAodp('')).toBeNull();
  });

  it('pula ordem inválida, limita a qualidade e mantém o encantamento do id', () => {
    const r = parseMensagemAodp(
      msg('marketorders.ingest', {
        Orders: [
          ordem({ UnitPriceSilver: 0 }),
          ordem({ AuctionType: 'outra' }),
          ordem({ ItemTypeId: '' }),
          ordem({ ItemTypeId: 't5_main_sword@2', QualityLevel: 9 }),
        ],
      }),
      AGORA,
    );
    expect(r).toHaveLength(1);
    expect(r![0]).toMatchObject({ itemId: 'T5_MAIN_SWORD@2', quality: 5 });
  });
});

describe('cidadeDoLocal', () => {
  it('cidades, Black Market e Brecilien', () => {
    expect(cidadeDoLocal('0007')).toBe('Thetford');
    expect(cidadeDoLocal('1002')).toBe('Lymhurst');
    expect(cidadeDoLocal('2004')).toBe('Bridgewatch');
    expect(cidadeDoLocal('3008')).toBe('Martlock');
    expect(cidadeDoLocal('4002')).toBe('Fort Sterling');
    expect(cidadeDoLocal('3005')).toBe('Caerleon');
    expect(cidadeDoLocal('3003')).toBe('Black Market');
    expect(cidadeDoLocal('5003')).toBe('Brecilien');
    expect(cidadeDoLocal(1002)).toBe('Lymhurst');
  });
  it('portais, Auction2, HellDen, BLACKBANK e @', () => {
    expect(cidadeDoLocal('1301')).toBe('Lymhurst');
    expect(cidadeDoLocal('3013')).toBe('Caerleon');
    expect(cidadeDoLocal('3005-Auction2')).toBe('Caerleon');
    expect(cidadeDoLocal('3003-HellDen')).toBe('Caerleon');
    expect(cidadeDoLocal('0000-HellDen')).toBe('Thetford');
    expect(cidadeDoLocal('9999-HellDen')).toBeNull();
    expect(cidadeDoLocal('BLACKBANK-3003')).toBe('Black Market');
    expect(cidadeDoLocal('xyz@BLACKBANK-2004')).toBe('Bridgewatch');
  });
  it('esconderijo e lixo viram null', () => {
    expect(cidadeDoLocal('307')).toBeNull();
    expect(cidadeDoLocal('')).toBeNull();
    expect(cidadeDoLocal(null)).toBeNull();
    expect(cidadeDoLocal('Caerleon')).toBeNull();
  });
});

describe('itemUnico e resumirOfertas', () => {
  const v = (o: Partial<OfertaVista>): OfertaVista => ({
    itemId: 'T4_BAG', city: 'Martlock', quality: 1, price: 100, amount: 1, kind: 'sell', at: AGORA.toISOString(), ...o,
  });
  it('item aberto só quando todas as ordens são do mesmo item', () => {
    expect(itemUnico([v({}), v({ kind: 'buy' })])).toBe('T4_BAG');
    expect(itemUnico([v({}), v({ itemId: 'T5_BAG' })])).toBeNull();
    expect(itemUnico([])).toBeNull();
  });
  it('venda mais barata, compra mais alta, cidade e qualidade de referência', () => {
    const r = resumirOfertas([
      v({ price: 120, quality: 2 }),
      v({ price: 90, quality: 3 }),
      v({ kind: 'buy', price: 70 }),
      v({ kind: 'buy', price: 80 }),
    ]);
    expect(r.venda?.price).toBe(90);
    expect(r.compra?.price).toBe(80);
    expect(r.city).toBe('Martlock');
    expect(r.quality).toBe(3);
  });
});

describe('normalizarUrlLente', () => {
  it('padrão tem /ws (o cliente só atende nesse caminho)', () => expect(LENTE_URL_PADRAO).toBe('ws://localhost:8099/ws'));
  it('sem caminho ganha /ws; outra origem volta ao padrão', () => {
    expect(normalizarUrlLente('ws://localhost:8099')).toBe('ws://localhost:8099/ws');
    expect(normalizarUrlLente('ws://localhost:8099/')).toBe('ws://localhost:8099/ws');
    expect(normalizarUrlLente('ws://localhost:8099/ws')).toBe('ws://localhost:8099/ws');
    expect(normalizarUrlLente('ws://exemplo.com:8099/ws')).toBe(LENTE_URL_PADRAO);
    expect(normalizarUrlLente('ws://localhost:9000/ws')).toBe(LENTE_URL_PADRAO);
    expect(normalizarUrlLente(42)).toBe(LENTE_URL_PADRAO);
  });
});

// ---------- conexão com WebSocket falso ----------

class FakeSocket implements SocketLike {
  static todos: FakeSocket[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  fechado = false;
  enviados: unknown[] = [];
  constructor(readonly url: string) {
    FakeSocket.todos.push(this);
  }
  send(d: unknown) {
    this.enviados.push(d);
  }
  close() {
    this.fechado = true;
  }
  abrir() {
    this.onopen?.({});
  }
  recusar() {
    this.onerror?.({});
    this.onclose?.({ code: 1006 });
  }
  receber(data: string) {
    this.onmessage?.({ data });
  }
}
const ultimo = () => FakeSocket.todos[FakeSocket.todos.length - 1];

describe('criarLente', () => {
  beforeEach(() => {
    FakeSocket.todos = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('nasce desligada e não abre conexão sozinha', () => {
    const l = criarLente({ WebSocketImpl: FakeSocket });
    expect(l.estado()).toBe('desligada');
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.todos).toHaveLength(0);
  });

  it('sem cliente: estado sem-cliente e tenta de novo com espera crescente', () => {
    const l = criarLente({ WebSocketImpl: FakeSocket });
    const estados: EstadoLente[] = [];
    l.onEstado((e) => estados.push(e));
    l.conectar('ws://localhost:8099');
    expect(ultimo().url).toBe('ws://localhost:8099/ws');
    ultimo().recusar();
    expect(l.estado()).toBe('sem-cliente');
    expect(l.proximaTentativa()).not.toBeNull();
    vi.advanceTimersByTime(ESPERAS_MS[0] - 1);
    expect(FakeSocket.todos).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.todos).toHaveLength(2);
    ultimo().recusar();
    vi.advanceTimersByTime(ESPERAS_MS[1]);
    expect(FakeSocket.todos).toHaveLength(3);
    // a espera para no teto
    for (let i = 0; i < 20; i++) {
      ultimo().recusar();
      vi.advanceTimersByTime(ESPERAS_MS[ESPERAS_MS.length - 1]);
    }
    expect(FakeSocket.todos).toHaveLength(23);
    expect(estados).toEqual(['conectando', 'sem-cliente']);
  });

  it('conecta, avisa o item aberto e nunca manda nada ao cliente', () => {
    const l = criarLente({ WebSocketImpl: FakeSocket, agora: () => AGORA });
    const vistos: [string, number][] = [];
    l.onItemAberto((id, of) => vistos.push([id, of.length]));
    l.conectar();
    ultimo().abrir();
    expect(l.estado()).toBe('conectada');
    // lista de categoria (itens diferentes): não é item aberto
    ultimo().receber(msg('marketorders.ingest', { Orders: [ordem(), ordem({ ItemTypeId: 'T5_BAG' })] }));
    ultimo().receber(msg('goldprices.ingest', { Prices: [] }));
    ultimo().receber(msg('marketorders.ingest', { Orders: [ordem(), ordem({ AuctionType: 'request' })] }));
    expect(vistos).toEqual([['T4_BAG', 2]]);
    expect(ultimo().enviados).toEqual([]);
  });

  it('caiu depois de aberta: erro, e volta a conectar zerando a espera', () => {
    const l = criarLente({ WebSocketImpl: FakeSocket });
    l.conectar();
    ultimo().abrir();
    ultimo().recusar();
    expect(l.estado()).toBe('erro');
    vi.advanceTimersByTime(ESPERAS_MS[0]);
    expect(FakeSocket.todos).toHaveLength(2);
    ultimo().abrir();
    expect(l.estado()).toBe('conectada');
    ultimo().recusar();
    vi.advanceTimersByTime(ESPERAS_MS[0]);
    expect(FakeSocket.todos).toHaveLength(3);
  });

  it('desligar fecha a conexão e cancela a próxima tentativa', () => {
    const l = criarLente({ WebSocketImpl: FakeSocket });
    l.conectar();
    const s = ultimo();
    s.recusar();
    l.desconectar();
    expect(l.estado()).toBe('desligada');
    expect(l.proximaTentativa()).toBeNull();
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.todos).toHaveLength(1);

    l.conectar();
    ultimo().abrir();
    const aberto = ultimo();
    l.desconectar();
    expect(aberto.fechado).toBe(true);
    expect(aberto.onclose).toBeNull();
  });
});
