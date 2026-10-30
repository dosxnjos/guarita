<script lang="ts">
  // Perdas no PvP: itens mais perdidos nas mortes do Americas (amostra do KillLog da Guarita) com o preço atual.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import type { LossesResponse } from '../../shared/types';
  import { loadIndex } from '../lib/itemsClient';
  import { itemName, tierLabel } from '../../shared/items';
  import { tierFromId, fmtDateTime } from '../lib/format';
  import { itemHref, plural } from '../lib/player/format';
  import { coverageText, lossTotals, periodLabel, sortLosses, type LossSort } from '../lib/insights/format';
  import ItemIcon from '../lib/ui/ItemIcon.svelte';
  import Money from '../lib/ui/Money.svelte';
  import AgeDot from '../lib/ui/AgeDot.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const initialDays = (() => {
    try { return new URLSearchParams(location.search).get('dias') === '7' ? 7 : 1; } catch { return 1; }
  })();

  let days = $state<1 | 7>(initialDays);
  let sort = $state<LossSort>('count');
  let data = $state<LossesResponse | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  /** Nomes completados pelo índice do navegador quando o servidor devolveu só o id. */
  let names = $state<Record<string, string>>({});
  let seq = 0;

  async function load(d: 1 | 7) {
    const my = ++seq;
    loading = true; error = null;
    try {
      const r = await api.losses(d);
      if (my !== seq) return;
      data = r;
      fillNames(r);
    } catch (e) {
      if (my === seq) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === seq) loading = false;
    }
  }

  async function fillNames(r: LossesResponse) {
    const missing = r.items.filter((i) => i.name === i.id && !names[i.id]);
    if (!missing.length) return;
    try {
      const index = await loadIndex();
      const add: Record<string, string> = {};
      for (const i of missing) {
        const n = itemName(index, i.id);
        if (n !== i.id) {
          const { tier, ench } = tierFromId(i.id);
          add[i.id] = tier ? `${n} (${tierLabel(tier, ench)})` : n;
        }
      }
      names = { ...names, ...add };
    } catch { /* sem índice: fica o id */ }
  }

  function pick(d: 1 | 7) {
    if (d === days) return;
    days = d;
    try {
      const u = new URL(location.href);
      if (d === 7) u.searchParams.set('dias', '7'); else u.searchParams.delete('dias');
      history.replaceState(history.state, '', u.pathname + u.search);
    } catch { /* sem history */ }
    load(d);
  }

  $effect(() => {
    document.title = 'Perdas no PvP · Guarita';
    load(initialDays);
  });

  const items = $derived(data ? sortLosses(data.items, sort) : []);
  const totals = $derived(lossTotals(data?.items ?? []));
  const label = (id: string, name: string) => names[id] ?? name;
</script>

<section class="page stack">
  <header>
    <h1>Perdas no PvP</h1>
    <p class="muted">
      O que a guerra consome: os itens que mais se perdem nas mortes PvP do servidor Americas, com o preço atual.
      Quem morre precisa repor o set, e isso gera demanda para quem crafta e vende. Nas zonas de saque total boa parte
      do que cai é saqueada e volta ao mercado; só uma parte é destruída na morte.
    </p>
  </header>

  <div class="controls">
    <div class="seg" role="group" aria-label="Período">
      <button type="button" aria-pressed={days === 1} onclick={() => pick(1)}>Hoje</button>
      <button type="button" aria-pressed={days === 7} onclick={() => pick(7)}>7 dias</button>
    </div>
    <div class="seg" role="group" aria-label="Ordenar por">
      <button type="button" aria-pressed={sort === 'count'} onclick={() => (sort = 'count')}>Mais perdidos</button>
      <button type="button" aria-pressed={sort === 'value'} onclick={() => (sort = 'value')}>Maior valor</button>
    </div>
  </div>

  {#if days === 1}
    <p class="muted small hint">“Hoje” é o dia do jogo, que vira às 21h de Brasília (meia-noite UTC).</p>
  {/if}

  <div aria-live="polite">
    {#if loading && !data}
      <Loading lines={6} height={44} label="Carregando as perdas" />
    {:else if error && !data}
      <ErrorBox message={error} onretry={() => load(days)} />
    {:else if data}
      <div class="stack" class:dim={loading}>
        <div class="callout small">
          <strong>{coverageText(data.since, data.sampleKills)}</strong>
          A Guarita guarda uma parte das mortes do killboard público, não todas. Use os números como proporção do que
          mais se perde, não como o total do servidor.
        </div>

        {#if error}<ErrorBox message={error} onretry={() => load(days)} />{/if}

        {#if items.length === 0}
          <p class="empty card">
            Nenhuma perda coletada {periodLabel(data.days)} ainda.
            {#if data.days === 1}Logo depois das 21h o dia do jogo recomeça; veja os últimos 7 dias.{/if}
          </p>
        {:else}
          <div class="stats">
            <div class="card stat"><span class="kpi-label">Valor perdido</span><strong class="kpi"><Money value={totals.value} compact /></strong>
              <span class="muted small">soma dos {totals.priced} itens com preço, em prata</span></div>
            <div class="card stat"><span class="kpi-label">Mortes na amostra</span><strong class="kpi num">{plural(data.sampleKills, 'morte', 'mortes')}</strong>
              <span class="muted small">{periodLabel(data.days)}</span></div>
          </div>

          <ol class="losses" aria-label="Itens mais perdidos, {periodLabel(data.days)}">
            {#each items as it, i (it.id)}
              <li class="card">
                <span class="rank num muted small" aria-hidden="true">{i + 1}</span>
                <ItemIcon id={it.id} size={44} alt="" />
                <div class="main">
                  <a class="name" href={itemHref(it.id)} onclick={go}>{label(it.id, it.name)}</a>
                  <span class="muted small">Perdido {plural(it.count, 'vez', 'vezes')}</span>
                </div>
                <dl class="nums">
                  <div><dt class="muted small">Preço</dt><dd><Money value={it.price} compact />
                    {#if it.price !== null}<AgeDot min={it.ageMin} text={false} />{/if}</dd></div>
                  <div><dt class="muted small">Valor perdido</dt><dd><strong><Money value={it.value} compact /></strong></dd></div>
                </dl>
              </li>
            {/each}
          </ol>

          <p class="muted small">
            Preço: menor venda entre as cidades reais e Caerleon, qualidade normal, no Albion Online Data Project.
            {#if totals.unpriced}{totals.unpriced} {totals.unpriced === 1 ? 'item ficou' : 'itens ficaram'} sem preço recente.{/if}
            Valor perdido = vezes perdido × preço. Atualizado em {fmtDateTime(data.fetchedAt)} (Brasília).
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <p class="callout small">
    É histórico do killboard público, com atraso de minutos: não mostra quem está por perto nem avisa de inimigos.
    <a href="/permitido" onclick={go}>Entenda o que fazemos e o que nunca faremos.</a>
  </p>
</section>

<style>
  header p { margin: 0; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px 12px; }
  .hint { margin: -4px 0 0; }
  .dim { opacity: 0.6; transition: opacity 0.15s; }
  .callout strong { display: block; margin-bottom: 2px; }
  .stats { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); }
  .stat { display: grid; gap: 2px; padding: 10px 12px; }
  .losses { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .losses li { display: grid; grid-template-columns: auto auto 1fr; gap: 6px 10px; align-items: center; padding: 10px 12px; }
  .rank { width: 1.6em; text-align: right; }
  .main { display: grid; gap: 2px; min-width: 0; }
  .name { font-weight: 600; overflow-wrap: anywhere; }
  .nums { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin: 0; }
  .nums div { display: grid; gap: 0; }
  dd { margin: 0; display: inline-flex; align-items: center; gap: 6px; }
  @media (min-width: 640px) {
    .losses li { grid-template-columns: auto auto 1fr minmax(220px, auto); }
    .nums { grid-column: auto; text-align: right; }
    .nums dd { justify-content: flex-end; }
  }
  p { margin: 0; }
</style>
