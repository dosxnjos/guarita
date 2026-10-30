<script lang="ts">
  // Bloco de previsão da página de item: próximos 3 dias na cidade escolhida (ou na mais negociada), com o placar
  // do teste contra o modelo ingênuo e o link para o gráfico e a metodologia. Carrega sozinho e falha sozinho:
  // erro aqui nunca derruba a página de item.
  import { untrack } from 'svelte';
  import type { City, ForecastResponse, Quality } from '../../../shared/types';
  import { cityName, fmtSilver } from '../format';
  import { go } from '../router';
  import { getLocale, href, tx } from '../i18n/index.svelte';
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
      const r = await api.forecast(itemId, c, q, getLocale());
      if (my !== seq) return;
      data = r;
    } catch (e) {
      if (my !== seq) return;
      data = null;
      error = e instanceof Error ? e.message : tx('Erro desconhecido.', 'Error desconocido.');
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
  const pageHref = $derived(href(previsaoHref(id, data?.city ?? city, quality)));
</script>

<div class="card stack fcard" aria-busy={loading}>
  {#if loading && !data}
    <Loading lines={3} label={tx('Carregando a previsão', 'Cargando la previsión')} />
  {:else if error}
    <p class="small" style="margin:0">{tx(`Não deu para carregar a previsão agora (${error}).`, `No se pudo cargar la previsión ahora (${error}).`)}
      <button type="button" class="linkbtn" onclick={() => load(id, quality, city)}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
  {:else if data}
    {#if kind === 'empty'}
      <p class="small muted" style="margin:0"><strong>{tx(`Sem previsão para ${data.city}.`, `No hay previsión para ${cityName(data.city)}.`)}</strong> {data.method}</p>
    {:else}
      <p class="small" style="margin:0">
        {tx('Próximos dias em', 'Próximos días en')} <strong>{cityName(data.city)}</strong>
        {#if kind === 'model'}<span class="tag good">{tx('bate o ingênuo', 'supera a la ingenua')}</span>{:else}<span class="tag warn">{tx('previsão ingênua', 'previsión ingenua')}</span>{/if}
      </p>
      <ul class="fcard-days plain">
        {#each data.forecast as f (f.date)}
          <li>
            <span class="small muted">{dayLabel(f.date)}</span>
            <strong class="num">{fmtSilver(f.p50)}</strong>
            <span class="small muted num">{tx(`${fmtSilver(f.p10, true)} a ${fmtSilver(f.p90, true)}`, `${fmtSilver(f.p10, true)} a ${fmtSilver(f.p90, true)}`)}</span>
          </li>
        {/each}
      </ul>
      {#if kind === 'naive'}
        <p class="small warn-text" style="margin:0">{tx(
          'O modelo não errou menos que repetir o último dia, então o número acima é só o último preço repetido.',
          'El modelo no se equivocó menos que repetir el último día, así que el número de arriba es solo el último precio repetido.',
        )}</p>
      {/if}
      <p class="small muted" style="margin:0">{scoreText(data)} {tx(
        'A faixa mostra onde o preço caiu em 8 de cada 10 dias do teste. Não é promessa.',
        'El rango muestra dónde cayó el precio en 8 de cada 10 días de la prueba. No es una promesa.',
      )}</p>
    {/if}
    <p class="small" style="margin:0"><a href={pageHref} onclick={go}>{tx(
      'Ver gráfico, outra cidade e como a previsão é feita',
      'Ver el gráfico, otra ciudad y cómo se hace la previsión',
    )}</a></p>
  {/if}
</div>

<style>
  .fcard-days { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
  .fcard-days li { display: flex; flex-direction: column; gap: 2px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; min-width: 0; }
  .fcard-days strong { font-size: 1.1rem; }
  @media (max-width: 360px) { .fcard-days { grid-template-columns: 1fr; } }
</style>
