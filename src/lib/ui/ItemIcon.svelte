<script lang="ts">
  // Ícone oficial do item (render.albiononline.com), com lazy load e caixa vazia se falhar.
  import { RENDER_BASE } from '../../../shared/market';
  let { id, quality = 1, size = 40, alt = '', eager = false }: { id: string; quality?: number; size?: number; alt?: string; eager?: boolean } = $props();
  let failed = $state(false);
  const src = $derived(`${RENDER_BASE}/${encodeURIComponent(id)}.png?quality=${quality}&size=${size > 48 ? 128 : 64}`);
  $effect(() => {
    src;
    failed = false;
  });
</script>

{#if failed}
  <span class="item-icon item-icon-empty" style="width:{size}px;height:{size}px" role={alt ? 'img' : undefined} aria-label={alt || undefined}></span>
{:else}
  <img class="item-icon" {src} {alt} width={size} height={size} loading={eager ? 'eager' : 'lazy'} decoding="async" onerror={() => (failed = true)} />
{/if}
