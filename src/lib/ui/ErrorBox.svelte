<script lang="ts">
  // Caixa de erro com "tentar de novo".
  import { tx } from '../i18n/index.svelte';
  let { message, title, onretry }: { message: string; title?: string; onretry?: () => void } = $props();
</script>

<div class="callout bad errorbox" role="alert">
  <strong>{title ?? tx('Não deu para carregar', 'No se pudo cargar')}</strong>
  <p class="small">{message}</p>
  {#if onretry}<button type="button" class="btn" onclick={onretry}>{tx('Tentar de novo', 'Intentar de nuevo')}</button>{/if}
</div>
