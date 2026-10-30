<script lang="ts">
  // Página de item (/item/:id?q=1..5): preço por cidade com idade, selo e veredito; faixa; 30 dias; livro; flips.
  import { untrack } from 'svelte';
  import type { ItemResponse, Quality } from '../../shared/types';
  import { itemName, tierLabel } from '../../shared/items';
  import { loadIndex } from '../lib/itemsClient';
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import {
    QUALITIES, QUALITY_LABEL, cheapestReliable, citySlug, fmtAge, fmtSilver, hasAnyPrice, isStale, parseQuality, sortCities, tierFromId,
  } from '../lib/format';
  import ItemIcon from '../lib/ui/ItemIcon.svelte';
  import Money from '../lib/ui/Money.svelte';
  import AgeDot from '../lib/ui/AgeDot.svelte';
  import ConfidenceBadge from '../lib/ui/ConfidenceBadge.svelte';
  import VerdictTag from '../lib/ui/VerdictTag.svelte';
  import Sparkline from '../lib/ui/Sparkline.svelte';
  import HistoryChart from '../lib/ui/HistoryChart.svelte';
  import RangeBar from '../lib/ui/RangeBar.svelte';
  import BookPanel from '../lib/ui/BookPanel.svelte';
  import FlipsTable from '../lib/ui/FlipsTable.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';
  import TimeAgo from '../lib/ui/TimeAgo.svelte';
  import { DISCORD_INVITE } from '../lib/ui/links';

  let { params = {} }: { params?: Record<string, string> } = $props();
  const id = $derived((params.id ?? '').trim());

  let quality = $state<Quality>(parseQuality(new URLSearchParams(location.search).get('q')));
  let data = $state<ItemResponse | null>(null);
  let loading = $state(true);
  let error = $state('');
  let seq = 0;

  // Nome e tier: do índice de itens; sem índice, o id e o tier lido do próprio id.
  let meta = $state<{ pt: string; en: string; tier: number; ench: number } | null>(null);
  /** true quando o índice carregou e o id não está nele (link quebrado ou digitado errado). */
  let unknown = $state(false);
  $effect(() => {
    const cur = id;
    const t = tierFromId(cur);
    unknown = false;
    meta = { pt: cur, en: '', tier: t.tier, ench: t.ench };
    loadIndex()
      .then((idx) => {
        if (cur !== id) return;
        const tuple = idx.items.find((x) => x[0] === cur);
        unknown = !tuple;
        let pt = cur;
        try { pt = itemName(idx, cur); } catch { pt = tuple?.[1] || cur; }
        meta = { pt, en: tuple?.[2] ?? '', tier: tuple?.[3] ?? t.tier, ench: tuple?.[4] ?? t.ench };
      })
      .catch(() => {});
  });

  async function load(itemId: string, q: Quality) {
    const my = ++seq;
    loading = true;
    error = '';
    try {
      const r = await api.item(itemId, q);
      if (my !== seq) return;
      data = r;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : 'Erro desconhecido.';
    } finally {
      if (my === seq) loading = false;
    }
  }

  // Trocar de item pela busca reaproveita esta tela: zera o resultado e relê a qualidade da URL.
  let lastId = '';
  $effect.pre(() => {
    const itemId = id;
    if (itemId === lastId) return;
    const first = lastId === '';
    lastId = itemId;
    if (!first) {
      untrack(() => {
        data = null;
        quality = parseQuality(new URLSearchParams(location.search).get('q'));
      });
    }
  });

  $effect(() => {
    const itemId = id;
    const q = quality;
    if (!itemId) return;
    untrack(() => load(itemId, q));
  });

  function setQuality(q: Quality) {
    if (q === quality) return;
    quality = q;
    history.replaceState(history.state, '', `/item/${encodeURIComponent(id)}${q === 1 ? '' : `?q=${q}`}`);
  }

  const cities = $derived(data ? sortCities(data.cities) : []);
  const best = $derived(data ? cheapestReliable(data.cities) : null);
  const empty = $derived(!!data && !hasAnyPrice(data.cities));
  const histByCity = $derived(new Map((data?.history ?? []).map((h) => [h.city, [...h.days].sort((a, b) => a.date.localeCompare(b.date))])));
  const stale = $derived(!!data && isStale(data.fetchedAt, 15));
  const title = $derived(meta ? `${meta.pt}${meta.tier ? ' ' + tierLabel(meta.tier, meta.ench) : ''}` : id);
  const alertHref = $derived(`/alertas?item=${encodeURIComponent(id)}${quality === 1 ? '' : `&q=${quality}`}`);
  const discordCmd = $derived(`/preco item:${meta?.pt && meta.pt !== id ? meta.pt : id}${meta?.tier ? ' ' + tierLabel(meta.tier, meta.ench) : ''}`);

  let copied = $state(false);
  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(discordCmd);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<svelte:head><title>{title} · Guarita</title></svelte:head>

<section class="page">
  <p class="small" style="margin:0 0 10px"><a href="/" onclick={go}>← Mercado</a></p>

  <header class="item-head">
    <ItemIcon {id} {quality} size={72} alt="" eager />
    <div class="item-title">
      <h1>{meta?.pt ?? id}</h1>
      <p class="muted small">
        {#if meta?.tier}<span class="tag">{tierLabel(meta.tier, meta.ench)}</span>{/if}
        {#if meta?.en && meta.en !== meta.pt}<span>{meta.en}</span> · {/if}{#if meta?.pt !== id}<span class="mono">{id}</span>{/if}
      </p>
    </div>
  </header>

  <div class="row item-tools">
    <div class="seg" role="group" aria-label="Qualidade">
      {#each QUALITIES as q}
        <button type="button" aria-pressed={quality === q} onclick={() => setQuality(q)}>{QUALITY_LABEL[q]}</button>
      {/each}
    </div>
    <span class="spacer"></span>
    <a class="btn primary" href={alertHref} onclick={go}>Criar alerta</a>
  </div>

  {#if unknown}
    <p class="callout warn small" style="margin-top:14px">
      O código <code>{id}</code> não está na lista de itens da Guarita. Confira o link ou <a href="/" onclick={go}>busque pelo nome</a>.
    </p>
  {/if}

  {#if loading && !data}
    <div class="stack" style="margin-top:16px">
      <div class="skeleton" style="height:64px"></div>
      <Loading lines={6} height={22} label="Carregando preços" />
    </div>
  {:else if error && !data}
    <div style="margin-top:16px"><ErrorBox message={error} onretry={() => load(id, quality)} /></div>
  {:else if data}
    {#if error}
      <p class="callout warn small">Não deu para atualizar ({error}). Mostrando o último resultado. <button type="button" class="linkbtn" onclick={() => load(id, quality)}>Tentar de novo</button></p>
    {/if}
    <p class="small muted row" style="margin:12px 0 0">
      <span>Dados do Albion Online Data Project, consultados <TimeAgo iso={data.fetchedAt} />.</span>
      {#if stale}<span class="tag warn">pode estar desatualizado</span>{/if}
      {#if data.quality !== quality}<span class="tag warn">mostrando qualidade {QUALITY_LABEL[data.quality]}</span>{/if}
      <button type="button" class="linkbtn" onclick={() => load(id, quality)} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
    </p>

    <div class="item-body" class:refreshing={loading} aria-busy={loading}>
    {#if empty}
      <div class="card empty-state" style="margin-top:16px">
        <h2 style="margin-top:0">Ninguém escaneou este item recentemente</h2>
        <p class="muted">Os preços vêm de jogadores que rodam o cliente do Albion Online Data Project e abrem o mercado no jogo. Se ninguém abriu este item ({QUALITY_LABEL[quality].toLowerCase()}) nas últimas horas, não há preço para mostrar.</p>
        <p class="muted">Tente outra qualidade ou crie um alerta: ele avisa quando aparecer preço.</p>
      </div>
    {:else}
      {#if best}
        <div class="callout {best.reliable ? 'good' : 'warn'} best">
          <div>
            <span class="kpi-label">{best.reliable ? 'Mais barato confiável' : 'Mais barato (pouca confiança)'}</span>
            <div class="kpi"><Money value={best.quote.sellMin} /> <span class="small muted">prata em {best.quote.city}</span></div>
            <p class="small muted" style="margin:2px 0 0">
              Visto {fmtAge(best.quote.ageMin)} · selo {best.quote.confidence.label}{best.quote.confidence.label !== 'sem dado' ? ` (${best.quote.confidence.score})` : ''}
              {#if !best.reliable}· confira no jogo antes de viajar{/if}
            </p>
          </div>
        </div>
      {/if}

      <h2>Preço por cidade</h2>
      <div class="table-wrap">
        <table class="data">
          <caption class="sr-only">Preço de venda mais baixo e de compra mais alto por cidade, com idade, selo de confiança e veredito</caption>
          <thead>
            <tr>
              <th scope="col">Cidade</th>
              <th scope="col" class="num">Venda (menor)</th>
              <th scope="col">Idade</th>
              <th scope="col" class="num">Compra (maior)</th>
              <th scope="col">Confiança</th>
              <th scope="col">Veredito</th>
              <th scope="col">30 dias</th>
            </tr>
          </thead>
          <tbody>
            {#each cities as c (c.city)}
              {@const days = histByCity.get(c.city) ?? []}
              <tr class:highlight={best?.reliable && best.quote.city === c.city}>
                <th scope="row">
                  <span class="city-name city-{citySlug(c.city)}">{c.city}</span>
                  {#if c.city === 'Black Market'}<span class="small muted"> (só compra)</span>{/if}
                </th>
                <td class="num"><Money value={c.sellMin} /></td>
                <td><AgeDot min={c.ageMin} /></td>
                <td class="num"><Money value={c.buyMax} /></td>
                <td class="wrap"><ConfidenceBadge confidence={c.confidence} /></td>
                <td><VerdictTag verdict={c.verdict} /></td>
                <td><Sparkline color="var(--city-{citySlug(c.city)})" values={days.map((d) => (d.avg > 0 ? d.avg : null))} label="Média diária em {c.city} nos últimos {days.length} dias" /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small muted">Toque no selo para ver os motivos. Idade: <span class="age fresh" aria-hidden="true"></span> até 1 h · <span class="age stale" aria-hidden="true"></span> até 6 h · <span class="age" aria-hidden="true"></span> mais velho.</p>

      {#if data.p25 !== null && data.p75 !== null}
        <h2>Faixa dos últimos dias</h2>
        <div class="card">
          <RangeBar p25={data.p25} median={data.median7d} p75={data.p75} current={best?.quote.sellMin ?? null} currentLabel={best ? `agora (${best.quote.city})` : 'agora'} />
          <p class="small muted" style="margin:0">Metade dos negócios ficou entre p25 ({fmtSilver(data.p25)}) e p75 ({fmtSilver(data.p75)}). Abaixo do p25 é “barato”; acima do p75, “caro”.</p>
        </div>
      {/if}

      <h2>Últimos 30 dias</h2>
      <div class="card"><HistoryChart history={data.history} /></div>

      <h2>Livro de ofertas</h2>
      <BookPanel {id} {quality} books={data.book} initialCity={best?.quote.city ?? null} />

      <h2>Flip para o Black Market</h2>
      <FlipsTable flips={data.flips} />
    {/if}
    </div>

    <div class="grid" style="margin-top:28px">
      <div class="card stack">
        <h2 style="margin:0">Avise quando baixar</h2>
        <p class="muted small" style="margin:0">Receba {DISCORD_INVITE ? 'no navegador ou no Discord' : 'uma notificação no navegador'} quando {meta?.pt ?? 'este item'} ficar abaixo do preço que você escolher.</p>
        <p style="margin:0"><a class="btn primary" href={alertHref} onclick={go}>Criar alerta</a></p>
      </div>
      <div class="card stack">
        <h2 style="margin:0">Ver no Discord</h2>
        {#if DISCORD_INVITE}
          <p class="muted small" style="margin:0">No servidor com a Guarita, use o comando:</p>
          <div class="row"><code class="cmd">{discordCmd}</code><button type="button" class="btn" onclick={copyCmd}>{copied ? 'Copiado' : 'Copiar'}</button></div>
          <a class="small" href={DISCORD_INVITE} target="_blank" rel="noopener">Adicionar a Guarita ao meu servidor</a>
        {:else}
          <p class="muted small" style="margin:0">O bot do Discord abre em breve.</p>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .item-head { display: flex; gap: 14px; align-items: center; }
  .item-title { min-width: 0; }
  .item-title h1 { margin: 0 0 4px; overflow-wrap: anywhere; }
  .item-title p { margin: 0; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .item-tools { margin-top: 14px; }
  .spacer { flex: 1; }
  .best { margin-top: 16px; }
  .cmd { overflow-wrap: anywhere; }
  .item-body { transition: opacity 0.15s; }
  .item-body.refreshing { opacity: 0.5; }
  @media (prefers-reduced-motion: reduce) { .item-body { transition: none; } }
</style>
