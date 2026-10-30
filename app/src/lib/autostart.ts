// "Iniciar com o Windows": opção DESLIGADA por padrão. Único lugar do app que chama enable()/disable() do
// tauri-plugin-autostart, e enable() só a partir da tela de ajustes (o usuário marca). Não cria tarefa agendada nem
// serviço: o plugin usa a chave Run do registro do usuário, que o próprio Windows lista em "Aplicativos de inicialização".
//
// O registro é a verdade, não a config: se a config se perder (arquivo apagado ou estragado volta ao padrão, false)
// com a chave Run ainda lá, o app abriria com o Windows e a tela diria "desligado". Por isso o painel chama
// reconciliarIniciarComWindows() ao abrir: divergiu, desliga. Consentimento desconhecido conta como não dado.
import { getConfig, loadConfig, updateConfig } from './config';
import { isTauri } from './windows';

/** O que o app usa do tauri-plugin-autostart (trocável nos testes). */
export interface AutostartPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<boolean>;
}

let pluginTeste: AutostartPlugin | null = null;

/** Troca o plugin (testes). null volta ao real. */
export function setAutostartPlugin(p: AutostartPlugin | null): void {
  pluginTeste = p;
}

async function plugin(): Promise<AutostartPlugin | null> {
  if (pluginTeste) return pluginTeste;
  if (!isTauri()) return null;
  return import('@tauri-apps/plugin-autostart');
}

export async function iniciarComWindowsAtivo(): Promise<boolean> {
  const p = await plugin();
  return p ? p.isEnabled() : false;
}

/** Liga ou desliga, e grava a escolha na config. Chamar só por ação do usuário. */
export async function setIniciarComWindows(on: boolean): Promise<void> {
  const p = await plugin();
  if (p) {
    if (on) await p.enable();
    else await p.disable();
  }
  try {
    await updateConfig((c) => {
      c.iniciarComWindows = on;
    });
  } catch (e) {
    // Ligou no registro mas não gravou a escolha: desfaz, para não abrir com o Windows sem a tela mostrar.
    if (p && on) await p.disable().catch(() => {});
    throw e;
  }
}

/**
 * Confere o registro contra a config ao abrir o painel. Nunca liga nada:
 * - registro ligado e config desligada → desliga no registro;
 * - registro desligado e config ligada → grava desligado na config.
 * Devolve o estado final (true = vai abrir com o Windows).
 */
export async function reconciliarIniciarComWindows(): Promise<boolean> {
  const p = await plugin();
  if (!p) return false;
  await loadConfig();
  const naConfig = getConfig().iniciarComWindows;
  const noRegistro = await p.isEnabled();
  if (noRegistro === naConfig) return noRegistro;
  if (noRegistro) {
    await p.disable();
    return false;
  }
  await updateConfig((c) => {
    c.iniciarComWindows = false;
  });
  return false;
}
