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
  import { QUALITIES, QUALITY_LABEL, fmtSilver, tierFromId } from '../lib/format';
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
      const r = await api.forecast(itemId, c, q);
      if (my !== seq) return;
      data = r;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : 'Erro desconhecido.';
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
      history.replaceState(history.state, '', previsaoHref(itemId, c, q));
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
    history.replaceState(history.state, '', '/previsao');
  }

  const kind = $derived(data ? forecastKind(data) : 'empty');
  const anuncio = $derived(anuncioPrevisao({ loading, error, data }));
  const gain = $derived(data ? errorGain(data) : null);
  const relErr = $derived(data ? relativeError(data) : null);
  const last = $derived(data?.history.at(-1) ?? null);
</script>

<svelte:head><title>{id ? `Previsão: ${name || id}` : 'Previsão de preço'} · Guarita</title></svelte:head>

<section class="page">
  <h1>Previsão de preço</h1>
  <p class="muted" style="margin-top:0">
    Quanto um item deve valer nos próximos {HORIZON} dias numa cidade, com o erro da previsão publicado ao lado.
    Se a previsão não acerta mais do que repetir o último preço, a página diz isso.
  </p>

  <div class="card stack">
    {#if id}
      <div class="row pv-item">
        <ItemIcon {id} {quality} size={48} alt="" />
        <div class="pv-name">
          <strong>{name || id}</strong>
          {#if name && name !== id}<span class="small muted mono">{id}</span>{/if}
        </div>
        <span class="pv-spacer"></span>
        <a class="small" href="/item/{encodeURIComponent(id)}{quality === 1 ? '' : `?q=${quality}`}" onclick={go}>Página do item</a>
        <button type="button" class="linkbtn small" onclick={clearItem}>Trocar item</button>
      </div>
    {:else}
      <SearchBox onselect={pickItem} label="Item" placeholder="Ex.: bolsa T4, tábuas T5, couro T6" />
    {/if}

    <div class="pv-controls">
      <label class="stack pv-field">
        <span class="small">Cidade</span>
        <select class="input" value={city ?? ''} onchange={(e) => (city = ((e.currentTarget as HTMLSelectElement).value || null) as City | null)}>
          <option value="">Mais negociada (automática)</option>
          {#each ALL_CITIES as c}<option value={c}>{c}</option>{/each}
        </select>
      </label>
      <div class="stack pv-field">
        <span class="small" id="pv-q">Qualidade</span>
        <div class="seg" role="group" aria-labelledby="pv-q">
          {#each QUALITIES as q}
            <button type="button" aria-pressed={quality === q} onclick={() => (quality = q)}>{QUALITY_LABEL[q]}</button>
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
        <div style="margin-top:16px"><Loading lines={5} label="Calculando a previsão" /></div>
      {:else if error && !data}
        <div style="margin-top:16px"><ErrorBox message={error} onretry={() => load(id, city, quality)} /></div>
      {:else if data}
        {#if error}
          <p class="callout warn small" style="margin-top:12px">Não deu para atualizar ({error}). Mostrando o último resultado.
            <button type="button" class="linkbtn" onclick={() => load(id, city, quality)}>Tentar de novo</button></p>
        {/if}
        <div class:pv-refreshing={loading}>
          <p class="small muted row" style="margin:12px 0 0">
            <span>Histórico do Albion Online Data Project em <strong>{data.city}</strong>{city ? '' : ' (a cidade com mais unidades vendidas nas últimas 2 semanas)'}, consultado <TimeAgo iso={data.fetchedAt} />.</span>
            {#if data.quality !== quality}<span class="tag warn">qualidade {QUALITY_LABEL[data.quality]}</span>{/if}
          </p>

          {#if kind === 'empty'}
            <div class="card empty-state" style="margin-top:16px">
              <h2 style="margin-top:0">Sem previsão para este item em {data.city}</h2>
              <p class="muted">{data.method}</p>
              <p class="muted small" style="margin-bottom:0">A previsão precisa de pelo menos {MIN_DAYS} dias com venda registrada e de venda recente. Itens pouco negociados ou pouco escaneados ficam de fora. Tente outra cidade ou a qualidade normal.</p>
            </div>
            {#if data.history.length}
              <h2>Histórico disponível</h2>
              <ForecastChart r={data} />
            {/if}
          {:else}
            {#if kind === 'naive'}
              <div class="callout warn" style="margin-top:16px">
                <p><strong>O modelo não bateu o palpite ingênuo neste item.</strong> No teste, repetir o preço do último dia errou menos (ou igual), então os números abaixo são esse palpite: o último preço repetido, com a faixa de erro que ele teve.</p>
              </div>
            {:else}
              <div class="callout good" style="margin-top:16px">
                <p><strong>O modelo bateu o palpite ingênuo neste item</strong>{gain !== null ? `: ${pct(gain)} menos erro no teste` : ''}.</p>
              </div>
            {/if}

            <div class="grid pv-days" style="margin-top:16px">
              {#each data.forecast as f (f.date)}
                <div class="card stack">
                  <div class="kpi-label">{dayLabel(f.date)}</div>
                  <div class="kpi">{fmtSilver(f.p50)} <span class="small muted">prata</span></div>
                  <p class="small muted" style="margin:0">Faixa provável: {fmtSilver(f.p10)} a {fmtSilver(f.p90)}</p>
                </div>
              {/each}
            </div>

            <h2>Gráfico</h2>
            <ForecastChart r={data} />

            <h2>Placar do teste</h2>
            <div class="table-wrap">
              <table class="data">
                <caption class="sr-only">Erro médio absoluto da previsão e do palpite ingênuo no teste dos últimos {BACKTEST_DAYS} dias</caption>
                <thead><tr><th scope="col">Quem previu</th><th scope="col" class="num">Erro médio</th><th scope="col">Resultado</th></tr></thead>
                <tbody>
                  <tr>
                    <th scope="row">Modelo</th>
                    <td class="num">{fmtSilver(data.backtest.maeModel)} prata</td>
                    <td>{#if data.backtest.beatsNaive}<span class="tag good">venceu</span>{:else}<span class="tag bad">não venceu</span>{/if}</td>
                  </tr>
                  <tr>
                    <th scope="row">Ingênuo (repete o último dia)</th>
                    <td class="num">{fmtSilver(data.backtest.maeNaive)} prata</td>
                    <td>{#if data.backtest.beatsNaive}<span class="tag">referência</span>{:else}<span class="tag good">publicado</span>{/if}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="small muted">{scoreText(data)}{relErr !== null && last ? ` O erro do que está publicado equivale a uns ${pct(relErr)} do último preço (${fmtSilver(last.avg)} prata).` : ''}</p>
            <p class="small muted">{data.method}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <h2 id="metodologia">Como a previsão é feita</h2>
  <div class="card stack pv-method">
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
