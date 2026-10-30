import { describe, expect, it } from 'vitest';
import type { PriceRow } from '../../shared/types';
import {
  CHAVE_CODIGOS_ASSINADOS,
  DADOS_IDADE_MAX_MS,
  URL_ASSINATURA,
  URL_CODIGOS,
  codigosAssinados,
  parseItensTxt,
  parseMapasTxt,
  textoComCopia,
  type CopiaTexto,
} from '../src/lib/capture/dados';
import {
  DURACAO_MIN_RITMO_MS,
  duracaoAgora,
  faseLigada,
  fmtDuracao,
  idsParaPreco,
  marcaDoLoot,
  normalizarPref,
  porHora,
  precoEstimado,
  valorLoot,
} from '../src/lib/capture/sessao';
import type { RetratoSessao } from '../src/lib/capture/tipos';
import { WIDGET_LABELS, WIDGET_TITLES } from '../src/lib/windows';

const AGORA = Date.parse('2026-10-30T15:00:00Z');
const linha = (o: Partial<PriceRow>): PriceRow => ({
  id: 'T4_BAG',
  city: 'Martlock',
  quality: 1,
  sellMin: 1000,
  sellMinAt: '2026-10-30T14:00:00Z',
  buyMax: null,
  buyMaxAt: null,
  ...o,
});

const retrato = (o: Partial<RetratoSessao> = {}): RetratoSessao => ({
  iniciadaEm: AGORA - 3_600_000,
  geradoEm: AGORA,
  duracaoMs: 1_800_000,
  ativa: true,
  zona: null,
  prata: 0,
  fama: 0,
  mortes: 0,
  saldoVariacao: null,
  loot: [],
  ultimoLootEm: null,
  fatos: 0,
  ultimoFatoEm: null,
  ...o,
});

describe('ritmo e duração', () => {
  it('por hora só depois de 1 minuto', () => {
    expect(porHora(1000, DURACAO_MIN_RITMO_MS - 1)).toBeNull();
    expect(porHora(1000, 30 * 60_000)).toBe(2000);
    expect(porHora(Number.NaN, 3_600_000)).toBeNull();
  });

  it('duração soma o tempo desde o retrato só com a captura ativa', () => {
    expect(duracaoAgora(retrato(), AGORA + 5000)).toBe(1_805_000);
    expect(duracaoAgora(retrato({ ativa: false }), AGORA + 5000)).toBe(1_800_000);
    expect(duracaoAgora(retrato(), AGORA - 999)).toBe(1_800_000);
  });

  it('marca do loot muda quando o item ganha id (lista de itens chegou depois do loot)', () => {
    const sem = [{ indice: 3, itemId: null, quantidade: 2 }];
    const com = [{ indice: 3, itemId: 'T4_BAG', quantidade: 2 }];
    expect(marcaDoLoot(sem)).not.toBe(marcaDoLoot(com));
    expect(marcaDoLoot(com)).toBe(marcaDoLoot([{ ...com[0] }]));
    expect(marcaDoLoot(com)).not.toBe(marcaDoLoot([{ ...com[0], quantidade: 3 }]));
    expect(marcaDoLoot([])).toBe('');
  });

  it('formata a duração', () => {
    expect(fmtDuracao(45_000)).toBe('45 s');
    expect(fmtDuracao(12 * 60_000)).toBe('12 min');
    expect(fmtDuracao(65 * 60_000)).toBe('1 h 05 min');
  });
});

describe('valor do loot', () => {
  it('mediana da venda nas cidades comuns, sem Black Market nem outra qualidade', () => {
    const rows = [
      linha({ city: 'Martlock', sellMin: 1000 }),
      linha({ city: 'Lymhurst', sellMin: 1400, sellMinAt: '2026-10-30T14:50:00Z' }),
      linha({ city: 'Thetford', sellMin: 9000 }),
      linha({ city: 'Black Market', sellMin: 50 }),
      linha({ city: 'Caerleon', quality: 2, sellMin: 1 }),
      linha({ city: 'Bridgewatch', sellMin: null }),
    ];
    expect(precoEstimado(rows, 't4_bag', AGORA)).toEqual({ preco: 1400, cidades: 3, idadeMin: 10 });
    expect(precoEstimado(rows.slice(0, 2), 'T4_BAG', AGORA)?.preco).toBe(1200);
    expect(precoEstimado(rows, 'T5_BAG', AGORA)).toBeNull();
  });

  it('soma o que tem preço, ordena pelo total e conta os sem preço', () => {
    const rows = [linha({ id: 'T4_BAG', sellMin: 1000 }), linha({ id: 'T5_ORE', sellMin: 50 })];
    const v = valorLoot(
      [
        { indice: 1, itemId: 'T5_ORE', quantidade: 100 },
        { indice: 2, itemId: 'T4_BAG', quantidade: 1 },
        { indice: 3, itemId: null, quantidade: 2 },
        { indice: 4, itemId: 'T8_NADA', quantidade: 1 },
      ],
      rows,
      AGORA,
    );
    expect(v.total).toBe(6000);
    expect(v.semPreco).toBe(2);
    expect(v.linhas.map((l) => l.indice)).toEqual([1, 2, 3, 4]);
    expect(v.linhas[0]).toMatchObject({ unitario: 50, total: 5000 });
  });

  it('ids para preço sem repetir, sem desconhecidos e até 300', () => {
    const loot = Array.from({ length: 320 }, (_, i) => ({ indice: i, itemId: `T4_X${i}`, quantidade: 1 }));
    loot.push({ indice: 999, itemId: 't4_x1', quantidade: 1 }, { indice: 1000, itemId: null as unknown as string, quantidade: 1 });
    const ids = idsParaPreco(loot);
    expect(ids.length).toBe(300);
    expect(new Set(ids).size).toBe(300);
  });
});

describe('dados do ao-bin-dumps', () => {
  it('items.txt vira lista por índice', () => {
    const txt = [
      '   1: UNIQUE_HIDEOUT                                                   : Hideout Construction Kit',
      '   3: T4_2H_TOOL_TRACKING                                              : Adept\'s Tracking Toolkit',
      ' 539: T2_POTION_HEAL@1                                                 : Minor Healing Potion',
      ' 512: T8_CONSUMABLE_SPECIAL_NONTRADABLE@1                              ',
      'lixo',
    ].join('\r\n');
    const l = parseItensTxt(txt);
    expect(l[1]).toBe('UNIQUE_HIDEOUT');
    expect(l[2]).toBe('');
    expect(l[3]).toBe('T4_2H_TOOL_TRACKING');
    expect(l[512]).toBe('T8_CONSUMABLE_SPECIAL_NONTRADABLE@1');
    expect(l[539]).toBe('T2_POTION_HEAL@1');
    expect(l.length).toBe(540);
  });

  it('world.txt vira id → nome', () => {
    const m = parseMapasTxt('3004: Martlock                                \n0004: Swamp Cross   \n3004-HellDen: Antiquarian\'s Den\n');
    expect(m).toEqual({ '3004': 'Martlock', '0004': 'Swamp Cross', '3004-HellDen': "Antiquarian's Den" });
  });

  it('cópia local nova evita a rede; velha tenta a rede e cai na cópia se falhar', async () => {
    const guardado = new Map<string, { texto: string; salvoEm: number }>();
    const copia: CopiaTexto = {
      ler: async (u) => guardado.get(u) ?? null,
      gravar: async (u, texto, salvoEm) => void guardado.set(u, { texto, salvoEm }),
    };
    let chamadas = 0;
    const baixar = async () => {
      chamadas++;
      return `v${chamadas}`;
    };
    expect(await textoComCopia('u', { baixar, copia, agora: () => 0 })).toBe('v1');
    expect(await textoComCopia('u', { baixar, copia, agora: () => 1000 })).toBe('v1');
    expect(chamadas).toBe(1);
    const falha = async () => {
      throw new Error('sem rede');
    };
    expect(await textoComCopia('u', { baixar: falha, copia, agora: () => DADOS_IDADE_MAX_MS + 1 })).toBe('v1');
    await expect(textoComCopia('outra', { baixar: falha, copia, agora: () => 0 })).rejects.toThrow('sem rede');
  });
});

describe('tabela de códigos assinada', () => {
  const memoria = () => {
    const guardado = new Map<string, { texto: string; salvoEm: number }>();
    const copia: CopiaTexto = {
      ler: async (u) => guardado.get(u) ?? null,
      gravar: async (u, texto, salvoEm) => void guardado.set(u, { texto, salvoEm }),
    };
    return { guardado, copia };
  };

  it('baixa a tabela e o .sig da mesma pasta e só guarda o par depois de aceito', async () => {
    const { guardado, copia } = memoria();
    const pedidos: string[] = [];
    const baixar = async (u: string) => {
      pedidos.push(u);
      return u === URL_ASSINATURA ? 'QUJD\n' : '{"versao":2}';
    };
    const b = await codigosAssinados({ baixar, copia, agora: () => 0 });
    expect(URL_ASSINATURA).toBe(`${URL_CODIGOS}.sig`);
    expect(pedidos.sort()).toEqual([URL_CODIGOS, URL_ASSINATURA].sort());
    expect(b).toMatchObject({ json: '{"versao":2}', assinatura: 'QUJD' });
    // Recusada pelo Rust (guardar não chamado): nada guardado, baixa de novo na próxima.
    expect(guardado.size).toBe(0);
    await b.guardar();
    expect(guardado.has(CHAVE_CODIGOS_ASSINADOS)).toBe(true);
    // Não mistura com a cópia da 0.2.0 (tabela solta em URL_CODIGOS).
    expect(guardado.has(URL_CODIGOS)).toBe(false);
    pedidos.length = 0;
    expect(await codigosAssinados({ baixar, copia, agora: () => 1000 })).toMatchObject({ assinatura: 'QUJD' });
    expect(pedidos).toEqual([]);
  });

  it('.sig ausente vira assinatura null (o Rust recusa e registra); sem rede cai na cópia velha', async () => {
    const { copia } = memoria();
    const semSig = async (u: string) => {
      if (u === URL_ASSINATURA) throw new Error('HTTP 404');
      return '{"versao":3}';
    };
    expect(await codigosAssinados({ baixar: semSig, copia, agora: () => 0 })).toMatchObject({ json: '{"versao":3}', assinatura: null });
    const ok = await codigosAssinados({ baixar: async (u) => (u === URL_ASSINATURA ? 'c2ln' : '{"versao":4}'), copia, agora: () => 0 });
    await ok.guardar();
    const falha = async () => {
      throw new Error('sem rede');
    };
    expect(await codigosAssinados({ baixar: falha, copia, agora: () => DADOS_IDADE_MAX_MS + 1 })).toMatchObject({
      json: '{"versao":4}',
      assinatura: 'c2ln',
    });
    await expect(codigosAssinados({ baixar: falha, copia: memoria().copia, agora: () => 0 })).rejects.toThrow('sem rede');
  });
});

describe('escolha do usuário', () => {
  it('desligada por padrão e sem aceite não existe ligada', () => {
    expect(normalizarPref(undefined)).toEqual({ ligada: false, avisoAceitoEm: null, diagnostico: false });
    expect(normalizarPref({ ligada: true, avisoAceitoEm: null })).toMatchObject({ ligada: false });
    expect(normalizarPref({ ligada: true, avisoAceitoEm: 'ontem' })).toMatchObject({ ligada: false, avisoAceitoEm: null });
    expect(normalizarPref({ ligada: true, avisoAceitoEm: '2026-10-30T12:00:00.000Z', diagnostico: true })).toEqual({
      ligada: true,
      avisoAceitoEm: '2026-10-30T12:00:00.000Z',
      diagnostico: true,
    });
  });

  it('fases de "ligada"', () => {
    expect(faseLigada('capturando')).toBe(true);
    expect(faseLigada('aguardando-mapa')).toBe(true);
    expect(faseLigada('sem-npcap')).toBe(false);
    expect(faseLigada('desligada')).toBe(false);
  });
});

describe('widgets novos', () => {
  it('sessao e loot registrados com título', () => {
    expect(WIDGET_LABELS).toContain('sessao');
    expect(WIDGET_LABELS).toContain('loot');
    expect(WIDGET_TITLES.sessao).toBe('Sessão');
    expect(WIDGET_TITLES.loot).toBe('Loot');
  });
});
