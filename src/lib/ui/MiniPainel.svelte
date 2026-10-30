<script lang="ts">
  // Mini-painel da janela flutuante (360×520): relógio compacto, preço rápido e alertas deste aparelho.
  // Roda no contexto da página principal (mount no documento da janela); só usa api.ts, como o resto do site.
  // Sem dossiê de jogador aqui, de propósito: informação sobre outro jogador por cima do jogo, no meio de um
  // encontro, é vantagem em tempo real (fronteira dos Termos da SBI; ver /permitido). O dossiê fica no site.
  import type { AlertRule, ClockResponse, ItemResponse } from '../../../shared/types';
  import type { ItemHit } from '../../../shared/items';
  import { itemName, tierLabel } from '../../../shared/items';
  import { loadIndex } from '../itemsClient';
  import { api } from '../api';
  import { currentSubId } from '../push';
  import { navigate } from '../router';
  import {
    alertConditionText, cheapestReliable, fmtAge, fmtCountdown, fmtTime, serverLabel, serverTone, splitFestivities, sortCities,
  } from '../format';
  import SearchBox from './SearchBox.svelte';
  import ItemIcon from './ItemIcon.svelte';
  import Money from './Money.svelte';
  import AgeDot from './AgeDot.svelte';
  import TimeAgo from './TimeAgo.svelte';

  type Tab = 'preco' | 'alertas';
  let tab = $state<Tab>('preco');
  let now = $state(Date.now());
  let clock = $state<ClockResponse | null>(null);

  async function loadClock() {
    try {
      clock = await api.clock();
    } catch {
      /* fica a última leitura */
    }
  }
  $effect(() => {
    loadClock();
    const a = setInterval(loadClock, 120000);
    const b = setInterval(() => (now = Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  });
  const fest = $derived(clock ? splitFestivities(clock.festivities, now) : null);

  // ---- preço rápido ----
  let picked = $state<ItemHit | null>(null);
  let item = $state<ItemResponse | null>(null);
  let itemErr = $state('');
  let itemBusy = $state(false);
  async function pick(hit: ItemHit) {
    picked = hit;
    item = null;
    itemErr = '';
    itemBusy = true;
    try {
      const r = await api.item(hit.id, 1);
      if (picked?.id === hit.id) item = r;
    } catch (e) {
      if (picked?.id === hit.id) itemErr = e instanceof Error ? e.message : 'Erro ao buscar o preço.';
    } finally {
      if (picked?.id === hit.id) itemBusy = false;
    }
  }
  const best = $derived(item ? cheapestReliable(item.cities) : null);
  const top = $derived(item ? sortCities(item.cities).filter((c) => c.sellMin !== null && c.city !== 'Black Market').slice(0, 4) : []);

  // ---- alertas deste aparelho ----
  const sub = currentSubId();
  let alerts = $state<AlertRule[] | null>(null);
  let alertErr = $state('');
  async function loadAlerts() {
    if (!sub) return;
    alertErr = '';
    try {
      alerts = (await api.alerts(sub)).alerts;
    } catch (e) {
      alertErr = e instanceof Error ? e.message : 'Não deu para carregar os alertas.';
    }
  }
  $effect(() => {
    if (tab === 'alertas' && alerts === null) loadAlerts();
  });
  // Nome dos itens dos alertas (índice estático; sem índice fica o id).
  let names = $state<Record<string, string>>({});
  $effect(() => {
    const list = alerts;
    if (!list?.length) return;
    loadIndex()
      .then((idx) => {
        const out: Record<string, string> = {};
        for (const a of list) {
          try { out[a.itemId] = itemName(idx, a.itemId); } catch { /* fica o id */ }
        }
        names = out;
      })
      .catch(() => {});
  });

  function openFull(path: string) {
    navigate(path);
    window.focus();
  }
</script>

<div class="mini">
  <div class="mini-head">
    <div>
      <div class="mini-time">{fmtTime(now, undefined, false)}</div>
      <div class="small muted">Brasília · UTC {fmtTime(now, 'UTC', false)}</div>
    </div>
    {#if clock}
      <span class="row small" title={clock.server.message}>
        <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>{serverLabel(clock.server.status)}
      </span>
    {/if}
  </div>
  {#if fest?.active.length}
    <p class="small" style="margin:0">
      <strong>Bônus:</strong> {fest.active[0].labelPt} <span class="muted">· termina em {fmtCountdown(fest.active[0].msLeft)}</span>
      {#if fest.active.length > 1}<span class="muted"> (+{fest.active.length - 1})</span>{/if}
    </p>
  {/if}

  <div class="mini-tabs" role="tablist" aria-label="Painel">
    <button type="button" role="tab" aria-selected={tab === 'preco'} onclick={() => (tab = 'preco')}>Preço</button>
    <button type="button" role="tab" aria-selected={tab === 'alertas'} onclick={() => (tab = 'alertas')}>Alertas</button>
  </div>

  {#if tab === 'preco'}
    <div class="stack" role="tabpanel">
      <SearchBox size="sm" label="Buscar item" placeholder="Item (ex.: bolsa t5)" onselect={pick} limit={6} />
      {#if picked}
        <div class="card stack">
          <div class="row">
            <ItemIcon id={picked.id} size={32} />
            <strong style="flex:1;min-width:0">{picked.pt}</strong>
            {#if picked.tier}<span class="tag">{tierLabel(picked.tier, picked.ench)}</span>{/if}
          </div>
          {#if itemBusy}
            <div class="skeleton" style="height:40px"></div>
          {:else if itemErr}
            <p class="small bad-text" style="margin:0">{itemErr} <button type="button" class="linkbtn" onclick={() => picked && pick(picked)}>Tentar de novo</button></p>
          {:else if item && best}
            <div>
              <span class="kpi-label">{best.reliable ? 'Mais barato confiável' : 'Mais barato (pouca confiança)'}</span>
              <div><strong class="kpi" style="font-size:20px"><Money value={best.quote.sellMin} /></strong> em {best.quote.city}</div>
              <div class="small"><AgeDot min={best.quote.ageMin} /></div>
            </div>
            <ul class="plain-list small">
              {#each top as c (c.city)}
                <li class="festa"><span>{c.city}</span><span><Money value={c.sellMin} /> · <span class="muted">{fmtAge(c.ageMin)}</span></span></li>
              {/each}
            </ul>
            <button type="button" class="linkbtn small" onclick={() => openFull(`/item/${encodeURIComponent(picked!.id)}`)}>Abrir a página completa</button>
          {:else if item}
            <p class="small muted" style="margin:0">Ninguém escaneou este item recentemente.</p>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="stack" role="tabpanel">
      {#if !sub}
        <p class="small muted" style="margin:0">Nenhum alerta neste aparelho ainda.</p>
        <button type="button" class="btn" onclick={() => openFull('/alertas')}>Criar alerta no site</button>
      {:else if alertErr}
        <p class="small bad-text" style="margin:0">{alertErr} <button type="button" class="linkbtn" onclick={loadAlerts}>Tentar de novo</button></p>
      {:else if alerts === null}
        <div class="skeleton" style="height:60px"></div>
      {:else if !alerts.length}
        <p class="small muted" style="margin:0">Nenhum alerta ativo neste aparelho.</p>
      {:else}
        <ul class="plain-list small">
          {#each [...alerts].sort((a, b) => (b.lastFiredAt ?? '').localeCompare(a.lastFiredAt ?? '')).slice(0, 8) as a (a.id)}
            <li>
              <div class="row"><ItemIcon id={a.itemId} quality={a.quality} size={24} /><strong>{names[a.itemId] ?? a.itemId}</strong></div>
              <div class="muted">{alertConditionText(a.condition)} · {a.cities.join(', ')}</div>
              <div class="muted">{#if a.lastFiredAt}Disparou <TimeAgo iso={a.lastFiredAt} />{:else}Ainda não disparou{/if}</div>
            </li>
          {/each}
        </ul>
        <button type="button" class="linkbtn small" onclick={loadAlerts}>Atualizar</button>
      {/if}
    </div>
  {/if}
</div>
