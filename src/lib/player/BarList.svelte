<script lang="ts">
  // Barras horizontais simples (armas mais usadas, fama por área). Valor ao lado, sem depender de cor.
  import ItemIcon from './ItemIcon.svelte';
  import { fmtCompact } from './format';
  import { tx } from '../i18n/index.svelte';
  type Row = { key: string; label: string; value: number; icon?: string };
  let { rows, unit = '', empty }: { rows: Row[]; unit?: string; empty?: string } = $props();
  const max = $derived(Math.max(1, ...rows.map((r) => r.value)));
</script>

{#if rows.length}
  <ul class="bars">
    {#each rows as r (r.key)}
      <li>
        {#if r.icon}<ItemIcon id={r.icon} alt="" size={32} />{/if}
        <div class="body">
          <div class="top"><span class="name">{r.label}</span><span class="num muted small">{fmtCompact(r.value)}{unit}</span></div>
          <div class="track" aria-hidden="true"><div class="fill" style:width="{Math.max(2, (r.value / max) * 100)}%"></div></div>
        </div>
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted small">{empty ?? tx('Sem dado.', 'Sin datos.')}</p>
{/if}

<style>
  .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  li { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; justify-content: space-between; gap: 8px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; margin-top: 3px; }
  .fill { height: 100%; background: var(--accent); border-radius: 99px; }
</style>
