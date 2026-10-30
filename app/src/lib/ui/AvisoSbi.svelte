<script lang="ts">
  // Aviso antes de ligar "sempre por cima". Texto do site (src/routes/Janela.svelte), trocando "navegador" por
  // "app". Aceitar grava config.avisoSbiAceitoEm; o Rust confere esse campo antes de fixar qualquer janela.
  import { updateConfig } from '../config';
  import { abrirLink } from '../links';

  // `compacto` (dentro de um widget pequeno): a confirmação e os botões ficam presos no rodapé da área visível
  // enquanto o texto rola por baixo, para ninguém procurar o "Fixar por cima" rolando a janela.
  let { onaceitar, oncancelar, compacto = false }: { onaceitar: () => void; oncancelar: () => void; compacto?: boolean } = $props();
  let entendi = $state(false);
  let gravando = $state(false);

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

<div class="callout warn stack aviso" class:compacto role="region" aria-label="Aviso antes de fixar por cima">
  <strong>Antes de fixar por cima, leia</strong>
  <p>Em 2020 a Sandbox Interactive proibiu ferramentas que fazem “<span lang="en">displaying extra information to the player in the client</span>” (mostrar informação extra ao jogador dentro do cliente do jogo).</p>
  <p>Esta janela é do app da Guarita, separada do cliente: não lê, não altera e não desenha nada dentro do jogo. Mesmo assim, ficar por cima da tela do jogo é uma zona cinza nas regras. <strong>O risco é da sua conta.</strong></p>
  <p class="small"><a href="https://guarita.pages.dev/permitido" onclick={(e) => abrirLink(e, 'https://guarita.pages.dev/permitido')}>Entenda o que é e o que não é permitido</a></p>
  <div class="acoes stack">
    <label class="check">
      <input type="checkbox" bind:checked={entendi} />
      <span>Entendi o risco e quero fixar a janela por cima mesmo assim.</span>
    </label>
    <div class="row">
      <button type="button" class="btn primary" onclick={confirmar} disabled={!entendi || gravando}>Fixar por cima</button>
      <button type="button" class="btn" onclick={oncancelar}>Cancelar</button>
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
