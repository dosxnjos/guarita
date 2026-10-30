<script lang="ts">
  import { tx } from '../i18n.svelte';
  let { texto }: { texto?: string } = $props();
</script>

<p class="muted small" role="status" aria-live="polite">{texto ?? tx('Carregando…', 'Cargando…')}</p>
