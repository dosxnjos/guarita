<script lang="ts">
  // Prata formatada em pt-BR. null vira "—". compact: "12,3 mil".
  import { fmtSilver } from '../format';
  let { value, compact = false, unit = false, title }: { value: number | null | undefined; compact?: boolean; unit?: boolean; title?: string } = $props();
  const full = $derived(fmtSilver(value));
</script>

<span class="num money" title={title ?? (compact && value != null ? `${full} de prata` : undefined)}
  >{fmtSilver(value, compact)}{#if unit && value != null}<span class="money-unit"> prata</span>{/if}</span>
