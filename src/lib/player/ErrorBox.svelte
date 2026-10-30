<script lang="ts">
  // Erro com explicação curta e botão de tentar de novo. Sem `hint`, usa o aviso padrão do killboard na língua atual.
  import { tx } from '../i18n/index.svelte';
  let { message, onretry, hint }: { message: string; onretry?: () => void; hint?: string } = $props();
</script>

<div class="callout warn" role="alert">
  <p><strong>{tx('Não deu para carregar.', 'No se pudo cargar.')}</strong> {hint ?? tx('O killboard oficial costuma falhar por alguns minutos. Tente de novo.', 'El killboard oficial suele fallar durante algunos minutos. Inténtalo de nuevo.')}</p>
  <p class="muted small">{tx('Detalhe', 'Detalle')}: {message}</p>
  {#if onretry}<button class="btn" type="button" onclick={onretry}>{tx('Tentar de novo', 'Intentar de nuevo')}</button>{/if}
</div>

<style>
  p { margin: 0 0 8px; }
</style>
