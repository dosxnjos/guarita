<script lang="ts">
  // Kills e mortes por dia (dia do jogo, UTC), em barras horizontais pareadas. Números ao lado: não depende de cor.
  import type { GuildSummary } from '../../../shared/types';
  import { lastDays } from './format';
  import { fmtDayMonth } from '../format';
  import { tx } from '../i18n/index.svelte';

  let { days, n = 14 }: { days: GuildSummary['days']; n?: number } = $props();
  const view = $derived(lastDays(days, n));
</script>

{#if view.rows.length}
  <ul class="days" aria-label={tx('Kills e mortes por dia', 'Asesinatos y muertes por día')}>
    {#each view.rows as d (d.date)}
      <li>
        <span class="date num small">{fmtDayMonth(d.date)}</span>
        <div class="bars" aria-hidden="true">
          <div class="bar kill" style:width="{d.kills ? Math.max(2, (d.kills / view.max) * 100) : 0}%"></div>
          <div class="bar death" style:width="{d.deaths ? Math.max(2, (d.deaths / view.max) * 100) : 0}%"></div>
        </div>
        <span class="vals small num"><span class="good-text">{d.kills}</span> / <span class="bad-text">{d.deaths}</span></span>
        <span class="sr-only">{tx(`${d.kills} kills e ${d.deaths} mortes`, `${d.kills} ${d.kills === 1 ? 'asesinato' : 'asesinatos'} y ${d.deaths} ${d.deaths === 1 ? 'muerte' : 'muertes'}`)}</span>
      </li>
    {/each}
  </ul>
  <p class="legend muted small">
    <span><i class="sw kill"></i> {tx('Kills', 'Asesinatos')}</span> <span><i class="sw death"></i> {tx('Mortes', 'Muertes')}</span> · {tx('dia do jogo (vira às 21h de Brasília)', 'día del juego (cambia a las 21 h de Brasilia)')}
  </p>
{:else}
  <p class="muted small">{tx('Ainda sem dias registrados para esta guilda.', 'Todavía no hay días registrados para este gremio.')}</p>
{/if}

<style>
  .days { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  li { display: grid; grid-template-columns: 44px 1fr auto; gap: 8px; align-items: center; }
  .bars { display: grid; gap: 2px; min-width: 0; }
  .bar { height: 7px; border-radius: 99px; }
  .bar.kill, .sw.kill { background: var(--good); }
  .bar.death, .sw.death { background: var(--bad); }
  .vals { white-space: nowrap; }
  .legend { margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; vertical-align: middle; }
</style>
