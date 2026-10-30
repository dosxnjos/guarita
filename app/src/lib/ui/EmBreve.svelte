<script lang="ts">
  // Placeholder dos widgets enquanto o módulo dono não entrega a tela.
  import { tx } from '../i18n.svelte';
  let { titulo, descricao }: { titulo: string; descricao: string } = $props();
</script>

<div class="stack em-breve">
  <strong>{titulo}</strong>
  <p class="muted small">{descricao}</p>
  <span class="tag">{tx('Chega na próxima versão', 'Llega en la próxima versión')}</span>
</div>

<style>
  .em-breve p { margin: 0; }
  .em-breve .tag { justify-self: start; }
</style>
