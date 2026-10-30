<script lang="ts">
  // Faixa p25–mediana–p75 dos últimos dias, com a marca do preço mais barato de agora.
  import { fmtSilver as fmtSilverL, rangePos } from '../format';
  import { getLocale, tx } from '../i18n/index.svelte';
  let { p25, median, p75, current = null, currentLabel }:
    { p25: number; median: number | null; p75: number; current?: number | null; currentLabel?: string } = $props();

  const fmtSilver = (n: number | null | undefined, compact = false) => fmtSilverL(n, compact, getLocale());
  const nowLabel = $derived(currentLabel ?? tx('agora', 'ahora'));
  const lo = $derived(Math.min(p25, current ?? p25) * 0.92);
  const hi = $derived(Math.max(p75, current ?? p75) * 1.08);
  const pct = (v: number) => `${(rangePos(v, lo, hi) * 100).toFixed(2)}%`;
  const text = $derived(
    tx(
      `Faixa comum: de ${fmtSilver(p25)} a ${fmtSilver(p75)} de prata` +
        (median !== null ? `, mediana ${fmtSilver(median)}` : '') +
        (current !== null ? `. Mais barato ${nowLabel}: ${fmtSilver(current)}.` : '.'),
      `Rango habitual: de ${fmtSilver(p25)} a ${fmtSilver(p75)} de plata` +
        (median !== null ? `, mediana ${fmtSilver(median)}` : '') +
        (current !== null ? `. Más barato ${nowLabel}: ${fmtSilver(current)}.` : '.'),
    ),
  );
</script>

<div class="rangebar" role="img" aria-label={text}>
  <div class="rangebar-track"></div>
  <div class="rangebar-box" style="left:{pct(p25)}; width:calc({pct(p75)} - {pct(p25)})"></div>
  {#if median !== null}<div class="rangebar-med" style="left:{pct(median)}"></div>{/if}
  <span class="rangebar-lbl bottom" style="left:{pct(p25)}">p25 {fmtSilver(p25, true)}</span>
  <span class="rangebar-lbl bottom" style="left:{pct(p75)}">p75 {fmtSilver(p75, true)}</span>
  {#if median !== null}<span class="rangebar-lbl top" style="left:{pct(median)}">{tx('mediana', 'mediana')} {fmtSilver(median, true)}</span>{/if}
  {#if current !== null}
    <div class="rangebar-mark" style="left:{pct(current)}" title="{tx('Mais barato', 'Más barato')} {nowLabel}: {fmtSilver(current)}"></div>
  {/if}
</div>
