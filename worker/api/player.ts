// Módulo (c): /api/player/search, /api/player/:id, /api/player/:id/autopsy. Exporta as funções para o bot.
// Fonte: gameinfo (killboard oficial, via worker/lib/gameinfo.ts) + AODP para o valor do equipamento.
// Pegadinhas da gameinfo tratadas aqui:
//  - numberOfParticipants corta em 4; o tamanho real do grupo vem de groupMemberCount (usa o maior dos dois).
//  - /kills e /deaths trazem só os 10 últimos eventos (qualquer query devolve 502).
//  - Quality 0 em comida e poção; o AODP chama isso de qualidade 1.
import type { Env } from '../env';
import type {
  AutopsyResponse,
  City,
  Danger,
  EventSide,
  GearPiece,
  KillEvent,
  PlayerDossier,
  PlayerHit,
  PlayerSearchResponse,
  PriceRow,
  Quality,
  RebuyLine,
} from '../../shared/types';
import { ROYAL_CITIES, minutesSince } from '../../shared/market';
import { WEAPON_LABEL_ES, WEAPON_LABEL_PT, weaponFamily, type WeaponFamily } from '../../shared/weapons';
import { apiLang, fmtDecL, fmtFameL, fmtIntL, tl, type ApiLang } from '../../shared/lang';
import { aodpPrices } from '../lib/aodp';
import { Budget, GameinfoError, GI_TTL, gameinfoCached, giPath, type GiOptions } from '../lib/gameinfo';

// ---------- formas enxutas (o que vai para o cache) ----------

export interface SlimGear {
  slot: string;
  id: string;
  quality: number;
  count: number;
}
export interface SlimSide {
  id: string;
  name: string;
  guild: string;
  alliance: string;
  ip: number;
  gear: SlimGear[];
}
export interface SlimEvent {
  id: number;
  time: string;
  killer: SlimSide;
  victim: SlimSide;
  /** numberOfParticipants cru (corta em 4): quem causou dano. */
  dealers: number;
  /** Tamanho do grupo: max(numberOfParticipants, groupMemberCount). */
  group: number;
  fame: number;
  area: string | null;
}
export interface SlimPlayer {
  id: string;
  name: string;
  guild: string;
  alliance: string;
  killFame: number;
  deathFame: number;
  pve: Record<string, number>;
  gathering: Record<string, number>;
}

/** Cidades para valorar equipamento: reais + Caerleon (onde o jogador de fato compra). */
export const GEAR_CITIES: City[] = [...ROYAL_CITIES, 'Caerleon'];
const SLOTS = ['MainHand', 'OffHand', 'Head', 'Armor', 'Shoes', 'Bag', 'Cape', 'Mount', 'Potion', 'Food'] as const;
/** Preço visto há mais que isso só entra se não houver nenhum mais novo. */
const FRESH_MIN = 3 * 24 * 60;
/** Margem para a URL de preços caber num só pedido ao AODP (limite 4096 com cidades e qualidades). */
const AODP_IDS_CHARS = 3400;
/** 3 idas à gameinfo × 2 tentativas + 1 ao AODP: sem a 7ª, três novas tentativas zeravam o valor dos sets. */
export const DOSSIER_BUDGET = 7;
/** Mortes (2) + preços da recompra (1) + dossiê do matador sem nova tentativa (3 + 1) = 7, com folga. */
export const AUTOPSY_BUDGET = 12;
const RECENT = 10;

export const MSG_GAMEINFO_DOWN = 'O killboard oficial está lento ou fora do ar; tente de novo em instantes';
export const MSG_NOT_FOUND = 'Jogador não encontrado no killboard do Americas.';
export const MSG_GAMEINFO_DOWN_ES = 'El killboard oficial está lento o fuera de servicio; inténtalo de nuevo en unos instantes';
export const MSG_NOT_FOUND_ES = 'Jugador no encontrado en el killboard de Americas.';

// ---------- utilitários ----------

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** 1350 → "1.350" (es: "1,350"). */
export const fmtInt = (n: number, lang: ApiLang = 'pt') => fmtIntL(n, lang);
/** Fama compacta: 2421977 → "2,4 mi"; 52000 → "52 mil" (es: "2.4 M", "52 mil"). */
export function fmtFame(n: number, lang: ApiLang = 'pt'): string {
  return fmtFameL(n, lang);
}

/** Data da gameinfo (7 a 9 casas de fração) → ISO em ms. */
function isoTime(v: unknown): string {
  const s = str(v);
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : s;
}

// ---------- normalização ----------

export function normalizeSearch(raw: unknown, q = ''): PlayerHit[] {
  const list = Array.isArray(obj(raw).players) ? (obj(raw).players as unknown[]) : [];
  const ql = q.trim().toLowerCase();
  const hits = list
    .map((p) => obj(p))
    .filter((p) => str(p.Id) && str(p.Name))
    .map((p) => ({
      id: str(p.Id),
      name: str(p.Name),
      guild: str(p.GuildName),
      alliance: str(p.AllianceName),
      killFame: num(p.KillFame),
      deathFame: num(p.DeathFame),
    }));
  // Nome exato primeiro; o resto na ordem da gameinfo.
  hits.sort((a, b) => Number(b.name.toLowerCase() === ql) - Number(a.name.toLowerCase() === ql));
  return hits.slice(0, 25);
}

export function normalizePlayer(raw: unknown): SlimPlayer {
  const p = obj(raw);
  if (!str(p.Id)) throw new GameinfoError('not_found', 'gameinfo: jogador sem id');
  const life = obj(p.LifetimeStatistics);
  const pve: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(life.PvE))) if (typeof v === 'number') pve[k] = v;
  const g = obj(life.Gathering);
  const gathering: Record<string, number> = {};
  for (const k of ['All', 'Fiber', 'Hide', 'Ore', 'Rock', 'Wood']) gathering[k] = num(obj(g[k]).Total);
  gathering.Fishing = num(life.FishingFame);
  gathering.Farming = num(life.FarmingFame);
  gathering.Crafting = num(obj(life.Crafting).Total);
  return {
    id: str(p.Id),
    name: str(p.Name),
    guild: str(p.GuildName),
    alliance: str(p.AllianceName),
    killFame: num(p.KillFame),
    deathFame: num(p.DeathFame),
    pve,
    gathering,
  };
}

function normalizeSide(raw: unknown): SlimSide {
  const s = obj(raw);
  const eq = obj(s.Equipment);
  const gear: SlimGear[] = [];
  for (const slot of SLOTS) {
    const it = obj(eq[slot]);
    const id = str(it.Type);
    if (!id) continue;
    gear.push({ slot, id, quality: Math.min(5, Math.max(1, num(it.Quality) || 1)), count: Math.max(1, num(it.Count) || 1) });
  }
  return {
    id: str(s.Id),
    name: str(s.Name),
    guild: str(s.GuildName),
    alliance: str(s.AllianceName),
    ip: Math.round(num(s.AverageItemPower)),
    gear,
  };
}

export function normalizeEvents(raw: unknown): SlimEvent[] {
  if (!Array.isArray(raw)) throw new GameinfoError('upstream', 'gameinfo: lista de eventos inválida');
  return raw
    .map((r) => obj(r))
    .filter((e) => typeof e.EventId === 'number')
    .map((e) => {
      const dealers = num(e.numberOfParticipants) || (Array.isArray(e.Participants) ? e.Participants.length : 0);
      return {
        id: e.EventId as number,
        time: isoTime(e.TimeStamp),
        killer: normalizeSide(e.Killer),
        victim: normalizeSide(e.Victim),
        dealers,
        group: Math.max(dealers, num(e.groupMemberCount), 1),
        fame: num(e.TotalVictimKillFame),
        area: str(e.KillArea) || null,
      };
    })
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, RECENT);
}

const toGear = (g: SlimGear[]): GearPiece[] => g.map(({ slot, id, quality }) => ({ slot, id, quality }));
const toSide = (s: SlimSide): EventSide => ({ id: s.id, name: s.name, guild: s.guild, alliance: s.alliance, ip: s.ip, gear: toGear(s.gear) });

export function toKillEvent(e: SlimEvent, estValue: number | null): KillEvent {
  return {
    id: e.id,
    time: e.time,
    killer: toSide(e.killer),
    victim: toSide(e.victim),
    participants: e.group,
    totalFame: e.fame,
    estValue,
  };
}

// ---------- estatística ----------

/** Kill solo: só um causou dano e não havia grupo. */
export const isSolo = (e: SlimEvent) => e.dealers <= 1 && e.group <= 1;

/** Lado do jogador no evento: matador nas kills, vítima nas mortes. */
function mySide(id: string, e: SlimEvent, as: 'killer' | 'victim'): SlimSide | null {
  const s = e[as];
  return s.id === id ? s : null;
}

export function weaponsOf(id: string, kills: SlimEvent[], deaths: SlimEvent[]): PlayerDossier['weapons'] {
  const count = new Map<WeaponFamily, number>();
  const add = (s: SlimSide | null) => {
    const main = s?.gear.find((g) => g.slot === 'MainHand');
    if (!main) return;
    const fam = weaponFamily(main.id);
    count.set(fam, (count.get(fam) ?? 0) + 1);
  };
  for (const e of kills) add(mySide(id, e, 'killer'));
  for (const e of deaths) add(mySide(id, e, 'victim'));
  return [...count.entries()]
    .map(([type, n]) => ({ type, labelPt: WEAPON_LABEL_PT[type], count: n }))
    .sort((a, b) => b.count - a.count || a.labelPt.localeCompare(b.labelPt, 'pt-BR'));
}

export function statsOf(id: string, kills: SlimEvent[], deaths: SlimEvent[]) {
  const soloRate = kills.length ? round(kills.filter(isSolo).length / kills.length, 2) : null;
  const avgGroup = kills.length ? round(kills.reduce((s, e) => s + e.group, 0) / kills.length, 1) : null;
  const ips = [
    ...kills.map((e) => mySide(id, e, 'killer')?.ip ?? 0),
    ...deaths.map((e) => mySide(id, e, 'victim')?.ip ?? 0),
  ].filter((ip) => ip > 0);
  const avgIp = ips.length ? Math.round(ips.reduce((s, n) => s + n, 0) / ips.length) : null;
  return { soloRate, avgGroup, avgIp };
}

/** Razão fama de abate / fama de morte, sem Infinity (JSON viraria null). */
export function fameRatio(killFame: number, deathFame: number): number {
  if (deathFame > 0) return round(killFame / deathFame, 2);
  return killFame > 0 ? 99 : 0;
}

export interface DangerInput {
  killFame: number;
  deathFame: number;
  kills: SlimEvent[];
  deaths: SlimEvent[];
  soloRate: number | null;
  avgGroup: number | null;
  avgIp: number | null;
  /** true se parte do histórico não carregou (vira motivo). */
  partial?: boolean;
}

/**
 * Perigo 0–100 para quem está decidindo se foge ou luta. Soma pontos por fama, razão, ritmo recente de kills,
 * estilo (ganker solo com IP alto, grupo grande) e IP; quem não mata há 30 dias pesa 60%.
 * `lang` muda só o texto dos motivos (o rótulo continua o código em PT do contrato).
 */
export function computeDanger(d: DangerInput, now = Date.now(), lang: ApiLang = 'pt'): Danger {
  const t = (pt: string, es: string) => tl(lang, pt, es);
  if (!d.kills.length && !d.deaths.length && d.killFame <= 0) {
    return { score: 0, label: 'sem dado', reasons: [t('nenhuma kill no killboard', 'ningún asesinato en el killboard')] };
  }
  let score = 0;
  const reasons: string[] = [];
  const fame = fmtFame(d.killFame, lang);

  if (d.killFame >= 50e6) { score += 25; reasons.push(t(`fama de abate muito alta (${fame})`, `fama por asesinatos muy alta (${fame})`)); }
  else if (d.killFame >= 10e6) { score += 18; reasons.push(t(`fama de abate alta (${fame})`, `fama por asesinatos alta (${fame})`)); }
  else if (d.killFame >= 1e6) score += 8;

  const ratio = fameRatio(d.killFame, d.deathFame);
  if (d.killFame >= 1e6 && ratio >= 3) {
    score += 15;
    const r = fmtDecL(Math.min(ratio, 99), lang);
    reasons.push(t(`mata ${r}× mais do que morre`, `mata ${r}× más de lo que muere`));
  } else if (d.killFame >= 1e6 && ratio >= 1.5) {
    score += 8;
    const r = fmtDecL(ratio, lang);
    reasons.push(t(`mata mais do que morre (${r}×)`, `mata más de lo que muere (${r}×)`));
  }

  const day = 86_400_000;
  const times = d.kills.map((e) => Date.parse(e.time)).filter(Number.isFinite);
  const last7 = times.filter((t) => now - t <= 7 * day).length;
  if (last7 >= 8) score += 25;
  else if (last7 >= 5) score += 18;
  else if (last7 >= 2) score += 10;
  else if (last7 === 1) score += 4;
  if (last7 >= 2) reasons.push(t(`${last7} kills recentes (últimos 7 dias)`, `${last7} asesinatos recientes (últimos 7 días)`));

  const solo = d.soloRate ?? 0;
  if (d.kills.length >= 3 && solo >= 0.5) {
    const n = Math.round(solo * 100);
    const pct = t(`${n}% das kills`, `${n}% de los asesinatos`);
    if ((d.avgIp ?? 0) >= 1200) { score += 20; reasons.push(t(`mata sozinho com IP alto (${pct})`, `mata en solitario con IP alto (${pct})`)); }
    else { score += 12; reasons.push(t(`mata sozinho (${pct})`, `mata en solitario (${pct})`)); }
  }
  if ((d.avgGroup ?? 0) >= 5) {
    const g = Math.round(d.avgGroup ?? 0);
    score += 10;
    reasons.push(t(`anda em grupo de ${g}`, `anda en grupo de ${g}`));
  }

  if (d.avgIp != null && d.avgIp >= 1250) {
    score += d.avgIp >= 1400 ? 10 : 5;
    const ip = fmtInt(d.avgIp, lang);
    reasons.push(t(`IP médio ${ip}`, `IP medio ${ip}`));
  }

  const lastKill = times.length ? Math.max(...times) : null;
  if (lastKill == null) {
    score = Math.round(score * 0.6);
    reasons.push(t('nenhuma kill recente no killboard', 'ningún asesinato reciente en el killboard'));
  } else if (now - lastKill > 30 * day) {
    score = Math.round(score * 0.6);
    const days = Math.floor((now - lastKill) / day);
    reasons.push(t(`última kill há ${days} dias`, `último asesinato hace ${days} días`));
  }
  if (d.partial) reasons.push(t('parte do histórico não carregou agora', 'parte del historial no se pudo cargar ahora'));

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label: Danger['label'] = score >= 60 ? 'perigoso' : score >= 30 ? 'atenção' : 'tranquilo';
  if (!reasons.length) {
    reasons.push(label === 'tranquilo' ? t('pouca atividade de PvP', 'poca actividad de PvP') : t('histórico de PvP moderado', 'historial de PvP moderado'));
  }
  return { score, label, reasons };
}

// ---------- preço do equipamento ----------

export interface Cheapest {
  city: City;
  price: number;
  at: string | null;
}

/**
 * Venda mais barata do item entre as linhas, com qualidade >= minQuality. Prefere preço visto nos últimos 3 dias;
 * se não houver nenhum, aceita o mais velho (a idade vai junto para a tela avisar).
 */
export function pickCheapest(rows: PriceRow[], id: string, minQuality: number, now = Date.now()): Cheapest | null {
  const cands = rows.filter((r) => r.id === id && r.quality >= minQuality && r.sellMin != null && r.sellMin > 0);
  if (!cands.length) return null;
  const fresh = cands.filter((r) => (minutesSince(r.sellMinAt, now) ?? Infinity) <= FRESH_MIN);
  const pool = fresh.length ? fresh : cands;
  const best = pool.reduce((a, b) => ((b.sellMin as number) < (a.sellMin as number) ? b : a));
  return { city: best.city, price: best.sellMin as number, at: best.sellMinAt };
}

/** Soma do set pelo preço mais barato de qualidade 1 (× quantidade em comida/poção); null se nada tem preço. */
export function gearValue(gear: SlimGear[], rows: PriceRow[], now = Date.now()): number | null {
  let total = 0;
  let any = false;
  for (const g of gear) {
    const c = pickCheapest(rows, g.id, 1, now);
    if (!c) continue;
    total += c.price * g.count;
    any = true;
  }
  return any ? total : null;
}

/** Ids únicos na ordem dada, cortando antes de a URL do AODP precisar de um segundo pedido. */
export function idsForOneCall(ids: string[], maxChars = AODP_IDS_CHARS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let len = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    const add = encodeURIComponent(id).length + 1;
    if (len + add > maxChars) break;
    seen.add(id);
    out.push(id);
    len += add;
  }
  return out;
}

/** Preços em lote, sem derrubar o dossiê: AODP fora ou orçamento esgotado → []. */
async function safePrices(ids: string[], qualities: Quality[], ctx: ExecutionContext | undefined, budget: Budget): Promise<PriceRow[]> {
  if (!ids.length || !budget.take()) return [];
  try {
    return await aodpPrices(ids, GEAR_CITIES, qualities, ctx);
  } catch (err) {
    console.warn('player: AODP falhou, valor do equipamento fica sem dado', String(err));
    return [];
  }
}

// ---------- recompra e lições da autópsia ----------

export function buildRebuy(gear: SlimGear[], rows: PriceRow[], now = Date.now()): { rebuy: RebuyLine[]; rebuyTotal: number | null } {
  let total = 0;
  let any = false;
  const rebuy = gear.map((g): RebuyLine => {
    const c = pickCheapest(rows, g.id, g.quality, now);
    if (c) { total += c.price * g.count; any = true; }
    return {
      id: g.id,
      slot: g.slot,
      quality: g.quality,
      cheapestCity: c?.city ?? null,
      // Preço da linha = custo de repor o espaço inteiro (comida e poção vêm com quantidade).
      price: c ? c.price * g.count : null,
      ageMin: c ? minutesSince(c.at, now) : null,
      count: g.count,
    };
  });
  return { rebuy, rebuyTotal: any ? total : null };
}

export interface LessonInput {
  death: SlimEvent;
  killerDanger: Danger | null;
  /** true quando o dossiê do matador não carregou (veio o básico). */
  killerBasic: boolean;
  setValue: number | null;
}

/** 3 a 5 frases curtas, por regra, a partir da morte. A ordem é a prioridade (corta no fim). `lang`: só o texto. */
export function buildLessons({ death, killerDanger, killerBasic, setValue }: LessonInput, lang: ApiLang = 'pt'): string[] {
  const t = (pt: string, es: string) => tl(lang, pt, es);
  const n = (x: number) => fmtInt(x, lang);
  const out: string[] = [];
  const k = death.killer;
  const v = death.victim;
  const has = (slot: string) => v.gear.some((g) => g.slot === slot);

  if (k.ip > 0 && v.ip > 0) {
    const gap = k.ip - v.ip;
    if (gap >= 200) {
      out.push(t(
        `Ele estava com IP bem maior (${n(k.ip)} contra ${n(v.ip)}); evite trocar com builds desse nível.`,
        `Quien te mató tenía un IP mucho mayor (${n(k.ip)} contra ${n(v.ip)}); evita pelear contra builds de ese nivel.`,
      ));
    } else if (gap >= 100) {
      out.push(t(
        `O matador tinha IP um pouco acima (+${n(gap)}): numa troca parelha isso pesa; escolha melhor a hora de lutar.`,
        `Quien te mató tenía un IP un poco mayor (+${n(gap)}): en una pelea pareja eso pesa; elige mejor el momento de pelear.`,
      ));
    } else if (gap <= -150 && isSolo(death)) {
      out.push(t(
        `Você tinha IP maior (${n(v.ip)} contra ${n(k.ip)}) e mesmo assim perdeu no um contra um: reveja a build e o tempo das habilidades.`,
        `Tenías un IP mayor (${n(v.ip)} contra ${n(k.ip)}) y aun así perdiste el uno contra uno: revisa la build y el momento de usar las habilidades.`,
      ));
    }
  }

  if (death.group >= 4) {
    out.push(t(
      `Foi um grupo de ${death.group}: em zona vermelha ou preta, ande com escolta ou evite o horário de pico.`,
      `Fue un grupo de ${death.group}: en zona roja o negra, ve con escolta o evita la hora pico.`,
    ));
  } else if (death.group >= 2) {
    out.push(t(
      `Foram ${death.group} contra você: quando vir mais de um inimigo chegando junto, saia cedo.`,
      `Fueron ${death.group} contra ti: cuando veas llegar a más de un enemigo a la vez, retírate pronto.`,
    ));
  }

  if (killerBasic) out.push(t('Não deu para carregar o histórico do matador agora; abra o dossiê dele daqui a pouco.', 'No se pudo cargar ahora el historial de quien te mató; abre su dosier en un rato.'));
  else if (killerDanger?.label === 'perigoso') out.push(t('Esse jogador mata com frequência: evite a área dele.', 'Este jugador mata con frecuencia: evita su zona.'));
  else if (killerDanger?.label === 'atenção') out.push(t('Esse jogador tem histórico de PvP: fique atento se cruzar com ele de novo.', 'Este jugador tiene historial de PvP: mantente atento si te lo cruzas de nuevo.'));

  if (!has('Mount')) out.push(t('Você estava sem montaria: sem ela, fugir fica quase impossível.', 'No llevabas montura: sin ella, huir es casi imposible.'));
  if (!has('Potion') && !has('Food')) out.push(t('Sem poção e sem comida no set: leve as duas, elas decidem uma troca ou garantem a fuga.', 'Sin poción ni comida en el set: lleva las dos, deciden una pelea o aseguran la huida.'));
  else if (!has('Potion')) out.push(t('Sem poção no set: leve uma de cura ou de resistência para virar a luta ou fugir.', 'Sin poción en el set: lleva una de curación o de resistencia para darle la vuelta a la pelea o huir.'));
  else if (!has('Food')) out.push(t('Sem comida no set: o bônus da comida faz diferença numa troca.', 'Sin comida en el set: la bonificación de la comida marca la diferencia en una pelea.'));

  if (setValue != null && setValue >= 500_000) {
    out.push(t(
      `Você carregava ${n(setValue)} de prata em equipamento: considere um set mais barato para essa atividade.`,
      `Llevabas ${n(setValue)} de plata en equipo: considera un set más barato para esa actividad.`,
    ));
  }

  if (v.gear.some((g) => /GATHERER/.test(g.id))) {
    out.push(t('Você morreu coletando: em zona de risco, colete perto da saída e de olho no mapa.', 'Moriste recolectando: en zona de riesgo, recolecta cerca de la salida y atento al mapa.'));
  }

  const kMain = k.gear.find((g) => g.slot === 'MainHand');
  const fam = weaponFamily(kMain?.id);
  if (fam !== 'other' && fam !== 'tool') {
    out.push(t(
      `Ele usava ${WEAPON_LABEL_PT[fam]}: conheça o alcance e as habilidades dessa arma para reconhecer a build na próxima.`,
      `Quien te mató usaba un arma de tipo ${WEAPON_LABEL_ES[fam].toLowerCase()}: conoce el alcance y las habilidades de esa arma para reconocer la build la próxima vez.`,
    ));
  }

  const fallback = lang === 'es'
    ? [
        'Revisa el dosier de quien te mató antes de volver a la misma zona.',
        'Guarda en el banco la plata que no puedes perder antes de salir a una zona de riesgo.',
        'Si dudas entre pelear y huir, huye pronto: huir cuesta menos que morir.',
      ]
    : [
        'Confira o dossiê do matador antes de voltar para a mesma área.',
        'Guarde no banco a prata que você não pode perder antes de sair para zona de risco.',
        'Na dúvida entre lutar e fugir, fuja cedo: a fuga perde menos do que a morte.',
      ];
  for (const f of fallback) if (out.length < 3) out.push(f);
  return out.slice(0, 5);
}

// ---------- montagem ----------

function oldest(...ats: (string | undefined)[]): string {
  const ok = ats.filter((a): a is string => !!a && Number.isFinite(Date.parse(a)));
  return ok.length ? ok.reduce((a, b) => (a < b ? a : b)) : new Date().toISOString();
}

interface BuildOpts {
  ctx?: ExecutionContext;
  budget: Budget;
  retry?: boolean;
  timeoutMs?: number;
  /** Língua dos motivos do perigo (o dado bruto em cache é o mesmo). */
  lang?: ApiLang;
}

/** Dossiê completo; gasta 3 idas à gameinfo (em paralelo) + 1 ao AODP no máximo, fora as novas tentativas. */
async function buildDossier(id: string, o: BuildOpts): Promise<PlayerDossier> {
  const gi: GiOptions = { ctx: o.ctx, budget: o.budget, retry: o.retry, timeoutMs: o.timeoutMs };
  const [p, k, d] = await Promise.allSettled([
    gameinfoCached(giPath.player(id), GI_TTL.player, normalizePlayer, gi),
    gameinfoCached(giPath.kills(id), GI_TTL.events, normalizeEvents, gi),
    gameinfoCached(giPath.deaths(id), GI_TTL.events, normalizeEvents, gi),
  ]);
  if (p.status === 'rejected') throw p.reason;
  const player = p.value.data;
  const kills = k.status === 'fulfilled' ? k.value.data : [];
  const deaths = d.status === 'fulfilled' ? d.value.data : [];
  const partial = k.status === 'rejected' || d.status === 'rejected';

  // Uma só consulta de preços com o equipamento de todas as vítimas (qualidade 1, reais + Caerleon).
  const allIds = [...kills, ...deaths].flatMap((e) => e.victim.gear.map((g) => g.id));
  const rows = await safePrices(idsForOneCall(allIds), [1], o.ctx, o.budget);
  const value = (e: SlimEvent) => gearValue(e.victim.gear, rows);

  const stats = statsOf(id, kills, deaths);
  return {
    id: player.id,
    name: player.name,
    guild: player.guild,
    alliance: player.alliance,
    killFame: player.killFame,
    deathFame: player.deathFame,
    ratio: fameRatio(player.killFame, player.deathFame),
    pve: player.pve,
    gathering: player.gathering,
    recentKills: kills.map((e) => toKillEvent(e, value(e))),
    recentDeaths: deaths.map((e) => toKillEvent(e, value(e))),
    weapons: weaponsOf(id, kills, deaths),
    ...stats,
    danger: computeDanger({ killFame: player.killFame, deathFame: player.deathFame, kills, deaths, ...stats, partial }, Date.now(), o.lang ?? 'pt'),
    fetchedAt: oldest(p.value.at, k.status === 'fulfilled' ? k.value.at : undefined, d.status === 'fulfilled' ? d.value.at : undefined),
  };
}

/** Dossiê mínimo montado só com o que veio no evento (quando o completo não carrega ou estoura o orçamento). */
export function basicDossier(side: SlimSide, lang: ApiLang = 'pt'): PlayerDossier {
  const main = side.gear.find((g) => g.slot === 'MainHand');
  const fam = main ? weaponFamily(main.id) : null;
  return {
    id: side.id,
    name: side.name,
    guild: side.guild,
    alliance: side.alliance,
    killFame: 0,
    deathFame: 0,
    ratio: 0,
    pve: {},
    gathering: {},
    recentKills: [],
    recentDeaths: [],
    weapons: fam ? [{ type: fam, labelPt: WEAPON_LABEL_PT[fam], count: 1 }] : [],
    soloRate: null,
    avgGroup: null,
    avgIp: side.ip > 0 ? side.ip : null,
    danger: {
      score: 0,
      label: 'sem dado',
      reasons: [tl(lang, 'histórico completo indisponível agora; tente de novo em instantes', 'historial completo no disponible ahora; inténtalo de nuevo en unos instantes')],
    },
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- API pública do módulo (o bot importa estas) ----------

export async function searchPlayers(_env: Env, ctx: ExecutionContext, q: string): Promise<PlayerSearchResponse> {
  const query = q.trim();
  const res = await gameinfoCached(giPath.search(query), GI_TTL.search, (raw) => normalizeSearch(raw, query), {
    ctx,
    budget: new Budget(2),
  });
  return { players: res.data };
}

/** `lang` 'es': motivos do perigo em espanhol (mesmo dado em cache, mesmos subrequests). */
export async function getDossier(_env: Env, ctx: ExecutionContext, id: string, lang: ApiLang = 'pt'): Promise<PlayerDossier> {
  return buildDossier(id, { ctx, budget: new Budget(DOSSIER_BUDGET), lang });
}

/** `lang` 'es': lições e motivos do perigo do matador em espanhol (mesmo dado em cache, mesmos subrequests). */
export async function getAutopsy(_env: Env, ctx: ExecutionContext, id: string, lang: ApiLang = 'pt'): Promise<AutopsyResponse> {
  const budget = new Budget(AUTOPSY_BUDGET);
  const deaths = await gameinfoCached(giPath.deaths(id), GI_TTL.events, normalizeEvents, { ctx, budget });
  const last = deaths.data[0];
  if (!last) return { death: null, killerDossier: null, lessons: [], rebuy: [], rebuyTotal: null };

  // Recompra e dossiê do matador em paralelo. O matador vai sem nova tentativa e com timeout menor: a autópsia
  // já esperou a gameinfo uma vez e não pode somar 100 s de espera.
  const gear = last.victim.gear;
  const [rows, killer] = await Promise.all([
    safePrices([...new Set(gear.map((g) => g.id))], [1, 2, 3, 4, 5], ctx, budget),
    last.killer.id
      ? buildDossier(last.killer.id, { ctx, budget, retry: false, timeoutMs: 15_000, lang }).then(
          (d) => ({ d, basic: false }),
          (err) => {
            console.warn('player: dossiê do matador falhou', String(err));
            return { d: basicDossier(last.killer, lang), basic: true };
          },
        )
      : Promise.resolve({ d: basicDossier(last.killer, lang), basic: true }),
  ]);

  const { rebuy, rebuyTotal } = buildRebuy(gear, rows);
  return {
    // "Valor estimado" da morte com a mesma régua do dossiê (qualidade 1); rebuyTotal é o custo de recompra.
    death: toKillEvent(last, gearValue(gear, rows.filter((r) => r.quality === 1))),
    killerDossier: killer.d,
    lessons: buildLessons({ death: last, killerDanger: killer.d.danger, killerBasic: killer.basic, setValue: rebuyTotal }, lang),
    rebuy,
    rebuyTotal,
  };
}

// ---------- rotas ----------

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': status === 200 ? 'public, max-age=120' : 'no-store' },
  });
}

/** Traduz erro em resposta: 404 jogador inexistente, 504 lento, 502 fora do ar. */
export function playerErrorResponse(err: unknown, lang: ApiLang = 'pt'): Response {
  if (err instanceof GameinfoError) {
    if (err.kind === 'not_found') return json({ error: tl(lang, MSG_NOT_FOUND, MSG_NOT_FOUND_ES) }, 404);
    const down = tl(lang, MSG_GAMEINFO_DOWN, MSG_GAMEINFO_DOWN_ES);
    if (err.kind === 'timeout') return json({ error: down }, 504);
    return json({ error: down }, 502);
  }
  console.error('player: erro inesperado', err);
  return json({ error: tl(lang, 'Erro interno ao montar os dados do jogador.', 'Error interno al preparar los datos del jugador.') }, 500);
}

/**
 * /api/player/search?q=, /api/player/:id e /api/player/:id/autopsy. `?lang=es` devolve em espanhol os motivos do
 * perigo, as lições da autópsia e as mensagens de erro; sem ele (ou com outro valor), tudo igual a antes.
 */
export async function routePlayer(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const parts = url.pathname.replace(/\/+$/, '').split('/');
  if (parts[1] !== 'api' || parts[2] !== 'player') return null;
  const lang = apiLang(url.searchParams.get('lang'));
  const t = (pt: string, es: string) => tl(lang, pt, es);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: t('método não permitido', 'método no permitido') }, { status: 405, headers: { Allow: 'GET' } });
  }
  try {
    if (parts.length === 4 && parts[3] === 'search') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if (q.length < 3) return json({ error: t('Digite pelo menos 3 caracteres do nome.', 'Escribe al menos 3 caracteres del nombre.') }, 400);
      if (q.length > 32) {
        return json({ error: t('Nome longo demais: no Albion o nome tem até 16 caracteres.', 'Nombre demasiado largo: en Albion el nombre tiene hasta 16 caracteres.') }, 400);
      }
      return json(await searchPlayers(env, ctx, q));
    }
    const id = parts[3] ?? '';
    if ((parts.length === 4 || (parts.length === 5 && parts[4] === 'autopsy')) && !ID_RE.test(id)) {
      return json({ error: t('Id de jogador inválido.', 'Id de jugador no válido.') }, 400);
    }
    if (parts.length === 4) return json(await getDossier(env, ctx, id, lang));
    if (parts.length === 5 && parts[4] === 'autopsy') return json(await getAutopsy(env, ctx, id, lang));
    return json({ error: t('rota não encontrada', 'ruta no encontrada') }, 404);
  } catch (err) {
    return playerErrorResponse(err, lang);
  }
}
