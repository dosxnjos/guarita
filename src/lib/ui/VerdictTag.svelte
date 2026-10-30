<script lang="ts">
  // Veredito do preço contra a faixa de 7–30 dias.
  import type { Verdict } from '../../../shared/types';
  import { verdictText, verdictTone } from '../format';
  import { getLocale, tx } from '../i18n/index.svelte';
  let { verdict }: { verdict: Verdict } = $props();
  const TITLE = $derived<Record<Verdict, string>>({
    barato: tx('Abaixo do 1º quartil (p25) dos últimos dias', 'Por debajo del 1.er cuartil (p25) de los últimos días'),
    normal: tx('Dentro da faixa comum dos últimos dias', 'Dentro del rango habitual de los últimos días'),
    caro: tx('Acima do 3º quartil (p75) dos últimos dias', 'Por encima del 3.er cuartil (p75) de los últimos días'),
    'sem dado': tx('Sem histórico suficiente para comparar', 'Sin historial suficiente para comparar'),
  });
</script>

<span class="tag {verdictTone(verdict)}" title={TITLE[verdict]}>{verdictText(verdict, getLocale())}</span>
