<script lang="ts">
  let { texto = 'Carregando…' }: { texto?: string } = $props();
</script>

<p class="muted small" role="status" aria-live="polite">{texto}</p>
