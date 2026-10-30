<script lang="ts">
  // Ícone oficial do item com carregamento preguiçoso; some sem quebrar o layout se a imagem falhar.
  import { iconUrl } from './format';
  let { id, quality = 1, alt, size = 40 }: { id: string; quality?: number; alt: string; size?: number } = $props();
  let failed = $state(false);
</script>

{#if id && !failed}
  <img src={iconUrl(id, quality)} {alt} width={size} height={size} loading="lazy" decoding="async" onerror={() => (failed = true)} />
{:else}
  <span class="ph" style:width="{size}px" style:height="{size}px" aria-hidden="true"></span>
{/if}

<style>
  img, .ph { flex: none; display: inline-block; border-radius: 6px; background: var(--surface-2); }
</style>
