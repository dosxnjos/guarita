// Relógio do servidor: consulta /api/clock a cada 2 min com o app aberto e transforma a diferença entre duas
// leituras em eventos (servidor caiu ou voltou, bônus começou, bônus acabando em 30 min, fim da temporada perto).
// Roda só no painel (engine/motor.ts). Fechou o app, parou.
// Dono: módulo (b). Fronteira: compararRelogio, avisoRelogio (puras) e criarMotorRelogio.
import type { ClockResponse, Festivity } from '../../../../shared/types';
import type { GuaritaApi } from '../api';
import { MAX_BONUS_AVISADOS, type AvisosRelogioDados, type GuaritaConfig } from '../config';
import type { Aviso } from '../notify';
import { fmtDateTime, fmtTime } from '../format';
import { diasFalados, minutosFalados } from '../fala';

export const INTERVALO_RELOGIO_MS = 2 * 60_000;
/** Bônus acabando: avisa quando faltam até 30 min. */
export const BONUS_AVISO_MIN = 30;
/** Fim da temporada: avisa ao cruzar estes marcos (dias restantes). */
export const MARCOS_TEMPORADA = [7, 3, 1] as const;

export type EventoRelogio =
  | { tipo: 'bonusAcabando'; festividade: Festivity; faltamMin: number }
  | { tipo: 'festividadeNova'; festividade: Festivity }
  | { tipo: 'servidorCaiu'; mensagem: string; status: 'offline' | 'manutenção' }
  | { tipo: 'servidorVoltou' }
  | { tipo: 'temporadaAcabando'; faltamDias: number; nome: string; fim: string; marco: number };

type StatusServidor = ClockResponse['server']['status'];

const fora = (s: ClockResponse['server']['status']) => s === 'offline' || s === 'manutenção';
const chave = (f: Festivity) => `${f.kind}|${f.category}|${f.name}|${f.start}`;
const ativa = (f: Festivity, t: number) => Date.parse(f.start) <= t && Date.parse(f.end) > t;

/** Marco de temporada em que `dias` restantes cai (o menor marco >= dias), ou null fora dos marcos. */
function marco(dias: number): number | null {
  let m: number | null = null;
  for (const x of MARCOS_TEMPORADA) if (dias <= x) m = x;
  return m;
}

/**
 * Eventos novos entre a leitura anterior e a atual. Pura.
 * - Servidor: só por transição (online → offline/manutenção = caiu; o contrário = voltou). "desconhecido" não
 *   entra em transição nenhuma, e sem leitura anterior não há evento de servidor.
 * - Bônus acabando: festividade ativa que entrou na janela de 30 min (na primeira leitura, avisa se já está dentro).
 * - Festividade nova: ativa agora e não ativa na leitura anterior (sem leitura anterior, nada: não é novidade).
 * - Temporada: ao cruzar 7, 3 ou 1 dia; na primeira leitura, avisa se já está a 7 dias ou menos.
 * `statusAnterior`: último status conhecido (não "desconhecido") antes desta leitura, para uma falha de checagem no
 * meio (online → desconhecido → offline) não engolir a transição. Sem ele, vale o status de `antes`.
 * Bônus acabando e temporada podem se repetir a cada abertura do app: quem filtra o que já foi avisado é
 * filtrarJaAvisados, com a memória gravada na config.
 */
export function compararRelogio(
  antes: ClockResponse | null,
  agora: ClockResponse,
  now: number,
  statusAnterior?: StatusServidor | null,
): EventoRelogio[] {
  const ev: EventoRelogio[] = [];
  const tAntes = antes ? Date.parse(antes.now) || now - 1 : null;

  if (antes) {
    const a = statusAnterior ?? antes.server.status;
    const b = agora.server.status;
    if (a === 'online' && fora(b)) ev.push({ tipo: 'servidorCaiu', mensagem: agora.server.message, status: b as 'offline' | 'manutenção' });
    else if (fora(a) && b === 'online') ev.push({ tipo: 'servidorVoltou' });
  }

  const ativasAntes = new Set((antes?.festivities ?? []).filter((f) => tAntes != null && ativa(f, tAntes)).map(chave));
  for (const f of agora.festivities) {
    if (!ativa(f, now)) continue;
    const fim = Date.parse(f.end);
    const faltam = (fim - now) / 60000;
    if (antes && !ativasAntes.has(chave(f))) ev.push({ tipo: 'festividadeNova', festividade: f });
    if (faltam <= BONUS_AVISO_MIN) {
      const jaEstava = tAntes != null && ativasAntes.has(chave(f)) && (fim - tAntes) / 60000 <= BONUS_AVISO_MIN;
      if (!jaEstava) ev.push({ tipo: 'bonusAcabando', festividade: f, faltamMin: Math.max(1, Math.round(faltam)) });
    }
  }

  const fimTemp = Date.parse(agora.season?.end ?? '');
  if (Number.isFinite(fimTemp) && fimTemp > now) {
    const dias = (fimTemp - now) / 86400000;
    const mAgora = marco(dias);
    if (mAgora != null) {
      const diasAntes = tAntes != null ? (Date.parse(antes!.season?.end ?? '') - tAntes) / 86400000 : NaN;
      const mAntes = Number.isFinite(diasAntes) ? marco(diasAntes) : null;
      if (!antes || mAntes !== mAgora) {
        ev.push({ tipo: 'temporadaAcabando', faltamDias: Math.max(1, Math.ceil(dias)), nome: agora.season.name, fim: agora.season.end, marco: mAgora });
      }
    }
  }
  return ev;
}

/** Chave do aviso que não deve se repetir entre aberturas do app (bônus acabando, marco da temporada), ou null. */
export function chaveAvisoRelogio(e: EventoRelogio): string | null {
  if (e.tipo === 'bonusAcabando') return chave(e.festividade);
  if (e.tipo === 'temporadaAcabando') return `${e.fim}|${e.marco}`;
  return null;
}

/**
 * Tira os avisos já dados (em qualquer abertura anterior do app) e devolve a memória nova, ou null se não mudou.
 * Pura. A memória de bônus guarda os mais novos primeiro, até MAX_BONUS_AVISADOS.
 */
export function filtrarJaAvisados(
  ev: EventoRelogio[],
  dados: AvisosRelogioDados,
): { novos: EventoRelogio[]; dados: AvisosRelogioDados | null } {
  let temporada = dados.temporada;
  let bonus = dados.bonus;
  const novos: EventoRelogio[] = [];
  for (const e of ev) {
    const k = chaveAvisoRelogio(e);
    if (k == null) {
      novos.push(e);
    } else if (e.tipo === 'temporadaAcabando') {
      if (k === temporada) continue;
      temporada = k;
      novos.push(e);
    } else {
      if (bonus.includes(k)) continue;
      bonus = [k, ...bonus].slice(0, MAX_BONUS_AVISADOS);
      novos.push(e);
    }
  }
  const mudou = temporada !== dados.temporada || bonus !== dados.bonus;
  return { novos, dados: mudou ? { temporada, bonus } : null };
}

/** Evento ligado nos ajustes? */
export function eventoLigado(e: EventoRelogio, cfg: GuaritaConfig): boolean {
  const r = cfg.avisos.relogio;
  if (e.tipo === 'servidorCaiu' || e.tipo === 'servidorVoltou') return r.servidor;
  if (e.tipo === 'bonusAcabando') return r.bonusAcabando;
  if (e.tipo === 'festividadeNova') return r.festividade;
  return r.temporada;
}

/** Texto do aviso (notificação com hora de Brasília; voz curta). Pura. */
export function avisoRelogio(e: EventoRelogio): Aviso {
  switch (e.tipo) {
    case 'servidorCaiu':
      return {
        titulo: e.status === 'manutenção' ? 'Servidor em manutenção' : 'Servidor fora do ar',
        // A mensagem oficial vem em inglês (serverstatus da SBI): fica no widget Relógio, com lang="en", não aqui.
        corpo: `O servidor Americas ${e.status === 'manutenção' ? 'entrou em manutenção' : 'está fora do ar'}.`,
        voz: e.status === 'manutenção' ? 'O servidor entrou em manutenção.' : 'O servidor caiu.',
        prioridade: 'alta',
      };
    case 'servidorVoltou':
      return { titulo: 'Servidor de volta', corpo: 'O servidor Americas voltou a ficar online.', voz: 'O servidor voltou.', prioridade: 'alta' };
    case 'bonusAcabando':
      return {
        titulo: 'Bônus acabando',
        corpo: `${e.festividade.labelPt} termina em ${e.faltamMin} min, às ${fmtTime(e.festividade.end, undefined, false)} (horário de Brasília).`,
        voz: `${e.festividade.labelPt} acaba em ${minutosFalados(e.faltamMin)}.`,
        prioridade: 'normal',
      };
    case 'festividadeNova':
      return {
        titulo: 'Bônus começou',
        corpo: `${e.festividade.labelPt}, até ${fmtDateTime(e.festividade.end, undefined, true)} (horário de Brasília).`,
        voz: `Começou: ${e.festividade.labelPt}.`,
        prioridade: 'baixa',
      };
    case 'temporadaAcabando':
      return {
        titulo: 'Temporada acabando',
        corpo: `A ${e.nome || 'temporada'} termina por volta de ${fmtDateTime(e.fim, undefined, true)} (horário de Brasília): ${e.faltamDias === 1 ? 'falta cerca de 1 dia' : `faltam cerca de ${e.faltamDias} dias`}.`,
        voz: `A temporada acaba em cerca de ${diasFalados(e.faltamDias)}.`,
        prioridade: 'baixa',
      };
  }
}

export interface MotorRelogioDeps {
  api: GuaritaApi;
  avisar: (a: Aviso) => Promise<void>;
  getConfig: () => GuaritaConfig;
  /** Grava a memória dos avisos dados (bônus acabando, marco da temporada), para não repetir na próxima abertura. */
  marcarAvisos?: (dados: AvisosRelogioDados) => Promise<void>;
  now?: () => number;
  onErro?: (e: unknown) => void;
}

export interface MotorRelogio {
  iniciar(): void;
  parar(): void;
  rodando(): boolean;
  ultimo(): ClockResponse | null;
  /** Ouve cada leitura nova. Devolve a função para parar. */
  onAtualizar(cb: (c: ClockResponse) => void): () => void;
  /** Lê agora e avisa o que mudou (testes). */
  lerAgora(): Promise<EventoRelogio[]>;
}

export function criarMotorRelogio(deps: MotorRelogioDeps): MotorRelogio {
  const now = deps.now ?? (() => Date.now());
  let on = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ultimo: ClockResponse | null = null;
  /** Último status do servidor diferente de "desconhecido" (falha de checagem não apaga a transição). */
  let ultimoConhecido: StatusServidor | null = null;
  let lendo: Promise<EventoRelogio[]> | null = null;
  const subs = new Set<(c: ClockResponse) => void>();

  async function ler(): Promise<EventoRelogio[]> {
    const r = await deps.api.clock();
    const antes = ultimo;
    // Resposta do cache em memória (a mesma de antes) não gera evento novo.
    if (antes && r.data === antes) return [];
    ultimo = r.data;
    for (const s of subs) s(r.data);
    const todos = compararRelogio(antes, r.data, now(), ultimoConhecido);
    if (r.data.server.status !== 'desconhecido') ultimoConhecido = r.data.server.status;
    const cfg = deps.getConfig();
    const { novos: ev, dados } = filtrarJaAvisados(todos, cfg.avisosRelogio);
    if (dados && deps.marcarAvisos) await deps.marcarAvisos(dados).catch((err) => deps.onErro?.(err));
    for (const e of ev) {
      if (!eventoLigado(e, cfg)) continue;
      await deps.avisar(avisoRelogio(e)).catch((err) => deps.onErro?.(err));
    }
    return ev;
  }

  function lerAgora(): Promise<EventoRelogio[]> {
    if (!lendo) lendo = ler().finally(() => (lendo = null));
    return lendo;
  }

  function agendar(ms: number) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!on) return;
    timer = setTimeout(async () => {
      timer = null;
      await lerAgora().catch((e) => deps.onErro?.(e));
      agendar(INTERVALO_RELOGIO_MS);
    }, ms);
  }

  return {
    iniciar: () => {
      if (on) return;
      on = true;
      agendar(0);
    },
    parar: () => {
      on = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    rodando: () => on,
    ultimo: () => ultimo,
    onAtualizar: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    lerAgora,
  };
}
