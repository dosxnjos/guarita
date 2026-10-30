<script lang="ts">
  // Bloco de previsão da página de item: próximos 3 dias na cidade escolhida (ou na mais negociada), com o placar
  // do teste contra o modelo ingênuo e o link para o gráfico e a metodologia. Carrega sozinho e falha sozinho:
  // erro aqui nunca derruba a página de item.
  import { untrack } from 'svelte';
  import type { City, ForecastResponse, Quality } from '../../../shared/types';
  import { fmtSilver } from '../format';
  import { go } from '../router';
  import Loading from '../ui/Loading.svelte';
  import { api } from '../api';
  import { dayLabel, forecastKind, previsaoHref, scoreText } from './view';

  let { id, quality = 1, city = null }: { id: string; quality?: Quality; city?: City | null } = $props();

  let data = $state<ForecastResponse | null>(null);
  let loading = $state(true);
  let error = $state('');
  let seq = 0;

  async function load(itemId: string, q: Quality, c: City | null) {
    const my = ++seq;
    loading = true;
    error = '';
    try {
      const r = await api.forecast(itemId, c, q);
      if (my !== seq) return;
      data = r;
    } catch (e) {
      if (my !== seq) return;
      data = null;
      error = e instanceof Error ? e.message : 'Erro desconhecido.';
    } finally {
      if (my === seq) loading = false;
    }
  }

  $effect(() => {
    const itemId = id;
    const q = quality;
    const c = city;
    if (!itemId) return;
    untrack(() => load(itemId, q, c));
  });

  const kind = $derived(data ? forecastKind(data) : 'empty');
  const href = $derived(previsaoHref(id, data?.city ?? city, quality));
</script>

<div class="card stack fcard" aria-busy={loading}>
  {#if loading && !data}
    <Loading lines={3} label="Carregando a previsão" />
  {:else if error}
    <p class="small" style="margin:0">Não deu para carregar a previsão agora ({error}).
      <button type="button" class="linkbtn" onclick={() => load(id, quality, city)}>Tentar de novo</button></p>
  {:else if data}
    {#if kind === 'empty'}
      <p class="small muted" style="margin:0"><strong>Sem previsão para {data.city}.</strong> {data.method}</p>
    {:else}
      <p class="small" style="margin:0">
        Próximos dias em <strong>{data.city}</strong>
        {#if kind === 'model'}<span class="tag good">bate o ingênuo</span>{:else}<span class="tag warn">previsão ingênua</span>{/if}
      </p>
      <ul class="fcard-days plain">
        {#each data.forecast as f (f.date)}
          <li>
            <span class="small muted">{dayLabel(f.date)}</span>
            <strong class="num">{fmtSilver(f.p50)}</strong>
            <span class="small muted num">{fmtSilver(f.p10, true)} a {fmtSilver(f.p90, true)}</span>
          </li>
        {/each}
      </ul>
      {#if kind === 'naive'}
        <p class="small warn-text" style="margin:0">O modelo não errou menos que repetir o último dia, então o número acima é só o último preço repetido.</p>
      {/if}
      <p class="small muted" style="margin:0">{scoreText(data)} A faixa mostra onde o preço caiu em 8 de cada 10 dias do teste. Não é promessa.</p>
    {/if}
    <p class="small" style="margin:0"><a href={href} onclick={go}>Ver gráfico, outra cidade e como a previsão é feita</a></p>
  {/if}
</div>

<style>
  .fcard-days { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
  .fcard-days li { display: flex; flex-direction: column; gap: 2px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; min-width: 0; }
  .fcard-days strong { font-size: 1.1rem; }
  @media (max-width: 360px) { .fcard-days { grid-template-columns: 1fr; } }
</style>
