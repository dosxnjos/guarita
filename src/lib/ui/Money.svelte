<script lang="ts">
  // Prata formatada na língua atual (pt-BR ou es-419). null vira "—". compact: "12,3 mil".
  import { fmtSilver } from '../format';
  import { getLocale, tx } from '../i18n/index.svelte';
  let { value, compact = false, unit = false, title }: { value: number | null | undefined; compact?: boolean; unit?: boolean; title?: string } = $props();
  const full = $derived(fmtSilver(value, false, getLocale()));
</script>

<span class="num money" title={title ?? (compact && value != null ? `${full} ${tx('de prata', 'de plata')}` : undefined)}
  >{fmtSilver(value, compact, getLocale())}{#if unit && value != null}<span class="money-unit"> {tx('prata', 'plata')}</span>{/if}</span>
