<script lang="ts">
  // Dossiê de um jogador: perigo, números, armas, fama PvE/coleta, últimas kills e mortes.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import type { PlayerDossier } from '../../shared/types';
  import { cached } from '../lib/player/cache';
  import {
    famBars, fmtAgo, fmtCompact, fmtDateBR, fmtDec, fmtNum, fmtPct, gatherLabel, isStale, playerHref, pveLabel,
  } from '../lib/player/format';
  import DangerMeter from '../lib/player/DangerMeter.svelte';
  import BarList from '../lib/player/BarList.svelte';
  import EventList from '../lib/player/EventList.svelte';
  import Patient from '../lib/player/Patient.svelte';
  import ErrorBox from '../lib/player/ErrorBox.svelte';

  let { params = {} }: { params?: Record<string, string> } = $props();
  const id = $derived(params.id ?? '');

  let data = $state<PlayerDossier | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let seq = 0;

  async function load(pid: string, fresh = false) {
    const my = ++seq;
    loading = true; error = null; data = null;
    try {
      const d = await cached(`dossie:${pid}`, () => api.dossier(pid), fresh);
      if (my === seq) data = d;
    } catch (e) {
      if (my === seq) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === seq) loading = false;
    }
  }

  // recarrega quando o id muda (ex.: clicou no dossiê do outro lado de uma kill)
  $effect(() => {
    if (id) load(id);
  });

  $effect(() => {
    document.title = data ? `${data.name} · Dossiê · Guarita` : 'Dossiê · Guarita';
  });

  const pve = $derived(famBars(data?.pve, pveLabel));
  const gather = $derived(famBars(data?.gathering, gatherLabel));
  const weapons = $derived(
    (data?.weapons ?? []).map((w) => ({ key: w.type, label: w.labelPt || w.type, value: w.count, icon: w.type })),
  );
  const totalFights = $derived((data?.recentKills.length ?? 0) + (data?.recentDeaths.length ?? 0));
</script>

<section class="page stack">
  <p class="small"><a href="/jogador" onclick={go}>← Buscar outro jogador</a></p>

  {#if loading}
    <h1>Dossiê</h1>
    <Patient lines={6} what="o dossiê no killboard oficial" />
  {:else if error}
    <h1>Dossiê</h1>
    <ErrorBox message={error} onretry={() => load(id, true)} />
  {:else if data}
    <header class="card head">
      <div>
        <h1>{data.name}</h1>
        <p class="org">
          {#if data.guild}<span>Guilda <strong>{data.guild}</strong></span>{:else}<span class="muted">Sem guilda</span>{/if}
          {#if data.alliance}<span>Aliança <strong>[{data.alliance}]</strong></span>{/if}
        </p>
      </div>
      <p class="muted small fetched">
        Atualizado {fmtAgo(data.fetchedAt)}
        {#if isStale(data.fetchedAt)}<span class="tag warn">dado antigo</span>{/if}
        <button class="btn small" type="button" onclick={() => load(id, true)}>Atualizar</button>
      </p>
    </header>

    <div class="card">
      <h2 class="first">Nível de perigo</h2>
      <DangerMeter danger={data.danger} />
    </div>

    <div class="stats">
      <div class="card stat"><span class="muted small">Fama de abate</span><strong class="num">{fmtCompact(data.killFame)}</strong></div>
      <div class="card stat"><span class="muted small">Fama de morte</span><strong class="num">{fmtCompact(data.deathFame)}</strong></div>
      <div class="card stat"><span class="muted small">Razão kill/morte</span><strong class="num">{fmtDec(data.ratio)}</strong></div>
      <div class="card stat"><span class="muted small">IP médio recente</span><strong class="num">{fmtNum(data.avgIp)}</strong></div>
      <div class="card stat"><span class="muted small">Kills sozinho</span><strong class="num">{fmtPct(data.soloRate)}</strong></div>
      <div class="card stat">
        <span class="muted small">Grupo médio (jogadores)</span>
        <strong class="num">{fmtDec(data.avgGroup)}</strong>
      </div>
    </div>
    <p class="muted small">IP, solo e grupo vêm das {fmtNum(totalFights)} lutas recentes que o killboard mostra.</p>

    {#if data.recentDeaths.length}
      <a class="btn primary autopsy" href="{playerHref(data.id)}/morte" onclick={go}>Autópsia da última morte →</a>
    {:else}
      <p class="muted small">Sem mortes recentes no killboard, então não há autópsia para mostrar.</p>
    {/if}

    <div class="grid">
      <div class="card">
        <h2 class="first">Armas mais usadas</h2>
        <BarList rows={weapons} unit="×" empty="Sem kills ou mortes recentes para ver as armas." />
      </div>
      <div class="card">
        <h2 class="first">Fama PvE <span class="muted small num">{fmtCompact(pve.total)}</span></h2>
        <BarList rows={pve.bars} empty="Sem fama PvE registrada." />
      </div>
      <div class="card">
        <h2 class="first">Coleta <span class="muted small num">{fmtCompact(gather.total)}</span></h2>
        <BarList rows={gather.bars} empty="Sem fama de coleta registrada." />
      </div>
    </div>

    <div class="grid">
      <div>
        <h2>Últimas kills</h2>
        <EventList events={data.recentKills} mode="kill" empty="Nenhuma kill recente no killboard." />
      </div>
      <div>
        <h2>Últimas mortes</h2>
        <EventList events={data.recentDeaths} mode="death" empty="Nenhuma morte recente no killboard." />
      </div>
    </div>

    <p class="muted small">
      Horários em Brasília. Dados públicos do killboard oficial, que podem atrasar alguns minutos. Consulta feita em
      {fmtDateBR(data.fetchedAt)}. A Guarita nunca detecta jogadores dentro do jogo.
    </p>
  {/if}
</section>

<style>
  .head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; align-items: flex-end; }
  .head h1 { margin: 0 0 4px; overflow-wrap: anywhere; }
  .org { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; overflow-wrap: anywhere; }
  .fetched { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0; }
  .fetched .btn { padding: 4px 10px; }
  h2.first { margin-top: 0; }
  .stats { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); }
  .stat { display: grid; gap: 2px; padding: 10px 12px; }
  .stat strong { font-size: 22px; }
  .autopsy { justify-self: start; }
  p { margin: 0; }
</style>
