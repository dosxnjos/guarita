<script lang="ts">
  // Previsão com acerto publicado (/previsao?item=&city=&q=): escolhe item, cidade e qualidade; mostra o
  // histórico, a previsão de 1 a 3 dias com faixa P10–P90 e o placar do teste contra o modelo ingênuo.
  // A metodologia fica na própria página, sempre visível.
  import { untrack } from 'svelte';
  import type { City, ForecastResponse, Quality } from '../../shared/types';
  import type { ItemHit } from '../../shared/items';
  import { itemName, tierLabel } from '../../shared/items';
  import { ALL_CITIES } from '../../shared/market';
  import { BACKTEST_DAYS, DOW_MIN_DAYS, HORIZON, MIN_DAYS } from '../../shared/forecast';
  import { loadIndex } from '../lib/itemsClient';
  import { go } from '../lib/router';
  import { QUALITIES, cityName, fmtSilver, qualityName, tierFromId } from '../lib/format';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  import { scrollFocus } from '../lib/ui/scrollFocus';
  import SearchBox from '../lib/ui/SearchBox.svelte';
  import ItemIcon from '../lib/ui/ItemIcon.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';
  import TimeAgo from '../lib/ui/TimeAgo.svelte';
  import ForecastChart from '../lib/forecast/ForecastChart.svelte';
  import { api } from '../lib/api';
  import { anuncioPrevisao, dayLabel, errorGain, forecastKind, parsePrevisaoQuery, pct, previsaoHref, relativeError, scoreText } from '../lib/forecast/view';

  let { params = {} }: { params?: Record<string, string> } = $props();

  // lido uma vez: depois disso a URL segue o estado da tela (replaceState), não o contrário
  const initial = untrack(() => parsePrevisaoQuery(location.search, params.id));
  let id = $state(initial.id);
  let city = $state<City | null>(initial.city);
  let quality = $state<Quality>(initial.q);

  let data = $state<ForecastResponse | null>(null);
  let loading = $state(false);
  let error = $state('');
  let seq = 0;

  let name = $state('');
  $effect(() => {
    const cur = id;
    if (!cur) return;
    const t = tierFromId(cur);
    name = cur;
    loadIndex()
      .then((idx) => {
        if (cur !== id) return;
        const tuple = idx.items.find((x) => x[0] === cur);
        let pt = cur;
        try { pt = itemName(idx, cur); } catch { pt = tuple?.[1] || cur; }
        const tier = tuple?.[3] ?? t.tier;
        const ench = tuple?.[4] ?? t.ench;
        name = `${pt}${tier ? ' ' + tierLabel(tier, ench) : ''}`;
      })
      .catch(() => {});
  });

  async function load(itemId: string, c: City | null, q: Quality) {
    const my = ++seq;
    loading = true;
    error = '';
    try {
      const r = await api.forecast(itemId, c, q, getLocale());
      if (my !== seq) return;
      data = r;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : tx('Erro desconhecido.', 'Error desconocido.');
    } finally {
      if (my === seq) loading = false;
    }
  }

  $effect(() => {
    const itemId = id;
    const c = city;
    const q = quality;
    if (!itemId) return;
    untrack(() => {
      history.replaceState(history.state, '', href(previsaoHref(itemId, c, q)));
      load(itemId, c, q);
    });
  });

  function pickItem(hit: ItemHit) {
    data = null;
    id = hit.id;
  }
  function clearItem() {
    seq++;
    id = '';
    data = null;
    error = '';
    loading = false;
    history.replaceState(history.state, '', href('/previsao'));
  }

  const kind = $derived(data ? forecastKind(data) : 'empty');
  const anuncio = $derived(anuncioPrevisao({ loading, error, data }));
  const gain = $derived(data ? errorGain(data) : null);
  const relErr = $derived(data ? relativeError(data) : null);
  const last = $derived(data?.history.at(-1) ?? null);
</script>

<!-- Título sem item igual ao de worker/seo.ts (FIXED_ROUTES e FIXED_ES). -->
<svelte:head><title>{id
  ? tx(`Previsão: ${name || id} · Guarita`, `Previsión: ${name || id} · Guarita`)
  : tx('Previsão de preço · Guarita', 'Previsión de precios · Guarita')}</title></svelte:head>

<section class="page">
  <h1>{tx('Previsão de preço', 'Previsión de precios')}</h1>
  <p class="muted" style="margin-top:0">{tx(
    `Quanto um item deve valer nos próximos ${HORIZON} dias numa cidade, com o erro da previsão publicado ao lado. Se a previsão não acerta mais do que repetir o último preço, a página diz isso.`,
    `Cuánto debería valer un objeto en los próximos ${HORIZON} días en una ciudad, con el error de la previsión publicado al lado. Si la previsión no acierta más que repetir el último precio, la página lo dice.`,
  )}</p>

  <div class="card stack">
    {#if id}
      <div class="row pv-item">
        <ItemIcon {id} {quality} size={48} alt="" />
        <div class="pv-name">
          <strong>{name || id}</strong>
          {#if name && name !== id}<span class="small muted mono">{id}</span>{/if}
        </div>
        <span class="pv-spacer"></span>
        <a class="small" href={href(`/item/${encodeURIComponent(id)}${quality === 1 ? '' : `?q=${quality}`}`)} onclick={go}>{tx('Página do item', 'Página del objeto')}</a>
        <button type="button" class="linkbtn small" onclick={clearItem}>{tx('Trocar item', 'Cambiar objeto')}</button>
      </div>
    {:else}
      <SearchBox onselect={pickItem} label={tx('Item', 'Objeto')} placeholder={tx('Ex.: bolsa T4, tábuas T5, couro T6', 'Ej.: bolsa T4, tablas T5, cuero T6')} />
    {/if}

    <div class="pv-controls">
      <label class="stack pv-field">
        <span class="small">{tx('Cidade', 'Ciudad')}</span>
        <select class="input" value={city ?? ''} onchange={(e) => (city = ((e.currentTarget as HTMLSelectElement).value || null) as City | null)}>
          <option value="">{tx('Mais negociada (automática)', 'La más negociada (automática)')}</option>
          {#each ALL_CITIES as c}<option value={c}>{cityName(c)}</option>{/each}
        </select>
      </label>
      <div class="stack pv-field">
        <span class="small" id="pv-q">{tx('Qualidade', 'Calidad')}</span>
        <div class="seg" role="group" aria-labelledby="pv-q">
          {#each QUALITIES as q}
            <button type="button" aria-pressed={quality === q} onclick={() => (quality = q)}>{qualityName(q)}</button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Anúncio curto para leitor de tela, sempre montado (região que nasce junto com o texto não é anunciada). -->
  <p class="sr-only" role="status" aria-live="polite">{id ? anuncio : ''}</p>

  {#if id}
    <div>
      {#if loading && !data}
        <div style="margin-top:16px"><Loading lines={5} label={tx('Calculando a previsão', 'Calculando la previsión')} /></div>
      {:else if error && !data}
        <div style="margin-top:16px"><ErrorBox message={error} onretry={() => load(id, city, quality)} /></div>
      {:else if data}
        {#if error}
          <p class="callout warn small" style="margin-top:12px">{tx(
            `Não deu para atualizar (${error}). Mostrando o último resultado.`,
            `No se pudo actualizar (${error}). Se muestra el último resultado.`,
          )}
            <button type="button" class="linkbtn" onclick={() => load(id, city, quality)}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
        {/if}
        <div class:pv-refreshing={loading}>
          <p class="small muted row" style="margin:12px 0 0">
            {#if getLocale() === 'es'}
              <span>Historial del Albion Online Data Project en <strong>{cityName(data.city)}</strong>{city ? '' : ' (la ciudad con más unidades vendidas en las últimas 2 semanas)'}, consultado <TimeAgo iso={data.fetchedAt} />.</span>
            {:else}
              <span>Histórico do Albion Online Data Project em <strong>{data.city}</strong>{city ? '' : ' (a cidade com mais unidades vendidas nas últimas 2 semanas)'}, consultado <TimeAgo iso={data.fetchedAt} />.</span>
            {/if}
            {#if data.quality !== quality}<span class="tag warn">{tx('qualidade', 'calidad')} {qualityName(data.quality)}</span>{/if}
          </p>

          {#if kind === 'empty'}
            <div class="card empty-state" style="margin-top:16px">
              <h2 style="margin-top:0">{tx(`Sem previsão para este item em ${data.city}`, `No hay previsión para este objeto en ${cityName(data.city)}`)}</h2>
              <p class="muted">{data.method}</p>
              <p class="muted small" style="margin-bottom:0">{tx(
                `A previsão precisa de pelo menos ${MIN_DAYS} dias com venda registrada e de venda recente. Itens pouco negociados ou pouco escaneados ficam de fora. Tente outra cidade ou a qualidade normal.`,
                `La previsión necesita al menos ${MIN_DAYS} días con venta registrada y ventas recientes. Los objetos poco negociados o poco escaneados quedan fuera. Prueba otra ciudad o la calidad normal.`,
              )}</p>
            </div>
            {#if data.history.length}
              <h2>{tx('Histórico disponível', 'Historial disponible')}</h2>
              <ForecastChart r={data} />
            {/if}
          {:else}
            {#if kind === 'naive'}
              <div class="callout warn" style="margin-top:16px">
                {#if getLocale() === 'es'}
                  <p><strong>El modelo no superó a la estimación ingenua en este objeto.</strong> En la prueba, repetir el precio del último día se equivocó menos (o lo mismo), así que los números de abajo son esa estimación: el último precio repetido, con el margen de error que tuvo.</p>
                {:else}
                  <p><strong>O modelo não bateu o palpite ingênuo neste item.</strong> No teste, repetir o preço do último dia errou menos (ou igual), então os números abaixo são esse palpite: o último preço repetido, com a faixa de erro que ele teve.</p>
                {/if}
              </div>
            {:else}
              <div class="callout good" style="margin-top:16px">
                {#if getLocale() === 'es'}
                  <p><strong>El modelo superó a la estimación ingenua en este objeto</strong>{gain !== null ? `: un ${pct(gain)} menos de error en la prueba` : ''}.</p>
                {:else}
                  <p><strong>O modelo bateu o palpite ingênuo neste item</strong>{gain !== null ? `: ${pct(gain)} menos erro no teste` : ''}.</p>
                {/if}
              </div>
            {/if}

            <div class="grid pv-days" style="margin-top:16px">
              {#each data.forecast as f (f.date)}
                <div class="card stack">
                  <div class="kpi-label">{dayLabel(f.date)}</div>
                  <div class="kpi">{fmtSilver(f.p50)} <span class="small muted">{tx('prata', 'plata')}</span></div>
                  <p class="small muted" style="margin:0">{tx(
                    `Faixa provável: ${fmtSilver(f.p10)} a ${fmtSilver(f.p90)}`,
                    `Rango probable: ${fmtSilver(f.p10)} a ${fmtSilver(f.p90)}`,
                  )}</p>
                </div>
              {/each}
            </div>

            <h2>{tx('Gráfico', 'Gráfico')}</h2>
            <ForecastChart r={data} />

            <h2>{tx('Placar do teste', 'Marcador de la prueba')}</h2>
            <div class="table-wrap" use:scrollFocus>
              <table class="data">
                <caption class="sr-only">{tx(
                  `Erro médio absoluto da previsão e do palpite ingênuo no teste dos últimos ${BACKTEST_DAYS} dias`,
                  `Error medio absoluto de la previsión y de la estimación ingenua en la prueba de los últimos ${BACKTEST_DAYS} días`,
                )}</caption>
                <thead><tr><th scope="col">{tx('Quem previu', 'Quién previó')}</th><th scope="col" class="num">{tx('Erro médio', 'Error medio')}</th><th scope="col">{tx('Resultado', 'Resultado')}</th></tr></thead>
                <tbody>
                  <tr>
                    <th scope="row">{tx('Modelo', 'Modelo')}</th>
                    <td class="num">{fmtSilver(data.backtest.maeModel)} {tx('prata', 'plata')}</td>
                    <td>{#if data.backtest.beatsNaive}<span class="tag good">{tx('venceu', 'ganó')}</span>{:else}<span class="tag bad">{tx('não venceu', 'no ganó')}</span>{/if}</td>
                  </tr>
                  <tr>
                    <th scope="row">{tx('Ingênuo (repete o último dia)', 'Ingenua (repite el último día)')}</th>
                    <td class="num">{fmtSilver(data.backtest.maeNaive)} {tx('prata', 'plata')}</td>
                    <td>{#if data.backtest.beatsNaive}<span class="tag">{tx('referência', 'referencia')}</span>{:else}<span class="tag good">{tx('publicado', 'publicada')}</span>{/if}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="small muted">{scoreText(data)}{relErr !== null && last
              ? tx(
                ` O erro do que está publicado equivale a uns ${pct(relErr)} do último preço (${fmtSilver(last.avg)} prata).`,
                ` El error de lo publicado equivale a un ${pct(relErr)} del último precio (${fmtSilver(last.avg)} de plata).`,
              )
              : ''}</p>
            <p class="small muted">{data.method}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <h2 id="metodologia">{tx('Como a previsão é feita', 'Cómo se hace la previsión')}</h2>
  <div class="card stack pv-method">
    {#if getLocale() === 'es'}
      <ol>
        <li><strong>Datos:</strong> el precio medio de venta por día de una ciudad, de los últimos 30 días, según el Albion Online Data Project. El día del AODP cierra a las 21 h de Brasilia (medianoche UTC); el día en curso queda fuera porque su promedio todavía cambia.</li>
        <li><strong>Modelo:</strong> con {DOW_MIN_DAYS} días o más con venta, una media móvil exponencial del precio (da más peso a los días recientes) con un ajuste por día de la semana, para el patrón del fin de semana. Con menos días, la mediana de los últimos 7 días con venta, que no se deja llevar por un día fuera de lo normal. Los días con precios absurdos se recortan antes del cálculo.</li>
        <li><strong>Prueba honesta:</strong> en los últimos {BACKTEST_DAYS} días, rehacemos la previsión día a día como si fuera ese día, sin mirar el futuro, para 1 a {HORIZON} días hacia adelante, y medimos el error medio absoluto (en plata).</li>
        <li><strong>Comparación:</strong> la misma prueba con la estimación ingenua, que solo repite el precio del último día. Prever bien es equivocarse menos que ella. Cuando el modelo no lo logra, la página publica la estimación ingenua y lo avisa.</li>
        <li><strong>Rango probable (P10–P90):</strong> sale de los errores de la propia prueba. En 8 de cada 10 rondas el precio real quedó dentro de él. Con solo dos semanas de prueba el rango es aproximado.</li>
      </ol>
      <p class="small muted" style="margin:0">
        <strong>Lo que no es:</strong> una recomendación de compra ni una promesa de ganancia. Un parche, una actualización de contenido, una guerra
        grande o alguien comprando todo el mercado cambian el precio de un día para otro, y ningún modelo lo ve antes. Necesita
        al menos {MIN_DAYS} días con venta y ventas en los últimos días; los números se recalculan cada hora.
      </p>
    {:else}
      <ol>
        <li><strong>Dado:</strong> a média de venda por dia de uma cidade, dos últimos 30 dias, pelo Albion Online Data Project. O dia do AODP fecha às 21h de Brasília (meia-noite UTC); o dia em andamento fica de fora porque a média dele ainda muda.</li>
        <li><strong>Modelo:</strong> com {DOW_MIN_DAYS} dias ou mais com venda, uma média móvel exponencial do preço (dá mais peso aos dias recentes) com um ajuste por dia da semana, para o padrão de fim de semana. Com menos dias, a mediana dos últimos 7 dias com venda, que não se deixa levar por um dia fora da curva. Dias com preço absurdo são aparados antes da conta.</li>
        <li><strong>Teste honesto:</strong> nos últimos {BACKTEST_DAYS} dias, refazemos a previsão dia a dia como se fosse aquele dia, sem olhar o futuro, para 1 a {HORIZON} dias à frente, e medimos o erro médio absoluto (em prata).</li>
        <li><strong>Comparação:</strong> o mesmo teste com o palpite ingênuo, que só repete o preço do último dia. Prever bem é errar menos que ele. Quando o modelo não consegue, a página publica o palpite ingênuo e avisa.</li>
        <li><strong>Faixa provável (P10–P90):</strong> vem dos erros do próprio teste. Em 8 de cada 10 rodadas o preço real ficou dentro dela. Com só duas semanas de teste a faixa é aproximada.</li>
      </ol>
      <p class="small muted" style="margin:0">
        <strong>O que ela não é:</strong> recomendação de compra ou promessa de lucro. Um patch, uma atualização de conteúdo, uma guerra
        grande ou alguém comprando o mercado inteiro mudam o preço de um dia para o outro, e nenhum modelo vê isso antes. Precisa de
        pelo menos {MIN_DAYS} dias com venda e de venda nos últimos dias; os números são recalculados a cada hora.
      </p>
    {/if}
  </div>
</section>

<style>
  .pv-item { align-items: center; gap: 12px; flex-wrap: wrap; }
  .pv-name { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
  .pv-spacer { flex: 1; }
  .pv-controls { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: flex-end; }
  .pv-field { gap: 4px; min-width: 0; }
  .pv-field select { min-width: 220px; max-width: 100%; }
  .pv-days { grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 8px; }
  .pv-days .card { padding: 10px 12px; }
  .pv-days .kpi { font-size: 1.25rem; }
  .pv-method ol { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
  .pv-refreshing { opacity: 0.5; transition: opacity 0.15s; }
  @media (prefers-reduced-motion: reduce) { .pv-refreshing { transition: none; } }
</style>
