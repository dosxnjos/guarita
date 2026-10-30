// Página /status: transparência de custos e saúde. Dados fixos (custo, limites do plano grátis, fontes, planos) e a
// leitura de /api/health, tudo puro e testado em tests/institucional.test.ts, menos fetchHealth (rede).
// Números do plano grátis da Cloudflare conferidos na documentação oficial (Workers e Durable Objects, "Limits" e
// "Pricing"), 30/10/2026. Se a Cloudflare mudar os limites, mudar aqui e em docs/ARQUITETURA.md ("Limites").
import type { Locale } from '../i18n/core';

type Bi = readonly [pt: string, es: string];
const pick = (b: Bi, loc: Locale) => (loc === 'es' ? b[1] : b[0]);

export interface Linha {
  /** Nome do recurso ou do limite. */
  nome: string;
  valor: string;
  /** O que isso significa para a Guarita. */
  nota: string;
}

/** Os limites do plano grátis que de fato moldam a Guarita (o resto do plano sobra). */
const LIMITES: readonly [nome: Bi, valor: Bi, nota: Bi][] = [
  [
    ['Requisições ao Worker', 'Solicitudes al Worker'],
    ['100 mil por dia', '100 mil por día'],
    ['Cada página aberta, consulta de preço, comando do bot e verificação de alerta conta uma. É o limite que mais pesa.',
      'Cada página abierta, consulta de precio, comando del bot y revisión de alerta cuenta una. Es el límite que más pesa.'],
  ],
  [
    ['CPU por requisição', 'CPU por solicitud'],
    ['10 ms', '10 ms'],
    ['Tempo de processamento de cada pedido. Por isso a Guarita trabalha em lotes pequenos e guarda respostas em cache.',
      'Tiempo de procesamiento de cada solicitud. Por eso la Guarita trabaja en lotes pequeños y guarda respuestas en caché.'],
  ],
  [
    ['Chamadas externas por requisição', 'Llamadas externas por solicitud'],
    ['50', '50'],
    ['Quantas fontes de fora (AODP, killboard) um pedido pode consultar. Listas grandes são cortadas por isso.',
      'Cuántas fuentes externas (AODP, killboard) puede consultar una solicitud. Por eso se recortan las listas grandes.'],
  ],
  [
    ['Durable Objects: linhas lidas', 'Durable Objects: filas leídas'],
    ['5 milhões por dia', '5 millones por día'],
    ['Leituras do banco onde ficam os alertas, os lembretes e a amostra do killboard.',
      'Lecturas de la base donde están las alertas, los recordatorios y la muestra del killboard.'],
  ],
  [
    ['Durable Objects: linhas escritas', 'Durable Objects: filas escritas'],
    ['100 mil por dia', '100 mil por día'],
    ['Cada morte guardada do killboard e cada alerta criado ou disparado escreve linhas.',
      'Cada muerte guardada del killboard y cada alerta creada o disparada escribe filas.'],
  ],
  [
    ['Durable Objects: armazenamento', 'Durable Objects: almacenamiento'],
    ['5 GB', '5 GB'],
    ['Espaço total do banco. A amostra do killboard é a parte que cresce.',
      'Espacio total de la base. La muestra del killboard es la parte que crece.'],
  ],
];

export function limites(loc: Locale): Linha[] {
  return LIMITES.map(([n, v, x]) => ({ nome: pick(n, loc), valor: pick(v, loc), nota: pick(x, loc) }));
}

export interface Fonte {
  dado: string;
  fonte: string;
  url: string;
  nota: string;
}

const FONTES: readonly [dado: Bi, fonte: Bi, url: string, nota: Bi][] = [
  [
    ['Preços, histórico e ouro', 'Precios, historial y oro'],
    ['Albion Online Data Project (comunitário)', 'Albion Online Data Project (comunitario)'],
    'https://www.albion-online-data.com/',
    ['Jogadores enviam os preços que veem no mercado. Onde ninguém olha há horas, o preço envelhece.',
      'Los jugadores envían los precios que ven en el mercado. Donde nadie mira desde hace horas, el precio envejece.'],
  ],
  [
    ['Jogadores, guildas e perdas PvP', 'Jugadores, gremios y pérdidas PvP'],
    ['API pública do killboard oficial', 'API pública del killboard oficial'],
    'https://albiononline.com/killboard',
    ['Com atraso de minutos. A Guarita guarda uma amostra para as estatísticas de perdas e de guilda.',
      'Con minutos de retraso. La Guarita guarda una muestra para las estadísticas de pérdidas y de gremios.'],
  ],
  [
    ['Status do servidor', 'Estado del servidor'],
    ['Página pública de status do Albion', 'Página pública de estado de Albion'],
    'https://serverstatus.albiononline.com/',
    ['Só diz se o servidor está no ar.', 'Solo indica si el servidor está en línea.'],
  ],
  [
    ['Nomes e dados dos itens', 'Nombres y datos de los objetos'],
    ['ao-bin-dumps (dados públicos do jogo)', 'ao-bin-dumps (datos públicos del juego)'],
    'https://github.com/ao-data/ao-bin-dumps',
    ['Nomes em português e espanhol, tiers e encantamentos. Os ícones vêm do servidor oficial de imagens do jogo.',
      'Nombres en portugués y español, tiers y encantamientos. Los íconos vienen del servidor oficial de imágenes del juego.'],
  ],
];

export function fontes(loc: Locale): Fonte[] {
  return FONTES.map(([d, f, url, n]) => ({ dado: pick(d, loc), fonte: pick(f, loc), url, nota: pick(n, loc) }));
}

export interface Plano {
  titulo: string;
  custo: string;
  ganho: string;
}

/** O que custaria evoluir. Nada disso está contratado: é a régua para a decisão, se um dia for preciso. */
const PLANOS: readonly [titulo: Bi, custo: Bi, ganho: Bi][] = [
  [
    ['Servidor próprio pequeno', 'Servidor propio pequeño'],
    ['US$ 5 a 10 por mês', 'US$ 5 a 10 al mes'],
    ['Alertas conferidos a cada segundo em vez de a cada 5 minutos e o killboard completo, sem amostra.',
      'Alertas revisadas cada segundo en lugar de cada 5 minutos y el killboard completo, sin muestra.'],
  ],
  [
    ['Plano pago da Cloudflare', 'Plan de pago de Cloudflare'],
    ['US$ 5 por mês', 'US$ 5 al mes'],
    ['10 milhões de requisições por mês e mais tempo de CPU por pedido: folga para crescer sem mudar nada no código.',
      '10 millones de solicitudes al mes y más tiempo de CPU por solicitud: margen para crecer sin cambiar nada en el código.'],
  ],
  [
    ['Domínio próprio', 'Dominio propio'],
    ['cerca de R$ 40 por ano (.com.br)', 'unos R$ 40 al año (.com.br)'],
    ['Um endereço mais curto que guarita.pages.dev. O endereço atual continuaria funcionando.',
      'Una dirección más corta que guarita.pages.dev. La dirección actual seguiría funcionando.'],
  ],
];

export function planos(loc: Locale): Plano[] {
  return PLANOS.map(([t, c, g]) => ({ titulo: pick(t, loc), custo: pick(c, loc), ganho: pick(g, loc) }));
}

// ---------- saúde ao vivo (/api/health) ----------

/** Os crons do motor rodam a cada 5 minutos; sem marca há mais que isso, o motor está atrasado. */
export const CRON_ATRASO_MIN = 15;

export type Tom = 'good' | 'warn' | 'bad';

export interface SaudeView {
  /** A API respondeu (o Worker está de pé). */
  api: boolean;
  /** O motor de alertas (Durable Object) respondeu. */
  motor: boolean;
  /** Última execução do cron (ISO) ou null. */
  ultimoCron: string | null;
  /** Qual trabalho foi o último: alertas, killboard ou os dois. */
  trabalho: 'alerts' | 'killboard' | 'both' | null;
  /** O último cron registrou erro em alguma parte. */
  erroNoCron: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Lê a resposta de /api/health: { ok, hub: { ok, lastCron: { v: JSON do resumo, at } | null } | { error }, at }.
 * Tolerante: forma inesperada vira "não respondeu", nunca exceção. Pura.
 */
export function parseHealth(json: unknown): SaudeView {
  const out: SaudeView = { api: false, motor: false, ultimoCron: null, trabalho: null, erroNoCron: false };
  if (!isObj(json)) return out;
  out.api = json.ok === true;
  const hub = json.hub;
  if (!isObj(hub) || hub.ok !== true) return out;
  out.motor = true;
  const last = hub.lastCron;
  if (!isObj(last)) return out;
  if (typeof last.at === 'string' && Number.isFinite(Date.parse(last.at))) out.ultimoCron = last.at;
  if (typeof last.v === 'string') {
    try {
      const v: unknown = JSON.parse(last.v);
      if (isObj(v)) {
        if (v.job === 'alerts' || v.job === 'killboard' || v.job === 'both') out.trabalho = v.job;
        out.erroNoCron = [v.alerts, v.killboard].some((p) => isObj(p) && typeof p.error === 'string');
      }
    } catch {
      /* resumo ilegível: fica só a data */
    }
  }
  return out;
}

/** Tom do motor: verde com cron recente e sem erro; amarelo atrasado ou com erro; vermelho sem resposta. Pura. */
export function tomMotor(s: SaudeView, now = Date.now()): Tom {
  if (!s.motor) return 'bad';
  if (!s.ultimoCron) return 'warn';
  const min = (now - Date.parse(s.ultimoCron)) / 60000;
  return min > CRON_ATRASO_MIN || s.erroNoCron ? 'warn' : 'good';
}

/** Busca /api/health com tempo limite. Falha de rede ou resposta estranha = tudo fora (sem exceção). */
export async function fetchHealth(fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<SaudeView> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetcher('/api/health', { headers: { accept: 'application/json' }, signal: ctrl.signal });
    return parseHealth(r.ok ? await r.json() : null);
  } catch {
    return parseHealth(null);
  } finally {
    clearTimeout(t);
  }
}
