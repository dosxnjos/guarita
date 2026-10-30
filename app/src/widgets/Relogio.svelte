<script lang="ts">
  // Widget "Relógio": hora de Brasília e do servidor (UTC), status do servidor, bônus do dia com contagem, ouro,
  // Premium em prata e fim aproximado da temporada. /api/clock a cada 2 min com a janela aberta; os relógios andam
  // a cada segundo.
  import type { ClockResponse } from '../../../shared/types';
  import { SEASON } from '../../../shared/market';
  import { api } from '../lib/api';
  import { fmtCountdown, fmtDateTime, fmtSilver, fmtTime, isStale, serverLabel, serverTone, splitFestivities, trendArrow } from '../lib/format';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';

  let clock = $state<ClockResponse | null>(null);
  let erro = $state('');
  let now = $state(Date.now());

  async function carregar() {
    try {
      clock = (await api.clock()).data;
      erro = '';
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    void carregar();
    const a = setInterval(carregar, 120_000);
    const b = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  });

  const fest = $derived(clock ? splitFestivities(clock.festivities, now) : { active: [], upcoming: [] });
  const temporada = $derived(clock?.season ?? SEASON);
  const faltaTemporada = $derived(Date.parse(temporada.end) - now);
  const statusVelho = $derived(!!clock && isStale(clock.server.checkedAt, 15, now));
</script>

<div class="relogio stack">
  <div class="horas">
    <div>
      <div class="kpi-label">Brasília</div>
      <div class="hora num" aria-live="off">{fmtTime(now)}</div>
    </div>
    <div class="utc small">
      <span class="muted">Servidor (UTC)</span>
      <strong class="num">{fmtTime(now, 'UTC', false)}</strong>
    </div>
  </div>

  {#if clock}
    <p class="row m0 status">
      <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>
      <strong>{serverLabel(clock.server.status)}</strong>
      {#if statusVelho}<span class="tag warn">pode estar desatualizado</span>{/if}
    </p>
    {#if clock.server.message && !/^server is online\.?$/i.test(clock.server.message.trim())}
      <p lang="en" class="small m0 muted">{clock.server.message}</p>
    {/if}
  {/if}

  {#if erro && !clock}
    <ErroCaixa mensagem={erro} ontentar={carregar} />
  {:else if !clock}
    <p class="small muted m0" role="status">Carregando o relógio…</p>
  {:else}
    {#if erro}<p class="small warn-text m0">Sem atualizar agora; mostrando a última leitura.</p>{/if}

    <section class="bloco" aria-label="Bônus do dia">
      <span class="kpi-label">Bônus agora</span>
      {#if fest.active.length}
        <ul class="plain-list">
          {#each fest.active.slice(0, 4) as f (f.name + f.start)}
            <li class="festa small"><span>{f.labelPt}</span><span class="count">{fmtCountdown(f.msLeft)}</span></li>
          {/each}
        </ul>
      {:else}
        <p class="small muted m0">Nenhum bônus ativo.</p>
      {/if}
      {#if fest.upcoming[0]}
        {@const p = fest.upcoming[0]}
        <p class="small muted m0">Próximo: {p.labelPt}, em {fmtCountdown(p.msLeft)}</p>
      {/if}
    </section>

    <dl class="numeros small">
      <div>
        <dt>Ouro</dt>
        <dd class="num">{fmtSilver(clock.gold.price)} <span class="muted" title="Tendência: {clock.gold.trend}">{trendArrow(clock.gold.trend)}</span></dd>
      </div>
      <div><dt>Premium 30 dias</dt><dd class="num">{fmtSilver(clock.premiumSilver, true)}</dd></div>
      <div>
        <dt>{temporada.name}</dt>
        <dd class="num" title="Fim previsto por volta de {fmtDateTime(temporada.end)} (Brasília); data aproximada">
          {faltaTemporada > 0 ? `≈ ${fmtCountdown(faltaTemporada)}` : 'encerrada'}
        </dd>
      </div>
    </dl>
    <p class="small muted m0">Fim da temporada aproximado. Premium em prata pela cotação do ouro.</p>
  {/if}
</div>

<style>
  .relogio { gap: 8px; }
  .m0 { margin: 0; }
  .horas { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .hora { font-size: 30px; font-weight: 700; line-height: 1; }
  .utc { display: grid; text-align: right; }
  .status { gap: 6px; }
  .bloco { display: grid; gap: 2px; }
  .bloco .plain-list > li { padding: 3px 0; }
  .festa { display: flex; flex-wrap: nowrap; align-items: baseline; justify-content: space-between; gap: 8px; }
  .festa > span:first-child { min-width: 0; }
  .count { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  .numeros { display: grid; gap: 2px; margin: 0; }
  .numeros div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--line); padding: 3px 0; }
  .numeros dt { color: var(--muted); }
  .numeros dd { margin: 0; font-weight: 600; }
</style>
