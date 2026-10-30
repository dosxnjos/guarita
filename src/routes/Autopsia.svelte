<script lang="ts">
  // Autópsia da última morte: o que aconteceu, lições, quem matou e quanto custa recomprar o equipamento.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import { loadIndex } from '../lib/itemsClient';
  import { itemName, type ItemsIndex } from '../../shared/items';
  import type { AutopsyResponse } from '../../shared/types';
  import { cached } from '../lib/player/cache';
  import {
    ageClass, dangerHeadline, dangerTone, fmtAgo, fmtAgoMin, fmtCompact, fmtDateBR, fmtDec, fmtNum, itemHref,
    playerHref, qualityLabel, slotLabel,
  } from '../lib/player/format';
  import ItemIcon from '../lib/player/ItemIcon.svelte';
  import Patient from '../lib/player/Patient.svelte';
  import ErrorBox from '../lib/player/ErrorBox.svelte';

  let { params = {} }: { params?: Record<string, string> } = $props();
  const id = $derived(params.id ?? '');

  let data = $state<AutopsyResponse | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let index = $state<ItemsIndex | null>(null);
  let seq = 0;

  async function load(pid: string, fresh = false) {
    const my = ++seq;
    loading = true; error = null; data = null;
    try {
      const d = await cached(`autopsia:${pid}`, () => api.autopsy(pid), fresh);
      if (my === seq) data = d;
    } catch (e) {
      if (my === seq) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === seq) loading = false;
    }
  }

  $effect(() => {
    if (id) load(id);
  });

  // nomes dos itens vêm do índice; se ele falhar, mostramos o espaço + código
  $effect(() => {
    loadIndex().then((ix) => (index = ix)).catch(() => {});
  });

  $effect(() => {
    document.title = 'Autópsia · Guarita';
  });

  function nameOf(itemId: string, slot: string): string {
    if (index) {
      try {
        const n = itemName(index, itemId);
        if (n && n !== itemId) return n;
      } catch { /* cai no rótulo do espaço */ }
    }
    return `${slotLabel(slot)} (${itemId})`;
  }

  function killerOrg(guild: string, alliance: string): string {
    return alliance ? `${guild} · [${alliance}]` : guild;
  }

  const death = $derived(data?.death ?? null);
  const killer = $derived(data?.killerDossier ?? null);
  const missing = $derived((data?.rebuy ?? []).filter((r) => r.price === null).length);
</script>

<section class="page stack">
  <p class="small"><a href={playerHref(id)} onclick={go}>← Voltar ao dossiê</a></p>
  <h1>Autópsia da última morte</h1>

  {#if loading}
    <Patient lines={6} what="a última morte no killboard oficial" />
  {:else if error}
    <ErrorBox message={error} onretry={() => load(id, true)} />
  {:else if data && !death}
    <div class="card empty">
      <p><strong>Nenhuma morte recente encontrada.</strong></p>
      <p>O killboard não mostra mortes recentes deste personagem. Boa notícia: não há o que analisar por enquanto.</p>
      <a class="btn" href={playerHref(id)} onclick={go}>Ver o dossiê</a>
    </div>
  {:else if data && death}
    <div class="card stack">
      <p class="when">
        <strong>{death.victim.name}</strong> morreu <time datetime={death.time}>{fmtAgo(death.time)}</time>
        <span class="muted small">({fmtDateBR(death.time)}, horário de Brasília)</span>
      </p>
      <dl class="facts">
        <div>
          <dt>Quem matou</dt>
          <dd>
            {#if death.killer.id}<a href={playerHref(death.killer.id)} onclick={go}>{death.killer.name}</a>{:else}{death.killer.name || 'desconhecido'}{/if}
            {#if death.killer.guild}<span class="muted small">[{death.killer.guild}]</span>{/if}
          </dd>
        </div>
        <div><dt>IP de quem matou</dt><dd class="num">{fmtNum(death.killer.ip)}</dd></div>
        <div><dt>IP da vítima</dt><dd class="num">{fmtNum(death.victim.ip)}</dd></div>
        <div><dt>Tamanho do grupo</dt><dd class="num">{fmtNum(death.participants)}</dd></div>
        <div>
          <dt>Valor perdido (estimado)</dt>
          <dd class="num">{death.estValue === null ? 'sem preço' : fmtNum(death.estValue) + ' prata'}</dd>
        </div>
      </dl>
    </div>

    <div class="callout lessons">
      <h2 class="first">O que dá para aprender</h2>
      {#if data.lessons.length}
        <ul>{#each data.lessons as l, i (i)}<li>{l}</li>{/each}</ul>
      {:else}
        <p class="muted">Nada fora do comum nessa luta. Às vezes é só azar.</p>
      {/if}
    </div>

    {#if killer}
      <div class="card stack">
        <h2 class="first">Quem matou: {killer.name}</h2>
        <div class="row">
          <span class="tag {dangerTone(killer.danger.label)}">{dangerHeadline(killer.danger.label)}</span>
          {#if killer.guild}<span class="muted small">{killerOrg(killer.guild, killer.alliance)}</span>{/if}
        </div>
        <dl class="facts">
          <div><dt>Fama de kill</dt><dd class="num">{fmtCompact(killer.killFame)}</dd></div>
          <div><dt>Razão kill/morte</dt><dd class="num">{fmtDec(killer.ratio)}</dd></div>
          <div><dt>IP médio</dt><dd class="num">{fmtNum(killer.avgIp)}</dd></div>
          <div><dt>Arma mais usada</dt><dd>{killer.weapons[0]?.labelPt ?? '—'}</dd></div>
        </dl>
        {#if killer.danger.reasons.length}<p class="muted small">{killer.danger.reasons.slice(0, 2).join(' · ')}</p>{/if}
        <a class="btn" href={playerHref(killer.id)} onclick={go}>Ver dossiê completo de {killer.name}</a>
      </div>
    {/if}

    <div class="card stack">
      <h2 class="first">Recomprar o equipamento</h2>
      {#if data.rebuy.length}
        <ul class="rebuy">
          {#each data.rebuy as r, i (r.slot + r.id + i)}
            <li>
              <ItemIcon id={r.id} quality={r.quality} alt={nameOf(r.id, r.slot)} />
              <div class="piece">
                <a href={itemHref(r.id, r.quality)} onclick={go}>{nameOf(r.id, r.slot)}</a>
                <span class="muted small">{slotLabel(r.slot)} · {qualityLabel(r.quality)}{#if (r.count ?? 1) > 1} · {fmtNum(r.count ?? 1)} unidades{#if r.price !== null} ({fmtNum(Math.round(r.price / (r.count ?? 1)))} cada){/if}{/if}</span>
              </div>
              <div class="price">
                {#if r.price !== null}
                  <strong class="num">{fmtNum(r.price)}</strong>
                  <span class="muted small">
                    {r.cheapestCity ?? '—'} · <span class="age {ageClass(r.ageMin)}" aria-hidden="true"></span> {fmtAgoMin(r.ageMin)}
                  </span>
                {:else}
                  <span class="muted small">sem preço recente</span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        <p class="total">
          <span>Total, cada peça na cidade mais barata</span>
          <strong class="num">{data.rebuyTotal === null ? '—' : fmtNum(data.rebuyTotal) + ' prata'}</strong>
        </p>
        {#if missing}
          <p class="muted small">{missing} {missing === 1 ? 'peça ficou' : 'peças ficaram'} fora do total por falta de preço recente.</p>
        {/if}
        <p class="muted small">
          Preços do Albion Data Project, enviados por jogadores; a bolinha mostra a idade do preço (verde até 1 h, âmbar até
          6 h). Confira na página de cada item antes de comprar.
        </p>
      {:else}
        <p class="muted">O killboard não trouxe o equipamento dessa morte.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  p { margin: 0; }
  h2.first { margin-top: 0; }
  .when { overflow-wrap: anywhere; }
  .facts { display: grid; gap: 6px 16px; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); margin: 0; }
  .facts div { display: grid; }
  dt { color: var(--muted); font-size: 14px; }
  dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  .lessons { border-left-width: 6px; background: var(--accent-soft); }
  .lessons ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-weight: 500; }
  .empty { display: grid; gap: 8px; justify-items: center; }
  .rebuy { list-style: none; margin: 0; padding: 0; display: grid; }
  .rebuy li { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); min-width: 0; flex-wrap: wrap; }
  .piece { flex: 1 1 160px; min-width: 0; display: grid; }
  .piece a { overflow-wrap: anywhere; }
  .price { display: grid; justify-items: end; text-align: right; margin-left: auto; }
  .total { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 17px; }
</style>
