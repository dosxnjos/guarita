// Catálogo das ferramentas do servidor MCP (módulo e da Fase 2). Sem nenhum import de propósito: o front
// (src/routes/McpInfo.svelte) lê esta lista para mostrar as ferramentas sem puxar o código do Worker para o bundle.

export const MCP_URL = 'https://guarita.pages.dev/mcp';
export const MCP_SERVER_NAME = 'guarita';
/** 0.3.0: argumento opcional `lingua` ('pt' | 'es') em todas as ferramentas e descrições bilíngues. */
export const MCP_SERVER_VERSION = '0.3.0';

/** Versões do protocolo que o servidor entende, da mais nova para a mais antiga. */
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

/** Limite best-effort por IP (memória do isolate; ver worker/mcp/server.ts). */
export const MCP_CALLS_PER_MIN = 60;

export interface JsonSchemaProp {
  type: 'string' | 'integer' | 'boolean';
  description: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: number[] | string[];
  default?: number | boolean | string;
}

export interface McpToolDef {
  name: string;
  title: string;
  /** Descrição em PT-BR (a página /mcp em português mostra esta; o tools/list manda "pt / es"). */
  description: string;
  /** Resumo curto em espanhol: o tools/list junta com a descrição em português ("… / …"). */
  descriptionEs: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProp>;
    required?: string[];
    additionalProperties: false;
  };
  annotations: { title: string; readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: true };
  /** Exemplo curto de pergunta em PT-BR (só para a página /mcp). */
  example: string;
}

function annotations(title: string): McpToolDef['annotations'] {
  return { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
}

/** Línguas aceitas pelo argumento `lingua` de todas as ferramentas. */
export const MCP_LINGUAS = ['pt', 'es'] as const;
export type McpLingua = (typeof MCP_LINGUAS)[number];

/** Argumento opcional comum a todas as ferramentas: a língua da resposta (texto e mensagens de erro). */
export const LINGUA_PROP: JsonSchemaProp = {
  type: 'string',
  description:
    'Língua da resposta: "pt" (português do Brasil, padrão) ou "es" (espanhol). / ' +
    'Idioma de la respuesta: "pt" (portugués, predeterminado) o "es" (español).',
  enum: [...MCP_LINGUAS],
  default: 'pt',
};

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: 'buscar_item',
    title: 'Buscar item',
    description:
      'Procura itens do Albion Online pelo nome em português ou inglês (ex.: "bolsa adepto", "espada larga t6", ' +
      '"T4_BAG@1") e devolve até 10 resultados com o id interno e o nome em PT-BR. Use antes de preco_item quando ' +
      'não souber o id exato. Tier pode vir como número (t4, 4.1) ou nome (adepto, mestre).',
    descriptionEs:
      'Busca objetos por nombre (en español con lingua "es", o en portugués o inglés) y devuelve hasta 10 con el id ' +
      'interno. Úsala antes de preco_item si no sabes el id.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Nome ou id do item. Pelo menos uma palavra com 3 letras. / Nombre o id del objeto.', minLength: 3, maxLength: 80 },
        lingua: LINGUA_PROP,
      },
      required: ['consulta'],
      additionalProperties: false,
    },
    annotations: annotations('Buscar item'),
    example: 'Qual é o id da Bolsa do Adepto encantada 1?',
  },
  {
    name: 'preco_item',
    title: 'Preço do item',
    description:
      'Preço atual de um item no mercado do servidor Americas: menor venda e maior compra por cidade, idade do dado, ' +
      'mediana de 7 dias, faixa normal, veredito (barato, normal, caro) e o melhor flip para o Black Market. ' +
      'Dado do Albion Data Project, enviado por jogadores: pode ter minutos ou horas de atraso; confirme no jogo.',
    descriptionEs:
      'Precio actual de un objeto en Americas por ciudad (venta más baja, compra más alta, antigüedad del dato), mediana ' +
      'de 7 días, veredicto y la mejor reventa al Mercado Negro. Datos enviados por jugadores: confírmalos en el juego.',
    inputSchema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Id do item (ex.: T4_BAG@1) ou nome (ex.: "bolsa do adepto 4.1"). / Id u nombre del objeto.', minLength: 2, maxLength: 80 },
        qualidade: {
          type: 'integer',
          description: 'Qualidade: 1 Normal, 2 Bom, 3 Excepcional, 4 Excelente, 5 Obra-prima. Padrão 1. / Calidad: 1 Normal, 2 Bueno, 3 Notable, 4 Sobresaliente, 5 Obra maestra.',
          minimum: 1,
          maximum: 5,
          default: 1,
        },
        lingua: LINGUA_PROP,
      },
      required: ['item'],
      additionalProperties: false,
    },
    annotations: annotations('Preço do item'),
    example: 'Quanto está a Bolsa do Adepto 4.1 e onde compro mais barato?',
  },
  {
    name: 'relogio',
    title: 'Relógio do Americas',
    description:
      'Status do servidor Americas, bônus e festividades ativos, cotação do ouro, preço do Premium em prata e fim ' +
      'aproximado da temporada. Datas em horário de Brasília.',
    descriptionEs:
      'Estado del servidor Americas, bonificaciones y festividades activas, cotización del oro, precio del Premium en ' +
      'plata y fin aproximado de la temporada. Fechas en hora de Brasilia.',
    inputSchema: { type: 'object', properties: { lingua: LINGUA_PROP }, additionalProperties: false },
    annotations: annotations('Relógio do Americas'),
    example: 'O servidor está online? Quanto está o ouro hoje?',
  },
  {
    name: 'dossie_jogador',
    title: 'Dossiê de jogador',
    description:
      'Dossiê público de um jogador do Americas pelo killboard oficial: guilda, fama, armas mais usadas, estilo ' +
      '(solo ou em grupo), últimas kills e mortes e uma nota de perigo. O killboard oficial é lento: a resposta pode ' +
      'levar até 1 minuto. Dado histórico, nunca a posição atual do jogador.',
    descriptionEs:
      'Dosier público de un jugador de Americas según el killboard oficial: gremio, fama, armas, estilo, últimos ' +
      'asesinatos y muertes y una nota de peligro. Puede tardar hasta 1 minuto. Historial, nunca la posición actual.',
    inputSchema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do personagem (de 3 a 16 caracteres no jogo). / Nombre del personaje.', minLength: 3, maxLength: 32 },
        lingua: LINGUA_PROP,
      },
      required: ['nome'],
      additionalProperties: false,
    },
    annotations: annotations('Dossiê de jogador'),
    example: 'Me mostra o dossiê do jogador (nome do personagem).',
  },
  {
    name: 'perdas_pvp',
    title: 'Itens mais perdidos no PvP',
    description:
      'Itens mais perdidos no PvP do Americas (killboard coletado pela Guarita) com o preço atual e o valor total ' +
      'perdido nas mortes (parte é saqueada, não destruída): bom para achar o que craftar e vender. Janela de 1 ' +
      '(hoje, UTC) a 7 dias.',
    descriptionEs:
      'Objetos más perdidos en PvP en Americas (killboard recopilado por Guarita) con el precio actual y el valor ' +
      'perdido: útil para decidir qué fabricar y vender. Ventana de 1 (hoy, UTC) a 7 días.',
    inputSchema: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Janela em dias, de 1 (hoje) a 7. Padrão 1. / Ventana en días, de 1 (hoy) a 7.', minimum: 1, maximum: 7, default: 1 },
        lingua: LINGUA_PROP,
      },
      additionalProperties: false,
    },
    annotations: annotations('Itens mais perdidos no PvP'),
    example: 'Quais itens mais se perderam no PvP esta semana? O que vale a pena craftar?',
  },
  {
    name: 'o_que_fazer',
    title: 'O que fazer hoje',
    description:
      'Sugere o que fazer com a prata e o tempo do jogador no Americas, com dado ao vivo do Albion Data Project: até 3 ' +
      'opções por trilha (flip para o Black Market, refino na cidade com bônus e o bônus do dia, transporte entre ' +
      'cidades), cada uma com passos, conta aberta (compra, venda, taxas, lucro), selo de confiança de 0 a 100, idade ' +
      'dos preços e riscos de rota. É estimativa, não promessa de lucro: os preços vêm de jogadores e mudam rápido.',
    descriptionEs:
      'Sugiere qué hacer hoy con la plata y el tiempo del jugador en Americas: reventa al Mercado Negro, refinado con ' +
      'bonificación y transporte entre ciudades, con pasos, cálculo abierto, confianza y riesgos. Es una estimación, ' +
      'no una promesa de ganancia.',
    inputSchema: {
      type: 'object',
      properties: {
        prata: { type: 'integer', description: 'Prata disponível (ex.: 1000000 para 1 milhão). / Plata disponible.', minimum: 1_000, maximum: 100_000_000_000 },
        // Mesmas opções do site (/hoje) e do bot (/hoje): o link devolvido reproduz a mesma conta.
        minutos: { type: 'integer', description: 'Tempo disponível em minutos: 30, 60 ou 120 (as mesmas opções do site e do bot). Padrão 60. / Tiempo disponible en minutos.', enum: [30, 60, 120], default: 60 },
        premium: { type: 'boolean', description: 'Se o jogador tem Premium (imposto de venda de 4% em vez de 8%). Padrão false. / Si el jugador tiene Premium.', default: false },
        lingua: LINGUA_PROP,
      },
      required: ['prata'],
      additionalProperties: false,
    },
    annotations: annotations('O que fazer hoje'),
    example: 'Tenho 5 milhões de prata e uma hora, sem Premium. O que dá para fazer hoje?',
  },
];
