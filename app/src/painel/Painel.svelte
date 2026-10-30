<script lang="ts" module>
  /** Os widgets abertos no último uso já foram reabertos nesta execução (vale entre remontagens do painel). */
  let jaAbriu = false;
  /** Aba aberta: sobrevive à remontagem da troca de língua (quem troca está em Ajustes e continua lá). */
  let ultimaAba: 'inicio' | 'ajustes' | 'sobre' = 'inicio';
</script>

<script lang="ts">
  // Janela principal: abre os widgets, mostra o status (API da Guarita, servidor do Albion, última atualização) e
  // guarda os ajustes. Ao abrir, reabre os widgets que estavam abertos quando o app fechou.
  import { onMount } from 'svelte';
  import type { ClockResponse } from '../../../shared/types';
  import pkg from '../../package.json';
  import { api } from '../lib/api';
  import { reconciliarIniciarComWindows, setIniciarComWindows } from '../lib/autostart';
  import { ACOES_ATALHO, onConfigChange, updateConfig, type AcaoAtalho, type GuaritaConfig } from '../lib/config';
  import { fmtDateTime, serverLabel, serverTone } from '../lib/format';
  import { abrirLink } from '../lib/links';
  import { rotuloAcao, validarAtalho, type FalhaAtalho } from '../lib/shortcuts';
  import { atalhoRepetido, partesAtalho } from '../lib/ui-atalhos';
  import { TEMAS, escolherTema, nomeTema, temaAtual, widgetsParaReabrir, fmtOpacidade, opacidadeEmTodos, type Tema } from '../lib/ui-janelas';
  import { falar, isSilenciada, vozesDaLingua } from '../lib/voice';
  import { brasilia, getLocale, intlLocale, linkSite, resolverLingua, tx, type PrefLingua } from '../lib/i18n.svelte';
  import {
    EV_VOZ_SILENCIADA, OPACITY_MIN, WIDGET_LABELS, isTauri, listWidgets, openWidget, setCloseToTray, setOnTop, toggleWidget,
    tituloWidget, traySetMuted, type WidgetInfo, type WidgetLabel,
  } from '../lib/windows';
  import AvisoSbi from '../lib/ui/AvisoSbi.svelte';
  import Carregando from '../lib/ui/Carregando.svelte';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';
  import CampoAtalho from '../ui/CampoAtalho.svelte';
  import CapturaAjustes from './CapturaAjustes.svelte';
  import { iniciarCapturaNoPainel } from '../lib/capture/captura';

  const SITE = getLocale() === 'es' ? linkSite('/') : 'https://guarita.pages.dev';
  const PERMITIDO = linkSite('/permitido');
  const REPO = 'https://github.com/dosxnjos/guarita';
  const VERSAO = pkg.version;

  // Texto calculado no script: a troca de língua remonta o painel (App.svelte), então isto se refaz.
  const DESCRICAO: Record<WidgetLabel, string> = {
    preco: tx('Digite o item e veja a cidade mais barata, a idade do preço e o flip para o Black Market.', 'Escribe el objeto y mira la ciudad más barata, la antigüedad del precio y la reventa al Mercado Negro.'),
    dossie: tx('Busque um jogador e veja guilda, armas, perigo e as últimas lutas no killboard público.', 'Busca a un jugador y mira su gremio, sus armas, el peligro y sus últimas peleas en el killboard público.'),
    relogio: tx('Hora do servidor, status, bônus do dia, ouro, Premium e fim da temporada.', 'Hora del servidor, estado, bonificación del día, oro, Premium y fin de la temporada.'),
    alertas: tx('Regras de preço checadas por este app enquanto ele estiver aberto.', 'Reglas de precio que revisa esta app mientras esté abierta.'),
    despertador: tx('Lembretes de plantação, animais e foco, avisados com o app aberto.', 'Recordatorios de cultivos, animales y foco, que suenan con la app abierta.'),
    lente: tx('Experimental: preço nas outras cidades do item aberto no mercado, com o cliente do Albion Data Project.', 'Experimental: precio en las demás ciudades del objeto abierto en el mercado, con el cliente del Albion Data Project.'),
    sessao: tx('Experimental: prata, fama e loot por hora do seu personagem. Precisa da captura ligada em Ajustes.', 'Experimental: plata, fama y botín por hora de tu personaje. Requiere la captura activada en Ajustes.'),
    loot: tx('Experimental: itens que você pegou nesta sessão, com valor estimado. Precisa da captura ligada em Ajustes.', 'Experimental: objetos que recogiste en esta sesión, con su valor estimado. Requiere la captura activada en Ajustes.'),
  };
  /** Língua que o "Automático" daria agora (a do Windows), para mostrar no botão. */
  const LINGUA_SISTEMA = resolverLingua('auto') === 'es' ? 'Español' : 'Português';
  const LINGUAS: { id: PrefLingua; nome: string }[] = [
    { id: 'auto', nome: `${tx('Automático', 'Automático')} (${LINGUA_SISTEMA})` },
    { id: 'pt', nome: 'Português' },
    { id: 'es', nome: 'Español' },
  ];
  const ATALHO_DO_WIDGET: Partial<Record<WidgetLabel, AcaoAtalho>> = { preco: 'abrirPreco', dossie: 'abrirDossie' };

  type Aba = 'inicio' | 'ajustes' | 'sobre';
  let aba = $state<Aba>(ultimaAba);
  $effect(() => {
    ultimaAba = aba;
  });

  let cfg = $state<GuaritaConfig | null>(null);
  let widgets = $state<WidgetInfo[]>([]);
  let relogio = $state<ClockResponse | null>(null);
  let relogioEm = $state<number | null>(null);
  let apiOk = $state<boolean | null>(null);
  let erroRelogio = $state<string | null>(null);
  let atualizando = $state(false);
  let erroAcao = $state<string | null>(null);
  let silenciada = $state(isSilenciada());
  let vozes = $state<SpeechSynthesisVoice[] | null>(null);
  let falhas = $state<FalhaAtalho[]>([]);
  let tema = $state<Tema>(temaAtual());
  let opacidadePadrao = $state(1);
  let lendoAviso = $state(false);

  $effect(() => onConfigChange((c) => (cfg = c)));

  async function atualizarWidgets() {
    if (isTauri()) widgets = await listWidgets().catch(() => widgets);
  }

  async function carregarRelogio(fresco = false) {
    atualizando = true;
    if (fresco) api.clearCache('/api/clock');
    try {
      const r = await api.clock();
      relogio = r.data;
      relogioEm = r.at;
      apiOk = true;
      erroRelogio = null;
    } catch (e) {
      apiOk = false;
      erroRelogio = e instanceof Error ? e.message : String(e);
    } finally {
      atualizando = false;
    }
  }

  const erroTxt = (e: unknown) => (e instanceof Error ? e.message : String(e));

  async function alternar(l: WidgetLabel) {
    erroAcao = null;
    try {
      const aberto = await toggleWidget(l);
      await updateConfig((c) => {
        c.janelas[l].aberta = aberto;
      });
      await atualizarWidgets();
    } catch (e) {
      erroAcao = erroTxt(e);
    }
  }

  async function mudarIniciar(on: boolean) {
    erroAcao = null;
    try {
      await setIniciarComWindows(on);
    } catch (e) {
      erroAcao = tx(`Não foi possível mudar o início com o Windows: ${erroTxt(e)}`, `No fue posible cambiar el inicio con Windows: ${erroTxt(e)}`);
    }
  }

  async function mudarBandeja(on: boolean) {
    await updateConfig((c) => {
      c.fecharParaBandeja = on;
    });
    if (isTauri()) await setCloseToTray(on).catch(() => {});
  }

  async function mudarSilencio(on: boolean) {
    silenciada = on;
    if (isTauri()) await traySetMuted(on).catch((e) => (erroAcao = erroTxt(e)));
  }

  async function gravarAtalho(acao: AcaoAtalho, atalho: string | null): Promise<string | null> {
    if (atalho && cfg) {
      const outra = atalhoRepetido(cfg.atalhos, acao, atalho);
      if (outra) return tx(`Esse atalho já está em “${rotuloAcao(outra)}”.`, `Ese atajo ya está en “${rotuloAcao(outra)}”.`);
    }
    await updateConfig((c) => {
      c.atalhos[acao] = atalho;
    });
    return null;
  }

  async function carregarVozes() {
    vozes = await vozesDaLingua(getLocale());
  }

  function testarVoz() {
    falar(tx('A Guarita está pronta. O preço da bolsa caiu em Martlock.', 'La Guarita está lista. El precio de la bolsa bajó en Martlock.'), 'alta');
  }

  async function mudarLingua(l: PrefLingua) {
    // Grava e pronto: main.ts (todas as janelas) ouve a config, aplica a língua, remonta a tela e avisa o Rust.
    await updateConfig((c) => {
      c.lingua = l;
    });
  }

  async function aplicarOpacidadeTodos() {
    await updateConfig((c) => opacidadeEmTodos(c, opacidadePadrao));
  }

  async function mudarPorCima(l: WidgetLabel, on: boolean) {
    erroAcao = null;
    try {
      // Vale para janela aberta mesmo escondida pelo atalho: `existe`, não `aberto` (que é "visível").
      await atualizarWidgets();
      if (existe(l)) await setOnTop(l, on);
      await updateConfig((c) => {
        c.janelas[l].porCima = on;
      });
    } catch (e) {
      erroAcao = erroTxt(e);
    }
  }

  async function retirarAceite() {
    erroAcao = null;
    // Solta toda janela, aberta ou escondida, sem confiar na lista (atualizada a cada 2 s) nem na config:
    // janela que não existe só devolve "não está aberta", que é ignorado.
    if (isTauri()) for (const l of WIDGET_LABELS) await setOnTop(l, false).catch(() => {});
    await updateConfig((c) => {
      c.avisoSbiAceitoEm = null;
      for (const l of WIDGET_LABELS) c.janelas[l].porCima = false;
    });
  }

  function trocarTema(t: Tema) {
    tema = t;
    escolherTema(t);
  }

  const aberto = (l: WidgetLabel) => widgets.find((w) => w.label === l)?.visible ?? false;
  /** A janela existe (aberta, visível ou escondida pelo atalho "mostrar e esconder"). */
  const existe = (l: WidgetLabel) => widgets.find((w) => w.label === l)?.open ?? false;

  onMount(() => {
    let parar = false;
    const desligar: (() => void)[] = [];

    void (async () => {
      if (!isTauri()) return;
      // Reabre os widgets que estavam abertos quando o app fechou (uma vez, ao abrir o painel).
      const { loadConfig } = await import('../lib/config');
      const c = await loadConfig();
      opacidadePadrao = c.janelas.preco.opacidade;
      // Só na primeira montagem: a troca de língua remonta o painel, e reabrir os widgets de novo roubaria o foco.
      if (!jaAbriu) {
        jaAbriu = true;
        // O registro do Windows é a verdade de "Iniciar com o Windows": se divergir da config, desliga (nunca liga).
        await reconciliarIniciarComWindows().catch((e) => console.warn('iniciar com o Windows', e));
        for (const l of widgetsParaReabrir(c)) await openWidget(l).catch((e) => console.warn('reabrir', l, e));
      }
      await atualizarWidgets();
      // Captura do próprio jogador: entrega a tabela de códigos e as listas ao Rust; liga só se o usuário deixou
      // ligada com o aviso aceito (lib/capture/captura.ts).
      void iniciarCapturaNoPainel().catch((e) => console.warn('captura', e));

      const { listen } = await import('@tauri-apps/api/event');
      const un = await listen<boolean>(EV_VOZ_SILENCIADA, (e) => (silenciada = e.payload));
      if (parar) un();
      else desligar.push(un);

      // Falhas de registro dos atalhos globais vêm do motor local (engine/motor.ts), que roda nesta janela.
      for (let i = 0; i < 20 && !parar; i++) {
        const { motorLocal } = await import('../lib/engine/motor');
        const m = motorLocal();
        if (m) {
          desligar.push(m.onFalhasAtalhos((f) => (falhas = f)));
          falhas = m.falhasAtalhos();
          break;
        }
        await new Promise((ok) => setTimeout(ok, 500));
      }
    })();

    void carregarRelogio();
    const t1 = setInterval(() => void atualizarWidgets(), 2000);
    const t2 = setInterval(() => void carregarRelogio(), 120_000);
    return () => {
      parar = true;
      clearInterval(t1);
      clearInterval(t2);
      for (const d of desligar) d();
    };
  });

  $effect(() => {
    if (aba === 'ajustes' && vozes === null) void carregarVozes();
  });
</script>

<div class="wrap">
<div class="page stack painel">
  <header class="cabeca">
    <div class="marca">
      <h1>Guarita</h1>
      <span class="tag">{tx('no PC', 'en PC')}</span>
    </div>
    <nav class="abas" aria-label={tx('Seções do painel', 'Secciones del panel')}>
      <button type="button" aria-current={aba === 'inicio' ? 'page' : undefined} onclick={() => (aba = 'inicio')}>{tx('Início', 'Inicio')}</button>
      <button type="button" aria-current={aba === 'ajustes' ? 'page' : undefined} onclick={() => (aba = 'ajustes')}>{tx('Ajustes', 'Ajustes')}</button>
      <button type="button" aria-current={aba === 'sobre' ? 'page' : undefined} onclick={() => (aba = 'sobre')}>{tx('Sobre', 'Acerca de')}</button>
    </nav>
  </header>

  {#if erroAcao}<ErroCaixa mensagem={erroAcao} />{/if}

  {#if aba === 'inicio'}
    <section class="card status" aria-labelledby="status-h">
      <div class="sec-cab">
        <h2 id="status-h">{tx('Status', 'Estado')}</h2>
        <button type="button" class="btn btn-mini" onclick={() => carregarRelogio(true)} disabled={atualizando}>{atualizando ? tx('Atualizando…', 'Actualizando…') : tx('Atualizar', 'Actualizar')}</button>
      </div>
      <dl class="status-lista">
        <div>
          <dt>{tx('API da Guarita', 'API de la Guarita')}</dt>
          <dd>
            {#if apiOk === null}<span class="muted">{tx('conferindo…', 'comprobando…')}</span>
            {:else if apiOk}<span class="dot good" aria-hidden="true"></span> {tx('Respondendo', 'Respondiendo')}
            {:else}<span class="dot bad" aria-hidden="true"></span> {tx('Sem resposta', 'Sin respuesta')}{/if}
          </dd>
        </div>
        <div>
          <dt>{tx('Servidor do Albion', 'Servidor de Albion')}</dt>
          <dd>
            {#if relogio}
              <span class="dot {serverTone(relogio.server.status)}" aria-hidden="true"></span> {serverLabel(relogio.server.status)}
            {:else}<span class="muted">—</span>{/if}
          </dd>
        </div>
        <div>
          <dt>{tx('Última atualização', 'Última actualización')}</dt>
          <dd>{relogioEm ? `${fmtDateTime(relogioEm)} (${brasilia()})` : '—'}</dd>
        </div>
      </dl>
      {#if erroRelogio}<p class="small bad-text m0">{erroRelogio}</p>{/if}
      {#if apiOk === null}<Carregando texto={tx('Conferindo a API da Guarita…', 'Comprobando la API de la Guarita…')} />{/if}
    </section>

    <section class="card stack" aria-labelledby="widgets-h">
      <div class="sec-cab">
        <h2 id="widgets-h">Widgets</h2>
        {#if cfg}
          <button type="button" class="switch" role="switch" aria-checked={silenciada} onclick={() => mudarSilencio(!silenciada)}>
            <span class="switch-track" aria-hidden="true"></span><span class="small">{tx('Silenciar voz', 'Silenciar voz')}</span>
          </button>
        {/if}
      </div>
      <p class="muted small m0">{tx('Janelas pequenas para deixar ao lado do jogo ou em outra tela. Cada uma lembra posição e tamanho.', 'Ventanas pequeñas para dejar al lado del juego o en otra pantalla. Cada una recuerda su posición y su tamaño.')}</p>
      <ul class="widgets">
        {#each WIDGET_LABELS as l (l)}
          {@const acao = ATALHO_DO_WIDGET[l]}
          {@const at = acao && cfg ? cfg.atalhos[acao] : null}
          <li class="widget-linha">
            <div class="widget-txt">
              <strong>{tituloWidget(l)}</strong>
              {#if aberto(l)}<span class="tag good">{tx('aberto', 'abierto')}</span>{/if}
              {#if at}<span class="atalho-mini">{#each partesAtalho(at) as p, i (i)}{#if i}+{/if}<kbd>{p}</kbd>{/each}</span>{/if}
              <p class="small muted m0">{DESCRICAO[l]}</p>
            </div>
            <button type="button" class="btn" class:primary={!aberto(l)} aria-pressed={aberto(l)} onclick={() => alternar(l)}>
              {aberto(l) ? tx('Fechar', 'Cerrar') : tx('Abrir', 'Abrir')}
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <p class="small muted m0">
      {tx('A Guarita só trabalha com este app aberto: fechou, os avisos param e nada fica rodando no computador.', 'La Guarita solo trabaja con esta app abierta: si la cierras, los avisos se detienen y nada queda funcionando en la computadora.')}
      {#if cfg && !cfg.fecharParaBandeja}{tx('Fechar esta janela encerra o app.', 'Cerrar esta ventana cierra la app.')}{:else}{tx('Fechar esta janela deixa o app na bandeja, perto do relógio do Windows.', 'Cerrar esta ventana deja la app en la bandeja, cerca del reloj de Windows.')}{/if}
    </p>
  {:else if aba === 'ajustes' && cfg}
    <section class="card stack" aria-labelledby="lingua-h">
      <h2 id="lingua-h">{tx('Língua', 'Idioma')}</h2>
      <div class="seg" role="group" aria-label={tx('Língua da interface', 'Idioma de la interfaz')}>
        {#each LINGUAS as l (l.id)}
          <button type="button" aria-pressed={cfg.lingua === l.id} lang={l.id === 'pt' ? 'pt-BR' : l.id === 'es' ? 'es' : undefined} onclick={() => mudarLingua(l.id)}>{l.nome}</button>
        {/each}
      </div>
      <p class="small muted m0">{tx('Automático segue a língua do Windows. Vale para o painel, os widgets, a bandeja, os avisos e a voz.', 'Automático sigue el idioma de Windows. Vale para el panel, los widgets, la bandeja, los avisos y la voz.')}</p>
    </section>

    <section class="card stack" aria-labelledby="atalhos-h">
      <h2 id="atalhos-h">{tx('Atalhos globais', 'Atajos globales')}</h2>
      <p class="small muted m0">{tx('Funcionam mesmo com o jogo em primeiro plano. Cada atalho só mexe na Guarita, nunca manda tecla ao jogo. Começam vazios: escolha combinações que o jogo não usa.', 'Funcionan incluso con el juego en primer plano. Cada atajo solo actúa sobre la Guarita, nunca envía teclas al juego. Empiezan vacíos: elige combinaciones que el juego no use.')}</p>
      <p class="small muted m0">{tx('O atalho abre a janela da Guarita e passa o foco para ela, como um Alt+Tab. Use o Albion em modo janela sem borda (Configurações de vídeo do jogo); em tela cheia exclusiva, o jogo minimiza ou pisca.', 'El atajo abre la ventana de la Guarita y le pasa el foco, como un Alt+Tab. Usa Albion en modo ventana sin bordes (configuración de video del juego); en pantalla completa exclusiva, el juego se minimiza o parpadea.')}</p>
      <div class="atalhos">
        {#each ACOES_ATALHO as a (a)}
          <CampoAtalho rotulo={rotuloAcao(a)} valor={cfg.atalhos[a]} validar={(v) => validarAtalho(v)} onmudar={(v) => gravarAtalho(a, v)} />
        {/each}
      </div>
      {#if falhas.length}
        <div class="callout bad small" role="alert">
          {#each falhas as f (f.acao)}<p>{rotuloAcao(f.acao)} ({f.atalho}): {f.erro}</p>{/each}
        </div>
      {/if}
    </section>

    <section class="card stack" aria-labelledby="voz-h">
      <h2 id="voz-h">{tx('Voz', 'Voz')}</h2>
      <button type="button" class="switch" role="switch" aria-checked={cfg.voz.ligada} onclick={() => updateConfig((c) => void (c.voz.ligada = !c.voz.ligada))}>
        <span class="switch-track" aria-hidden="true"></span>
        <span><strong>{tx('Falar os avisos', 'Leer los avisos en voz alta')}</strong><br /><span class="small muted">{tx('Usa as vozes em português instaladas no Windows.', 'Usa las voces en español instaladas en Windows.')}</span></span>
      </button>
      <div class="campos">
        <label class="stack campo">
          <span class="rot">{tx('Voz', 'Voz')}</span>
          {#if vozes === null}
            <span class="small muted">{tx('Procurando vozes…', 'Buscando voces…')}</span>
          {:else if vozes.length}
            <!-- A voz guardada pode ser de outra língua (troca de língua): aí vale a padrão desta. -->
            <select class="input" value={vozes.some((v) => v.name === cfg!.voz.voz) ? cfg.voz.voz : ''} onchange={(e) => updateConfig((c) => void (c.voz.voz = e.currentTarget.value || null))}>
              <option value="">{tx('Padrão', 'Predeterminada')} ({vozes[0].name})</option>
              {#each vozes as v (v.name)}<option value={v.name}>{v.name}</option>{/each}
            </select>
          {:else}
            <span class="small warn-text">{tx('Nenhuma voz em português encontrada. Instale em Configurações do Windows › Hora e idioma › Fala.', 'No hay ninguna voz en español instalada: los avisos se leerán con la voz predeterminada de Windows. Instala una en Configuración de Windows › Hora e idioma › Voz.')}</span>
          {/if}
        </label>
        <label class="stack campo">
          <span class="rot">{tx('Volume', 'Volumen')}: {Math.round(cfg.voz.volume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" value={cfg.voz.volume} onchange={(e) => updateConfig((c) => void (c.voz.volume = Number(e.currentTarget.value)))} />
        </label>
        <label class="stack campo">
          <span class="rot">{tx('Velocidade', 'Velocidad')}: {cfg.voz.velocidade.toLocaleString(intlLocale())}×</span>
          <input type="range" min="0.5" max="2" step="0.1" value={cfg.voz.velocidade} onchange={(e) => updateConfig((c) => void (c.voz.velocidade = Number(e.currentTarget.value)))} />
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn" onclick={testarVoz} disabled={!cfg.voz.ligada || silenciada}>{tx('Testar a voz', 'Probar la voz')}</button>
        {#if silenciada}<span class="small muted">{tx('A voz está silenciada pela bandeja ou pelo atalho.', 'La voz está silenciada desde la bandeja o con el atajo.')}</span>{/if}
      </div>
    </section>

    <section class="card stack" aria-labelledby="avisos-h">
      <h2 id="avisos-h">{tx('Avisos', 'Avisos')}</h2>
      <div class="interruptores">
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.notificacao} onclick={() => updateConfig((c) => void (c.avisos.notificacao = !c.avisos.notificacao))}>
          <span class="switch-track" aria-hidden="true"></span><span>{tx('Notificação do Windows', 'Notificación de Windows')}</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.som} onclick={() => updateConfig((c) => void (c.avisos.som = !c.avisos.som))}>
          <span class="switch-track" aria-hidden="true"></span><span>{tx('Som curto', 'Sonido corto')}</span>
        </button>
      </div>
      <span class="rot">{tx('Relógio do servidor', 'Reloj del servidor')}</span>
      <div class="interruptores">
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.servidor} onclick={() => updateConfig((c) => void (c.avisos.relogio.servidor = !c.avisos.relogio.servidor))}>
          <span class="switch-track" aria-hidden="true"></span><span>{tx('Servidor caiu ou voltou', 'El servidor se cayó o volvió')}</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.bonusAcabando} onclick={() => updateConfig((c) => void (c.avisos.relogio.bonusAcabando = !c.avisos.relogio.bonusAcabando))}>
          <span class="switch-track" aria-hidden="true"></span><span>{tx('Bônus acabando', 'Bonificación por terminar')}</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.festividade} onclick={() => updateConfig((c) => void (c.avisos.relogio.festividade = !c.avisos.relogio.festividade))}>
          <span class="switch-track" aria-hidden="true"></span><span>{tx('Bônus começou', 'Empezó una bonificación')}</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.temporada} onclick={() => updateConfig((c) => void (c.avisos.relogio.temporada = !c.avisos.relogio.temporada))}>
          <span class="switch-track" aria-hidden="true"></span><span>{tx('Fim da temporada perto', 'Se acerca el fin de temporada')}</span>
        </button>
      </div>
    </section>

    <section class="card stack" aria-labelledby="janelas-h">
      <h2 id="janelas-h">{tx('Janelas', 'Ventanas')}</h2>
      <div class="campos">
        <label class="stack campo">
          <span class="rot">{tx('Opacidade do fundo', 'Opacidad del fondo')}: {fmtOpacidade(opacidadePadrao)}</span>
          <input type="range" min={OPACITY_MIN} max="1" step="0.05" bind:value={opacidadePadrao} />
        </label>
        <div class="campo-acao"><button type="button" class="btn" onclick={aplicarOpacidadeTodos}>{tx('Aplicar em todos os widgets', 'Aplicar a todos los widgets')}</button></div>
      </div>
      <p class="small muted m0">{tx('O texto continua opaco; só o fundo fica translúcido. Cada widget também troca a opacidade pelo botão da própria barra.', 'El texto sigue opaco; solo el fondo se vuelve translúcido. Cada widget también cambia la opacidad con el botón de su propia barra.')}</p>

      <span class="rot">{tx('Sempre por cima', 'Siempre encima')}</span>
      <p class="small muted m0">{tx('Para ver as janelas sobre o jogo, use o Albion em modo janela sem borda (Configurações de vídeo do jogo). Em tela cheia exclusiva, o jogo cobre tudo.', 'Para ver las ventanas sobre el juego, usa Albion en modo ventana sin bordes (configuración de video del juego). En pantalla completa exclusiva, el juego lo tapa todo.')}</p>
      {#if !cfg.avisoSbiAceitoEm}
        {#if lendoAviso}
          <AvisoSbi onaceitar={() => (lendoAviso = false)} oncancelar={() => (lendoAviso = false)} />
        {:else}
          <p class="small m0">{tx('Nenhuma janela fica por cima do jogo até você ler o aviso sobre a regra da Sandbox Interactive.', 'Ninguna ventana queda encima del juego hasta que leas el aviso sobre la regla de Sandbox Interactive.')}</p>
          <div><button type="button" class="btn" onclick={() => (lendoAviso = true)}>{tx('Ler o aviso', 'Leer el aviso')}</button></div>
        {/if}
      {:else}
        <p class="small muted m0">{tx('Aviso aceito em', 'Aviso aceptado el')} {fmtDateTime(cfg.avisoSbiAceitoEm)} ({brasilia()}). <button type="button" class="linkbtn" onclick={retirarAceite}>{tx('Retirar o aceite e soltar todas', 'Retirar la aceptación y soltar todas')}</button></p>
        <div class="interruptores">
          {#each WIDGET_LABELS as l (l)}
            <button type="button" class="switch" role="switch" aria-checked={cfg.janelas[l].porCima} onclick={() => mudarPorCima(l, !cfg!.janelas[l].porCima)}>
              <span class="switch-track" aria-hidden="true"></span><span>{tituloWidget(l)}</span>
            </button>
          {/each}
        </div>
      {/if}
      <p class="small m0"><a href={PERMITIDO} onclick={(e) => abrirLink(e, PERMITIDO)}>{tx('O que é e o que não é permitido', 'Qué está permitido y qué no')}</a></p>
    </section>

    <CapturaAjustes />

    <section class="card stack" aria-labelledby="aparencia-h">
      <h2 id="aparencia-h">{tx('Aparência', 'Apariencia')}</h2>
      <div class="seg" role="group" aria-label={tx('Tema', 'Tema')}>
        {#each TEMAS as t (t.id)}
          <button type="button" aria-pressed={tema === t.id} onclick={() => trocarTema(t.id)}>{nomeTema(t.id)}</button>
        {/each}
      </div>
    </section>

    <section class="card stack" aria-labelledby="sistema-h">
      <h2 id="sistema-h">{tx('Sistema', 'Sistema')}</h2>
      <button type="button" class="switch" role="switch" aria-checked={cfg.iniciarComWindows} onclick={() => mudarIniciar(!cfg!.iniciarComWindows)}>
        <span class="switch-track" aria-hidden="true"></span>
        <span><strong>{tx('Iniciar com o Windows', 'Iniciar con Windows')}</strong><br /><span class="small muted">{tx('Desligado por padrão. Não cria tarefa agendada nem serviço: só abre o app quando você entra no Windows.', 'Desactivado por defecto. No crea tareas programadas ni servicios: solo abre la app cuando inicias sesión en Windows.')}</span></span>
      </button>
      <button type="button" class="switch" role="switch" aria-checked={cfg.fecharParaBandeja} onclick={() => mudarBandeja(!cfg!.fecharParaBandeja)}>
        <span class="switch-track" aria-hidden="true"></span>
        <span><strong>{tx('Fechar para a bandeja', 'Minimizar a la bandeja al cerrar')}</strong><br /><span class="small muted">{tx('Desligado: fechar o painel encerra a Guarita e todos os avisos.', 'Desactivado: cerrar el panel cierra la Guarita y todos los avisos.')}</span></span>
      </button>
    </section>
  {:else if aba === 'sobre'}
    <section class="card stack" aria-labelledby="sobre-h">
      <h2 id="sobre-h">{tx('Sobre', 'Acerca de')}</h2>
      <p class="m0"><strong>{tx('Guarita no PC', 'Guarita en PC')}</strong> · {tx('versão', 'versión')} {VERSAO}</p>
      <p class="small m0">{tx('Companheiro em português para quem joga Albion Online no servidor Americas. Usa os mesmos dados do site.', 'Compañero en español para quienes juegan Albion Online en el servidor Americas. Usa los mismos datos del sitio.')}</p>
      <ul class="small lista">
        <li>{tx('Só trabalha com o app aberto: nada de tarefa agendada ou serviço do Windows.', 'Solo trabaja con la app abierta: nada de tareas programadas ni servicios de Windows.')}</li>
        <li>{tx('Não lê o processo do jogo e não manda tecla nem clique ao jogo.', 'No lee el proceso del juego y no envía teclas ni clics al juego.')}</li>
        <li>{tx('Captura do próprio jogador (experimental, desligada por padrão): só com o Npcap instalado e o aviso aceito, lê o tráfego que o jogo recebe e mostra apenas os seus números. Nada de outros jogadores é exibido; nada é enviado ao jogo.', 'Captura de tu propio personaje (experimental, desactivada por defecto): solo con Npcap instalado y el aviso aceptado, lee el tráfico que recibe el juego y muestra únicamente tus números. No se muestra nada de otros jugadores; no se envía nada al juego.')}</li>
        <li>{tx('Preços do Albion Online Data Project; jogadores do killboard público oficial.', 'Precios del Albion Online Data Project; jugadores del killboard público oficial.')}</li>
      </ul>
      <div class="row">
        <a class="btn" href={SITE} onclick={(e) => abrirLink(e, SITE)}>{tx('Abrir o site', 'Abrir el sitio')}</a>
        <a class="btn" href={REPO} onclick={(e) => abrirLink(e, REPO)}>{tx('Código aberto', 'Código abierto')}</a>
        <a class="btn" href={PERMITIDO} onclick={(e) => abrirLink(e, PERMITIDO)}>{tx('O que é permitido', 'Qué está permitido')}</a>
      </div>
      <p class="small muted m0">{tx('Não afiliada à Sandbox Interactive. Albion Online é marca da Sandbox Interactive GmbH.', 'Sin afiliación con Sandbox Interactive. Albion Online es una marca de Sandbox Interactive GmbH.')}</p>
    </section>
  {/if}
</div>
</div>

<style>
  .painel { gap: 14px; padding-top: 14px; }
  .m0 { margin: 0; }
  .cabeca { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .marca { display: flex; align-items: center; gap: 8px; }
  .marca h1 { margin: 0; font-size: 26px; }
  .abas { display: flex; gap: 4px; }
  .abas button { font: inherit; font-size: 15px; background: none; border: 0; color: var(--ink); padding: 6px 12px; border-radius: 999px; cursor: pointer; }
  .abas button:hover { background: var(--surface-2); }
  .abas button[aria-current='page'] { background: var(--accent-soft); font-weight: 600; }
  section h2 { margin: 0; font-size: 18px; }
  .sec-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .btn-mini { padding: 4px 12px; font-size: 14px; }
  .status { display: grid; gap: 10px; }
  .status-lista { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 16px; margin: 0; }
  .status-lista div { display: grid; gap: 2px; }
  .status-lista dt { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .status-lista dd { margin: 0; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .widgets { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .widget-linha { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .widget-linha:last-child { border-bottom: 0; }
  .widget-txt { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .widget-txt p { flex-basis: 100%; }
  .widget-linha .btn { flex: none; min-width: 84px; justify-content: center; }
  .atalho-mini { font-size: 12px; color: var(--muted); }
  .atalhos { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px 16px; }
  .campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px 16px; align-items: end; }
  .campo { gap: 4px; }
  .campo-acao { padding-bottom: 2px; }
  .rot { font-weight: 600; font-size: 14px; }
  input[type='range'] { width: 100%; accent-color: var(--accent); }
  .interruptores { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 16px; }
  .lista { margin: 0; padding-left: 20px; }
  .callout p { margin: 2px 0; }
</style>
