<script lang="ts">
  // Gráfico do ouro: linha hora a hora, faixa p10–p90 (onde ficou 80% das horas), mediana tracejada e ponto atual.
  // Tabela por dia (Brasília) em <details> para leitor de tela e para quem prefere números.
  import type { GoldResponse } from '../../../shared/types';
  import { fmtDateTime, fmtDayMonth, fmtSilver } from '../format';
  import { extent, linePath, niceTicks, scale } from '../ui/chart';
  import { goldDaily, thin } from './view';
  import { getLocale, tx } from '../i18n/index.svelte';
  import { scrollFocus } from '../ui/scrollFocus';

  let { gold, days }: { gold: GoldResponse; days: number } = $props();

  let width = $state(640);
  const height = 240;
  const M = { top: 12, right: 14, bottom: 26, left: 52 };
  const uid = 'gc-' + Math.random().toString(36).slice(2, 9);

  const geo = $derived.by(() => {
    const pts = thin(gold.points, 500);
    const t0 = pts.length ? Date.parse(pts[0].at) : 0;
    const t1 = pts.length ? Date.parse(pts[pts.length - 1].at) : 1;
    const vals = pts.map((p) => p.price);
    if (gold.p10 !== null) vals.push(gold.p10);
    if (gold.p90 !== null) vals.push(gold.p90);
    const [lo, hi] = extent(vals);
    const w = Math.max(260, width);
    const x = scale(t0, t1 === t0 ? t0 + 1 : t1, M.left, w - M.right);
    const y = scale(lo, hi, height - M.bottom, M.top);
    const ticks = niceTicks(lo, hi, 4).filter((t) => t >= lo && t <= hi);
    const d = linePath(pts.map((p) => [x(Date.parse(p.at)), y(p.price)] as [number, number]));
    const last = pts.length ? pts[pts.length - 1] : null;
    const xt = pts.length > 1 ? [t0, (t0 + t1) / 2, t1] : pts.length ? [t0] : [];
    return { w, x, y, ticks, d, last, xt, t0, t1 };
  });

  const desc = $derived(
    getLocale() === 'es'
      ? gold.points.length
        ? `Oro en los últimos ${days} días, del ${fmtDateTime(gold.points[0].at)} al ${fmtDateTime(gold.points[gold.points.length - 1].at)} (hora de Brasilia). ` +
          `Actual: ${fmtSilver(gold.current)} de plata. Rango del 80% de las horas: ${fmtSilver(gold.p10)} a ${fmtSilver(gold.p90)}; mediana ${fmtSilver(gold.p50)}.`
        : 'Sin datos del oro.'
      : gold.points.length
        ? `Ouro nos últimos ${days} dias, de ${fmtDateTime(gold.points[0].at)} a ${fmtDateTime(gold.points[gold.points.length - 1].at)} (Brasília). ` +
          `Atual: ${fmtSilver(gold.current)} de prata. Faixa de 80% das horas: ${fmtSilver(gold.p10)} a ${fmtSilver(gold.p90)}; mediana ${fmtSilver(gold.p50)}.`
        : 'Sem dados do ouro.',
  );
  const daily = $derived(goldDaily(gold.points));
</script>

<figure class="hchart">
  <div class="hchart-box" bind:clientWidth={width}>
    <svg width={geo.w} {height} viewBox="0 0 {geo.w} {height}" role="img" aria-labelledby="{uid}-t {uid}-d">
      <title id="{uid}-t">{tx(`Cotação do ouro em prata, últimos ${days} dias`, `Cotización del oro en plata, últimos ${days} días`)}</title>
      <desc id="{uid}-d">{desc}</desc>
      {#if gold.p10 !== null && gold.p90 !== null}
        <rect x={M.left} width={Math.max(0, geo.w - M.left - M.right)} y={geo.y(gold.p90)} height={Math.max(1, geo.y(gold.p10) - geo.y(gold.p90))} class="gold-band" />
      {/if}
      {#each geo.ticks as t}
        <line x1={M.left} x2={geo.w - M.right} y1={geo.y(t)} y2={geo.y(t)} class="hchart-grid" />
        <text x={M.left - 6} y={geo.y(t)} dy="0.32em" text-anchor="end" class="hchart-tick">{fmtSilver(t, true)}</text>
      {/each}
      {#each geo.xt as t, i}
        <text x={geo.x(t)} y={height - 6} text-anchor={i === 0 ? 'start' : i === geo.xt.length - 1 ? 'end' : 'middle'} class="hchart-tick"
          >{fmtDateTime(new Date(t), undefined, true).slice(0, 5)}</text>
      {/each}
      {#if gold.p50 !== null}
        <line x1={M.left} x2={geo.w - M.right} y1={geo.y(gold.p50)} y2={geo.y(gold.p50)} class="gold-median" stroke-dasharray="4 4" />
      {/if}
      <path d={geo.d} fill="none" class="gold-line" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      {#if geo.last}
        <circle cx={geo.x(Date.parse(geo.last.at))} cy={geo.y(geo.last.price)} r="4" class="gold-dot" />
      {/if}
    </svg>
  </div>
  <figcaption class="gold-legend small muted">
    <span><span class="gold-key line" aria-hidden="true"></span>{tx('Cotação hora a hora', 'Cotización hora a hora')}</span>
    <span><span class="gold-key band" aria-hidden="true"></span>{tx('Faixa de 80% das horas (p10 a p90)', 'Rango del 80% de las horas (p10 a p90)')}</span>
    <span><span class="gold-key median" aria-hidden="true"></span>{tx('Mediana', 'Mediana')}</span>
  </figcaption>
</figure>
<div class="hchart">
  <details class="small">
    <summary>{tx('Ver os dados por dia em tabela', 'Ver los datos por día en una tabla')}</summary>
    <div class="table-wrap" use:scrollFocus>
      <table class="data">
        <caption class="sr-only">{tx('Ouro por dia, horário de Brasília', 'Oro por día, horario de Brasilia')}</caption>
        <thead><tr><th scope="col">{tx('Dia', 'Día')}</th><th scope="col" class="num">{tx('Mínimo', 'Mínimo')}</th><th scope="col" class="num">{tx('Média', 'Promedio')}</th><th scope="col" class="num">{tx('Máximo', 'Máximo')}</th><th scope="col" class="num">{tx('Último', 'Último')}</th></tr></thead>
        <tbody>
          {#each daily as d (d.date)}
            <tr><th scope="row">{fmtDayMonth(d.date)}</th><td class="num">{fmtSilver(d.min)}</td><td class="num">{fmtSilver(d.avg)}</td><td class="num">{fmtSilver(d.max)}</td><td class="num">{fmtSilver(d.last)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</div>

<style>
  .gold-band { fill: var(--accent-soft); }
  .gold-median { stroke: var(--muted); stroke-width: 1.5; }
  .gold-line { stroke: var(--accent); }
  .gold-dot { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
  .gold-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 8px 0; }
  .gold-legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .gold-key { display: inline-block; width: 14px; flex: none; }
  .gold-key.line { height: 3px; border-radius: 2px; background: var(--accent); }
  .gold-key.band { height: 10px; border-radius: 2px; background: var(--accent-soft); border: 1px solid var(--line); }
  .gold-key.median { height: 0; border-top: 2px dashed var(--muted); }
  details .table-wrap { max-height: 320px; overflow: auto; margin-top: 6px; }
</style>
