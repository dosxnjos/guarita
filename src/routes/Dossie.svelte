<script lang="ts">
  // Dossiê de um jogador: perigo, números, armas, fama PvE/coleta, últimas kills e mortes.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import type { PlayerDossier } from '../../shared/types';
  import { cached } from '../lib/player/cache';
  import {
    famBars, fmtAgo, fmtCompact, fmtDateBR, fmtDec, fmtNum, fmtPct, gatherLabel, isStale, playerHref, pveLabel, weaponLabel,
  } from '../lib/player/format';
  import { href, tx } from '../lib/i18n/index.svelte';
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
    // Sem dado, igual a worker/seo.ts (routeMeta de /jogador/:id).
    const word = tx('Dossiê', 'Dosier');
    document.title = data ? `${data.name} · ${word} · Guarita` : `${word} · Guarita`;
  });

  const pve = $derived(famBars(data?.pve, (k) => pveLabel(k)));
  const gather = $derived(famBars(data?.gathering, (k) => gatherLabel(k)));
  // A API manda o rótulo da arma só em PT (labelPt); weaponLabel troca pelo termo do jogo em espanhol.
  const weapons = $derived(
    (data?.weapons ?? []).map((w) => ({ key: w.type, label: (w.labelPt && weaponLabel(w.labelPt)) || w.type, value: w.count, icon: w.type })),
  );
  const totalFights = $derived((data?.recentKills.length ?? 0) + (data?.recentDeaths.length ?? 0));
</script>

<section class="page stack">
  <p class="small"><a href={href('/jogador')} onclick={go}>{tx('← Buscar outro jogador', '← Buscar otro jugador')}</a></p>

  {#if loading}
    <h1>{tx('Dossiê', 'Dosier')}</h1>
    <Patient lines={6} what={tx('o dossiê no killboard oficial', 'el dosier en el killboard oficial')} />
  {:else if error}
    <h1>{tx('Dossiê', 'Dosier')}</h1>
    <ErrorBox message={error} onretry={() => load(id, true)} />
  {:else if data}
    <header class="card head">
      <div>
        <h1>{data.name}</h1>
        <p class="org">
          {#if data.guild}<span>{tx('Guilda', 'Gremio')} <strong>{data.guild}</strong></span>{:else}<span class="muted">{tx('Sem guilda', 'Sin gremio')}</span>{/if}
          {#if data.alliance}<span>{tx('Aliança', 'Alianza')} <strong>[{data.alliance}]</strong></span>{/if}
        </p>
      </div>
      <p class="muted small fetched">
        {tx('Atualizado', 'Actualizado')} {fmtAgo(data.fetchedAt)}
        {#if isStale(data.fetchedAt)}<span class="tag warn">{tx('dado antigo', 'datos antiguos')}</span>{/if}
        <button class="btn small" type="button" onclick={() => load(id, true)}>{tx('Atualizar', 'Actualizar')}</button>
      </p>
    </header>

    <div class="card">
      <h2 class="first">{tx('Nível de perigo', 'Nivel de peligro')}</h2>
      <DangerMeter danger={data.danger} />
    </div>

    <div class="stats">
      <div class="card stat"><span class="muted small">{tx('Fama de abate', 'Fama por asesinatos')}</span><strong class="num">{fmtCompact(data.killFame)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('Fama de morte', 'Fama por muertes')}</span><strong class="num">{fmtCompact(data.deathFame)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('Razão kill/morte', 'Relación asesinatos/muertes')}</span><strong class="num">{fmtDec(data.ratio)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('IP médio recente', 'IP medio reciente')}</span><strong class="num">{fmtNum(data.avgIp)}</strong></div>
      <div class="card stat"><span class="muted small">{tx('Kills sozinho', 'Asesinatos en solitario')}</span><strong class="num">{fmtPct(data.soloRate)}</strong></div>
      <div class="card stat">
        <span class="muted small">{tx('Grupo médio (jogadores)', 'Grupo medio (jugadores)')}</span>
        <strong class="num">{fmtDec(data.avgGroup)}</strong>
      </div>
    </div>
    <p class="muted small">{tx(
      `IP, solo e grupo vêm das ${fmtNum(totalFights)} lutas recentes que o killboard mostra.`,
      `El IP, los asesinatos en solitario y el grupo salen de las ${fmtNum(totalFights)} peleas recientes que muestra el killboard.`,
    )}</p>

    {#if data.recentDeaths.length}
      <a class="btn primary autopsy" href={href(`${playerHref(data.id)}/morte`)} onclick={go}>{tx('Autópsia da última morte →', 'Autopsia de la última muerte →')}</a>
    {:else}
      <p class="muted small">{tx('Sem mortes recentes no killboard, então não há autópsia para mostrar.', 'No hay muertes recientes en el killboard, así que no hay autopsia para mostrar.')}</p>
    {/if}

    <div class="grid">
      <div class="card">
        <h2 class="first">{tx('Armas mais usadas', 'Armas más usadas')}</h2>
        <BarList rows={weapons} unit="×" empty={tx('Sem kills ou mortes recentes para ver as armas.', 'No hay asesinatos ni muertes recientes para ver las armas.')} />
      </div>
      <div class="card">
        <h2 class="first">{tx('Fama PvE', 'Fama PvE')} <span class="muted small num">{fmtCompact(pve.total)}</span></h2>
        <BarList rows={pve.bars} empty={tx('Sem fama PvE registrada.', 'No hay fama PvE registrada.')} />
      </div>
      <div class="card">
        <h2 class="first">{tx('Coleta', 'Recolección')} <span class="muted small num">{fmtCompact(gather.total)}</span></h2>
        <BarList rows={gather.bars} empty={tx('Sem fama de coleta registrada.', 'No hay fama de recolección registrada.')} />
      </div>
    </div>

    <div class="grid">
      <div>
        <h2>{tx('Últimas kills', 'Últimos asesinatos')}</h2>
        <EventList events={data.recentKills} mode="kill" empty={tx('Nenhuma kill recente no killboard.', 'No hay asesinatos recientes en el killboard.')} />
      </div>
      <div>
        <h2>{tx('Últimas mortes', 'Últimas muertes')}</h2>
        <EventList events={data.recentDeaths} mode="death" empty={tx('Nenhuma morte recente no killboard.', 'No hay muertes recientes en el killboard.')} />
      </div>
    </div>

    <p class="muted small">
      {tx('Horários em Brasília. Dados públicos do killboard oficial, que podem atrasar alguns minutos. Consulta feita em', 'Horarios de Brasilia. Datos públicos del killboard oficial, que pueden retrasarse algunos minutos. Consulta hecha el')}
      {fmtDateBR(data.fetchedAt)}. {tx('A Guarita nunca detecta jogadores dentro do jogo.', 'La Guarita nunca detecta jugadores dentro del juego.')}
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
