<script lang="ts">
  // Aviso antes de ligar "sempre por cima". Texto do site (src/routes/Janela.svelte), trocando "navegador" por
  // "app". Aceitar grava config.avisoSbiAceitoEm; o Rust confere esse campo antes de fixar qualquer janela.
  import { updateConfig } from '../config';
  import { getLocale, linkSite, tx } from '../i18n.svelte';
  import { abrirLink } from '../links';

  // `compacto` (dentro de um widget pequeno): a confirmação e os botões ficam presos no rodapé da área visível
  // enquanto o texto rola por baixo, para ninguém procurar o "Fixar por cima" rolando a janela.
  let { onaceitar, oncancelar, compacto = false }: { onaceitar: () => void; oncancelar: () => void; compacto?: boolean } = $props();
  let entendi = $state(false);
  let gravando = $state(false);
  const permitido = $derived(linkSite('/permitido'));

  async function confirmar() {
    gravando = true;
    try {
      await updateConfig((c) => {
        c.avisoSbiAceitoEm = new Date().toISOString();
      });
      onaceitar();
    } finally {
      gravando = false;
    }
  }
</script>

<div class="callout warn stack aviso" class:compacto role="region" aria-label={tx('Aviso antes de fixar por cima', 'Aviso antes de fijar encima')}>
  <strong>{tx('Antes de fixar por cima, leia', 'Antes de fijar la ventana encima, lee esto')}</strong>
  {#if getLocale() === 'es'}
    <p>En 2020, Sandbox Interactive prohibió las herramientas que hacen “<span lang="en">displaying extra information to the player in the client</span>” (mostrar información extra al jugador dentro del cliente del juego).</p>
    <p>Esta ventana es de la app de la Guarita, separada del cliente: no lee, no altera y no dibuja nada dentro del juego. Aun así, quedar encima de la pantalla del juego es una zona gris en las reglas. <strong>El riesgo es tuyo: lo que está en juego es tu cuenta de Albion.</strong></p>
  {:else}
    <p>Em 2020 a Sandbox Interactive proibiu ferramentas que fazem “<span lang="en">displaying extra information to the player in the client</span>” (mostrar informação extra ao jogador dentro do cliente do jogo).</p>
    <p>Esta janela é do app da Guarita, separada do cliente: não lê, não altera e não desenha nada dentro do jogo. Mesmo assim, ficar por cima da tela do jogo é uma zona cinza nas regras. <strong>O risco é da sua conta.</strong></p>
  {/if}
  <p class="small"><a href={permitido} onclick={(e) => abrirLink(e, permitido)}>{tx('Entenda o que é e o que não é permitido', 'Entiende qué está permitido y qué no')}</a></p>
  <div class="acoes stack">
    <label class="check">
      <input type="checkbox" bind:checked={entendi} />
      <span>{tx('Entendi o risco e quero fixar a janela por cima mesmo assim.', 'Entiendo el riesgo y quiero fijar la ventana encima de todos modos.')}</span>
    </label>
    <div class="row">
      <button type="button" class="btn primary" onclick={confirmar} disabled={!entendi || gravando}>{tx('Fixar por cima', 'Fijar encima')}</button>
      <button type="button" class="btn" onclick={oncancelar}>{tx('Cancelar', 'Cancelar')}</button>
    </div>
  </div>
</div>

<style>
  .aviso p { margin: 0; }
  .acoes { gap: 8px; }
  .compacto .acoes {
    position: sticky;
    bottom: 0;
    padding: 8px 0 4px;
    background: var(--warn-bg);
    box-shadow: 0 -8px 8px -6px var(--warn-bg);
  }
</style>
