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
  import { ROTULO_ACAO, validarAtalho, type FalhaAtalho } from '../lib/shortcuts';
  import { atalhoRepetido, partesAtalho } from '../lib/ui-atalhos';
  import { TEMAS, escolherTema, temaAtual, widgetsParaReabrir, fmtOpacidade, opacidadeEmTodos, type Tema } from '../lib/ui-janelas';
  import { falar, isSilenciada, vozesPtBr } from '../lib/voice';
  import {
    EV_VOZ_SILENCIADA, OPACITY_MIN, WIDGET_LABELS, WIDGET_TITLES, isTauri, listWidgets, openWidget, setCloseToTray, setOnTop, toggleWidget,
    traySetMuted, type WidgetInfo, type WidgetLabel,
  } from '../lib/windows';
  import AvisoSbi from '../lib/ui/AvisoSbi.svelte';
  import Carregando from '../lib/ui/Carregando.svelte';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';
  import CampoAtalho from '../ui/CampoAtalho.svelte';
  import CapturaAjustes from './CapturaAjustes.svelte';
  import { iniciarCapturaNoPainel } from '../lib/capture/captura';

  const SITE = 'https://guarita.pages.dev';
  const REPO = 'https://github.com/dosxnjos/guarita';
  const VERSAO = pkg.version;

  const DESCRICAO: Record<WidgetLabel, string> = {
    preco: 'Digite o item e veja a cidade mais barata, a idade do preço e o flip para o Black Market.',
    dossie: 'Busque um jogador e veja guilda, armas, perigo e as últimas lutas no killboard público.',
    relogio: 'Hora do servidor, status, bônus do dia, ouro, Premium e fim da temporada.',
    alertas: 'Regras de preço checadas por este app enquanto ele estiver aberto.',
    despertador: 'Lembretes de plantação, animais e foco, avisados com o app aberto.',
    lente: 'Experimental: preço nas outras cidades do item aberto no mercado, com o cliente do Albion Data Project.',
    sessao: 'Experimental: prata, fama e loot por hora do seu personagem. Precisa da captura ligada em Ajustes.',
    loot: 'Experimental: itens que você pegou nesta sessão, com valor estimado. Precisa da captura ligada em Ajustes.',
  };
  const ATALHO_DO_WIDGET: Partial<Record<WidgetLabel, AcaoAtalho>> = { preco: 'abrirPreco', dossie: 'abrirDossie' };

  type Aba = 'inicio' | 'ajustes' | 'sobre';
  let aba = $state<Aba>('inicio');

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
      erroAcao = `Não foi possível mudar o início com o Windows: ${erroTxt(e)}`;
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
      if (outra) return `Esse atalho já está em “${ROTULO_ACAO[outra]}”.`;
    }
    await updateConfig((c) => {
      c.atalhos[acao] = atalho;
    });
    return null;
  }

  async function carregarVozes() {
    vozes = await vozesPtBr();
  }

  function testarVoz() {
    falar('A Guarita está pronta. O preço da bolsa caiu em Martlock.', 'alta');
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
      // O registro do Windows é a verdade de "Iniciar com o Windows": se divergir da config, desliga (nunca liga).
      await reconciliarIniciarComWindows().catch((e) => console.warn('iniciar com o Windows', e));
      for (const l of widgetsParaReabrir(c)) await openWidget(l).catch((e) => console.warn('reabrir', l, e));
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
      <span class="tag">no PC</span>
    </div>
    <nav class="abas" aria-label="Seções do painel">
      <button type="button" aria-current={aba === 'inicio' ? 'page' : undefined} onclick={() => (aba = 'inicio')}>Início</button>
      <button type="button" aria-current={aba === 'ajustes' ? 'page' : undefined} onclick={() => (aba = 'ajustes')}>Ajustes</button>
      <button type="button" aria-current={aba === 'sobre' ? 'page' : undefined} onclick={() => (aba = 'sobre')}>Sobre</button>
    </nav>
  </header>

  {#if erroAcao}<ErroCaixa mensagem={erroAcao} />{/if}

  {#if aba === 'inicio'}
    <section class="card status" aria-labelledby="status-h">
      <div class="sec-cab">
        <h2 id="status-h">Status</h2>
        <button type="button" class="btn btn-mini" onclick={() => carregarRelogio(true)} disabled={atualizando}>{atualizando ? 'Atualizando…' : 'Atualizar'}</button>
      </div>
      <dl class="status-lista">
        <div>
          <dt>API da Guarita</dt>
          <dd>
            {#if apiOk === null}<span class="muted">conferindo…</span>
            {:else if apiOk}<span class="dot good" aria-hidden="true"></span> Respondendo
            {:else}<span class="dot bad" aria-hidden="true"></span> Sem resposta{/if}
          </dd>
        </div>
        <div>
          <dt>Servidor do Albion</dt>
          <dd>
            {#if relogio}
              <span class="dot {serverTone(relogio.server.status)}" aria-hidden="true"></span> {serverLabel(relogio.server.status)}
            {:else}<span class="muted">—</span>{/if}
          </dd>
        </div>
        <div>
          <dt>Última atualização</dt>
          <dd>{relogioEm ? `${fmtDateTime(relogioEm)} (Brasília)` : '—'}</dd>
        </div>
      </dl>
      {#if erroRelogio}<p class="small bad-text m0">{erroRelogio}</p>{/if}
      {#if apiOk === null}<Carregando texto="Conferindo a API da Guarita…" />{/if}
    </section>

    <section class="card stack" aria-labelledby="widgets-h">
      <div class="sec-cab">
        <h2 id="widgets-h">Widgets</h2>
        {#if cfg}
          <button type="button" class="switch" role="switch" aria-checked={silenciada} onclick={() => mudarSilencio(!silenciada)}>
            <span class="switch-track" aria-hidden="true"></span><span class="small">Silenciar voz</span>
          </button>
        {/if}
      </div>
      <p class="muted small m0">Janelas pequenas para deixar ao lado do jogo ou em outra tela. Cada uma lembra posição e tamanho.</p>
      <ul class="widgets">
        {#each WIDGET_LABELS as l (l)}
          {@const acao = ATALHO_DO_WIDGET[l]}
          {@const at = acao && cfg ? cfg.atalhos[acao] : null}
          <li class="widget-linha">
            <div class="widget-txt">
              <strong>{WIDGET_TITLES[l]}</strong>
              {#if aberto(l)}<span class="tag good">aberto</span>{/if}
              {#if at}<span class="atalho-mini">{#each partesAtalho(at) as p, i (i)}{#if i}+{/if}<kbd>{p}</kbd>{/each}</span>{/if}
              <p class="small muted m0">{DESCRICAO[l]}</p>
            </div>
            <button type="button" class="btn" class:primary={!aberto(l)} aria-pressed={aberto(l)} onclick={() => alternar(l)}>
              {aberto(l) ? 'Fechar' : 'Abrir'}
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <p class="small muted m0">
      A Guarita só trabalha com este app aberto: fechou, os avisos param e nada fica rodando no computador.
      {#if cfg && !cfg.fecharParaBandeja}Fechar esta janela encerra o app.{:else}Fechar esta janela deixa o app na bandeja, perto do relógio do Windows.{/if}
    </p>
  {:else if aba === 'ajustes' && cfg}
    <section class="card stack" aria-labelledby="atalhos-h">
      <h2 id="atalhos-h">Atalhos globais</h2>
      <p class="small muted m0">Funcionam mesmo com o jogo em primeiro plano. Cada atalho só mexe na Guarita, nunca manda tecla ao jogo. Começam vazios: escolha combinações que o jogo não usa.</p>
      <p class="small muted m0">O atalho abre a janela da Guarita e passa o foco para ela, como um Alt+Tab. Use o Albion em modo janela sem borda (Configurações de vídeo do jogo); em tela cheia exclusiva, o jogo minimiza ou pisca.</p>
      <div class="atalhos">
        {#each ACOES_ATALHO as a (a)}
          <CampoAtalho rotulo={ROTULO_ACAO[a]} valor={cfg.atalhos[a]} validar={validarAtalho} onmudar={(v) => gravarAtalho(a, v)} />
        {/each}
      </div>
      {#if falhas.length}
        <div class="callout bad small" role="alert">
          {#each falhas as f (f.acao)}<p>{ROTULO_ACAO[f.acao]} ({f.atalho}): {f.erro}</p>{/each}
        </div>
      {/if}
    </section>

    <section class="card stack" aria-labelledby="voz-h">
      <h2 id="voz-h">Voz</h2>
      <button type="button" class="switch" role="switch" aria-checked={cfg.voz.ligada} onclick={() => updateConfig((c) => void (c.voz.ligada = !c.voz.ligada))}>
        <span class="switch-track" aria-hidden="true"></span>
        <span><strong>Falar os avisos</strong><br /><span class="small muted">Usa as vozes em português instaladas no Windows.</span></span>
      </button>
      <div class="campos">
        <label class="stack campo">
          <span class="rot">Voz</span>
          {#if vozes === null}
            <span class="small muted">Procurando vozes…</span>
          {:else if vozes.length}
            <select class="input" value={cfg.voz.voz ?? ''} onchange={(e) => updateConfig((c) => void (c.voz.voz = e.currentTarget.value || null))}>
              <option value="">Padrão ({vozes[0].name})</option>
              {#each vozes as v (v.name)}<option value={v.name}>{v.name}</option>{/each}
            </select>
          {:else}
            <span class="small warn-text">Nenhuma voz em português encontrada. Instale em Configurações do Windows › Hora e idioma › Fala.</span>
          {/if}
        </label>
        <label class="stack campo">
          <span class="rot">Volume: {Math.round(cfg.voz.volume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" value={cfg.voz.volume} onchange={(e) => updateConfig((c) => void (c.voz.volume = Number(e.currentTarget.value)))} />
        </label>
        <label class="stack campo">
          <span class="rot">Velocidade: {cfg.voz.velocidade.toLocaleString('pt-BR')}×</span>
          <input type="range" min="0.5" max="2" step="0.1" value={cfg.voz.velocidade} onchange={(e) => updateConfig((c) => void (c.voz.velocidade = Number(e.currentTarget.value)))} />
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn" onclick={testarVoz} disabled={!cfg.voz.ligada || silenciada}>Testar a voz</button>
        {#if silenciada}<span class="small muted">A voz está silenciada pela bandeja ou pelo atalho.</span>{/if}
      </div>
    </section>

    <section class="card stack" aria-labelledby="avisos-h">
      <h2 id="avisos-h">Avisos</h2>
      <div class="interruptores">
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.notificacao} onclick={() => updateConfig((c) => void (c.avisos.notificacao = !c.avisos.notificacao))}>
          <span class="switch-track" aria-hidden="true"></span><span>Notificação do Windows</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.som} onclick={() => updateConfig((c) => void (c.avisos.som = !c.avisos.som))}>
          <span class="switch-track" aria-hidden="true"></span><span>Som curto</span>
        </button>
      </div>
      <span class="rot">Relógio do servidor</span>
      <div class="interruptores">
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.servidor} onclick={() => updateConfig((c) => void (c.avisos.relogio.servidor = !c.avisos.relogio.servidor))}>
          <span class="switch-track" aria-hidden="true"></span><span>Servidor caiu ou voltou</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.bonusAcabando} onclick={() => updateConfig((c) => void (c.avisos.relogio.bonusAcabando = !c.avisos.relogio.bonusAcabando))}>
          <span class="switch-track" aria-hidden="true"></span><span>Bônus acabando</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.festividade} onclick={() => updateConfig((c) => void (c.avisos.relogio.festividade = !c.avisos.relogio.festividade))}>
          <span class="switch-track" aria-hidden="true"></span><span>Bônus começou</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked={cfg.avisos.relogio.temporada} onclick={() => updateConfig((c) => void (c.avisos.relogio.temporada = !c.avisos.relogio.temporada))}>
          <span class="switch-track" aria-hidden="true"></span><span>Fim da temporada perto</span>
        </button>
      </div>
    </section>

    <section class="card stack" aria-labelledby="janelas-h">
      <h2 id="janelas-h">Janelas</h2>
      <div class="campos">
        <label class="stack campo">
          <span class="rot">Opacidade do fundo: {fmtOpacidade(opacidadePadrao)}</span>
          <input type="range" min={OPACITY_MIN} max="1" step="0.05" bind:value={opacidadePadrao} />
        </label>
        <div class="campo-acao"><button type="button" class="btn" onclick={aplicarOpacidadeTodos}>Aplicar em todos os widgets</button></div>
      </div>
      <p class="small muted m0">O texto continua opaco; só o fundo fica translúcido. Cada widget também troca a opacidade pelo botão da própria barra.</p>

      <span class="rot">Sempre por cima</span>
      <p class="small muted m0">Para ver as janelas sobre o jogo, use o Albion em modo janela sem borda (Configurações de vídeo do jogo). Em tela cheia exclusiva, o jogo cobre tudo.</p>
      {#if !cfg.avisoSbiAceitoEm}
        {#if lendoAviso}
          <AvisoSbi onaceitar={() => (lendoAviso = false)} oncancelar={() => (lendoAviso = false)} />
        {:else}
          <p class="small m0">Nenhuma janela fica por cima do jogo até você ler o aviso sobre a regra da Sandbox Interactive.</p>
          <div><button type="button" class="btn" onclick={() => (lendoAviso = true)}>Ler o aviso</button></div>
        {/if}
      {:else}
        <p class="small muted m0">Aviso aceito em {fmtDateTime(cfg.avisoSbiAceitoEm)} (Brasília). <button type="button" class="linkbtn" onclick={retirarAceite}>Retirar o aceite e soltar todas</button></p>
        <div class="interruptores">
          {#each WIDGET_LABELS as l (l)}
            <button type="button" class="switch" role="switch" aria-checked={cfg.janelas[l].porCima} onclick={() => mudarPorCima(l, !cfg!.janelas[l].porCima)}>
              <span class="switch-track" aria-hidden="true"></span><span>{WIDGET_TITLES[l]}</span>
            </button>
          {/each}
        </div>
      {/if}
      <p class="small m0"><a href="{SITE}/permitido" onclick={(e) => abrirLink(e, `${SITE}/permitido`)}>O que é e o que não é permitido</a></p>
    </section>

    <CapturaAjustes />

    <section class="card stack" aria-labelledby="aparencia-h">
      <h2 id="aparencia-h">Aparência</h2>
      <div class="seg" role="group" aria-label="Tema">
        {#each TEMAS as t (t.id)}
          <button type="button" aria-pressed={tema === t.id} onclick={() => trocarTema(t.id)}>{t.nome}</button>
        {/each}
      </div>
    </section>

    <section class="card stack" aria-labelledby="sistema-h">
      <h2 id="sistema-h">Sistema</h2>
      <button type="button" class="switch" role="switch" aria-checked={cfg.iniciarComWindows} onclick={() => mudarIniciar(!cfg!.iniciarComWindows)}>
        <span class="switch-track" aria-hidden="true"></span>
        <span><strong>Iniciar com o Windows</strong><br /><span class="small muted">Desligado por padrão. Não cria tarefa agendada nem serviço: só abre o app quando você entra no Windows.</span></span>
      </button>
      <button type="button" class="switch" role="switch" aria-checked={cfg.fecharParaBandeja} onclick={() => mudarBandeja(!cfg!.fecharParaBandeja)}>
        <span class="switch-track" aria-hidden="true"></span>
        <span><strong>Fechar para a bandeja</strong><br /><span class="small muted">Desligado: fechar o painel encerra a Guarita e todos os avisos.</span></span>
      </button>
    </section>
  {:else if aba === 'sobre'}
    <section class="card stack" aria-labelledby="sobre-h">
      <h2 id="sobre-h">Sobre</h2>
      <p class="m0"><strong>Guarita no PC</strong> · versão {VERSAO}</p>
      <p class="small m0">Companheiro em português para quem joga Albion Online no servidor Americas. Usa os mesmos dados do site.</p>
      <ul class="small lista">
        <li>Só trabalha com o app aberto: nada de tarefa agendada ou serviço do Windows.</li>
        <li>Não lê o processo do jogo e não manda tecla nem clique ao jogo.</li>
        <li>Captura do próprio jogador (experimental, desligada por padrão): só com o Npcap instalado e o aviso aceito, lê o tráfego que o jogo recebe e mostra apenas os seus números. Nada de outros jogadores é exibido; nada é enviado ao jogo.</li>
        <li>Preços do Albion Online Data Project; jogadores do killboard público oficial.</li>
      </ul>
      <div class="row">
        <a class="btn" href={SITE} onclick={(e) => abrirLink(e, SITE)}>Abrir o site</a>
        <a class="btn" href={REPO} onclick={(e) => abrirLink(e, REPO)}>Código aberto</a>
        <a class="btn" href="{SITE}/permitido" onclick={(e) => abrirLink(e, `${SITE}/permitido`)}>O que é permitido</a>
      </div>
      <p class="small muted m0">Não afiliada à Sandbox Interactive. Albion Online é marca da Sandbox Interactive GmbH.</p>
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
