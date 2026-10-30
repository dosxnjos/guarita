<script lang="ts">
  // Esqueleto de carregamento. lines = quantas faixas; label só para leitor de tela.
  import { tx } from '../i18n/index.svelte';
  let { lines = 3, height = 18, label }: { lines?: number; height?: number; label?: string } = $props();
</script>

<div class="loading stack" role="status" aria-busy="true" aria-live="polite">
  <span class="sr-only">{label ?? tx('Carregando…', 'Cargando…')}</span>
  {#each Array(lines) as _, i}
    <div class="skeleton" style="height:{height}px; width:{i === lines - 1 && lines > 1 ? 60 : 100}%"></div>
  {/each}
</div>
