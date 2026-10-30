// Configuração persistente do app (tauri-plugin-store, arquivo `config.json` na pasta de dados do app, chave `config`).
// Uma chave só, objeto inteiro: todas as janelas leem e escrevem o mesmo store, e a mudança chega às outras pelo
// evento do plugin (onKeyChange). O Rust lê `avisoSbiAceitoEm` daqui antes de ligar "sempre por cima".
//
// Padrões que são regra do produto (testados em tests/config.test.ts):
// - iniciarComWindows: false (o usuário liga na tela de ajustes; ver autostart.ts);
// - toda janela nasce com porCima: false e o aviso da SBI não aceito;
// - atalhos globais vazios (atalho padrão poderia colidir com tecla do jogo; o usuário escolhe);
// - lente desligada.
import type { AlertCondition, AlertRule, City, Quality, Timer, TimerKind } from '../../../shared/types';
import { MEDIAN_PCT_MAX, MEDIAN_PCT_MIN, sideAllowsCities } from '../../../shared/alertLimits';
import { PAINEL, WIDGET_LABELS, clampOpacity, isTauri, type WindowLabel } from './windows';
import { LENTE_URL_PADRAO, normalizarUrlLente } from './lens/aodpWs';
import { normalizarPrefLingua, type PrefLingua } from './i18n.svelte';

export const CONFIG_STORE = 'config.json';
export const CONFIG_KEY = 'config';

export type AcaoAtalho = 'abrirPreco' | 'abrirDossie' | 'alternarWidgets' | 'silenciarVoz';
export const ACOES_ATALHO: AcaoAtalho[] = ['abrirPreco', 'abrirDossie', 'alternarWidgets', 'silenciarVoz'];

export interface ConfigVoz {
  ligada: boolean;
  /** Nome da voz do Windows (SpeechSynthesisVoice.name); null = primeira voz pt-BR disponível. */
  voz: string | null;
  /** 0 a 1. */
  volume: number;
  /** 0,5 a 2. */
  velocidade: number;
}

export interface ConfigAvisos {
  notificacao: boolean;
  som: boolean;
  /** festividade = bônus novo começou (mostrado como "Bônus começou"). */
  relogio: { bonusAcabando: boolean; servidor: boolean; temporada: boolean; festividade: boolean };
}

/** Um aviso de regra local que já tocou (lista curta para a tela de alertas mostrar o histórico). */
export interface DisparoRegistrado {
  regraId: string;
  /** ISO UTC. */
  quando: string;
  mensagem: string;
}

/** Quantos disparos o histórico guarda (os mais novos primeiro). */
export const MAX_DISPAROS = 50;

export interface JanelaCfg {
  /** Reabrir ao iniciar o app (widgets). */
  aberta: boolean;
  /** "Sempre por cima" pedido pelo usuário; só vale com o aviso da SBI aceito. */
  porCima: boolean;
  /** Opacidade do fundo (0,35 a 1). */
  opacidade: number;
}

/** Regra de preço local: checada pelo app aberto (engine/alerts.ts), nunca pelo servidor. */
export type RegraLocal = Omit<AlertRule, 'channel' | 'owner'> & {
  ativa: boolean;
  /** Falar o aviso em voz alta. */
  voz: boolean;
};

/** Despertador local (engine/timers.ts). */
export type TimerLocal = Omit<Timer, 'owner'>;

export interface ConfigLente {
  ligada: boolean;
  /** Websocket do cliente oficial do Albion Data Project (EnableWebsockets). */
  url: string;
}

export interface GuaritaConfig {
  versao: 1;
  atalhos: Record<AcaoAtalho, string | null>;
  voz: ConfigVoz;
  avisos: ConfigAvisos;
  /** Minutos entre duas checagens das regras locais (2 a 5). */
  intervaloRegrasMin: number;
  regras: RegraLocal[];
  /** Histórico dos últimos disparos das regras locais, mais novo primeiro (até MAX_DISPAROS). */
  disparos: DisparoRegistrado[];
  timers: TimerLocal[];
  janelas: Record<WindowLabel, JanelaCfg>;
  /** ISO de quando o usuário leu e aceitou o aviso da regra de 2020 da SBI; null = nunca. */
  avisoSbiAceitoEm: string | null;
  iniciarComWindows: boolean;
  /** Fechar o painel esconde na bandeja (true) ou encerra o app (false, padrão). */
  fecharParaBandeja: boolean;
  lente: ConfigLente;
  /** Avisos do relógio já dados, para não repetir a cada abertura do app (engine/clock.ts). */
  avisosRelogio: AvisosRelogioDados;
  /** Língua da interface: 'auto' (a do Windows, padrão), 'pt' ou 'es' (lib/i18n.svelte.ts). O Rust lê também. */
  lingua: PrefLingua;
}

export interface AvisosRelogioDados {
  /** Último marco de fim de temporada avisado (`<fim>|<marco>`), ou null. */
  temporada: string | null;
  /** Chaves dos bônus já avisados como "acabando" (mais novo primeiro, até MAX_BONUS_AVISADOS). */
  bonus: string[];
}

export const MAX_BONUS_AVISADOS = 20;

// Websocket do cliente AODP: ws://localhost:8099/ws (o servidor do cliente só atende em /ws). Fonte única em lens/aodpWs.ts.
export { LENTE_URL_PADRAO };

export function defaultConfig(): GuaritaConfig {
  const janela = (): JanelaCfg => ({ aberta: false, porCima: false, opacidade: 1 });
  const janelas = { [PAINEL]: janela() } as Record<WindowLabel, JanelaCfg>;
  for (const l of WIDGET_LABELS) janelas[l] = janela();
  return {
    versao: 1,
    atalhos: { abrirPreco: null, abrirDossie: null, alternarWidgets: null, silenciarVoz: null },
    voz: { ligada: true, voz: null, volume: 1, velocidade: 1 },
    avisos: { notificacao: true, som: true, relogio: { bonusAcabando: true, servidor: true, temporada: true, festividade: true } },
    intervaloRegrasMin: 3,
    regras: [],
    disparos: [],
    timers: [],
    janelas,
    avisoSbiAceitoEm: null,
    iniciarComWindows: false,
    fecharParaBandeja: false,
    lente: { ligada: false, url: LENTE_URL_PADRAO },
    avisosRelogio: { temporada: null, bonus: [] },
    lingua: 'auto',
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const strOrNull = (v: unknown, d: string | null) => (typeof v === 'string' && v ? v : v === null ? null : d);

// ---------- regras, timers e disparos, item a item ----------
// Mesmos limites do site e do core (shared/alertLimits.ts, guarita-core/src/rules.ts), para uma regra criada aqui
// valer igual se um dia for enviada ao servidor.

export const MAX_REGRAS_LOCAIS = 50;
export const MAX_TIMERS_LOCAIS = 50;
export const COOLDOWN_MIN_MIN = 5;
export const COOLDOWN_MAX_MIN = 7 * 24 * 60;
export const PRECO_MAX = 2_000_000_000;

const CIDADES: readonly City[] = ['Bridgewatch', 'Caerleon', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Brecilien', 'Black Market'];
const TIPOS_TIMER: readonly TimerKind[] = ['plantacao', 'animal', 'foco', 'outro'];
const ITEM_ID_RE = /^[A-Z0-9_]{2,80}(@[0-9])?$/;
const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const limpo = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');

function lista<T>(v: unknown, fn: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    const ok = fn(x);
    if (ok) out.push(ok);
  }
  return out;
}

function semRepetir<T extends { id: string }>(xs: T[]): T[] {
  const vistos = new Set<string>();
  return xs.filter((x) => !vistos.has(x.id) && vistos.add(x.id));
}

/** Regra local válida, ou null (campo estragado, cidade desconhecida, Black Market no lado de compra barata...). */
export function normalizarRegraLocal(raw: unknown): RegraLocal | null {
  if (!isObj(raw)) return null;
  const id = limpo(raw.id, 64);
  const itemId = limpo(raw.itemId, 82).toUpperCase();
  if (!id || !ITEM_ID_RE.test(itemId)) return null;
  const quality = raw.quality ?? 1;
  if (!Number.isInteger(quality) || (quality as number) < 1 || (quality as number) > 5) return null;
  if (!Array.isArray(raw.cities) || !raw.cities.length) return null;
  const cities: City[] = [];
  for (const c of raw.cities) {
    if (!CIDADES.includes(c as City)) return null;
    if (!cities.includes(c as City)) cities.push(c as City);
  }
  const side = raw.side ?? 'sell';
  if (side !== 'sell' && side !== 'buy') return null;
  if (!sideAllowsCities(side, cities)) return null;
  const c = isObj(raw.condition) ? raw.condition : null;
  let condition: AlertCondition;
  if (c && (c.kind === 'below' || c.kind === 'above')) {
    if (typeof c.price !== 'number' || !Number.isFinite(c.price) || c.price < 1 || c.price > PRECO_MAX) return null;
    condition = { kind: c.kind, price: Math.round(c.price) };
  } else if (c && c.kind === 'belowMedianPct') {
    if (typeof c.pct !== 'number' || !Number.isFinite(c.pct) || c.pct < MEDIAN_PCT_MIN || c.pct > MEDIAN_PCT_MAX) return null;
    condition = { kind: 'belowMedianPct', pct: Math.round(c.pct) };
  } else return null;
  const cooldownMin = Math.round(num(raw.cooldownMin, 60, COOLDOWN_MIN_MIN, COOLDOWN_MAX_MIN));
  const regra: RegraLocal = {
    id,
    itemId,
    quality: quality as Quality,
    cities,
    side,
    condition,
    cooldownMin,
    createdAt: isIso(raw.createdAt) ? raw.createdAt : new Date(0).toISOString(),
    ativa: bool(raw.ativa, true),
    voz: bool(raw.voz, true),
  };
  const nome = limpo(raw.itemName, 120);
  if (nome) regra.itemName = nome;
  if (isIso(raw.lastFiredAt)) regra.lastFiredAt = raw.lastFiredAt;
  return regra;
}

/** Despertador local válido, ou null. */
export function normalizarTimerLocal(raw: unknown): TimerLocal | null {
  if (!isObj(raw)) return null;
  const id = limpo(raw.id, 64);
  if (!id || !isIso(raw.endsAt)) return null;
  const t: TimerLocal = {
    id,
    kind: TIPOS_TIMER.includes(raw.kind as TimerKind) ? (raw.kind as TimerKind) : 'outro',
    label: limpo(raw.label, 80),
    endsAt: raw.endsAt,
    createdAt: isIso(raw.createdAt) ? raw.createdAt : raw.endsAt,
  };
  if (isIso(raw.firedAt)) t.firedAt = raw.firedAt;
  return t;
}

function normalizarDisparo(raw: unknown): DisparoRegistrado | null {
  if (!isObj(raw) || !isIso(raw.quando)) return null;
  const regraId = limpo(raw.regraId, 64);
  const mensagem = limpo(raw.mensagem, 300);
  return regraId && mensagem ? { regraId, quando: raw.quando, mensagem } : null;
}

/** Lê qualquer coisa vinda do disco e devolve uma config válida (campo faltando ou estragado volta ao padrão). */
export function normalizeConfig(raw: unknown): GuaritaConfig {
  const d = defaultConfig();
  if (!isObj(raw)) return d;
  const at = isObj(raw.atalhos) ? raw.atalhos : {};
  const vz = isObj(raw.voz) ? raw.voz : {};
  const av = isObj(raw.avisos) ? raw.avisos : {};
  const rel = isObj(av.relogio) ? av.relogio : {};
  const jn = isObj(raw.janelas) ? raw.janelas : {};
  const le = isObj(raw.lente) ? raw.lente : {};
  const ar = isObj(raw.avisosRelogio) ? raw.avisosRelogio : {};

  const janelas = { ...d.janelas };
  for (const l of Object.keys(d.janelas) as WindowLabel[]) {
    const j = isObj(jn[l]) ? (jn[l] as Record<string, unknown>) : {};
    janelas[l] = {
      aberta: bool(j.aberta, false),
      porCima: bool(j.porCima, false),
      opacidade: clampOpacity(num(j.opacidade, 1, 0, 1)),
    };
  }
  const atalhos = { ...d.atalhos };
  for (const a of ACOES_ATALHO) atalhos[a] = strOrNull(at[a], null);

  return {
    versao: 1,
    atalhos,
    voz: {
      ligada: bool(vz.ligada, d.voz.ligada),
      voz: strOrNull(vz.voz, null),
      volume: num(vz.volume, d.voz.volume, 0, 1),
      velocidade: num(vz.velocidade, d.voz.velocidade, 0.5, 2),
    },
    avisos: {
      notificacao: bool(av.notificacao, d.avisos.notificacao),
      som: bool(av.som, d.avisos.som),
      relogio: {
        bonusAcabando: bool(rel.bonusAcabando, true),
        servidor: bool(rel.servidor, true),
        temporada: bool(rel.temporada, true),
        festividade: bool(rel.festividade, true),
      },
    },
    intervaloRegrasMin: num(raw.intervaloRegrasMin, d.intervaloRegrasMin, 2, 5),
    // Item a item: o que estiver estragado sai (nunca derruba a config inteira); id repetido fica só o primeiro.
    regras: semRepetir(lista(raw.regras, normalizarRegraLocal)).slice(0, MAX_REGRAS_LOCAIS),
    disparos: lista(raw.disparos, normalizarDisparo).slice(0, MAX_DISPAROS),
    timers: semRepetir(lista(raw.timers, normalizarTimerLocal)).slice(0, MAX_TIMERS_LOCAIS),
    janelas,
    avisoSbiAceitoEm: strOrNull(raw.avisoSbiAceitoEm, null),
    iniciarComWindows: bool(raw.iniciarComWindows, false),
    fecharParaBandeja: bool(raw.fecharParaBandeja, false),
    lente: {
      ligada: bool(le.ligada, false),
      // Só ws://localhost:8099 (a CSP libera só essa origem); sem caminho vira /ws.
      url: normalizarUrlLente(le.url),
    },
    avisosRelogio: {
      temporada: strOrNull(ar.temporada, null),
      bonus: (Array.isArray(ar.bonus) ? ar.bonus : [])
        .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 300)
        .slice(0, MAX_BONUS_AVISADOS),
    },
    lingua: normalizarPrefLingua(raw.lingua),
  };
}

// ---------- persistência ----------

/** Onde a config mora. No app: tauri-plugin-store; no navegador e nos testes: memória. */
export interface ConfigBackend {
  read(): Promise<unknown>;
  write(value: GuaritaConfig): Promise<void>;
  /** Avisa quando outra janela gravou; devolve a função para parar de ouvir. */
  watch(cb: (value: unknown) => void): Promise<() => void>;
}

export function memoryBackend(initial?: unknown): ConfigBackend {
  let value = initial;
  const subs = new Set<(v: unknown) => void>();
  return {
    read: async () => value,
    write: async (v) => {
      value = structuredClone(v);
      for (const s of subs) s(value);
    },
    watch: async (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

async function tauriBackend(): Promise<ConfigBackend> {
  const { load } = await import('@tauri-apps/plugin-store');
  const store = await load(CONFIG_STORE, { autoSave: 200, defaults: {} });
  return {
    read: () => store.get(CONFIG_KEY),
    write: async (v) => {
      await store.set(CONFIG_KEY, v);
      await store.save();
    },
    watch: (cb) => store.onKeyChange(CONFIG_KEY, cb),
  };
}

let backend: ConfigBackend | null = null;
let current: GuaritaConfig = defaultConfig();
let loaded: Promise<GuaritaConfig> | null = null;
const listeners = new Set<(c: GuaritaConfig) => void>();

function publish(c: GuaritaConfig) {
  current = c;
  for (const l of listeners) l(c);
}

/** Troca o backend (testes). Zera o estado carregado. */
export function setConfigBackend(b: ConfigBackend | null): void {
  backend = b;
  loaded = null;
  current = defaultConfig();
}

/** Carrega uma vez por janela e passa a ouvir mudanças feitas pelas outras janelas. */
export function loadConfig(): Promise<GuaritaConfig> {
  if (!loaded) {
    loaded = (async () => {
      if (!backend) backend = isTauri() ? await tauriBackend() : memoryBackend();
      const c = normalizeConfig(await backend.read());
      publish(c);
      await backend.watch((v) => publish(normalizeConfig(v)));
      return c;
    })();
  }
  return loaded;
}

/** Última config conhecida (padrão até loadConfig terminar). */
export function getConfig(): GuaritaConfig {
  return current;
}

let fila: Promise<unknown> = Promise.resolve();

/**
 * Altera a config: recebe uma cópia, muda o que quiser e devolve (ou só muta). Grava e avisa as janelas.
 * Parte do valor GRAVADO (o store do lado Rust, que todas as janelas dividem), não do retrato desta janela: assim
 * uma gravação não apaga o que outra janela acabou de gravar (ex.: o `lastFiredAt` de um disparo). Dentro da
 * janela, as gravações entram em fila, uma por vez.
 */
export function updateConfig(fn: (draft: GuaritaConfig) => GuaritaConfig | void): Promise<GuaritaConfig> {
  const vez = fila.then(async () => {
    await loadConfig();
    const draft = normalizeConfig(await backend!.read());
    const next = normalizeConfig(fn(draft) ?? draft);
    publish(next);
    await backend!.write(next);
    return next;
  });
  fila = vez.catch(() => {});
  return vez;
}

/** Ouve mudanças (desta janela ou de outra). Chama já com o valor atual. Devolve a função para parar. */
export function onConfigChange(cb: (c: GuaritaConfig) => void): () => void {
  listeners.add(cb);
  cb(current);
  return () => listeners.delete(cb);
}
