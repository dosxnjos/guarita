<script lang="ts">
  // Erro com mensagem na língua do app (ApiError já vem traduzido) e botão de tentar de novo.
  import { tx } from '../i18n.svelte';
  let { mensagem, ontentar }: { mensagem: string; ontentar?: () => void } = $props();
</script>

<div class="callout bad stack" role="alert">
  <span>{mensagem}</span>
  {#if ontentar}
    <div><button type="button" class="btn" onclick={ontentar}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></div>
  {/if}
</div>
