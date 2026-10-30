<script lang="ts">
  // "há 5 min" que se atualiza sozinho; o title mostra data e hora de Brasília.
  import { fmtAge, fmtDateTime, minutesSinceIso } from './time';
  let { iso, prefix = '' }: { iso: string | null | undefined; prefix?: string } = $props();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30000);
    return () => clearInterval(t);
  });
  const min = $derived(minutesSinceIso(iso, now));
</script>

<time class="timeago" datetime={iso ?? undefined} title={iso ? fmtDateTime(iso) + ' (Brasília)' : undefined}
  >{prefix}{min === null ? 'sem data' : fmtAge(min)}</time>
