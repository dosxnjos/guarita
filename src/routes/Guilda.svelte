<script lang="ts">
  // Página da guilda: números da gameinfo (membros, fama, aliança) + resumo do histórico próprio do killboard
  // (kills e mortes por dia, quem mais mata, armas, horários em Brasília).
  import { api, ApiError } from '../lib/api';
  import { go } from '../lib/router';
  import type { GuildSummary } from '../../shared/types';
  import { cached } from '../lib/player/cache';
  import { fmtCompact, fmtDec, fmtNum, fmtAgo, playerHref } from '../lib/player/format';
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
      const d = await cached(`guilda:${n.toLowerCase()}`, () => api.guild(n), fresh);
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
    document.title = `${data?.name ?? (name || 'Guilda')} · Guilda · Guarita`;
  });

  const totals = $derived(guildTotals(data?.days ?? []));
  const weapons = $derived((data?.weapons ?? []).map((w) => ({ key: w.labelPt, label: w.labelPt, value: w.count, icon: w.type })));
  const maxKills = $derived(Math.max(1, ...(data?.topKillers ?? []).map((k) => k.kills)));
  const hasLog = $derived(!!data && (data.days.length > 0 || data.topKillers.length > 0));
</script>

<section class="page stack">
  <p class="small"><a href="/guilda" onclick={go}>← Buscar outra guilda</a></p>

  {#if loading}
    <h1>{name || 'Guilda'}</h1>
    <Patient lines={6} what="a guilda no killboard oficial" />
  {:else if notFound}
    <h1>{name}</h1>
    <div class="callout warn">
      <p><strong>Guilda não encontrada.</strong> Confira a grafia: o nome precisa ser exatamente o do jogo (espaços contam).</p>
      <p><a href="/guilda?q={encodeURIComponent(name)}" onclick={go}>Procurar nomes parecidos</a></p>
    </div>
  {:else if error}
    <h1>{name}</h1>
    <ErrorBox message={error} onretry={() => load(name, true)} />
  {:else if data}
    <header class="card head">
      <div>
        <h1>{data.name}</h1>
        <p class="org">
          {#if data.alliance}<span>Aliança <strong>{data.alliance}</strong></span>{:else}<span class="muted">Sem aliança</span>{/if}
          {#if data.members !== null}<span><strong class="num">{fmtNum(data.members)}</strong> membros</span>{/if}
        </p>
      </div>
      <p class="muted small fetched">
        Atualizado {fmtAgo(data.fetchedAt)}
        <button class="btn small" type="button" onclick={() => load(name, true)}>Atualizar</button>
      </p>
    </header>

    {#if data.id === null}
      <p class="callout warn small">Não foi possível obter membros e fama no killboard oficial agora. O histórico abaixo é da Guarita; tente atualizar daqui a pouco.</p>
    {/if}

    <div class="stats">
      <div class="card stat"><span class="muted small">Fama de abate</span><strong class="num">{fmtCompact(data.killFame)}</strong></div>
      <div class="card stat"><span class="muted small">Fama de morte</span><strong class="num">{fmtCompact(data.deathFame)}</strong></div>
      <div class="card stat"><span class="muted small">Kills na amostra</span><strong class="num good-text">{fmtNum(totals.kills)}</strong></div>
      <div class="card stat"><span class="muted small">Mortes na amostra</span><strong class="num bad-text">{fmtNum(totals.deaths)}</strong></div>
      <div class="card stat"><span class="muted small">Razão kill/morte</span><strong class="num">{fmtDec(totals.ratio)}</strong></div>
    </div>

    <div class="callout small">
      <strong>{coverageText(data.coverageSince)}</strong>
      Kills, mortes e horários vêm de uma amostra das mortes do killboard público que a Guarita guarda (não de todas).
      Quem mais mata, armas e horários olham os últimos 7 dias.
    </div>

    {#if !hasLog}
      <p class="empty card">Nenhuma kill ou morte desta guilda na amostra ainda. Volte depois de algumas horas de jogo.</p>
    {:else}
      <div class="grid">
        <div class="card">
          <h2 class="first">Kills e mortes por dia</h2>
          <DayBars days={data.days} />
        </div>
        <div class="card">
          <h2 class="first">Horários de kill</h2>
          <HoursChart hours={data.hoursBrt} />
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <h2 class="first">Quem mais mata</h2>
          {#if data.topKillers.length}
            <ol class="killers">
              {#each data.topKillers as k, i (k.id || k.name)}
                <li>
                  <span class="num muted small rank">{i + 1}</span>
                  <div class="body">
                    <div class="top">
                      {#if k.id}<a href={playerHref(k.id)} onclick={go}>{k.name}</a>{:else}<span>{k.name}</span>{/if}
                      <span class="num muted small">{fmtNum(k.kills)} {k.kills === 1 ? 'kill' : 'kills'}</span>
                    </div>
                    <div class="track" aria-hidden="true"><div class="fill" style:width="{Math.max(2, (k.kills / maxKills) * 100)}%"></div></div>
                  </div>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="muted small">Sem kills da guilda nos últimos 7 dias da amostra.</p>
          {/if}
        </div>
        <div class="card">
          <h2 class="first">Armas da guilda</h2>
          <BarList rows={weapons} unit="×" empty="Sem armas registradas nos últimos 7 dias." />
          <p class="muted small note">Armas de quem matou e de quem morreu pela guilda, somadas por tipo.</p>
        </div>
      </div>
    {/if}

    <p class="muted small">
      Horários em Brasília. Dados públicos do killboard oficial, com atraso de minutos: é histórico, nunca aviso de
      inimigo por perto. A Guarita nunca detecta jogadores dentro do jogo.
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
