<script lang="ts">
  // Kills por hora do dia em horário de Brasília (24 barras em SVG). O pico ganha destaque e rótulo.
  import { hourBands, hoursAria, peakHours } from './format';
  import { tx } from '../i18n/index.svelte';

  let { hours }: { hours: number[] } = $props();

  const W = 240;
  const H = 90;
  const BASE = 74;
  const step = W / 24;
  const max = $derived(Math.max(1, ...hours));
  const peaks = $derived(new Set(peakHours(hours)));
  const total = $derived(hours.reduce((n, v) => n + (v || 0), 0));
  const bands = $derived(hourBands(hours));
</script>

{#if total > 0}
  <figure class="hours">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={hoursAria(hours)}>
      <line x1="0" x2={W} y1={BASE} y2={BASE} class="axis" />
      {#each hours as v, i (i)}
        {@const h = v > 0 ? Math.max(2, (v / max) * (BASE - 8)) : 0}
        <rect x={i * step + 1} y={BASE - h} width={step - 2} height={h} rx="1.5" class:peak={peaks.has(i)}>
          <title>{i}h: {v} {v === 1 ? tx('kill', 'asesinato') : tx('kills', 'asesinatos')}</title>
        </rect>
        {#if i % 3 === 0}
          <text x={i * step + step / 2} y={H - 4} text-anchor="middle">{i}h</text>
        {/if}
      {/each}
    </svg>
    <figcaption class="muted small">{tx('Horário de Brasília. Barra mais escura: hora de pico.', 'Horario de Brasilia. Barra más oscura: hora pico.')}</figcaption>
  </figure>
  <ul class="bands small">
    {#each bands as b (b.label)}
      <li><span class="muted">{b.label}</span> <strong class="num">{Math.round((b.total / total) * 100)}%</strong></li>
    {/each}
  </ul>
{:else}
  <p class="muted small">{tx('Ainda sem kills da guilda na amostra para mostrar os horários.', 'Todavía no hay asesinatos del gremio en la muestra para mostrar los horarios.')}</p>
{/if}

<style>
  .hours { margin: 0; }
  svg { width: 100%; height: auto; max-height: 200px; display: block; overflow: visible; }
  rect { fill: color-mix(in srgb, var(--accent) 45%, var(--surface-2)); }
  rect.peak { fill: var(--accent); }
  .axis { stroke: var(--line); stroke-width: 1; }
  text { fill: var(--muted); font-size: 8px; font-family: inherit; }
  figcaption { margin-top: 4px; }
  .bands { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px 16px; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); }
  .bands li { display: flex; justify-content: space-between; gap: 8px; }
</style>
