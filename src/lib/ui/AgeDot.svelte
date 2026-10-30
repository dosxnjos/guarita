<script lang="ts">
  // Bolinha de idade do preço (régua do app.css) com o texto "há X" opcional ao lado.
  import { ageTone, ageToneLabel, fmtAge } from '../format';
  let { min, text = true }: { min: number | null | undefined; text?: boolean } = $props();
  const tone = $derived(ageTone(min));
  const label = $derived(`${ageToneLabel(tone)}${min != null ? `, visto ${fmtAge(min)}` : ''}`);
</script>

<span class="age-wrap" title={label}>
  <span class="age" class:fresh={tone === 'fresh'} class:stale={tone === 'stale'} aria-hidden="true"></span>
  {#if text}<span class="age-text" class:muted={tone === 'old' || tone === 'none'}>{fmtAge(min)}</span>
  {:else}<span class="sr-only">{label}</span>{/if}
</span>
