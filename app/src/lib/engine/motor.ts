// Motor local: liga os três motores (alertas de preço, despertador, relógio do servidor) e os atalhos globais.
// Nasce e morre com a janela do painel (main.ts chama iniciarMotorLocal só no painel): fechou o app, tudo para.
// Nada aqui cria tarefa agendada, serviço ou notificação marcada para depois.
//
// As telas (módulo a) usam motorLocal() para "checar agora", o estado dos alertas e as leituras do relógio,
// sem montar outro motor. Nos widgets (outras janelas) motorLocal() é null: lá a tela lê a config.
import { api } from '../api';
import { getConfig, loadConfig, MAX_DISPAROS, onConfigChange, updateConfig, type AcaoAtalho } from '../config';
import { avisar } from '../notify';
import { aplicarAtalhos, assinaturaAtalhos, limparAtalhos, type FalhaAtalho } from '../shortcuts';
import { isSilenciada } from '../voice';
import { hideAllWidgets, listWidgets, openWidget, showAllWidgets, traySetMuted } from '../windows';
import { criarMotorAlertas, type MotorAlertas } from './alerts';
import { criarMotorRelogio, type MotorRelogio } from './clock';
import { assinaturaTimers, criarMotorTimers, type MotorTimers } from './timers';

export interface MotorLocal {
  alertas: MotorAlertas;
  timers: MotorTimers;
  relogio: MotorRelogio;
  /** Atalhos que não puderam ser registrados na última aplicação (a tela de ajustes mostra). */
  falhasAtalhos(): FalhaAtalho[];
  onFalhasAtalhos(cb: (f: FalhaAtalho[]) => void): () => void;
  parar(): void;
}

let instancia: MotorLocal | null = null;

/** O motor desta janela (só existe no painel, depois de iniciarMotorLocal). */
export function motorLocal(): MotorLocal | null {
  return instancia;
}

/** Ações dos atalhos globais: só mexem na Guarita, nunca no jogo. */
export function acoesAtalhos(): Record<AcaoAtalho, () => void> {
  const erro = (e: unknown) => console.error('atalho', e);
  return {
    abrirPreco: () => void openWidget('preco').catch(erro),
    abrirDossie: () => void openWidget('dossie').catch(erro),
    alternarWidgets: () =>
      void (async () => {
        const ws = await listWidgets();
        if (ws.some((w) => w.open && w.visible)) await hideAllWidgets();
        else await showAllWidgets();
      })().catch(erro),
    // Pela bandeja: o Rust marca o item do menu e avisa todas as janelas (EV_VOZ_SILENCIADA → setSilenciada).
    silenciarVoz: () => void traySetMuted(!isSilenciada()).catch(erro),
  };
}

/** Liga tudo. Devolve a função que para (também chamada no beforeunload). Chamar uma vez, no painel. */
export async function iniciarMotorLocal(): Promise<() => void> {
  if (instancia) return instancia.parar;
  await loadConfig();
  const onErro = (e: unknown) => console.warn('motor local', e);

  const alertas = criarMotorAlertas({
    api,
    avisar,
    getConfig,
    onErro,
    marcarDisparo: async (regraId, quando, d) => {
      await updateConfig((c) => {
        const r = c.regras.find((x) => x.id === regraId);
        if (!r) return; // apagada enquanto checava
        r.lastFiredAt = quando;
        if (d) c.disparos = [{ regraId, quando, mensagem: d.mensagem }, ...c.disparos].slice(0, MAX_DISPAROS);
      });
    },
  });
  const timers = criarMotorTimers({
    avisar,
    getConfig,
    onErro,
    marcarDisparo: async (timerId, quando) => {
      await updateConfig((c) => {
        const t = c.timers.find((x) => x.id === timerId);
        if (t) t.firedAt = quando;
      });
    },
  });
  const relogio = criarMotorRelogio({
    api,
    avisar,
    getConfig,
    onErro,
    marcarAvisos: async (dados) => {
      await updateConfig((c) => {
        c.avisosRelogio = dados;
      });
    },
  });

  let falhas: FalhaAtalho[] = [];
  const subsFalhas = new Set<(f: FalhaAtalho[]) => void>();
  const acoes = acoesAtalhos();
  let assinAtalhos: string | null = null;
  let assinTimers = assinaturaTimers(getConfig().timers);
  let intervalo = getConfig().intervaloRegrasMin;

  const pararConfig = onConfigChange((c) => {
    const a = assinaturaAtalhos(c.atalhos);
    if (a !== assinAtalhos) {
      assinAtalhos = a;
      void aplicarAtalhos(c.atalhos, acoes)
        .then((r) => {
          falhas = r.falhas;
          for (const s of subsFalhas) s(falhas);
        })
        .catch(onErro);
    }
    const t = assinaturaTimers(c.timers);
    if (t !== assinTimers) {
      assinTimers = t;
      timers.reagendar();
    }
    if (c.intervaloRegrasMin !== intervalo) {
      intervalo = c.intervaloRegrasMin;
      alertas.reagendar();
    }
  });

  // Painel escondido na bandeja: o WebView2 pode segurar timers (docs/ARMADILHAS.md). Ao voltar, confere já.
  const aoVoltar = () => {
    if (document.visibilityState === 'visible') void timers.conferir();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoVoltar);

  // Trava da Web Locks API: segundo a issue do Tauri sobre throttling no Windows, uma trava pendente evita que o
  // WebView2 congele a página escondida. Inofensiva se não ajudar; solta no parar().
  let soltarTrava: (() => void) | null = null;
  try {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    if (locks) void locks.request('guarita-motor-local', () => new Promise<void>((ok) => (soltarTrava = ok))).catch(() => {});
  } catch {
    /* sem Web Locks */
  }

  alertas.iniciar();
  timers.iniciar();
  relogio.iniciar();

  const parar = () => {
    alertas.parar();
    timers.parar();
    relogio.parar();
    pararConfig();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar);
    soltarTrava?.();
    void limparAtalhos().catch(() => {});
    instancia = null;
  };
  instancia = {
    alertas,
    timers,
    relogio,
    falhasAtalhos: () => falhas,
    onFalhasAtalhos: (cb) => {
      subsFalhas.add(cb);
      cb(falhas);
      return () => subsFalhas.delete(cb);
    },
    parar,
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', parar, { once: true });
  return parar;
}
