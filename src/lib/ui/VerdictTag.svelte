<script lang="ts">
  // Veredito do preço contra a faixa de 7–30 dias.
  import type { Verdict } from '../../../shared/types';
  import { verdictTone } from '../format';
  let { verdict }: { verdict: Verdict } = $props();
  const TITLE: Record<Verdict, string> = {
    barato: 'Abaixo do 1º quartil (p25) dos últimos dias',
    normal: 'Dentro da faixa comum dos últimos dias',
    caro: 'Acima do 3º quartil (p75) dos últimos dias',
    'sem dado': 'Sem histórico suficiente para comparar',
  };
</script>

<span class="tag {verdictTone(verdict)}" title={TITLE[verdict]}>{verdict}</span>
