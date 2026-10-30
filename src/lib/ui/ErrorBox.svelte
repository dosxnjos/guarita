<script lang="ts">
  // Caixa de erro com "tentar de novo".
  let { message, title = 'Não deu para carregar', onretry }: { message: string; title?: string; onretry?: () => void } = $props();
</script>

<div class="callout bad errorbox" role="alert">
  <strong>{title}</strong>
  <p class="small">{message}</p>
  {#if onretry}<button type="button" class="btn" onclick={onretry}>Tentar de novo</button>{/if}
</div>
