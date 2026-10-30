// Ponte com a captura do próprio jogador (Rust: src-tauri/src/capture). Comandos, eventos e a escolha do usuário
// (store `captura.json`, chave `captura`: separado da config para a captura ter dono único aqui).
// Quem liga e desliga é o painel (controle abaixo); os widgets só leem o estado e o retrato.
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../windows';
import { URL_CODIGOS, URL_ITENS, URL_MAPAS, parseItensTxt, parseMapasTxt, textoComCopia } from './dados';
import { normalizarPref, prefPadrao } from './sessao';
import {
  EV_CAPTURA_ESTADO,
  EV_CAPTURA_SESSAO,
  type EstadoCaptura,
  type PrefCaptura,
  type RetratoSessao,
  type TabelaInfo,
} from './tipos';

export const STORE_CAPTURA = 'captura.json';
export const CHAVE_CAPTURA = 'captura';

// ---------- comandos ----------

export const estadoCaptura = () => invoke<EstadoCaptura>('captura_estado');
export const sessaoCaptura = () => invoke<RetratoSessao>('captura_sessao');
/** Exige o aviso aceito (o Rust confere no store). Sem Npcap não é erro: o estado diz o que falta. */
export const ligarCaptura = () => invoke<EstadoCaptura>('captura_ligar');
export const desligarCaptura = () => invoke<EstadoCaptura>('captura_desligar');
export const novaSessao = () => invoke<RetratoSessao>('captura_nova_sessao');
export const definirCodigos = (json: string) => invoke<TabelaInfo>('captura_definir_codigos', { json });
export const definirDados = (itens: string[], zonas: Record<string, string>) => invoke<void>('captura_definir_dados', { itens, zonas });
export const definirDiagnostico = (ligado: boolean) => invoke<EstadoCaptura>('captura_diagnostico', { ligado });

/** Escuta o estado e o retrato. Devolve a função que para de escutar. */
export async function acompanharCaptura(
  aoEstado: ((e: EstadoCaptura) => void) | null,
  aoRetrato: ((r: RetratoSessao) => void) | null,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  const offs: (() => void)[] = [];
  if (aoEstado) offs.push(await listen<EstadoCaptura>(EV_CAPTURA_ESTADO, (e) => aoEstado(e.payload)));
  if (aoRetrato) offs.push(await listen<RetratoSessao>(EV_CAPTURA_SESSAO, (e) => aoRetrato(e.payload)));
  return () => offs.forEach((f) => f());
}

// ---------- escolha do usuário ----------

type StoreCaptura = Awaited<ReturnType<typeof import('@tauri-apps/plugin-store').load>>;
let store: Promise<StoreCaptura> | null = null;

/** Um `load` por janela (o painel e o bloco de ajustes dividem a mesma instância). */
function abrirStore(): Promise<StoreCaptura> {
  store ??= import('@tauri-apps/plugin-store')
    .then(({ load }) => load(STORE_CAPTURA, { autoSave: 200, defaults: {} }))
    .catch((e) => {
      store = null;
      throw e;
    });
  return store;
}

export async function lerPref(): Promise<PrefCaptura> {
  if (!isTauri()) return prefPadrao();
  const s = await abrirStore();
  return normalizarPref(await s.get(CHAVE_CAPTURA));
}

export async function gravarPref(mudar: (p: PrefCaptura) => void): Promise<PrefCaptura> {
  const atual = await lerPref();
  mudar(atual);
  const p = normalizarPref(atual);
  if (isTauri()) {
    const s = await abrirStore();
    await s.set(CHAVE_CAPTURA, p);
    // O Rust lê o aceite deste store ao ligar: grava já, sem esperar o autoSave.
    await s.save();
  }
  return p;
}

// ---------- controle (só no painel) ----------

/** Baixa (ou lê da cópia local) a tabela de códigos e as listas do ao-bin-dumps e entrega ao Rust. */
export async function entregarDados(): Promise<{ tabela: TabelaInfo | null; erros: string[] }> {
  const erros: string[] = [];
  let tabela: TabelaInfo | null = null;
  try {
    tabela = await definirCodigos(await textoComCopia(URL_CODIGOS));
  } catch (e) {
    // Sem rede ou tabela recusada: vale a embutida no app.
    erros.push(`tabela de códigos: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const [itens, mapas] = await Promise.all([textoComCopia(URL_ITENS), textoComCopia(URL_MAPAS)]);
    await definirDados(parseItensTxt(itens), parseMapasTxt(mapas));
  } catch (e) {
    erros.push(`lista de itens e mapas: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { tabela, erros };
}

let iniciado = false;

/**
 * Chamado uma vez pelo painel ao abrir: entrega os dados ao Rust e, se o usuário deixou ligada (com o aviso
 * aceito), liga a captura. Nunca liga sozinha sem as duas coisas.
 */
export async function iniciarCapturaNoPainel(): Promise<void> {
  if (!isTauri() || iniciado) return;
  iniciado = true;
  const p = await lerPref();
  // Os dados chegam em paralelo (até 1 MB na primeira vez); o Rust reemite o retrato quando chegam.
  const dados = entregarDados().then(({ erros }) => erros.forEach((e) => console.warn('captura:', e)));
  if (p.diagnostico) await definirDiagnostico(true).catch(() => {});
  if (p.ligada && p.avisoAceitoEm) await ligarCaptura().catch((e) => console.warn('captura: não ligou', e));
  await dados;
}
