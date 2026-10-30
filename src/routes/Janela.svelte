<script lang="ts">
  // Janela flutuante: desligada por padrão; ligar exige ler o aviso da regra da SBI e marcar "entendi".
  import { tick } from 'svelte';
  import { go } from '../lib/router';
  import { closePip, openPip, pip, pipSupported } from '../lib/ui/pip.svelte';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';

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

<svelte:head><title>{tx('Janela flutuante · Guarita', 'Ventana flotante · Guarita')}</title></svelte:head>

<section class="page" style="max-width:760px">
  <h1>{tx('Janela flutuante', 'Ventana flotante')}</h1>
  <p class="muted" style="margin-top:0">{tx(
    'Uma janelinha da Guarita que fica por cima do jogo enquanto você joga em modo janela sem borda. Você pode mover e redimensionar à vontade.',
    'Una ventanita de la Guarita que queda encima del juego mientras juegas en modo ventana sin bordes. Puedes moverla y cambiar su tamaño como quieras.',
  )}</p>

  <div class="card stack">
    <h2 style="margin:0">{tx('O que aparece nela', 'Qué muestra')}</h2>
    <ul style="margin:0;padding-left:20px">
      <li>{tx('Relógio de Brasília e do servidor, status e bônus do dia.', 'Reloj de Brasilia y del servidor, estado y bonificaciones del día.')}</li>
      <li>{tx('Busca rápida de preço: o item, a cidade mais barata e a idade do preço.', 'Búsqueda rápida de precio: el objeto, la ciudad más barata y la antigüedad del precio.')}</li>
      <li>{tx('Os últimos alertas criados neste aparelho.', 'Las últimas alertas creadas en este dispositivo.')}</li>
    </ul>
    <p class="small muted" style="margin:0">{tx(
      'Ela não lê nada do jogo: tudo o que mostra vem das mesmas fontes públicas do site, e só quando você pede. Dossiê de jogador não aparece na janela, de propósito: ver o perigo de alguém por cima do jogo, no meio de um encontro, seria vantagem em tempo real. Ele continua no site.',
      'No lee nada del juego: todo lo que muestra viene de las mismas fuentes públicas del sitio, y solo cuando lo pides. El dosier de jugador no aparece en la ventana, a propósito: ver el peligro de alguien encima del juego, en medio de un encuentro, sería una ventaja en tiempo real. Sigue disponible en el sitio.',
    )}</p>
  </div>

  <div class="card stack" style="margin-top:16px">
    <button type="button" class="switch" role="switch" aria-checked={on} onclick={toggle} aria-describedby="janela-estado" bind:this={switchEl}>
      <span class="switch-track" aria-hidden="true"></span>
      <span><strong>{tx('Modo janela flutuante', 'Modo ventana flotante')}</strong><br /><span id="janela-estado" class="small muted">{on ? tx('Ligado neste aparelho', 'Activado en este dispositivo') : tx('Desligado', 'Desactivado')}</span></span>
    </button>

    {#if asking}
      <div class="callout warn stack" role="region" aria-label={tx('Aviso antes de ligar', 'Aviso antes de activar')}>
        <strong>{tx('Antes de ligar, leia', 'Antes de activarla, lee esto')}</strong>
        {#if getLocale() === 'es'}
          <p style="margin:0">En 2020, Sandbox Interactive prohibió las herramientas que hacen “<span lang="en">displaying extra information to the player in the client</span>” (mostrar información extra al jugador dentro del cliente del juego).</p>
          <p style="margin:0">Esta ventana es del navegador, separada del cliente: no lee, no altera y no dibuja nada dentro del juego. Aun así, quedar encima de la pantalla del juego es una zona gris en las reglas. <strong>El riesgo corre por tu cuenta: es tu cuenta del juego la que se arriesga.</strong></p>
        {:else}
          <p style="margin:0">Em 2020 a Sandbox Interactive proibiu ferramentas que fazem “<span lang="en">displaying extra information to the player in the client</span>” (mostrar informação extra ao jogador dentro do cliente do jogo).</p>
          <p style="margin:0">Esta janela é do navegador, separada do cliente: não lê, não altera e não desenha nada dentro do jogo. Mesmo assim, ficar por cima da tela do jogo é uma zona cinza nas regras. <strong>O risco é da sua conta.</strong></p>
        {/if}
        <p class="small" style="margin:0"><a href={href('/permitido')} onclick={go}>{tx('Entenda o que é e o que não é permitido', 'Entiende qué está permitido y qué no')}</a></p>
        <label class="check">
          <input type="checkbox" bind:checked={understood} />
          <span>{tx('Entendi o risco e quero usar a janela flutuante mesmo assim.', 'Entiendo el riesgo y quiero usar la ventana flotante de todos modos.')}</span>
        </label>
        <div class="row">
          <button type="button" class="btn primary" onclick={confirm} disabled={!understood}>{tx('Ligar', 'Activar')}</button>
          <button type="button" class="btn" onclick={cancel}>{tx('Cancelar', 'Cancelar')}</button>
        </div>
      </div>
    {/if}

    {#if on}
      {#if supported}
        <div class="row">
          {#if pip.open}
            <button type="button" class="btn" onclick={openPip}>{tx('Trazer a janela para frente', 'Traer la ventana al frente')}</button>
            <button type="button" class="btn" onclick={closePip}>{tx('Fechar a janela', 'Cerrar la ventana')}</button>
          {:else}
            <button type="button" class="btn primary" onclick={openPip} bind:this={openEl}>{tx('Abrir janela flutuante', 'Abrir ventana flotante')}</button>
          {/if}
        </div>
        {#if pip.error}<p class="bad-text small" role="alert" style="margin:0">{pip.error}</p>{/if}
        <p class="small muted" style="margin:0">{tx(
          'A janela fecha junto com esta aba. Por segurança do navegador, ela só abre com um clique seu.',
          'La ventana se cierra junto con esta pestaña. Por seguridad del navegador, solo se abre con un clic tuyo.',
        )}</p>
      {:else}
        <div class="callout info stack">
          <strong>{tx('Seu navegador não tem janela flutuante', 'Tu navegador no tiene ventana flotante')}</strong>
          <p style="margin:0">{tx(
            'Ela funciona no Chrome e no Edge atualizados (versão 116 ou mais nova), no computador. Enquanto isso:',
            'Funciona en Chrome y Edge actualizados (versión 116 o más reciente), en la computadora. Mientras tanto:',
          )}</p>
          <ul style="margin:0;padding-left:20px">
            <li>{tx('Abra a Guarita numa janela normal do navegador, estreita, ao lado do jogo em modo janela.', 'Abre la Guarita en una ventana normal del navegador, angosta, al lado del juego en modo ventana.')}</li>
            <li>{tx('Ou deixe a Guarita aberta em outra tela, ou no celular.', 'O deja la Guarita abierta en otra pantalla, o en el celular.')}</li>
          </ul>
        </div>
      {/if}
    {/if}
  </div>

  <h2>{tx('Como deixar por cima do jogo', 'Cómo dejarla encima del juego')}</h2>
  <ol>
    {#if getLocale() === 'es'}
      <li>En la configuración de video de Albion, cambia al modo ventana sin bordes (<span lang="en">borderless</span>).</li>
      <li>Activa el modo de arriba y haz clic en “Abrir ventana flotante”.</li>
      <li>Arrastra la ventanita a una esquina y ajusta el tamaño. Sigue encima cuando vuelves al juego.</li>
    {:else}
      <li>Nas configurações de vídeo do Albion, troque para o modo janela sem borda (<span lang="en">borderless</span>).</li>
      <li>Ligue o modo acima e clique em “Abrir janela flutuante”.</li>
      <li>Arraste a janelinha para um canto e ajuste o tamanho. Ela continua por cima quando você volta para o jogo.</li>
    {/if}
  </ol>
  <p class="small muted">{tx(
    'Em tela cheia exclusiva o jogo cobre tudo; por isso o modo janela sem borda.',
    'En pantalla completa exclusiva el juego cubre todo; por eso se usa el modo ventana sin bordes.',
  )}</p>
</section>
