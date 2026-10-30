<script lang="ts">
  // Página da guilda: números da gameinfo (membros, fama, aliança) + resumo do histórico próprio do killboard
  // (kills e mortes por dia, quem mais mata, armas, horários em Brasília).
  import { api, ApiError } from '../lib/api';
  import { go } from '../lib/router';
  import type { GuildSummary } from '../../shared/types';
  import { cacheKey, cached } from '../lib/player/cache';
  import { fmtCompact, fmtDec, fmtNum, fmtAgo, playerHref, weaponLabel } from '../lib/player/format';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  import { coverageText, guildTotals } from '../lib/insights/format';
  import BarList from '../lib/player/BarList.svelte';
  import Patient from '../lib/player/Patient.svelte';
  import ErrorBox from '../lib/player/ErrorBox.svelte';
  import DayBars from '../lib/insights/DayBars.svelte';
  import HoursChart from '../lib/insights/HoursChart.svelte';

  let { params = {} }: { params?: Record<string, string> } = $props();
  const name = $derived((params.nome ?? '').trim());

  let data = $state<GuildSummary | null>(null);
  let error = $state<string | null>(null);
  let notFound = $state(false);
  let loading = $state(true);
  let seq = 0;

  async function load(n: string, fresh = false) {
    const my = ++seq;
    loading = true; error = null; notFound = false; data = null;
    try {
      const loc = getLocale();
      const d = await cached(cacheKey(`guilda:${n.toLowerCase()}`, loc), () => api.guild(n, loc), fresh);
      if (my === seq) data = d;
    } catch (e) {
      if (my !== seq) return;
      notFound = e instanceof ApiError && e.status === 404;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === seq) loading = false;
    }
  }

  $effect(() => {
    if (name) load(name);
  });

  $effect(() => {
    // Mesmo formato de worker/seo.ts (routeMeta de /guilda/:nome): "Nome · Guilda · Guarita" / "Nome · Gremio · Guarita".
    const word = tx('Guilda', 'Gremio');
    document.title = `${data?.name ?? (name || word)} · ${word} · Guarita`;
  });

  const totals = $derived(guildTotals(data?.days ?? []));
  // A API manda o rótulo da família de arma só em PT; weaponLabel troca pelo termo do jogo em espanhol.
  const weapons = $derived((data?.weapons ?? []).map((w) => ({ key: w.labelPt, label: weaponLabel(w.labelPt), value: w.count, icon: w.type })));
  const maxKills = $derived(Math.max(1, ...(data?.topKillers ?? []).map((k) => k.kills)));
  const hasLog = $derived(!!data && (data.days.length > 0 || data.topKillers.length > 0));
</script>

<section class="page stack">
  <p class="small"><a href={href('/guilda')} onclick={go}>{tx('← Buscar outra guilda', '← Buscar otro gremio')}</a></p>

  {#if loading}
    <h1>{name || tx('Guilda', 'Gremio')}</h1>
    <Patient lines={6} what={tx('a guilda no killboard oficial', 'el gremio en el killboard oficial')} />
  {:else if notFound}
    <h1>{name}</h1>
    <div class="callout warn">
      <p><strong>{tx('Guilda não encontrada.', 'No se encontró el gremio.')}</strong> {tx(
        'Confira a grafia: o nome precisa ser exatamente o do jogo (espaços contam).',
        'Revisa cómo se escribe: el nombre tiene que ser exactamente el del juego (los espacios cuentan).',
      )}</p>
      <p><a href={href(`/guilda?q=${encodeURIComponent(name)}`)} onclick={go}>{tx('Procurar nomes parecidos', 'Buscar nombres parecidos')}</a></p>
    </div>
  {:else if error}
    <h1>{name}</h1>
    <ErrorBox message={error} onretry={() => load(name, true)} />
  {:else if data}
    <header class="card head">
      <div>
        <h1>{data.name}</h1>
        <p class="org">
          {#if data.alliance}<span>{tx('Aliança', 'Alianza')} <strong>{data.alliance}</strong></span>{:else}<span class="muted">{tx('Sem aliança', 'Sin alianza')}</span>{/if}
          {#if data.members !== null}<span><strong class="num">{fmtNum(data.members)}</strong> {tx('membros', 'miembros')}</span>{/if}
        </p>
      </div>
      <p class="muted small fetched">
        {tx('Atualizado', 'Actualizado')} {fmtAgo(data.fetchedAt)}
        <button class="btn small" type="button" onclick={() => load(name, true)}>{tx('Atualizar', 'Actualizar')}</button>
      </p>
    </header>

    {#if data.id === null}
      <p class="callout warn small">{tx(
        'Não foi possível obter membros e fama no killboard oficial agora. O histórico abaixo é da Guarita; tente atualizar daqui a pouco.',
        'No fue posible obtener los miembros y la fama en el killboard oficial ahora. El historial de abajo es de la Guarita; intenta actualizar en un rato.',
      )}</p>
    {/if}

    <div class="stats">
      <div class="card stat"><span class="muted small">{tx('Fama de abate', 'Fama por asesinatos')}</span><strong class="num">{fmtCompact(data.killFame)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('Fama de morte', 'Fama por muertes')}</span><strong class="num">{fmtCompact(data.deathFame)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('Kills na amostra', 'Asesinatos en la muestra')}</span><strong class="num good-text">{fmtNum(totals.kills)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('Mortes na amostra', 'Muertes en la muestra')}</span><strong class="num bad-text">{fmtNum(totals.deaths)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('Razão kill/morte', 'Relación asesinatos/muertes')}</span><strong class="num">{fmtDec(totals.ratio)}</strong></div>
    </div>

    <div class="callout small">
      <strong>{coverageText(data.coverageSince)}</strong>
      {tx(
        'Kills, mortes e horários vêm de uma amostra das mortes do killboard público que a Guarita guarda (não de todas). Quem mais mata, armas e horários olham os últimos 7 dias.',
        'Los asesinatos, las muertes y los horarios salen de una muestra de las muertes del killboard público que guarda la Guarita (no de todas). Quién más mata, las armas y los horarios consideran los últimos 7 días.',
      )}
    </div>

    {#if !hasLog}
      <p class="empty card">{tx(
        'Nenhuma kill ou morte desta guilda na amostra ainda. Volte depois de algumas horas de jogo.',
        'Todavía no hay asesinatos ni muertes de este gremio en la muestra. Vuelve después de algunas horas de juego.',
      )}</p>
    {:else}
      <div class="grid">
        <div class="card">
          <h2 class="first">{tx('Kills e mortes por dia', 'Asesinatos y muertes por día')}</h2>
          <DayBars days={data.days} />
        </div>
        <div class="card">
          <h2 class="first">{tx('Horários de kill', 'Horarios de asesinatos')}</h2>
          <HoursChart hours={data.hoursBrt} />
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <h2 class="first">{tx('Quem mais mata', 'Quién más mata')}</h2>
          {#if data.topKillers.length}
            <ol class="killers">
              {#each data.topKillers as k, i (k.id || k.name)}
                <li>
                  <span class="num muted small rank">{i + 1}</span>
                  <div class="body">
                    <div class="top">
                      {#if k.id}<a href={href(playerHref(k.id))} onclick={go}>{k.name}</a>{:else}<span>{k.name}</span>{/if}
                      <span class="num muted small">{fmtNum(k.kills)} {k.kills === 1 ? tx('kill', 'asesinato') : tx('kills', 'asesinatos')}</span>
                    </div>
                    <div class="track" aria-hidden="true"><div class="fill" style:width="{Math.max(2, (k.kills / maxKills) * 100)}%"></div></div>
                  </div>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="muted small">{tx('Sem kills da guilda nos últimos 7 dias da amostra.', 'No hay asesinatos del gremio en los últimos 7 días de la muestra.')}</p>
          {/if}
        </div>
        <div class="card">
          <h2 class="first">{tx('Armas da guilda', 'Armas del gremio')}</h2>
          <BarList rows={weapons} unit="×" empty={tx('Sem armas registradas nos últimos 7 dias.', 'No hay armas registradas en los últimos 7 días.')} />
          <p class="muted small note">{tx('Armas de quem matou e de quem morreu pela guilda, somadas por tipo.', 'Armas de quienes mataron y de quienes murieron por el gremio, sumadas por tipo.')}</p>
        </div>
      </div>
    {/if}

    <p class="muted small">
      {tx(
        'Horários em Brasília. Dados públicos do killboard oficial, com atraso de minutos: é histórico, nunca aviso de inimigo por perto. A Guarita nunca detecta jogadores dentro do jogo.',
        'Horarios de Brasilia. Datos públicos del killboard oficial, con minutos de retraso: es historial, nunca un aviso de enemigos cerca. La Guarita nunca detecta jugadores dentro del juego.',
      )}
    </p>
  {/if}
</section>

<style>
  .head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; align-items: flex-end; }
  .head h1 { margin: 0 0 4px; overflow-wrap: anywhere; }
  h1 { overflow-wrap: anywhere; }
  .org { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; overflow-wrap: anywhere; }
  .fetched { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0; }
  .fetched .btn { padding: 4px 10px; }
  h2.first { margin-top: 0; }
  .stats { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); }
  .stat { display: grid; gap: 2px; padding: 10px 12px; }
  .stat strong { font-size: 22px; }
  .callout strong { display: block; margin-bottom: 2px; }
  .killers { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .killers li { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .rank { width: 1.6em; text-align: right; flex: none; }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; justify-content: space-between; gap: 8px; }
  .top a, .top span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; margin-top: 3px; }
  .fill { height: 100%; background: var(--accent); border-radius: 99px; }
  .note { margin-top: 8px; }
  p { margin: 0; }
  .callout p + p { margin-top: 6px; }
</style>
