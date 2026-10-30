// Saída dos avisos locais: notificação do Windows (tauri-plugin-notification) + voz + som curto, conforme a config.
// Só existe com o app aberto: quem chama é o motor (engine/*), que roda na janela do painel.
// Dono: módulo (b). Fronteira fixa: avisar(aviso), permissaoNotificacao(), tituloNotificacao().
//
// O título leva "Guarita · " na frente: no `tauri dev` (app não instalado) o Windows mostra a notificação como se
// fosse de outro programa, e o título é a única marca garantida. Notificação agendada do plugin (schedule) não se
// usa: nada fica marcado no Windows para depois que o app fecha.
import { getConfig } from './config';
import { falar, type Prioridade } from './voice';
import { isTauri } from './windows';

export interface Aviso {
  titulo: string;
  corpo: string;
  /** Texto falado; omitido = "titulo. corpo"; false = não falar. */
  voz?: string | false;
  prioridade?: Prioridade;
  /** Tocar o som curto do app (omitido = o que estiver nos ajustes). */
  som?: boolean;
}

export const PREFIXO_TITULO = 'Guarita · ';

export function tituloNotificacao(titulo: string): string {
  return titulo.startsWith('Guarita') ? titulo : `${PREFIXO_TITULO}${titulo}`;
}

let permissao: boolean | null = null;

/** Confere (e pede, se ainda não pediu) a permissão de notificação do Windows. Guarda a resposta. */
export async function permissaoNotificacao(): Promise<boolean> {
  if (!isTauri()) return false;
  if (permissao) return true;
  const n = await import('@tauri-apps/plugin-notification');
  permissao = (await n.isPermissionGranted()) || (await n.requestPermission()) === 'granted';
  return permissao;
}

// ---------- som curto (Web Audio, sem arquivo) ----------

let ctx: AudioContext | null = null;

/** Duas notas curtas e baixas (lá e mi), ~0,3 s. Volume segue o da voz. Falha em silêncio. */
export function tocarSom(volume = getConfig().voz.volume): void {
  try {
    const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const vol = Math.max(0, Math.min(1, volume)) * 0.18;
    [880, 1318.5].forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const ini = t0 + i * 0.13;
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(vol || 0.0001, ini + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.16);
      o.connect(g).connect(ctx!.destination);
      o.start(ini);
      o.stop(ini + 0.18);
    });
  } catch {
    /* sem áudio: segue só com notificação e voz */
  }
}

/** Notificação do Windows + som + voz, cada um conforme os ajustes. Nunca lança por falha de um dos canais. */
export async function avisar(a: Aviso): Promise<void> {
  const cfg = getConfig();
  const som = a.som ?? cfg.avisos.som;
  let notificou = false;
  if (cfg.avisos.notificacao) {
    try {
      if (await permissaoNotificacao()) {
        const { sendNotification } = await import('@tauri-apps/plugin-notification');
        // Sem `sound` o plugin manda a notificação muda (<audio silent="true"/>). "Default" = som padrão do Windows,
        // que toca mesmo com o Web Audio suspenso (janela sem clique ainda).
        sendNotification({ title: tituloNotificacao(a.titulo), body: a.corpo, ...(som ? { sound: 'Default' } : {}) });
        notificou = true;
      }
    } catch (e) {
      console.error('notificação', e);
    }
  }
  // Notificação desligada (ou fora do app): o som curto do próprio app faz o papel.
  if (som && !notificou) tocarSom(cfg.voz.volume);
  if (a.voz !== false) falar(a.voz ?? `${a.titulo}. ${a.corpo}`, a.prioridade ?? 'normal');
}
