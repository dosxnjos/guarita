<script lang="ts">
  // Gráfico da previsão: média diária real (linha cheia), previsão central (tracejada) e faixa P10–P90 sombreada.
  // Tabela com os mesmos números em <details> para leitor de tela e para quem prefere ler.
  import type { ForecastResponse } from '../../../shared/types';
  import { cityName, fmtDayMonth, fmtInt, fmtSilver } from '../format';
  import { getLocale, tx } from '../i18n/index.svelte';
  import { scrollFocus } from '../ui/scrollFocus';
  import { dayLabel, forecastGeometry, forecastKind } from './view';

  let { r, height = 240 }: { r: ForecastResponse; height?: number } = $props();

  let width = $state(640);
  const uid = 'fc-' + Math.random().toString(36).slice(2, 9);
  const geo = $derived(forecastGeometry(r, width, height));
  const kind = $derived(forecastKind(r));

  const desc = $derived.by(() => {
    const h = r.history;
    if (getLocale() === 'es') {
      if (!h.length) return 'Sin historial.';
      let e = `Precio medio diario de venta en ${cityName(r.city)}, del ${fmtDayMonth(h[0].date)} al ${fmtDayMonth(h[h.length - 1].date)}; último día ${fmtSilver(h[h.length - 1].avg)} de plata.`;
      if (r.forecast.length) {
        e += ` Previsión${kind === 'naive' ? ' ingenua' : ''}: ` +
          r.forecast.map((f) => `${fmtDayMonth(f.date)} ${fmtSilver(f.p50)} (entre ${fmtSilver(f.p10)} y ${fmtSilver(f.p90)})`).join('; ') + '.';
      }
      return e;
    }
    if (!h.length) return 'Sem histórico.';
    let s = `Média diária de venda em ${r.city}, de ${fmtDayMonth(h[0].date)} a ${fmtDayMonth(h[h.length - 1].date)}; último dia ${fmtSilver(h[h.length - 1].avg)} prata.`;
    if (r.forecast.length) {
      s += ` Previsão${kind === 'naive' ? ' ingênua' : ''}: ` +
        r.forecast.map((f) => `${fmtDayMonth(f.date)} ${fmtSilver(f.p50)} (entre ${fmtSilver(f.p10)} e ${fmtSilver(f.p90)})`).join('; ') + '.';
    }
    return s;
  });
</script>

<figure class="hchart fchart">
  <div class="hchart-box" bind:clientWidth={width}>
    <svg width={geo.w} {height} viewBox="0 0 {geo.w} {height}" role="img" aria-labelledby="{uid}-t {uid}-d">
      <title id="{uid}-t">{tx(
        `Preço médio diário em ${r.city} e previsão dos próximos dias`,
        `Precio medio diario en ${cityName(r.city)} y previsión de los próximos días`,
      )}</title>
      <desc id="{uid}-d">{desc}</desc>
      {#each geo.ticks as t}
        <line x1={52} x2={geo.w - 14} y1={t.y} y2={t.y} class="hchart-grid" />
        <text x={46} y={t.y} dy="0.32em" text-anchor="end" class="hchart-tick">{fmtSilver(t.v, true)}</text>
      {/each}
      {#each geo.xTicks as t}
        <text x={t.x} y={height - 6} text-anchor={t.anchor} class="hchart-tick">{t.label}</text>
      {/each}
      {#if geo.band}<path d={geo.band} class="fchart-band" />{/if}
      {#if geo.splitX !== null}
        <line x1={geo.splitX} x2={geo.splitX} y1={12} y2={height - 26} class="fchart-split" stroke-dasharray="2 3" />
      {/if}
      <path d={geo.history} fill="none" class="fchart-line" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      {#if geo.forecast}
        <path d={geo.forecast} fill="none" class="fchart-fc" class:naive={kind === 'naive'} stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" />
      {/if}
      {#each geo.forecastDots as p}<circle cx={p[0]} cy={p[1]} r="3" class="fchart-fdot" />{/each}
      {#if geo.last}<circle cx={geo.last[0]} cy={geo.last[1]} r="3.5" class="fchart-dot" />{/if}
    </svg>
  </div>
  <figcaption class="hchart-legend small muted">
    <span><span class="fkey line" aria-hidden="true"></span>{tx('média real do dia', 'promedio real del día')}</span>
    {#if r.forecast.length}
      <span><span class="fkey fc" aria-hidden="true"></span>{tx(`previsão${kind === 'naive' ? ' ingênua' : ''}`, `previsión${kind === 'naive' ? ' ingenua' : ''}`)}</span>
      <span><span class="fkey band" aria-hidden="true"></span>{tx('faixa provável (P10–P90)', 'rango probable (P10–P90)')}</span>
    {/if}
  </figcaption>
</figure>
<div class="hchart">
  <details class="small">
    <summary>{tx('Ver os dados em tabela', 'Ver los datos en una tabla')}</summary>
    <div class="table-wrap" use:scrollFocus={tx('Tabela da previsão por dia', 'Tabla del pronóstico por día')}>
      <table class="data">
        <thead><tr><th scope="col">{tx('Dia', 'Día')}</th><th scope="col" class="num">{tx('Preço', 'Precio')}</th><th scope="col" class="num">{tx('Faixa provável', 'Rango probable')}</th><th scope="col" class="num">{tx('Unidades vendidas', 'Unidades vendidas')}</th></tr></thead>
        <tbody>
          {#each [...r.forecast].reverse() as f (f.date)}
            <tr><th scope="row">{dayLabel(f.date)} <span class="tag info">{tx('previsão', 'previsión')}</span></th><td class="num">{fmtSilver(f.p50)}</td><td class="num">{fmtSilver(f.p10)} a {fmtSilver(f.p90)}</td><td class="num">—</td></tr>
          {/each}
          {#each [...r.history].reverse() as h (h.date)}
            <tr><th scope="row">{dayLabel(h.date)}</th><td class="num">{fmtSilver(h.avg)}</td><td class="num">—</td><td class="num">{fmtInt(h.count)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</div>

<style>
  .fchart-band { fill: var(--accent-soft); opacity: 0.9; }
  .fchart-split { stroke: var(--muted); stroke-width: 1; }
  .fchart-line { stroke: var(--ink); }
  .fchart-fc { stroke: var(--accent); }
  .fchart-fc.naive { stroke: var(--muted); }
  .fchart-fdot { fill: var(--accent); }
  .fchart-dot { fill: var(--ink); stroke: var(--surface); stroke-width: 2; }
  .fchart .hchart-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; }
  .fkey { display: inline-block; width: 18px; height: 0; vertical-align: middle; margin-right: 6px; border-top: 2px solid var(--ink); }
  .fkey.fc { border-top: 2px dashed var(--accent); }
  .fkey.band { height: 10px; border: 0; background: var(--accent-soft); border-radius: 2px; }
</style>
