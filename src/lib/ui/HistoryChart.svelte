<script lang="ts">
  // Gráfico de 30 dias: uma linha por cidade, legenda que liga/desliga, eixo de preço e tabela acessível.
  import type { CityHistory } from '../../../shared/types';
  import { citySlug, fmtDayMonth, fmtSilver } from '../format';
  import { dateDomain, extent, linePath, niceTicks, scale } from './chart';

  let { history, title = 'Preço médio diário nos últimos 30 dias' }: { history: CityHistory[]; title?: string } = $props();

  let width = $state(640);
  const height = 240;
  const M = { top: 12, right: 12, bottom: 26, left: 52 };
  const uid = 'hc-' + Math.random().toString(36).slice(2, 9);

  const series = $derived(history.filter((h) => h.days.some((d) => d.avg > 0)));
  let hidden = $state<Record<string, boolean>>({});
  const visible = $derived(series.filter((s) => !hidden[s.city]));
  const dates = $derived(dateDomain(series, 30));

  const geo = $derived.by(() => {
    const vals = visible.flatMap((s) => s.days.filter((d) => d.avg > 0 && dates.includes(d.date.slice(0, 10))).map((d) => d.avg));
    const [lo, hi] = extent(vals);
    const w = Math.max(240, width);
    const x = scale(0, Math.max(1, dates.length - 1), M.left, w - M.right);
    const y = scale(lo, hi, height - M.bottom, M.top);
    const ticks = niceTicks(lo, hi, 4).filter((t) => t >= lo && t <= hi);
    const idx = new Map(dates.map((d, i) => [d, i]));
    const lines = visible.map((s) => {
      const byDate = new Map(s.days.filter((d) => d.avg > 0).map((d) => [d.date.slice(0, 10), d.avg]));
      const pts = dates.map((d, i) => (byDate.has(d) ? ([x(i), y(byDate.get(d)!)] as [number, number]) : null));
      const solo = pts.filter(Boolean).length === 1 ? pts.find(Boolean)! : null;
      return { city: s.city, d: linePath(pts), solo };
    });
    const xt = dates.length ? [0, Math.floor((dates.length - 1) / 2), dates.length - 1].filter((v, i, a) => a.indexOf(v) === i) : [];
    return { w, x, y, ticks, lines, xt, idx };
  });

  const desc = $derived.by(() => {
    if (!series.length) return 'Sem histórico.';
    const last = series
      .map((s) => ({ city: s.city, avg: [...s.days].filter((d) => d.avg > 0).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.avg }))
      .filter((s) => s.avg)
      .sort((a, b) => a.avg! - b.avg!);
    return `${series.length} cidades, de ${fmtDayMonth(dates[0] ?? '')} a ${fmtDayMonth(dates.at(-1) ?? '')}.` +
      (last[0] ? ` Média mais baixa no último dia: ${last[0].city}, ${fmtSilver(last[0].avg)} de prata.` : '');
  });
</script>

{#if !series.length}
  <p class="empty">Sem histórico de preço para este item nos últimos 30 dias.</p>
{:else}
  <figure class="hchart">
    <div class="hchart-box" bind:clientWidth={width}>
      <svg width={geo.w} {height} viewBox="0 0 {geo.w} {height}" role="img" aria-labelledby="{uid}-t {uid}-d">
        <title id="{uid}-t">{title}</title>
        <desc id="{uid}-d">{desc}</desc>
        {#each geo.ticks as t}
          <line x1={M.left} x2={geo.w - M.right} y1={geo.y(t)} y2={geo.y(t)} class="hchart-grid" />
          <text x={M.left - 6} y={geo.y(t)} dy="0.32em" text-anchor="end" class="hchart-tick">{fmtSilver(t, true)}</text>
        {/each}
        {#each geo.xt as i}
          <text x={geo.x(i)} y={height - 6} text-anchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'} class="hchart-tick">{fmtDayMonth(dates[i])}</text>
        {/each}
        {#each geo.lines as l (l.city)}
          <path d={l.d} fill="none" class="hchart-line city-{citySlug(l.city)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
            stroke-dasharray={l.city === 'Black Market' ? '5 4' : undefined} />
          {#if l.solo}<circle cx={l.solo[0]} cy={l.solo[1]} r="3.5" class="hchart-dot city-{citySlug(l.city)}" />{/if}
        {/each}
      </svg>
    </div>
    <figcaption class="hchart-legend">
      {#each series as s (s.city)}
        <button type="button" class="hchart-key" aria-pressed={!hidden[s.city]} onclick={() => (hidden = { ...hidden, [s.city]: !hidden[s.city] })}>
          <span class="hchart-swatch city-{citySlug(s.city)}" aria-hidden="true"></span>{s.city}
        </button>
      {/each}
    </figcaption>
  </figure>
  <div class="hchart">
    <details class="small">
      <summary>Ver os dados em tabela</summary>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th scope="col">Dia</th>{#each series as s}<th scope="col" class="num">{s.city}</th>{/each}</tr></thead>
          <tbody>
            {#each [...dates].reverse() as d}
              <tr>
                <th scope="row">{fmtDayMonth(d)}</th>
                {#each series as s}
                  {@const day = s.days.find((x) => x.date.slice(0, 10) === d)}
                  <td class="num">{day && day.avg > 0 ? fmtSilver(day.avg) : '—'}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </details>
  </div>
{/if}
