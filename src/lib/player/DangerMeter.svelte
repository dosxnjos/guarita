<script lang="ts">
  // Medidor de perigo: arco de 0 a 100, cor pelo rótulo, motivos em lista.
  import type { Danger } from '../../../shared/types';
  import { dangerHeadline, dangerTone } from './format';
  let { danger }: { danger: Danger } = $props();

  const score = $derived(Math.max(0, Math.min(100, Math.round(danger.score || 0))));
  const tone = $derived(dangerTone(danger.label));
  // arco semicircular de raio 80: comprimento = π·80
  const LEN = Math.PI * 80;
  const dash = $derived(danger.label === 'sem dado' ? 0 : (score / 100) * LEN);
</script>

<div class="meter {tone}">
  <div class="gauge" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}
    aria-label="Perigo: {dangerHeadline(danger.label)}, {score} de 100">
    <svg viewBox="0 0 200 110" aria-hidden="true">
      <path d="M20 100 A80 80 0 0 1 180 100" class="track" />
      <path d="M20 100 A80 80 0 0 1 180 100" class="fill" stroke-dasharray="{dash} {LEN}" />
    </svg>
    <div class="read">
      <strong class="label">{dangerHeadline(danger.label)}</strong>
      {#if danger.label !== 'sem dado'}<span class="num muted">{score}/100</span>{/if}
    </div>
  </div>
  <div class="why">
    <h3>Por quê</h3>
    {#if danger.reasons.length}
      <ul>{#each danger.reasons as r, i (i)}<li>{r}</li>{/each}</ul>
    {:else}
      <p class="muted small">Poucas lutas recentes no killboard para formar opinião.</p>
    {/if}
    <p class="muted small">Leitura baseada só nas últimas kills e mortes públicas. Não é previsão.</p>
  </div>
</div>

<style>
  .meter { --tone: var(--muted); display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); align-items: center; }
  .meter.good { --tone: var(--good); }
  .meter.warn { --tone: var(--warn); }
  .meter.bad { --tone: var(--bad); }
  @media (min-width: 640px) { .meter { grid-template-columns: 260px minmax(0, 1fr); } }
  .gauge { position: relative; max-width: 260px; width: 100%; margin: 0 auto; }
  svg { display: block; width: 100%; height: auto; }
  path { fill: none; stroke-width: 18; stroke-linecap: round; }
  .track { stroke: var(--surface-2); }
  .fill { stroke: var(--tone); transition: stroke-dasharray 0.6s ease; }
  @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
  .read { position: absolute; inset: auto 0 0 0; display: grid; justify-items: center; }
  .label { font-size: 28px; line-height: 1.1; color: var(--tone); }
  .why h3 { font-size: 16px; margin-bottom: 6px; }
  .why ul { margin: 0 0 8px; padding-left: 20px; }
  .why p { margin: 0; }
</style>
