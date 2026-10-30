<script lang="ts">
  // Janela flutuante: desligada por padrão; ligar exige ler o aviso da regra da SBI e marcar "entendi".
  import { tick } from 'svelte';
  import { go } from '../lib/router';
  import { closePip, openPip, pip, pipSupported } from '../lib/ui/pip.svelte';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const KEY = 'guarita.janela';
  function readOn(): boolean {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  }
  function saveOn(v: boolean) {
    try {
      if (v) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }

  const supported = pipSupported();
  let on = $state(readOn());
  let asking = $state(false);
  let understood = $state(false);

  function toggle() {
    if (on) {
      on = false;
      asking = false;
      saveOn(false);
      closePip();
    } else {
      asking = true;
      understood = false;
    }
  }
  // O aviso sai do DOM com o botão focado: o foco vai para o próximo passo (abrir a janela) ou volta ao interruptor,
  // senão cai no <body> e quem usa teclado ou leitor de tela perde a posição.
  let switchEl = $state<HTMLButtonElement | null>(null);
  let openEl = $state<HTMLButtonElement | null>(null);

  async function confirm() {
    if (!understood) return;
    on = true;
    asking = false;
    saveOn(true);
    await tick();
    (openEl ?? switchEl)?.focus();
  }
  async function cancel() {
    asking = false;
    await tick();
    switchEl?.focus();
  }
</script>

<svelte:head><title>Janela flutuante · Guarita</title></svelte:head>

<section class="page" style="max-width:760px">
  <h1>Janela flutuante</h1>
  <p class="muted" style="margin-top:0">Uma janelinha da Guarita que fica por cima do jogo enquanto você joga em modo janela sem borda. Você pode mover e redimensionar à vontade.</p>

  <div class="card stack">
    <h2 style="margin:0">O que aparece nela</h2>
    <ul style="margin:0;padding-left:20px">
      <li>Relógio de Brasília e do servidor, status e bônus do dia.</li>
      <li>Busca rápida de preço: o item, a cidade mais barata e a idade do preço.</li>
      <li>Os últimos alertas criados neste aparelho.</li>
    </ul>
    <p class="small muted" style="margin:0">Ela não lê nada do jogo: tudo o que mostra vem das mesmas fontes públicas do site, e só quando você pede. Dossiê de jogador não aparece na janela, de propósito: ver o perigo de alguém por cima do jogo, no meio de um encontro, seria vantagem em tempo real. Ele continua no site.</p>
  </div>

  <div class="card stack" style="margin-top:16px">
    <button type="button" class="switch" role="switch" aria-checked={on} onclick={toggle} aria-describedby="janela-estado" bind:this={switchEl}>
      <span class="switch-track" aria-hidden="true"></span>
      <span><strong>Modo janela flutuante</strong><br /><span id="janela-estado" class="small muted">{on ? 'Ligado neste aparelho' : 'Desligado'}</span></span>
    </button>

    {#if asking}
      <div class="callout warn stack" role="region" aria-label="Aviso antes de ligar">
        <strong>Antes de ligar, leia</strong>
        <p style="margin:0">Em 2020 a Sandbox Interactive proibiu ferramentas que fazem “<span lang="en">displaying extra information to the player in the client</span>” (mostrar informação extra ao jogador dentro do cliente do jogo).</p>
        <p style="margin:0">Esta janela é do navegador, separada do cliente: não lê, não altera e não desenha nada dentro do jogo. Mesmo assim, ficar por cima da tela do jogo é uma zona cinza nas regras. <strong>O risco é da sua conta.</strong></p>
        <p class="small" style="margin:0"><a href="/permitido" onclick={go}>Entenda o que é e o que não é permitido</a></p>
        <label class="check">
          <input type="checkbox" bind:checked={understood} />
          <span>Entendi o risco e quero usar a janela flutuante mesmo assim.</span>
        </label>
        <div class="row">
          <button type="button" class="btn primary" onclick={confirm} disabled={!understood}>Ligar</button>
          <button type="button" class="btn" onclick={cancel}>Cancelar</button>
        </div>
      </div>
    {/if}

    {#if on}
      {#if supported}
        <div class="row">
          {#if pip.open}
            <button type="button" class="btn" onclick={openPip}>Trazer a janela para frente</button>
            <button type="button" class="btn" onclick={closePip}>Fechar a janela</button>
          {:else}
            <button type="button" class="btn primary" onclick={openPip} bind:this={openEl}>Abrir janela flutuante</button>
          {/if}
        </div>
        {#if pip.error}<p class="bad-text small" role="alert" style="margin:0">{pip.error}</p>{/if}
        <p class="small muted" style="margin:0">A janela fecha junto com esta aba. Por segurança do navegador, ela só abre com um clique seu.</p>
      {:else}
        <div class="callout info stack">
          <strong>Seu navegador não tem janela flutuante</strong>
          <p style="margin:0">Ela funciona no Chrome e no Edge atualizados (versão 116 ou mais nova), no computador. Enquanto isso:</p>
          <ul style="margin:0;padding-left:20px">
            <li>Abra a Guarita numa janela normal do navegador, estreita, ao lado do jogo em modo janela.</li>
            <li>Ou deixe a Guarita aberta em outra tela, ou no celular.</li>
          </ul>
        </div>
      {/if}
    {/if}
  </div>

  <h2>Como deixar por cima do jogo</h2>
  <ol>
    <li>Nas configurações de vídeo do Albion, troque para o modo janela sem borda (<span lang="en">borderless</span>).</li>
    <li>Ligue o modo acima e clique em “Abrir janela flutuante”.</li>
    <li>Arraste a janelinha para um canto e ajuste o tamanho. Ela continua por cima quando você volta para o jogo.</li>
  </ol>
  <p class="small muted">Em tela cheia exclusiva o jogo cobre tudo; por isso o modo janela sem borda.</p>
</section>
