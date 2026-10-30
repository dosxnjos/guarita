<script lang="ts">
  // Painel de live (fonte de navegador do OBS): relógio do servidor, preço dos itens escolhidos e histórico do
  // killboard da guilda. Sem botão nem link: ninguém clica numa fonte do OBS. Cada bloco busca o próprio dado e
  // falha sozinho (o último valor bom continua na tela). Também é a prévia da tela de configuração.
  // Fronteira dos Termos da SBI: só dado público e com atraso (AODP e histórico agregado do killboard), nada sobre
  // jogador avistado agora.
  import { untrack } from 'svelte';
  import type { ClockResponse, GuildSummary, ItemResponse } from '../../../shared/types';
  import { itemName, tierLabel, type ItemsIndex } from '../../../shared/items';
  import { api, ApiError } from '../api';
  import { loadIndex } from '../itemsClient';
  import { coverageText } from '../insights/format';
  import {
    fmtCountdown, fmtInt, fmtSilver, fmtTime, serverLabel, serverTone, tierFromId, trendArrow,
  } from '../format';
  import AgeDot from '../ui/AgeDot.svelte';
  import ItemIcon from '../ui/ItemIcon.svelte';
  import { LIVE_REFRESH_MS, liveBonuses, liveGuildStats, livePrice, type LiveConfig } from './config';

  let { cfg, preview = false }: { cfg: LiveConfig; preview?: boolean } = $props();

  const show = $derived({
    relogio: cfg.blocks.includes('relogio'),
    precos: cfg.blocks.includes('precos') && cfg.items.length > 0,
    guilda: cfg.blocks.includes('guilda') && cfg.guild !== '',
  });

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  /** Sem atualizar há mais de 2 ciclos: o bloco mostra desde quando. */
  const staleSince = (at: number | null, every: number) => (at !== null && now - at > every * 2 ? fmtTime(at, undefined, false) : null);

  // ---------- relógio ----------
  let clock = $state<ClockResponse | null>(null);
  let clockAt = $state<number | null>(null);
  let clockErr = $state(false);
  $effect(() => {
    if (!show.relogio) return;
    let alive = true;
    const load = async () => {
      try {
        const c = await api.clock();
        if (!alive) return;
        clock = c;
        clockAt = Date.now();
        clockErr = false;
      } catch {
        if (alive) clockErr = true;
      }
    };
    load();
    const t = setInterval(load, LIVE_REFRESH_MS.clock);
    return () => { alive = false; clearInterval(t); };
  });
  const bonus = $derived(clock ? liveBonuses(clock.festivities, now) : null);

  // ---------- preços ----------
  interface PriceEntry { item: ItemResponse | null; at: number | null; error: boolean }
  let prices = $state<Record<string, PriceEntry>>({});
  let index = $state<ItemsIndex | null>(null);
  const itemsKey = $derived(show.precos ? cfg.items.join(',') : '');

  $effect(() => {
    if (!itemsKey || index) return;
    loadIndex().then((ix) => (index = ix), () => { /* sem índice: mostra o id */ });
  });

  $effect(() => {
    const ids = itemsKey ? itemsKey.split(',') : [];
    if (!ids.length) return;
    let alive = true;
    // Um item por vez: cada consulta custa várias chamadas no Worker, e o painel não tem pressa.
    const run = async () => {
      for (const id of ids) {
        if (!alive) return;
        try {
          const item = await api.item(id, 1);
          if (alive) prices[id] = { item, at: Date.now(), error: false };
        } catch {
          if (alive) {
            const prev = untrack(() => prices[id]);
            prices[id] = { item: prev?.item ?? null, at: prev?.at ?? null, error: true };
          }
        }
      }
    };
    run();
    const t = setInterval(run, LIVE_REFRESH_MS.prices);
    return () => { alive = false; clearInterval(t); };
  });

  /** Nome PT-BR do índice; sem índice (ou item fora dele), o id legível. */
  function label(id: string): string {
    const n = index ? itemName(index, id) : id;
    return n !== id ? n : id.replace(/^T\d_/, '').replace(/@\d$/, '').replace(/_/g, ' ').toLowerCase();
  }

  const priceRows = $derived(
    show.precos
      ? cfg.items.map((id) => {
          const e = prices[id];
          const { tier, ench } = tierFromId(id);
          return { id, name: label(id), tier: tierLabel(tier, ench), entry: e, p: livePrice(e?.item, cfg.city) };
        })
      : [],
  );
  const pricesAt = $derived(
    priceRows.reduce<number | null>((min, r) => (r.entry?.at != null ? (min === null ? r.entry.at : Math.min(min, r.entry.at)) : min), null),
  );

  // ---------- guilda ----------
  let guild = $state<GuildSummary | null>(null);
  let guildAt = $state<number | null>(null);
  let guildErr = $state('');
  let guildLoading = $state(false);
  const guildName = $derived(show.guilda ? cfg.guild : '');

  $effect(() => {
    const name = guildName;
    guild = null;
    guildAt = null;
    guildErr = '';
    if (!name) return;
    let alive = true;
    const load = async () => {
      guildLoading = true;
      try {
        const g = await api.guild(name);
        if (!alive) return;
        guild = g;
        guildAt = Date.now();
        guildErr = '';
      } catch (e) {
        if (!alive) return;
        guildErr = e instanceof ApiError && e.status === 404 ? 'Guilda não encontrada. Confira o nome exato.' : 'Histórico indisponível agora.';
      } finally {
        if (alive) guildLoading = false;
      }
    };
    load();
    const t = setInterval(load, LIVE_REFRESH_MS.guild);
    return () => { alive = false; clearInterval(t); };
  });
  const gs = $derived(guild ? liveGuildStats(guild, now) : null);
</script>

<div
  class="live-panel"
  class:claro={cfg.theme === 'claro'}
  class:preview
  style="font-size: calc(22px * {cfg.scale})"
  role="region"
  aria-label="Painel de live da Guarita"
>
  {#each cfg.blocks as b (b)}
    {#if b === 'relogio' && show.relogio}
      <section class="lp-block" aria-label="Relógio do servidor">
        <div class="lp-clock">
          <span class="lp-time num" aria-live="off">{fmtTime(now, undefined, false)}</span>
          <span class="lp-sub">Brasília · servidor <span class="num">{fmtTime(now, 'UTC', false)}</span> UTC</span>
        </div>
        {#if clock}
          <div class="lp-line">
            <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>
            <span>{serverLabel(clock.server.status)}</span>
            {#if clock.gold.price !== null}
              <span class="lp-sep" aria-hidden="true">·</span>
              <span>Ouro <strong class="num">{fmtInt(clock.gold.price)}</strong> <span class="lp-muted">prata</span>
                {#if trendArrow(clock.gold.trend)}<span aria-label="tendência: {clock.gold.trend}">{trendArrow(clock.gold.trend)}</span>{/if}</span>
            {/if}
          </div>
          {#if bonus && bonus.production.length}
            <div class="lp-line lp-fest"><span class="lp-accent">Bônus do dia (produção):</span> {bonus.production.join(', ')}
              {#if bonus.productionMsLeft !== null}<span class="lp-muted">(termina em {fmtCountdown(bonus.productionMsLeft)})</span>{/if}</div>
          {/if}
          {#if bonus && bonus.activities.length}
            <div class="lp-line lp-fest"><span class="lp-accent">Bônus ativo:</span> {bonus.activities.join(', ')}</div>
          {/if}
          {#if bonus && bonus.seasonal.length}
            <div class="lp-line lp-fest"><span class="lp-muted">Evento:</span> {bonus.seasonal.join(', ')}</div>
          {/if}
          {#if bonus && !bonus.production.length && !bonus.activities.length}
            <div class="lp-line lp-muted">Sem bônus do dia agora.</div>
          {/if}
          {#if staleSince(clockAt, LIVE_REFRESH_MS.clock)}<div class="lp-note">Sem atualizar desde {staleSince(clockAt, LIVE_REFRESH_MS.clock)}</div>{/if}
        {:else if clockErr}
          <div class="lp-line lp-muted">Status do servidor indisponível agora.</div>
        {:else}
          <div class="lp-line lp-muted">Carregando status do servidor…</div>
        {/if}
      </section>
    {:else if b === 'precos' && show.precos}
      <section class="lp-block" aria-label="Preços dos itens">
        <div class="lp-title">Preços {cfg.city ? `em ${cfg.city}` : '(melhor cidade)'}</div>
        <ul class="lp-prices">
          {#each priceRows as r (r.id)}
            <li>
              <ItemIcon id={r.id} size={64} eager />
              <div class="lp-pname">
                <span class="lp-name">{r.name}{#if r.tier} <span class="lp-tier">{r.tier}</span>{/if}</span>
                {#if r.entry?.item && r.p.price !== null}
                  <span class="lp-meta">
                    {#if !cfg.city && r.p.city}<span>{r.p.city}</span><span aria-hidden="true">·</span>{/if}
                    <AgeDot min={r.p.ageMin} />
                    {#if !r.p.reliable}<span aria-hidden="true">·</span><span>conferir no jogo</span>{/if}
                  </span>
                {:else if r.entry?.item}
                  <span class="lp-meta lp-muted">sem preço recente</span>
                {:else if r.entry?.error}
                  <span class="lp-meta lp-muted">indisponível agora</span>
                {:else}
                  <span class="lp-meta lp-muted">carregando…</span>
                {/if}
              </div>
              <span class="lp-price num">{r.p.price !== null ? fmtSilver(r.p.price, r.p.price >= 1e6) : '—'}</span>
            </li>
          {/each}
        </ul>
        <div class="lp-note">Albion Online Data Project (comunitário){#if staleSince(pricesAt, LIVE_REFRESH_MS.prices)} · sem atualizar desde {staleSince(pricesAt, LIVE_REFRESH_MS.prices)}{/if}</div>
      </section>
    {:else if b === 'guilda' && show.guilda}
      <section class="lp-block" aria-label="Histórico do killboard da guilda">
        <div class="lp-title">{guild?.name ?? cfg.guild} <span class="lp-muted">· histórico do killboard</span></div>
        {#if gs && guild}
          <div class="lp-kd">
            <div><span class="lp-kd-n num lp-good">{fmtInt(gs.todayKills)}</span> <span class="lp-muted">kills</span></div>
            <div><span class="lp-kd-n num lp-bad">{fmtInt(gs.todayDeaths)}</span> <span class="lp-muted">mortes</span></div>
            <div class="lp-muted lp-kd-l">hoje no servidor</div>
          </div>
          <div class="lp-line">7 dias: <strong class="num">{fmtInt(gs.weekKills)}</strong> kills · <strong class="num">{fmtInt(gs.weekDeaths)}</strong> mortes</div>
          {#if gs.top.length}
            <div class="lp-line"><span class="lp-muted">Quem mais matou:</span>
              {gs.top.map((t) => `${t.name} (${fmtInt(t.kills)})`).join(', ')}</div>
          {/if}
          <div class="lp-note">Com atraso, não é ao vivo. {coverageText(guild.coverageSince)}{#if staleSince(guildAt, LIVE_REFRESH_MS.guild)} Sem atualizar desde {staleSince(guildAt, LIVE_REFRESH_MS.guild)}.{/if}</div>
        {:else if guildErr}
          <div class="lp-line lp-muted">{guildErr}</div>
        {:else if guildLoading}
          <div class="lp-line lp-muted">Carregando histórico… (o killboard oficial às vezes demora)</div>
        {/if}
      </section>
    {/if}
  {/each}
</div>

<style>
  /* Tokens próprios do painel (não dependem do tema do site): legível sobre qualquer cena do jogo. */
  .live-panel {
    --lp-bg: rgb(16 14 11 / 78%);
    --lp-line: rgb(255 255 255 / 12%);
    --ink: #f7f1e6;
    --muted: #cfc5b3;
    --accent: #f2bb5e;
    --good: #8fe0b0;
    --warn: #f0d277;
    --bad: #ffa59b;
    --lp-shadow: 0 1px 2px rgb(0 0 0 / 85%), 0 0 6px rgb(0 0 0 / 45%);
    display: grid;
    gap: 0.45em;
    width: min(100%, 24em);
    padding: 0.4em;
    color: var(--ink);
    font-family: var(--font);
    line-height: 1.3;
    text-shadow: var(--lp-shadow);
    cursor: default;
    user-select: none;
  }
  .live-panel.claro {
    --lp-bg: rgb(255 252 246 / 88%);
    --lp-line: rgb(0 0 0 / 10%);
    --ink: #1c1915;
    --muted: #574f43;
    --accent: #8a5a10;
    --good: #1f6b45;
    --warn: #7a5000;
    --bad: #a3322a;
    --lp-shadow: none;
  }
  .lp-block {
    background: var(--lp-bg);
    border: 1px solid var(--lp-line);
    border-radius: 0.5em;
    padding: 0.5em 0.7em;
    display: grid;
    gap: 0.25em;
    min-width: 0;
  }
  .lp-clock { display: flex; align-items: baseline; gap: 0.5em; flex-wrap: wrap; }
  .lp-time { font-size: 2.1em; font-weight: 800; line-height: 1; letter-spacing: 0.01em; }
  .lp-sub { font-size: 0.75em; color: var(--muted); }
  .lp-line { display: flex; align-items: center; gap: 0.35em; flex-wrap: wrap; font-size: 0.85em; }
  .lp-fest { display: block; }
  .lp-title { font-weight: 700; font-size: 0.9em; }
  .lp-muted { color: var(--muted); }
  .lp-accent { color: var(--accent); font-weight: 700; }
  .lp-good { color: var(--good); }
  .lp-bad { color: var(--bad); }
  .lp-sep { color: var(--muted); }
  .lp-note { font-size: 0.6em; color: var(--muted); }
  .dot { display: inline-block; width: 0.55em; height: 0.55em; border-radius: 50%; background: var(--muted); flex: none; }
  .dot.good { background: var(--good); }
  .dot.warn { background: var(--warn); }
  .dot.bad { background: var(--bad); }

  .lp-prices { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3em; }
  .lp-prices li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.45em; min-width: 0; }
  .lp-prices :global(.item-icon) { width: 2.1em; height: 2.1em; }
  .lp-pname { display: grid; min-width: 0; }
  .lp-name { font-size: 0.8em; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lp-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 0 0.35em; font-size: 0.62em; color: var(--muted); }
  .lp-meta :global(.age) { width: 0.7em; height: 0.7em; }
  .lp-price { font-size: 1.15em; font-weight: 800; white-space: nowrap; }

  .lp-kd { display: flex; align-items: baseline; gap: 0.8em; flex-wrap: wrap; }
  .lp-kd-n { font-size: 1.6em; font-weight: 800; }
  .lp-kd-l { font-size: 0.7em; }
  .lp-tier { margin-left: 0.3em; font-size: 0.85em; font-weight: 500; color: var(--muted); }
</style>
