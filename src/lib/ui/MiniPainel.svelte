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
    alertConditionText, cheapestReliable, cityName, fmtAge, fmtCountdown, fmtTime, serverLabel, serverTone, splitFestivities, sortCities,
  } from '../format';
  import { getLocale, htmlLang, tx } from '../i18n/index.svelte';
  import { festivityLabel } from '../../../shared/festivities';
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
      if (picked?.id === hit.id) itemErr = e instanceof Error ? e.message : tx('Erro ao buscar o preço.', 'Error al buscar el precio.');
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
      alertErr = e instanceof Error ? e.message : tx('Não deu para carregar os alertas.', 'No se pudieron cargar las alertas.');
    }
  }
  $effect(() => {
    if (tab === 'alertas' && alerts === null) loadAlerts();
  });
  // Nome dos itens dos alertas e do item escolhido (índice estático; sem índice fica o id). Depende da língua: a
  // janela flutuante fica fora do {#key} do App, então a troca de língua na janela principal relê o índice aqui.
  let names = $state<Record<string, string>>({});
  $effect(() => {
    const loc = getLocale();
    const ids = [...(alerts ?? []).map((a) => a.itemId), ...(picked ? [picked.id] : [])];
    if (!ids.length) return;
    loadIndex(loc)
      .then((idx) => {
        if (getLocale() !== loc) return;
        const out: Record<string, string> = {};
        for (const id of ids) {
          try { out[id] = itemName(idx, id); } catch { /* fica o id */ }
        }
        names = out;
      })
      .catch(() => {});
  });

  // <html lang> da janela flutuante acompanha a língua (pip.svelte.ts só define na abertura).
  let rootEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const lang = htmlLang();
    const doc = rootEl?.ownerDocument;
    if (doc && doc !== document) doc.documentElement.lang = lang;
  });

  function openFull(path: string) {
    navigate(path);
    window.focus();
  }
</script>

<div class="mini" bind:this={rootEl}>
  <div class="mini-head">
    <div>
      <div class="mini-time">{fmtTime(now, undefined, false)}</div>
      <div class="small muted">{tx('Brasília', 'Brasilia')} · UTC {fmtTime(now, 'UTC', false)}</div>
    </div>
    {#if clock}
      <span class="row small" title={clock.server.message}>
        <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>{serverLabel(clock.server.status, getLocale())}
      </span>
    {/if}
  </div>
  {#if fest?.active.length}
    <p class="small" style="margin:0">
      <strong>{tx('Bônus:', 'Bonificación:')}</strong> {festivityLabel(fest.active[0], getLocale())} <span class="muted">· {tx('termina em', 'termina en')} {fmtCountdown(fest.active[0].msLeft, getLocale())}</span>
      {#if fest.active.length > 1}<span class="muted"> (+{fest.active.length - 1})</span>{/if}
    </p>
  {/if}

  <div class="mini-tabs" role="tablist" aria-label={tx('Painel', 'Panel')}>
    <button type="button" role="tab" aria-selected={tab === 'preco'} onclick={() => (tab = 'preco')}>{tx('Preço', 'Precio')}</button>
    <button type="button" role="tab" aria-selected={tab === 'alertas'} onclick={() => (tab = 'alertas')}>{tx('Alertas', 'Alertas')}</button>
  </div>

  {#if tab === 'preco'}
    <div class="stack" role="tabpanel">
      <!-- {#key}: a busca guarda o índice da língua em que carregou; trocar de língua remonta com o índice certo. -->
      {#key getLocale()}
        <SearchBox size="sm" label={tx('Buscar item', 'Buscar objeto')} placeholder={tx('Item (ex.: bolsa t5)', 'Objeto (ej.: bolsa t5)')} onselect={pick} limit={6} />
      {/key}
      {#if picked}
        <div class="card stack">
          <div class="row">
            <ItemIcon id={picked.id} size={32} />
            <strong style="flex:1;min-width:0">{names[picked.id] ?? picked.pt}</strong>
            {#if picked.tier}<span class="tag">{tierLabel(picked.tier, picked.ench)}</span>{/if}
          </div>
          {#if itemBusy}
            <div class="skeleton" style="height:40px"></div>
          {:else if itemErr}
            <p class="small bad-text" style="margin:0">{itemErr} <button type="button" class="linkbtn" onclick={() => picked && pick(picked)}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
          {:else if item && best}
            <div>
              <span class="kpi-label">{best.reliable ? tx('Mais barato confiável', 'Más barato confiable') : tx('Mais barato (pouca confiança)', 'Más barato (poca confianza)')}</span>
              <div><strong class="kpi" style="font-size:20px"><Money value={best.quote.sellMin} /></strong> {tx('em', 'en')} {cityName(best.quote.city, getLocale())}</div>
              <div class="small"><AgeDot min={best.quote.ageMin} /></div>
            </div>
            <ul class="plain-list small">
              {#each top as c (c.city)}
                <li class="festa"><span>{cityName(c.city, getLocale())}</span><span><Money value={c.sellMin} /> · <span class="muted">{fmtAge(c.ageMin, getLocale())}</span></span></li>
              {/each}
            </ul>
            <button type="button" class="linkbtn small" onclick={() => openFull(`/item/${encodeURIComponent(picked!.id)}`)}>{tx('Abrir a página completa', 'Abrir la página completa')}</button>
          {:else if item}
            <p class="small muted" style="margin:0">{tx('Ninguém escaneou este item recentemente.', 'Nadie ha escaneado este objeto recientemente.')}</p>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="stack" role="tabpanel">
      {#if !sub}
        <p class="small muted" style="margin:0">{tx('Nenhum alerta neste aparelho ainda.', 'Todavía no hay alertas en este dispositivo.')}</p>
        <button type="button" class="btn" onclick={() => openFull('/alertas')}>{tx('Criar alerta no site', 'Crear alerta en el sitio')}</button>
      {:else if alertErr}
        <p class="small bad-text" style="margin:0">{alertErr} <button type="button" class="linkbtn" onclick={loadAlerts}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
      {:else if alerts === null}
        <div class="skeleton" style="height:60px"></div>
      {:else if !alerts.length}
        <p class="small muted" style="margin:0">{tx('Nenhum alerta ativo neste aparelho.', 'No hay alertas activas en este dispositivo.')}</p>
      {:else}
        <ul class="plain-list small">
          {#each [...alerts].sort((a, b) => (b.lastFiredAt ?? '').localeCompare(a.lastFiredAt ?? '')).slice(0, 8) as a (a.id)}
            <li>
              <div class="row"><ItemIcon id={a.itemId} quality={a.quality} size={24} /><strong>{names[a.itemId] ?? a.itemId}</strong></div>
              <div class="muted">{alertConditionText(a.condition, getLocale())} · {a.cities.map((c) => cityName(c, getLocale())).join(', ')}</div>
              <div class="muted">{#if a.lastFiredAt}{tx('Disparou', 'Se activó')} <TimeAgo iso={a.lastFiredAt} />{:else}{tx('Ainda não disparou', 'Todavía no se activó')}{/if}</div>
            </li>
          {/each}
        </ul>
        <button type="button" class="linkbtn small" onclick={loadAlerts}>{tx('Atualizar', 'Actualizar')}</button>
      {/if}
    </div>
  {/if}
</div>
