<script lang="ts">
  // Bolinha de idade do preço (régua do app.css) com o texto "há X" opcional ao lado.
  import { ageTone, ageToneLabel, fmtAge } from '../format';
  import { getLocale, tx } from '../i18n/index.svelte';
  let { min, text = true }: { min: number | null | undefined; text?: boolean } = $props();
  const tone = $derived(ageTone(min));
  const label = $derived(`${ageToneLabel(tone, getLocale())}${min != null ? `, ${tx('visto', 'visto')} ${fmtAge(min, getLocale())}` : ''}`);
</script>

<span class="age-wrap" title={label}>
  <span class="age" class:fresh={tone === 'fresh'} class:stale={tone === 'stale'} aria-hidden="true"></span>
  {#if text}<span class="age-text" class:muted={tone === 'old' || tone === 'none'}>{fmtAge(min, getLocale())}</span>
  {:else}<span class="sr-only">{label}</span>{/if}
</span>
