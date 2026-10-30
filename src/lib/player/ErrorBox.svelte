<script lang="ts">
  // Erro com explicação curta e botão de tentar de novo.
  let { message, onretry, hint = 'O killboard oficial costuma falhar por alguns minutos. Tente de novo.' }:
    { message: string; onretry?: () => void; hint?: string } = $props();
</script>

<div class="callout warn" role="alert">
  <p><strong>Não deu para carregar.</strong> {hint}</p>
  <p class="muted small">Detalhe: {message}</p>
  {#if onretry}<button class="btn" type="button" onclick={onretry}>Tentar de novo</button>{/if}
</div>

<style>
  p { margin: 0 0 8px; }
</style>
