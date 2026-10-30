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
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const initialDays = (() => {
    try { return new URLSearchParams(location.search).get('dias') === '7' ? 7 : 1; } catch { return 1; }
  })();

  let days = $state<1 | 7>(initialDays);
  let sort = $state<LossSort>('count');
  let data = $state<LossesResponse | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  /**
   * Nomes completados pelo índice do navegador quando o servidor devolveu só o id. Em espanhol, todos: a API manda o
   * nome em PT e o loadIndex() já carrega o índice ES.
   */
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
    const all = getLocale() === 'es';
    const missing = r.items.filter((i) => (all || i.name === i.id) && !names[i.id]);
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
    // Igual a worker/seo.ts (FIXED_ROUTES e FIXED_ES).
    document.title = tx('Perdas no PvP · Guarita', 'Pérdidas en PvP · Guarita');
    load(initialDays);
  });

  const items = $derived(data ? sortLosses(data.items, sort) : []);
  const totals = $derived(lossTotals(data?.items ?? []));
  const label = (id: string, name: string) => names[id] ?? name;
</script>

<section class="page stack">
  <header>
    <h1>{tx('Perdas no PvP', 'Pérdidas en PvP')}</h1>
    <p class="muted">
      {tx(
        'O que a guerra consome: os itens que mais se perdem nas mortes PvP do servidor Americas, com o preço atual. Quem morre precisa repor o set, e isso gera demanda para quem crafta e vende. Nas zonas de saque total boa parte do que cai é saqueada e volta ao mercado; só uma parte é destruída na morte.',
        'Lo que consume la guerra: los objetos que más se pierden en las muertes PvP del servidor Americas, con el precio actual. Quien muere necesita reponer su equipo, y eso genera demanda para quien fabrica y vende. En las zonas de botín completo, buena parte de lo que cae se saquea y vuelve al mercado; solo una parte se destruye al morir.',
      )}
    </p>
  </header>

  <div class="controls">
    <div class="seg" role="group" aria-label={tx('Período', 'Período')}>
      <button type="button" aria-pressed={days === 1} onclick={() => pick(1)}>{tx('Hoje', 'Hoy')}</button>
      <button type="button" aria-pressed={days === 7} onclick={() => pick(7)}>{tx('7 dias', '7 días')}</button>
    </div>
    <div class="seg" role="group" aria-label={tx('Ordenar por', 'Ordenar por')}>
      <button type="button" aria-pressed={sort === 'count'} onclick={() => (sort = 'count')}>{tx('Mais perdidos', 'Más perdidos')}</button>
      <button type="button" aria-pressed={sort === 'value'} onclick={() => (sort = 'value')}>{tx('Maior valor', 'Mayor valor')}</button>
    </div>
  </div>

  {#if days === 1}
    <p class="muted small hint">{tx('“Hoje” é o dia do jogo, que vira às 21h de Brasília (meia-noite UTC).', '“Hoy” es el día del juego, que cambia a las 21 h de Brasilia (medianoche UTC).')}</p>
  {/if}

  <div aria-live="polite">
    {#if loading && !data}
      <Loading lines={6} height={44} label={tx('Carregando as perdas', 'Cargando las pérdidas')} />
    {:else if error && !data}
      <ErrorBox message={error} onretry={() => load(days)} />
    {:else if data}
      <div class="stack" class:dim={loading}>
        <div class="callout small">
          <strong>{coverageText(data.since, data.sampleKills)}</strong>
          {tx(
            'A Guarita guarda uma parte das mortes do killboard público, não todas. Use os números como proporção do que mais se perde, não como o total do servidor.',
            'La Guarita guarda una parte de las muertes del killboard público, no todas. Usa los números como proporción de lo que más se pierde, no como el total del servidor.',
          )}
        </div>

        {#if error}<ErrorBox message={error} onretry={() => load(days)} />{/if}

        {#if items.length === 0}
          <p class="empty card">
            {tx(`Nenhuma perda coletada ${periodLabel(data.days)} ainda.`, `Todavía no se registró ninguna pérdida ${data.days <= 1 ? 'hoy' : `en los ${periodLabel(data.days)}`}.`)}
            {#if data.days === 1}{tx('Logo depois das 21h o dia do jogo recomeça; veja os últimos 7 dias.', 'Justo después de las 21 h el día del juego vuelve a empezar; mira los últimos 7 días.')}{/if}
          </p>
        {:else}
          <div class="stats">
            <div class="card stat"><span class="kpi-label">{tx('Valor perdido', 'Valor perdido')}</span><strong class="kpi"><Money value={totals.value} compact /></strong>
              <span class="muted small">{tx(`soma dos ${totals.priced} itens com preço, em prata`, `suma de los ${totals.priced} objetos con precio, en plata`)}</span></div>
            <div class="card stat"><span class="kpi-label">{tx('Mortes na amostra', 'Muertes en la muestra')}</span><strong class="kpi num">{tx(plural(data.sampleKills, 'morte', 'mortes'), plural(data.sampleKills, 'muerte', 'muertes'))}</strong>
              <span class="muted small">{periodLabel(data.days)}</span></div>
          </div>

          <ol class="losses" aria-label={tx(`Itens mais perdidos, ${periodLabel(data.days)}`, `Objetos más perdidos, ${periodLabel(data.days)}`)}>
            {#each items as it, i (it.id)}
              <li class="card">
                <span class="rank num muted small" aria-hidden="true">{i + 1}</span>
                <ItemIcon id={it.id} size={44} alt="" />
                <div class="main">
                  <a class="name" href={href(itemHref(it.id))} onclick={go}>{label(it.id, it.name)}</a>
                  <span class="muted small">{tx(`Perdido ${plural(it.count, 'vez', 'vezes')}`, `Perdido ${plural(it.count, 'vez', 'veces')}`)}</span>
                </div>
                <dl class="nums">
                  <div><dt class="muted small">{tx('Preço', 'Precio')}</dt><dd><Money value={it.price} compact />
                    {#if it.price !== null}<AgeDot min={it.ageMin} text={false} />{/if}</dd></div>
                  <div><dt class="muted small">{tx('Valor perdido', 'Valor perdido')}</dt><dd><strong><Money value={it.value} compact /></strong></dd></div>
                </dl>
              </li>
            {/each}
          </ol>

          <p class="muted small">
            {tx(
              'Preço: menor venda entre as cidades reais e Caerleon, qualidade normal, no Albion Online Data Project.',
              'Precio: la venta más baja entre las ciudades reales y Caerleon, calidad normal, en el Albion Online Data Project.',
            )}
            {#if totals.unpriced}{tx(
              `${totals.unpriced} ${totals.unpriced === 1 ? 'item ficou' : 'itens ficaram'} sem preço recente.`,
              `${totals.unpriced} ${totals.unpriced === 1 ? 'objeto quedó' : 'objetos quedaron'} sin precio reciente.`,
            )}{/if}
            {tx(
              `Valor perdido = vezes perdido × preço. Atualizado em ${fmtDateTime(data.fetchedAt)} (Brasília).`,
              `Valor perdido = veces perdido × precio. Actualizado el ${fmtDateTime(data.fetchedAt)} (Brasilia).`,
            )}
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <p class="callout small">
    {tx(
      'É histórico do killboard público, com atraso de minutos: não mostra quem está por perto nem avisa de inimigos.',
      'Es historial del killboard público, con minutos de retraso: no muestra quién está cerca ni avisa de enemigos.',
    )}
    <a href={href('/permitido')} onclick={go}>{tx('Entenda o que fazemos e o que nunca faremos.', 'Entiende lo que hacemos y lo que nunca haremos.')}</a>
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
