<script lang="ts">
  // Selo de confiança 0–100. Clique (ou toque) mostra os motivos; no mouse, o title também mostra.
  import type { Confidence } from '../../../shared/types';
  // Os motivos vêm da API na língua pedida (api.item manda `lang=es` em espanhol); o rótulo (código) é traduzido aqui.
  import { confidenceText, confidenceTone } from '../format';
  import { getLocale } from '../i18n/index.svelte';
  let { confidence }: { confidence: Confidence } = $props();
  let open = $state(false);
  const uid = 'conf-' + Math.random().toString(36).slice(2, 9);
  const hasReasons = $derived(confidence.reasons.length > 0);
</script>

<span class="conf">
  <button type="button" class="tag conf-btn {confidenceTone(confidence.label)}" aria-expanded={hasReasons ? open : undefined}
    aria-controls={hasReasons ? uid : undefined} title={confidence.reasons.join(' · ') || undefined}
    onclick={() => hasReasons && (open = !open)} disabled={!hasReasons}>
    {confidenceText(confidence.label, getLocale())}{#if confidence.label !== 'sem dado'}<span class="conf-score num"> {confidence.score}</span>{/if}
    {#if hasReasons}<span aria-hidden="true" class="conf-caret">{open ? '▴' : '▾'}</span>{/if}
  </button>
  {#if open && hasReasons}
    <ul id={uid} class="conf-reasons small">
      {#each confidence.reasons as r}<li>{r}</li>{/each}
    </ul>
  {/if}
</span>
