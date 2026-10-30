<script lang="ts">
  // Linha mínima em SVG (sem eixos). values na ordem do tempo; null = dia sem dado.
  import { extent, linePath, scale } from './chart';
  let { values, width = 80, height = 24, color = 'var(--accent)', label }:
    { values: (number | null)[]; width?: number; height?: number; color?: string; label: string } = $props();
  const nums = $derived(values.filter((v): v is number => v !== null && Number.isFinite(v)));
  const d = $derived.by(() => {
    if (nums.length < 2) return '';
    const [lo, hi] = extent(nums, 0.1);
    const x = scale(0, values.length - 1, 1, width - 1);
    const y = scale(lo, hi, height - 2, 2);
    return linePath(values.map((v, i) => (v === null ? null : [x(i), y(v)])));
  });
</script>

{#if d}
  <svg class="sparkline" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
    <title>{label}</title>
    <path {d} fill="none" style="stroke:{color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
{:else}
  <span class="muted small" title={label}>—</span>
{/if}
