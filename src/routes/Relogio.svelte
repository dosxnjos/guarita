<script lang="ts">
  // Relógio do Americas: hora de Brasília e do servidor (UTC), status, festividades, ouro, Premium e temporada.
  // Busca /api/clock a cada 2 min; os relógios e contagens andam a cada segundo no navegador.
  import type { ClockResponse } from '../../shared/types';
  import { SEASON } from '../../shared/market';
  import { api } from '../lib/api';
  import {
    fmtCountdown, fmtDateTime, fmtLongDate, fmtPct, fmtSilver, fmtTime, isStale, serverLabel, serverTone, splitFestivities, trendArrow,
  } from '../lib/format';
  import Loading from '../lib/ui/Loading.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';
  import TimeAgo from '../lib/ui/TimeAgo.svelte';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  let clock = $state<ClockResponse | null>(null);
  let error = $state('');
  let loading = $state(false);
  let now = $state(Date.now());

  async function load() {
    loading = true;
    try {
      clock = await api.clock();
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Erro desconhecido.';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
    const a = setInterval(load, 120000);
    const b = setInterval(() => (now = Date.now()), 1000);
    // Volta de outra aba: atualiza na hora se passou do intervalo.
    const vis = () => { if (document.visibilityState === 'visible' && clock && isStale(clock.now, 2)) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener('visibilitychange', vis); };
  });

  const fest = $derived(clock ? splitFestivities(clock.festivities, now) : { active: [], upcoming: [] });
  const season = $derived(clock?.season ?? SEASON);
  const seasonLeft = $derived(Date.parse(season.end) - now);
  const goldDelta = $derived(clock && clock.gold.price && clock.gold.p30 ? clock.gold.price / clock.gold.p30 - 1 : null);
  const statusStale = $derived(!!clock && isStale(clock.server.checkedAt, 15, now));
</script>

<svelte:head><title>Relógio do Americas · Guarita</title></svelte:head>

<section class="page">
  <h1>Relógio do Americas</h1>
  <p class="muted" style="margin-top:0">{fmtLongDate(now)} · atualiza sozinho a cada 2 minutos.</p>

  <div class="grid">
    <div class="card stack">
      <div class="kpi-label">Brasília</div>
      <div class="big-clock" aria-live="off">{fmtTime(now)}</div>
      <div class="small muted">Servidor (UTC): <strong class="num">{fmtTime(now, 'UTC')}</strong></div>
    </div>

    <div class="card stack">
      <div class="kpi-label">Servidor</div>
      {#if clock}
        <p class="row" style="margin:0;font-size:20px">
          <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>
          <strong>{serverLabel(clock.server.status)}</strong>
        </p>
        <!-- a mensagem oficial vem em inglês; a genérica "Server is online." não acrescenta nada -->
        {#if clock.server.message && !/^server is online\.?$/i.test(clock.server.message.trim())}<p lang="en" class="small" style="margin:0">{clock.server.message}</p>{/if}
        <p class="small muted" style="margin:0">
          Conferido <TimeAgo iso={clock.server.checkedAt} />
          {#if statusStale}<span class="tag warn">pode estar desatualizado</span>{/if}
        </p>
      {:else if error}
        <p class="small muted" style="margin:0">Sem informação agora.</p>
      {:else}
        <Loading lines={2} label="Carregando status" />
      {/if}
    </div>
  </div>

  {#if error && !clock}
    <div style="margin-top:16px"><ErrorBox message={error} onretry={load} /></div>
  {:else if error}
    <p class="callout warn small" style="margin-top:12px">Não deu para atualizar agora ({error}); mostrando a última leitura. <button type="button" class="linkbtn" onclick={load} disabled={loading}>Tentar de novo</button></p>
  {/if}

  <h2>Festividades e bônus</h2>
  {#if clock}
    <div class="grid">
      <div class="card">
        <h3 class="small kpi-label">Ativas agora</h3>
        {#if fest.active.length}
          <ul class="plain-list">
            {#each fest.active as f (f.name + f.start)}
              <li class="festa">
                <span>{f.labelPt}</span>
                <span class="small"><span class="muted">termina em</span> <span class="count">{fmtCountdown(f.msLeft)}</span></span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">Nenhuma festividade ativa agora.</p>
        {/if}
      </div>
      <div class="card">
        <h3 class="small kpi-label">Próximas</h3>
        {#if fest.upcoming.length}
          <ul class="plain-list">
            {#each fest.upcoming.slice(0, 6) as f (f.name + f.start)}
              <li class="festa">
                <span>{f.labelPt}<br /><span class="small muted">{fmtDateTime(f.start)} (Brasília)</span></span>
                <span class="small"><span class="muted">começa em</span> <span class="count">{fmtCountdown(f.msLeft)}</span></span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">Nenhuma festividade anunciada.</p>
        {/if}
      </div>
    </div>
  {:else if !error}
    <Loading lines={3} label="Carregando festividades" />
  {/if}

  <h2>Ouro e Premium</h2>
  {#if clock}
    <div class="grid">
      <div class="card stack">
        <div class="kpi-label">Ouro agora</div>
        <div class="kpi">{fmtSilver(clock.gold.price)} <span class="small muted">prata</span></div>
        <p class="small muted" style="margin:0">
          Mediana de 30 dias: <strong class="num">{fmtSilver(clock.gold.p30)}</strong>
          {#if goldDelta !== null}({fmtPct(goldDelta, true)}){/if}
        </p>
        <p class="small" style="margin:0">
          Tendência: <span class="tag {clock.gold.trend === 'subindo' ? 'warn' : clock.gold.trend === 'caindo' ? 'good' : ''}">{trendArrow(clock.gold.trend)} {clock.gold.trend}</span>
          {#if clock.gold.at}<span class="muted"> · cotação <TimeAgo iso={clock.gold.at} /></span>{/if}
        </p>
      </div>
      <div class="card stack">
        <div class="kpi-label">Premium de 30 dias</div>
        <div class="kpi">{fmtSilver(clock.premiumSilver)} <span class="small muted">prata</span></div>
        <p class="small muted" style="margin:0">3.750 de ouro convertidos pela cotação atual. Com Premium o imposto de venda cai de 8% para 4%.</p>
      </div>
    </div>
  {:else if !error}
    <Loading lines={2} label="Carregando ouro" />
  {/if}

  <h2>Temporada</h2>
  <div class="card stack">
    <div class="row" style="justify-content:space-between">
      <strong>{season.name}</strong>
      <span class="tag warn">data aproximada</span>
    </div>
    {#if seasonLeft > 0}
      <div class="kpi">{fmtCountdown(seasonLeft)}</div>
      <p class="small muted" style="margin:0">Fim previsto por volta de {fmtDateTime(season.end)} (Brasília). A data exata ainda não saiu em anúncio oficial; confira no jogo.</p>
    {:else}
      <p style="margin:0">A temporada deve ter terminado por volta de {fmtDateTime(season.end)} (Brasília). Aguardando a data da próxima.</p>
    {/if}
  </div>
</section>
