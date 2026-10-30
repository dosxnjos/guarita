// Definições dos comandos de barra do bot Guarita (formato da API do Discord v10).
// O Worker usa os nomes/constantes; scripts/register-commands.mjs registra COMMANDS no Discord.
// Sem import de runtime aqui: o script de registro empacota este arquivo isolado com esbuild.

/** Tipos de opção da API do Discord. */
export const OPT = { SUB_COMMAND: 1, STRING: 3, INTEGER: 4, NUMBER: 10 } as const;

// Cópia literal de shared/quality.ts (este arquivo não importa nada em runtime; tests/discord.test.ts confere
// que as duas tabelas são iguais).
export const QUALITY_NAMES: Record<number, string> = {
  1: 'Normal',
  2: 'Bom',
  3: 'Excepcional',
  4: 'Excelente',
  5: 'Obra-prima',
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

export interface CommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: boolean;
  choices?: { name: string; value: string | number }[];
  min_value?: number;
  max_value?: number;
  max_length?: number;
  options?: CommandOption[];
}

export interface CommandDef {
  name: string;
  description: string;
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
  description: 'Qualidade do item (padrão: Normal)',
  choices: Object.entries(QUALITY_NAMES).map(([v, name]) => ({ name, value: Number(v) })),
};

const item: CommandOption = {
  type: OPT.STRING,
  name: 'item',
  description: 'Nome do item em português ou inglês (ex.: bolsa do adepto 4.1)',
  required: true,
  autocomplete: true,
  max_length: 100,
};

const nome: CommandOption = {
  type: OPT.STRING,
  name: 'nome',
  description: 'Nome do personagem no servidor Americas',
  required: true,
  max_length: 32,
};

const base = { type: 1 as const, integration_types: [0], contexts: [0, 1] };

export const COMMANDS: CommandDef[] = [
  {
    ...base,
    name: 'preco',
    description: 'Preço do item em cada cidade, com idade do dado, selo de confiança e flip para o Black Market',
    options: [item, qualidade],
  },
  {
    ...base,
    name: 'relogio',
    description: 'Servidor, bônus e festividades, ouro, Premium em prata e fim da temporada',
  },
  {
    ...base,
    name: 'dossie',
    description: 'Dossiê público de um jogador: perigo, guilda, fama, armas e últimas lutas',
    options: [nome],
  },
  {
    ...base,
    name: 'morte',
    description: 'Autópsia da última morte de um jogador: quem matou, lições e custo para repor',
    options: [nome],
  },
  {
    ...base,
    name: 'alerta',
    description: 'Alertas de preço por mensagem direta (checados a cada 5 minutos)',
    options: [
      {
        type: OPT.SUB_COMMAND,
        name: 'criar',
        description: 'Cria um alerta de preço',
        options: [
          item,
          {
            type: OPT.STRING,
            name: 'cidade',
            description: 'Cidade a vigiar',
            required: true,
            choices: ALERT_CITIES.map((c) => ({ name: c, value: c })),
          },
          {
            type: OPT.STRING,
            name: 'condicao',
            description: 'Quando avisar',
            required: true,
            choices: Object.entries(CONDITIONS).map(([value, name]) => ({ name, value })),
          },
          {
            type: OPT.NUMBER,
            name: 'valor',
            description: 'Preço em prata (ou porcentagem de 1 a 90, na condição da mediana)',
            required: true,
            min_value: 1,
          },
          qualidade,
        ],
      },
      { type: OPT.SUB_COMMAND, name: 'listar', description: 'Lista os seus alertas' },
      {
        type: OPT.SUB_COMMAND,
        name: 'apagar',
        description: 'Apaga um dos seus alertas',
        options: [
          {
            type: OPT.STRING,
            name: 'id',
            description: 'Identificador do alerta (aparece em /alerta listar)',
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
    name: 'ajuda',
    description: 'Como usar a Guarita no Discord',
  },
];
