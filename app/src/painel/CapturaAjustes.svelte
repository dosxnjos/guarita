<script lang="ts">
  // Bloco de Ajustes: liga e desliga a captura passiva do PRÓPRIO jogador (src/lib/capture, Rust em
  // src-tauri/src/capture). Desligada por padrão; só liga depois do aviso aceito (o Rust confere no store).
  import { onMount } from 'svelte';
  import { fmtDateTime, fmtInt } from '../lib/format';
  import { abrirLink } from '../lib/links';
  import {
    acompanharCaptura,
    definirDiagnostico,
    desligarCaptura,
    entregarDados,
    estadoCaptura,
    gravarPref,
    lerPref,
    ligarCaptura,
  } from '../lib/capture/captura';
  import { ROTULO_FASE, faseLigada, prefPadrao } from '../lib/capture/sessao';
  import type { EstadoCaptura, PrefCaptura } from '../lib/capture/tipos';
  import { isTauri } from '../lib/windows';

  const NPCAP = 'https://npcap.com/#download';
  const PERMITIDO = 'https://guarita.pages.dev/permitido';

  let pref = $state<PrefCaptura>(prefPadrao());
  let estado = $state.raw<EstadoCaptura | null>(null);
  let entendi = $state(false);
  let lendoAviso = $state(false);
  let ocupado = $state(false);
  let erro = $state<string | null>(null);

  const fase = $derived(estado?.fase ?? 'desligada');
  const ligada = $derived(faseLigada(fase));
  const txt = (e: unknown) => (e instanceof Error ? e.message : String(e));

  onMount(() => {
    if (!isTauri()) return;
    let off = () => {};
    let parar = false;
    void (async () => {
      try {
        pref = await lerPref();
        estado = await estadoCaptura();
        const o = await acompanharCaptura((e) => (estado = e), null);
        if (parar) o();
        else off = o;
      } catch (e) {
        erro = txt(e);
      }
    })();
    return () => {
      parar = true;
      off();
    };
  });

  async function executar(f: () => Promise<void>) {
    ocupado = true;
    erro = null;
    try {
      await f();
    } catch (e) {
      erro = txt(e);
    } finally {
      ocupado = false;
    }
  }

  const aceitarELigar = () =>
    executar(async () => {
      pref = await gravarPref((p) => {
        p.avisoAceitoEm = new Date().toISOString();
        p.ligada = true;
      });
      lendoAviso = false;
      estado = await ligarCaptura();
    });

  const alternar = () =>
    executar(async () => {
      if (ligada) {
        pref = await gravarPref((p) => void (p.ligada = false));
        estado = await desligarCaptura();
      } else {
        pref = await gravarPref((p) => void (p.ligada = true));
        estado = await ligarCaptura();
      }
    });

  const tentarDeNovo = () =>
    executar(async () => {
      await entregarDados();
      estado = await ligarCaptura();
    });

  const retirarAceite = () =>
    executar(async () => {
      estado = await desligarCaptura();
      pref = await gravarPref((p) => {
        p.ligada = false;
        p.avisoAceitoEm = null;
      });
      entendi = false;
    });

  const alternarDiagnostico = () =>
    executar(async () => {
      pref = await gravarPref((p) => void (p.diagnostico = !p.diagnostico));
      estado = await definirDiagnostico(pref.diagnostico);
    });
</script>

<section class="card stack" aria-labelledby="captura-h">
  <div class="sec-cab">
    <h2 id="captura-h">Captura do próprio jogador <span class="tag">experimental</span></h2>
    <span class="tag {ROTULO_FASE[fase][1]}" role="status" aria-live="polite">{ROTULO_FASE[fase][0]}</span>
  </div>
  <p class="small muted m0">
    Com o Albion aberto, a Guarita lê o tráfego que o jogo recebe no seu PC e mostra só os seus números: prata e fama
    por hora, itens que você pegou com valor estimado, mortes e o mapa. Alimenta os widgets Sessão e Loot. Nada de
    outros jogadores é exibido, nada é enviado ao jogo e nada lê o processo do jogo.
  </p>

  {#if erro}<div class="callout bad small" role="alert">{erro}</div>{/if}

  {#if !isTauri()}
    <p class="small muted m0">Disponível só dentro do app da Guarita.</p>
  {:else if !pref.avisoAceitoEm}
    {#if lendoAviso}
      <div class="callout warn stack aviso" role="region" aria-label="Aviso antes de ligar a captura">
        <strong>Antes de ligar, leia</strong>
        <p>Ler o tráfego de rede só para análise é tolerado pela Sandbox Interactive desde 2017; <strong>não é permitido oficialmente</strong>. O risco é da sua conta.</p>
        <p>A Guarita só escuta, sem modo promíscuo, o que o servidor do jogo manda ao seu PC (porta UDP 5056). Não altera nem envia pacote, não lê a memória do jogo e descarta, ainda na leitura, tudo o que é de outros jogadores (nomes, equipamento, posição).</p>
        <p class="small"><a href={PERMITIDO} onclick={(e) => abrirLink(e, PERMITIDO)}>Entenda o que é e o que não é permitido</a></p>
        <label class="check">
          <input type="checkbox" bind:checked={entendi} />
          <span>Entendi o risco e quero ligar a captura mesmo assim.</span>
        </label>
        <div class="row">
          <button type="button" class="btn primary" onclick={aceitarELigar} disabled={!entendi || ocupado}>Ligar a captura</button>
          <button type="button" class="btn" onclick={() => (lendoAviso = false)}>Cancelar</button>
        </div>
      </div>
    {:else}
      <p class="small m0">Desligada por padrão. Para ligar, leia o aviso sobre a regra da Sandbox Interactive.</p>
      <div><button type="button" class="btn" onclick={() => (lendoAviso = true)}>Ler o aviso</button></div>
    {/if}
  {:else}
    <button type="button" class="switch" role="switch" aria-checked={ligada} disabled={ocupado} onclick={alternar}>
      <span class="switch-track" aria-hidden="true"></span>
      <span><strong>Captura ligada</strong><br /><span class="small muted">Só funciona com este app aberto. Desligar para tudo na hora.</span></span>
    </button>

    {#if fase === 'sem-npcap'}
      <div class="callout warn stack">
        <strong>Npcap não encontrado</strong>
        <p class="small m0">O Windows não deixa um programa ler o tráfego de rede sem um driver de captura. O Npcap é esse driver (o mesmo usado pelo Wireshark e pelo cliente do Albion Data Project). A Guarita não o instala junto: instalar é escolha sua.</p>
        <ol class="small passos">
          <li>Baixe o instalador na página oficial: <a href={NPCAP} onclick={(e) => abrirLink(e, NPCAP)}>npcap.com</a> (o Npcap tem licença própria; leia na página).</li>
          <li>Instale com as opções padrão. <strong>Não marque</strong> “Restrict Npcap driver's access to Administrators only”, senão a Guarita não consegue ler sem rodar como administrador.</li>
          <li>Volte aqui e clique em “Tentar de novo”. Não precisa reiniciar o app.</li>
        </ol>
        <div><button type="button" class="btn" onclick={tentarDeNovo} disabled={ocupado}>Tentar de novo</button></div>
      </div>
    {:else if fase === 'npcap-invalido' || fase === 'sem-permissao' || fase === 'sem-interface'}
      <div class="callout warn stack">
        {#if fase === 'npcap-invalido'}
          <strong>O Npcap está instalado, mas não carregou</strong>
          <p class="small m0">Reinstale a versão atual a partir de <a href={NPCAP} onclick={(e) => abrirLink(e, NPCAP)}>npcap.com</a>.</p>
        {:else if fase === 'sem-permissao'}
          <strong>Nenhuma rede pôde ser aberta</strong>
          <p class="small m0">O mais comum é o Npcap instalado só para administradores. Reinstale a partir de <a href={NPCAP} onclick={(e) => abrirLink(e, NPCAP)}>npcap.com</a> sem a opção “Restrict Npcap driver's access to Administrators only”.</p>
        {:else}
          <strong>Nenhuma placa de rede encontrada</strong>
          <p class="small m0">Confira se o computador está conectado e se o Npcap foi instalado com as opções padrão.</p>
        {/if}
        {#if estado?.mensagem}<p class="small muted m0 mono">Detalhe: {estado.mensagem}</p>{/if}
        <div><button type="button" class="btn" onclick={tentarDeNovo} disabled={ocupado}>Tentar de novo</button></div>
      </div>
    {:else if fase === 'aguardando-jogo'}
      <p class="small m0">Lendo {estado?.interfaces} {estado?.interfaces === 1 ? 'rede' : 'redes'}. Abra o Albion e entre num mapa.</p>
    {:else if fase === 'aguardando-mapa'}
      <p class="small m0">O tráfego do jogo está chegando. Troque de mapa uma vez (entre por um portal) para a Guarita reconhecer o seu personagem.</p>
    {:else if fase === 'capturando'}
      <p class="small m0">Lendo o seu personagem. Abra os widgets Sessão e Loot na aba Início.</p>
    {/if}

    {#if estado && ligada}
      <p class="small muted m0">
        {fmtInt(estado.numeros.datagramas)} pacotes do jogo lidos · {fmtInt(estado.numeros.fatosProprios)} registros seus{#if estado.numeros.criptografados} · {fmtInt(estado.numeros.criptografados)} criptografados (ignorados){/if}.
        Eventos de outros jogadores são descartados.
      </p>
    {/if}

    <details class="small">
      <summary>Detalhes técnicos</summary>
      <div class="stack detalhes">
        {#if estado}
          <p class="m0">Tabela de códigos v{estado.tabela.versao} de {estado.tabela.atualizadoEm} ({estado.tabela.origem === 'remota' ? 'atualizada pelo GitHub' : 'a que veio com o app'}). Os códigos mudam a cada atualização do Albion; a tabela nova chega sem instalar outra versão.</p>
          {#if estado.npcapVersao}<p class="m0 mono">{estado.npcapVersao}</p>{/if}
        {/if}
        <button type="button" class="switch" role="switch" aria-checked={pref.diagnostico} disabled={ocupado} onclick={alternarDiagnostico}>
          <span class="switch-track" aria-hidden="true"></span>
          <span>Modo de diagnóstico<br /><span class="muted">Grava a cada 30 s quantas vezes cada código de evento apareceu (só números, sem conteúdo), para conferir a tabela depois de um patch.</span></span>
        </button>
        {#if estado?.arquivoDiagnostico}<p class="m0 muted">Arquivo: <span class="mono">{estado.arquivoDiagnostico}</span></p>{/if}
      </div>
    </details>

    <p class="small muted m0">Aviso aceito em {fmtDateTime(pref.avisoAceitoEm)} (Brasília). <button type="button" class="linkbtn" onclick={retirarAceite} disabled={ocupado}>Retirar o aceite e desligar</button></p>
  {/if}
</section>

<style>
  .m0 { margin: 0; }
  section h2 { margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sec-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .aviso p { margin: 0; }
  .passos { margin: 4px 0; padding-left: 18px; display: grid; gap: 4px; }
  .detalhes { gap: 8px; padding-top: 6px; }
  summary { cursor: pointer; }
  .mono { word-break: break-all; }
</style>
