// Definições dos comandos de barra do bot Guarita (formato da API do Discord v10).
// O Worker usa os nomes/constantes; scripts/register-commands.mjs registra COMMANDS no Discord.
// Sem import de runtime aqui: o script de registro empacota este arquivo isolado com esbuild.
//
// Espanhol: name_localizations/description_localizations para es-ES e es-419 (o cliente do Discord mostra o nome e
// a descrição na língua de quem usa). O nome-base continua o português: a interação sempre chega com ele
// (data.name e options[].name), então o roteamento em interactions.ts não muda com a língua.

/** Tipos de opção da API do Discord. */
export const OPT = { SUB_COMMAND: 1, SUB_COMMAND_GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, CHANNEL: 7, NUMBER: 10 } as const;

/** Locales do Discord que recebem a tradução em espanhol (o mesmo texto nos dois). */
export const ES_LOCALES = ['es-ES', 'es-419'] as const;
export type Localizations = Partial<Record<(typeof ES_LOCALES)[number], string>>;

/** O mesmo texto em espanhol para es-ES e es-419. */
export function es(text: string): Localizations {
  return { 'es-ES': text, 'es-419': text };
}

/** /hoje: limites da prata e escolhas de tempo (mesmos de worker/api/hoje.ts LIMITS e da tela /hoje). */
export const HOJE_PRATA_MIN = 1_000;
export const HOJE_PRATA_MAX = 100_000_000_000;
export const HOJE_MINUTOS = [30, 60, 120] as const;

// Cópia literal de shared/quality.ts (este arquivo não importa nada em runtime; tests/discord.test.ts confere
// que as duas tabelas são iguais).
export const QUALITY_NAMES: Record<number, string> = {
  1: 'Normal',
  2: 'Bom',
  3: 'Excepcional',
  4: 'Excelente',
  5: 'Obra-prima',
};
// Cópia literal de QUALITY_LABEL_ES (src/lib/format.ts), os nomes do cliente do jogo em espanhol (docs/glossario-es.md).
export const QUALITY_NAMES_ES: Record<number, string> = {
  1: 'Normal',
  2: 'Bueno',
  3: 'Notable',
  4: 'Sobresaliente',
  5: 'Obra maestra',
};

/** Cidades aceitas em /alerta criar (mesmos valores de City em shared/types.ts). */
export const ALERT_CITIES = [
  'Bridgewatch',
  'Caerleon',
  'Fort Sterling',
  'Lymhurst',
  'Martlock',
  'Thetford',
  'Brecilien',
  'Black Market',
] as const;

export const CONDITIONS = {
  abaixo: 'Preço abaixo do valor',
  acima: 'Preço acima do valor',
  abaixo_mediana: 'Valor % abaixo da mediana de 7 dias da cidade',
} as const;
export type ConditionKey = keyof typeof CONDITIONS;
export const CONDITIONS_ES: Record<ConditionKey, string> = {
  abaixo: 'Precio por debajo del valor',
  acima: 'Precio por encima del valor',
  abaixo_mediana: 'Valor % por debajo de la mediana de 7 días de la ciudad',
};

export interface CommandChoice {
  name: string;
  name_localizations?: Localizations;
  value: string | number;
}

export interface CommandOption {
  type: number;
  name: string;
  name_localizations?: Localizations;
  description: string;
  description_localizations?: Localizations;
  required?: boolean;
  autocomplete?: boolean;
  choices?: CommandChoice[];
  min_value?: number;
  max_value?: number;
  max_length?: number;
  /** Só em opção CHANNEL: tipos de canal aceitos (0 = texto, 5 = anúncios). */
  channel_types?: number[];
  options?: CommandOption[];
}

export interface CommandDef {
  name: string;
  name_localizations?: Localizations;
  description: string;
  description_localizations?: Localizations;
  type?: 1;
  options?: CommandOption[];
  /** 0 = instalado no servidor. */
  integration_types?: number[];
  /** 0 = servidor, 1 = DM com o bot. */
  contexts?: number[];
}

const qualidade: CommandOption = {
  type: OPT.INTEGER,
  name: 'qualidade',
  name_localizations: es('calidad'),
  description: 'Qualidade do item (padrão: Normal)',
  description_localizations: es('Calidad del objeto (por defecto: Normal)'),
  choices: Object.entries(QUALITY_NAMES).map(([v, name]) => ({ name, name_localizations: es(QUALITY_NAMES_ES[Number(v)]), value: Number(v) })),
};

const item: CommandOption = {
  type: OPT.STRING,
  name: 'item',
  name_localizations: es('objeto'),
  description: 'Nome do item em português ou inglês (ex.: bolsa do adepto 4.1)',
  description_localizations: es('Nombre del objeto en español o inglés (ej.: bolsa del iniciado 4.1)'),
  required: true,
  autocomplete: true,
  max_length: 100,
};

const nome: CommandOption = {
  type: OPT.STRING,
  name: 'nome',
  name_localizations: es('nombre'),
  description: 'Nome do personagem no servidor Americas',
  description_localizations: es('Nombre del personaje en el servidor Americas'),
  required: true,
  max_length: 32,
};

const GUILD_NAME: CommandOption = {
  type: OPT.STRING,
  name: 'nome',
  name_localizations: es('nombre'),
  description: 'Nome exato da guilda no servidor Americas (com os espaços)',
  description_localizations: es('Nombre exacto del gremio en el servidor Americas (con los espacios)'),
  max_length: 64,
};

const base = { type: 1 as const, integration_types: [0], contexts: [0, 1] };

export const COMMANDS: CommandDef[] = [
  {
    ...base,
    name: 'preco',
    name_localizations: es('precio'),
    description: 'Preço do item em cada cidade, com idade do dado, selo de confiança e flip para o Black Market',
    description_localizations: es('Precio del objeto en cada ciudad, con antigüedad del dato, confianza y reventa al Mercado Negro'),
    options: [item, qualidade],
  },
  {
    ...base,
    name: 'relogio',
    name_localizations: es('reloj'),
    description: 'Servidor, bônus e festividades, ouro, Premium em prata e fim da temporada',
    description_localizations: es('Servidor, bonificaciones y festividades, oro, Premium en plata y fin de la temporada'),
  },
  {
    ...base,
    name: 'dossie',
    name_localizations: es('dosier'),
    description: 'Dossiê público de um jogador: perigo, guilda, fama, armas e últimas lutas',
    description_localizations: es('Dosier público de un jugador: peligro, gremio, fama, armas y últimos combates'),
    options: [nome],
  },
  {
    ...base,
    name: 'morte',
    name_localizations: es('muerte'),
    description: 'Autópsia da última morte de um jogador: quem matou, lições e custo para repor',
    description_localizations: es('Autopsia de la última muerte de un jugador: quién lo mató, lecciones y costo de reponer'),
    options: [nome],
  },
  {
    ...base,
    name: 'alerta',
    description: 'Alertas de preço por mensagem direta (checados a cada 5 minutos)',
    description_localizations: es('Alertas de precio por mensaje directo (revisadas cada 5 minutos)'),
    options: [
      {
        type: OPT.SUB_COMMAND,
        name: 'criar',
        name_localizations: es('crear'),
        description: 'Cria um alerta de preço',
        description_localizations: es('Crea una alerta de precio'),
        options: [
          item,
          {
            type: OPT.STRING,
            name: 'cidade',
            name_localizations: es('ciudad'),
            description: 'Cidade a vigiar',
            description_localizations: es('Ciudad que vigilar'),
            required: true,
            choices: ALERT_CITIES.map((c) => (c === 'Black Market' ? { name: c, name_localizations: es('Mercado Negro'), value: c } : { name: c, value: c })),
          },
          {
            type: OPT.STRING,
            name: 'condicao',
            name_localizations: es('condicion'),
            description: 'Quando avisar',
            description_localizations: es('Cuándo avisar'),
            required: true,
            choices: Object.entries(CONDITIONS).map(([value, name]) => ({ name, name_localizations: es(CONDITIONS_ES[value as ConditionKey]), value })),
          },
          {
            type: OPT.NUMBER,
            name: 'valor',
            description: 'Preço em prata (ou porcentagem de 1 a 90, na condição da mediana)',
            description_localizations: es('Precio en plata (o porcentaje de 1 a 90, en la condición de la mediana)'),
            required: true,
            min_value: 1,
          },
          qualidade,
        ],
      },
      {
        type: OPT.SUB_COMMAND,
        name: 'listar',
        description: 'Lista os seus alertas',
        description_localizations: es('Muestra tus alertas'),
      },
      {
        type: OPT.SUB_COMMAND,
        name: 'apagar',
        name_localizations: es('borrar'),
        description: 'Apaga um dos seus alertas',
        description_localizations: es('Borra una de tus alertas'),
        options: [
          {
            type: OPT.STRING,
            name: 'id',
            description: 'Identificador do alerta (aparece em /alerta listar)',
            description_localizations: es('Identificador de la alerta (aparece en /alerta listar)'),
            required: true,
            autocomplete: true,
            max_length: 64,
          },
        ],
      },
    ],
  },
  {
    ...base,
    name: 'perdas',
    name_localizations: es('perdidas'),
    description: 'Itens mais perdidos no PvP do Americas, com preço atual e valor perdido',
    description_localizations: es('Objetos más perdidos en el PvP de Americas, con precio actual y valor perdido'),
    options: [
      {
        type: OPT.INTEGER,
        name: 'dias',
        name_localizations: es('periodo'),
        description: 'Janela (padrão: hoje)',
        description_localizations: es('Período (por defecto: hoy)'),
        choices: [
          { name: 'Hoje', name_localizations: es('Hoy'), value: 1 },
          { name: 'Últimos 7 dias', name_localizations: es('Últimos 7 días'), value: 7 },
        ],
      },
    ],
  },
  {
    ...base,
    // Só em servidor: o killfeed e o regear vivem num canal da guilda.
    contexts: [0],
    name: 'guilda',
    name_localizations: es('gremio'),
    description: 'Killfeed, regear e resumo da sua guilda do Albion neste servidor',
    description_localizations: es('Killfeed, regear y resumen de tu gremio de Albion en este servidor'),
    options: [
      {
        type: OPT.SUB_COMMAND,
        name: 'configurar',
        description: 'Liga o killfeed de uma guilda num canal (exige Gerenciar Servidor)',
        description_localizations: es('Activa el killfeed de un gremio en un canal (requiere Gestionar servidor)'),
        options: [
          { ...GUILD_NAME, required: true },
          {
            type: OPT.CHANNEL,
            name: 'canal',
            description: 'Canal de texto onde as kills e mortes vão aparecer',
            description_localizations: es('Canal de texto donde aparecerán los asesinatos y las muertes'),
            required: true,
            channel_types: [0, 5],
          },
        ],
      },
      {
        type: OPT.SUB_COMMAND_GROUP,
        name: 'feed',
        description: 'Liga ou desliga o killfeed deste servidor (exige Gerenciar Servidor)',
        description_localizations: es('Activa o desactiva el killfeed de este servidor (requiere Gestionar servidor)'),
        options: [
          {
            type: OPT.SUB_COMMAND,
            name: 'ligar',
            name_localizations: es('activar'),
            description: 'Volta a postar as kills e mortes da guilda no canal configurado',
            description_localizations: es('Vuelve a publicar los asesinatos y las muertes del gremio en el canal configurado'),
          },
          {
            type: OPT.SUB_COMMAND,
            name: 'desligar',
            name_localizations: es('desactivar'),
            description: 'Pausa o killfeed sem apagar a configuração',
            description_localizations: es('Pausa el killfeed sin borrar la configuración'),
          },
        ],
      },
      {
        type: OPT.SUB_COMMAND,
        name: 'resumo',
        name_localizations: es('resumen'),
        description: 'Kills, mortes, quem mais mata, armas e horários dos últimos dias',
        description_localizations: es('Asesinatos, muertes, quién mata más, armas y horarios de los últimos días'),
        options: [
          {
            ...GUILD_NAME,
            description: 'Nome exato da guilda (padrão: a configurada neste servidor)',
            description_localizations: es('Nombre exacto del gremio (por defecto: el configurado en este servidor)'),
          },
        ],
      },
    ],
  },
  {
    ...base,
    name: 'hoje',
    name_localizations: es('hoy'),
    description: 'O que fazer hoje com a sua prata e o seu tempo: flip, refino e transporte com a conta aberta',
    description_localizations: es('Qué hacer hoy con tu plata y tu tiempo: reventa, refinado y transporte con el cálculo a la vista'),
    options: [
      {
        type: OPT.INTEGER,
        name: 'prata',
        name_localizations: es('plata'),
        description: 'Quanta prata você quer usar (ex.: 1000000 para 1 milhão)',
        description_localizations: es('Cuánta plata quieres usar (ej.: 1000000 para 1 millón)'),
        required: true,
        min_value: HOJE_PRATA_MIN,
        max_value: HOJE_PRATA_MAX,
      },
      {
        type: OPT.INTEGER,
        name: 'minutos',
        description: 'Quanto tempo você tem (padrão: 60 minutos)',
        description_localizations: es('Cuánto tiempo tienes (por defecto: 60 minutos)'),
        choices: HOJE_MINUTOS.map((m) => ({ name: `${m} minutos`, value: m })),
      },
      {
        type: OPT.BOOLEAN,
        name: 'premium',
        description: 'Você tem Premium? Muda o imposto sobre a venda (padrão: não)',
        description_localizations: es('¿Tienes Premium? Cambia el impuesto sobre la venta (por defecto: no)'),
      },
    ],
  },
  {
    ...base,
    name: 'ajuda',
    name_localizations: es('ayuda'),
    description: 'Como usar a Guarita no Discord',
    description_localizations: es('Cómo usar Guarita en Discord'),
  },
];

/**
 * Nome do comando como quem lê vê no Discord ("/preco" em português, "/precio" em espanhol), para os textos de ajuda
 * e de erro. `path` é o nome-base com subcomandos ("guilda feed desligar"); parte sem tradução fica igual.
 */
export function commandName(path: string, loc: 'pt' | 'es' = 'pt'): string {
  if (loc !== 'es') return `/${path}`;
  const [top, ...rest] = path.split(' ');
  const cmd = COMMANDS.find((c) => c.name === top);
  const parts = [cmd?.name_localizations?.['es-419'] ?? top];
  let options = cmd?.options;
  for (const r of rest) {
    const o = options?.find((x) => x.name === r && (x.type === OPT.SUB_COMMAND || x.type === OPT.SUB_COMMAND_GROUP));
    parts.push(o?.name_localizations?.['es-419'] ?? r);
    options = o?.options;
  }
  return `/${parts.join(' ')}`;
}
