<script lang="ts">
  // Relógio do Americas: hora de Brasília e do servidor (UTC), status, festividades, ouro, Premium e temporada.
  // Busca /api/clock a cada 2 min; os relógios e contagens andam a cada segundo no navegador.
  // Duas línguas: texto com tx('pt', 'es'), números e datas pela língua atual (horário de Brasília nas duas).
  import type { ClockResponse } from '../../shared/types';
  import { SEASON } from '../../shared/market';
  import { festivityLabel } from '../../shared/festivities';
  import { api } from '../lib/api';
  import {
    fmtCountdown, fmtDateTime, fmtInt, fmtLongDate, fmtPct, fmtSilver, fmtTime, isStale, serverLabel, serverTone, splitFestivities, trendArrow,
  } from '../lib/format';
  import { getLocale, tx } from '../lib/i18n/index.svelte';
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
      error = e instanceof Error ? e.message : tx('Erro desconhecido.', 'Error desconocido.');
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
  // A tendência vem da API em português ('subindo' | 'caindo' | 'estável' | 'sem dado'); a cor segue esse valor.
  const TREND_ES: Record<string, string> = { subindo: 'subiendo', caindo: 'bajando', 'estável': 'estable', 'sem dado': 'sin datos' };
  const trendText = $derived(clock ? tx(clock.gold.trend, TREND_ES[clock.gold.trend] ?? clock.gold.trend) : '');
</script>

<svelte:head><title>{tx('Relógio do Americas · Guarita', 'Reloj de Americas · Guarita')}</title></svelte:head>

<section class="page">
  <h1>{tx('Relógio do Americas', 'Reloj de Americas')}</h1>
  <p class="muted" style="margin-top:0">{fmtLongDate(now, undefined, getLocale())} · {tx('atualiza sozinho a cada 2 minutos.', 'se actualiza solo cada 2 minutos.')}</p>

  <div class="grid">
    <div class="card stack">
      <div class="kpi-label">{tx('Brasília', 'Brasilia')}</div>
      <div class="big-clock" aria-live="off">{fmtTime(now)}</div>
      <div class="small muted">{tx('Servidor (UTC)', 'Servidor (UTC)')}: <strong class="num">{fmtTime(now, 'UTC')}</strong></div>
    </div>

    <div class="card stack">
      <div class="kpi-label">{tx('Servidor', 'Servidor')}</div>
      {#if clock}
        <p class="row" style="margin:0;font-size:20px">
          <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>
          <strong>{serverLabel(clock.server.status, getLocale())}</strong>
        </p>
        <!-- a mensagem oficial vem em inglês; a genérica "Server is online." não acrescenta nada -->
        {#if clock.server.message && !/^server is online\.?$/i.test(clock.server.message.trim())}<p lang="en" class="small" style="margin:0">{clock.server.message}</p>{/if}
        <p class="small muted" style="margin:0">
          {tx('Conferido', 'Verificado')} <TimeAgo iso={clock.server.checkedAt} />
          {#if statusStale}<span class="tag warn">{tx('pode estar desatualizado', 'puede estar desactualizado')}</span>{/if}
        </p>
      {:else if error}
        <p class="small muted" style="margin:0">{tx('Sem informação agora.', 'Sin información por ahora.')}</p>
      {:else}
        <Loading lines={2} label={tx('Carregando status', 'Cargando estado')} />
      {/if}
    </div>
  </div>

  {#if error && !clock}
    <div style="margin-top:16px"><ErrorBox message={error} onretry={load} /></div>
  {:else if error}
    <p class="callout warn small" style="margin-top:12px">{tx(`Não deu para atualizar agora (${error}); mostrando a última leitura.`, `No se pudo actualizar ahora (${error}); se muestra la última lectura.`)} <button type="button" class="linkbtn" onclick={load} disabled={loading}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
  {/if}

  <h2>{tx('Festividades e bônus', 'Festividades y bonificaciones')}</h2>
  {#if clock}
    <div class="grid">
      <div class="card">
        <h3 class="small kpi-label">{tx('Ativas agora', 'Activas ahora')}</h3>
        {#if fest.active.length}
          <ul class="plain-list">
            {#each fest.active as f (f.name + f.start)}
              <li class="festa">
                <span>{festivityLabel(f, getLocale())}</span>
                <span class="small"><span class="muted">{tx('termina em', 'termina en')}</span> <span class="count">{fmtCountdown(f.msLeft, getLocale())}</span></span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">{tx('Nenhuma festividade ativa agora.', 'No hay ninguna festividad activa ahora.')}</p>
        {/if}
      </div>
      <div class="card">
        <h3 class="small kpi-label">{tx('Próximas', 'Próximas')}</h3>
        {#if fest.upcoming.length}
          <ul class="plain-list">
            {#each fest.upcoming.slice(0, 6) as f (f.name + f.start)}
              <li class="festa">
                <span>{festivityLabel(f, getLocale())}<br /><span class="small muted">{fmtDateTime(f.start)} {tx('(Brasília)', '(hora de Brasilia)')}</span></span>
                <span class="small"><span class="muted">{tx('começa em', 'empieza en')}</span> <span class="count">{fmtCountdown(f.msLeft, getLocale())}</span></span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">{tx('Nenhuma festividade anunciada.', 'No hay festividades anunciadas.')}</p>
        {/if}
      </div>
    </div>
  {:else if !error}
    <Loading lines={3} label={tx('Carregando festividades', 'Cargando festividades')} />
  {/if}

  <h2>{tx('Ouro e Premium', 'Oro y Premium')}</h2>
  {#if clock}
    <div class="grid">
      <div class="card stack">
        <div class="kpi-label">{tx('Ouro agora', 'Oro ahora')}</div>
        <div class="kpi">{fmtSilver(clock.gold.price, false, getLocale())} <span class="small muted">{tx('prata', 'plata')}</span></div>
        <p class="small muted" style="margin:0">
          {tx('Mediana de 30 dias', 'Mediana de 30 días')}: <strong class="num">{fmtSilver(clock.gold.p30, false, getLocale())}</strong>
          {#if goldDelta !== null}({fmtPct(goldDelta, true, getLocale())}){/if}
        </p>
        <p class="small" style="margin:0">
          {tx('Tendência', 'Tendencia')}: <span class="tag {clock.gold.trend === 'subindo' ? 'warn' : clock.gold.trend === 'caindo' ? 'good' : ''}">{trendArrow(clock.gold.trend)} {trendText}</span>
          {#if clock.gold.at}<span class="muted"> · {tx('cotação', 'cotización')} <TimeAgo iso={clock.gold.at} /></span>{/if}
        </p>
      </div>
      <div class="card stack">
        <div class="kpi-label">{tx('Premium de 30 dias', 'Premium de 30 días')}</div>
        <div class="kpi">{fmtSilver(clock.premiumSilver, false, getLocale())} <span class="small muted">{tx('prata', 'plata')}</span></div>
        <p class="small muted" style="margin:0">{tx(
          '3.750 de ouro convertidos pela cotação atual. Com Premium o imposto de venda cai de 8% para 4%.',
          `${fmtInt(3750, 'es')} de oro convertidos a la cotización actual. Con Premium el impuesto de venta baja del 8% al 4%.`,
        )}</p>
      </div>
    </div>
  {:else if !error}
    <Loading lines={2} label={tx('Carregando ouro', 'Cargando oro')} />
  {/if}

  <h2>{tx('Temporada', 'Temporada')}</h2>
  <div class="card stack">
    <div class="row" style="justify-content:space-between">
      <strong>{season.name}</strong>
      <span class="tag warn">{tx('data aproximada', 'fecha aproximada')}</span>
    </div>
    {#if seasonLeft > 0}
      <div class="kpi">{fmtCountdown(seasonLeft, getLocale())}</div>
      <p class="small muted" style="margin:0">{tx(
        `Fim previsto por volta de ${fmtDateTime(season.end)} (Brasília). A data exata ainda não saiu em anúncio oficial; confira no jogo.`,
        `Fin previsto alrededor del ${fmtDateTime(season.end)} (hora de Brasilia). La fecha exacta aún no salió en un anuncio oficial; confírmala en el juego.`,
      )}</p>
    {:else}
      <p style="margin:0">{tx(
        `A temporada deve ter terminado por volta de ${fmtDateTime(season.end)} (Brasília). Aguardando a data da próxima.`,
        `La temporada debió terminar alrededor del ${fmtDateTime(season.end)} (hora de Brasilia). Esperando la fecha de la próxima.`,
      )}</p>
    {/if}
  </div>
</section>
