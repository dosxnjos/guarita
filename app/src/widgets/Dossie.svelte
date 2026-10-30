<script lang="ts">
  // Widget "Dossiê": nome → busca → escolhe → dossiê compacto (perigo, motivos, guilda, armas, solo ou grupo,
  // últimas kills e mortes). Só busca quando a pessoa pede: nada automático, nenhuma atualização sozinha e nenhum
  // aviso de jogador avistado (fronteira dos Termos da SBI). Dado do killboard público, que pode demorar.
  import type { KillEvent, PlayerDossier, PlayerHit } from '../../../shared/types';
  import Patient from '../../../src/lib/player/Patient.svelte';
  import {
    dangerHeadline, dangerTone, fmtAgo, fmtCompact, fmtDateBR, fmtDec, fmtNum, fmtPct, isStale, playerQuery,
  } from '../../../src/lib/player/format';
  import { api } from '../lib/api';
  import { abrirUrl } from '../lib/links';
  import { urlJogadorNoSite } from '../lib/ui-preco';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';

  let termo = $state('');
  let campo = $state<HTMLInputElement | null>(null);
  let buscando = $state(false);
  let erroBusca = $state('');
  let achados = $state<PlayerHit[] | null>(null);

  let carregando = $state(false);
  let erro = $state('');
  let d = $state<PlayerDossier | null>(null);
  let idAtual = $state<string | null>(null);
  let seq = 0;

  async function buscar(e?: SubmitEvent) {
    e?.preventDefault();
    const { q, ok } = playerQuery(termo);
    if (!ok) {
      erroBusca = 'Digite pelo menos 3 letras do nome.';
      return;
    }
    const meu = ++seq;
    buscando = true;
    erroBusca = '';
    achados = null;
    d = null;
    idAtual = null;
    try {
      const r = await api.searchPlayers(q);
      if (meu !== seq) return;
      achados = r.data.players;
      // Nome exato e único: abre direto (continua sendo ação do usuário: ele apertou Buscar).
      const exato = achados.filter((p) => p.name.toLowerCase() === q.toLowerCase());
      // abrir() troca o seq: o finally abaixo não vai mais zerar `buscando`, então zera aqui.
      if (exato.length === 1) {
        buscando = false;
        void abrir(exato[0].id);
      }
    } catch (err) {
      if (meu === seq) erroBusca = err instanceof Error ? err.message : String(err);
    } finally {
      if (meu === seq) buscando = false;
    }
  }

  async function abrir(id: string, fresco = false) {
    const meu = ++seq;
    idAtual = id;
    carregando = true;
    erro = '';
    d = null;
    if (fresco) api.clearCache(`/api/player/${encodeURIComponent(id)}`);
    try {
      const r = await api.dossier(id);
      if (meu === seq) d = r.data;
    } catch (err) {
      if (meu === seq) erro = err instanceof Error ? err.message : String(err);
    } finally {
      if (meu === seq) carregando = false;
    }
  }

  function voltar() {
    seq++;
    d = null;
    idAtual = null;
    erro = '';
    carregando = false;
    // A busca em voo (se houver) foi descartada pelo seq++ acima: o formulário volta liberado.
    buscando = false;
    erroBusca = '';
    queueMicrotask(() => campo?.focus());
  }

  type Linha = { ev: KillEvent; tipo: 'kill' | 'morte' };
  const eventos = $derived<Linha[]>(
    d
      ? [...d.recentKills.map((ev) => ({ ev, tipo: 'kill' as const })), ...d.recentDeaths.map((ev) => ({ ev, tipo: 'morte' as const }))]
          .sort((a, b) => Date.parse(b.ev.time) - Date.parse(a.ev.time))
          .slice(0, 8)
      : [],
  );
</script>

<div class="dossie stack">
  {#if !idAtual}
    <form class="busca" onsubmit={buscar}>
      <label class="sr-only" for="dossie-nome">Nome do jogador</label>
      <input id="dossie-nome" bind:this={campo} class="input" type="search" autocomplete="off" spellcheck="false" placeholder="Nome do jogador" bind:value={termo} />
      <button type="submit" class="btn primary" disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
    </form>
    <p class="small muted m0">O killboard oficial às vezes leva até 1 minuto para responder. A busca só acontece quando você pede.</p>

    {#if erroBusca}
      <ErroCaixa mensagem={erroBusca} ontentar={termo.trim().length >= 3 ? () => buscar() : undefined} />
    {:else if buscando}
      <Patient lines={3} what="jogadores no killboard oficial" />
    {:else if achados}
      {#if achados.length}
        <ul class="plain-list achados" aria-label="Jogadores encontrados">
          {#each achados.slice(0, 10) as p (p.id)}
            <li>
              <button type="button" class="achado" onclick={() => abrir(p.id)}>
                <strong>{p.name}</strong>
                <span class="small muted">{p.guild ? `[${p.guild}]` : 'sem guilda'} · fama de kill {fmtCompact(p.killFame)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="small muted m0">Nenhum jogador com esse nome no Americas. Confira a grafia.</p>
      {/if}
    {/if}
  {:else}
    <div class="row topo">
      <button type="button" class="linkbtn small" onclick={voltar}>← Nova busca</button>
      {#if d}
        <span class="row">
          <button type="button" class="btn mini-btn" onclick={() => idAtual && abrir(idAtual, true)}>Atualizar</button>
          <button type="button" class="btn mini-btn" onclick={() => idAtual && abrirUrl(urlJogadorNoSite(idAtual))}>Abrir no site</button>
        </span>
      {/if}
    </div>

    {#if carregando}
      <Patient lines={4} what="o dossiê no killboard oficial" />
    {:else if erro}
      <ErroCaixa mensagem={erro} ontentar={() => idAtual && abrir(idAtual, true)} />
    {:else if d}
      <header class="cab">
        <div class="cab-nome">
          <strong class="nome">{d.name}</strong>
          <span class="small muted">{d.guild ? `Guilda ${d.guild}` : 'Sem guilda'}{d.alliance ? ` · [${d.alliance}]` : ''}</span>
        </div>
        <span class="perigo tag {dangerTone(d.danger.label)}" title="Perigo de 0 a 100, só pelas últimas lutas públicas">
          {d.danger.label === 'sem dado' ? dangerHeadline(d.danger.label) : `${dangerHeadline(d.danger.label)} · ${Math.round(d.danger.score)}`}
        </span>
      </header>

      {#if d.danger.reasons.length}
        <ul class="motivos small">{#each d.danger.reasons.slice(0, 4) as r, i (i)}<li>{r}</li>{/each}</ul>
      {/if}

      <dl class="numeros small">
        <div><dt>Kill/morte</dt><dd class="num">{fmtDec(d.ratio)}</dd></div>
        <div><dt>Sozinho</dt><dd class="num">{fmtPct(d.soloRate)}</dd></div>
        <div><dt>Grupo médio</dt><dd class="num">{fmtDec(d.avgGroup)}</dd></div>
        <div><dt>IP médio</dt><dd class="num">{fmtNum(d.avgIp)}</dd></div>
      </dl>

      {#if d.weapons.length}
        <p class="small m0"><span class="muted">Armas:</span> {d.weapons.slice(0, 3).map((w) => `${w.labelPt || w.type} (${w.count})`).join(', ')}</p>
      {/if}

      <div class="stack eventos">
        <span class="kpi-label">Últimas lutas</span>
        {#if eventos.length}
          <ul class="plain-list">
            {#each eventos as { ev, tipo } (tipo + ev.id)}
              {@const outro = tipo === 'kill' ? ev.victim : ev.killer}
              {@const eu = tipo === 'kill' ? ev.killer : ev.victim}
              <li class="ev">
                <span class="tag {tipo === 'kill' ? 'good' : 'bad'}">{tipo === 'kill' ? 'Kill' : 'Morte'}</span>
                <span class="ev-txt small">
                  {tipo === 'kill' ? 'matou' : 'morto por'} <strong>{outro.name || 'desconhecido'}</strong>{#if outro.guild} <span class="muted">[{outro.guild}]</span>{/if}
                  <span class="muted">· IP {fmtNum(eu.ip)} vs {fmtNum(outro.ip)} · grupo {fmtNum(ev.participants)}</span>
                </span>
                <time class="small muted" datetime={ev.time} title="{fmtDateBR(ev.time)} (Brasília)">{fmtAgo(ev.time)}</time>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="small muted m0">Nenhuma kill ou morte pública recente.</p>
        {/if}
      </div>

      <p class="small muted m0">
        Atualizado {fmtAgo(d.fetchedAt)}{#if isStale(d.fetchedAt)} <span class="tag warn">dado antigo</span>{/if}. Leitura das últimas lutas públicas; não é previsão.
      </p>
    {/if}
  {/if}
</div>

<style>
  .dossie { gap: 10px; }
  .m0 { margin: 0; }
  .busca { display: flex; gap: 6px; }
  .busca .input { padding: 7px 10px; font-size: 14px; min-width: 0; }
  .busca .btn { padding: 6px 12px; font-size: 14px; flex: none; }
  .achados > li { padding: 0; }
  .achado { display: grid; width: 100%; text-align: left; font: inherit; background: none; border: 0; color: var(--ink); padding: 6px 4px; border-radius: 6px; cursor: pointer; }
  .achado:hover { background: var(--surface-2); }
  .topo { justify-content: space-between; }
  .mini-btn { padding: 4px 10px; font-size: 13px; }
  .cab { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; }
  .cab-nome { display: grid; min-width: 0; }
  .nome { font-size: 17px; overflow-wrap: anywhere; }
  .perigo { flex: none; font-size: 13px; }
  .motivos { margin: 0; padding-left: 18px; }
  .numeros { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 4px 12px; margin: 0; }
  .numeros div { display: flex; justify-content: space-between; gap: 6px; border-bottom: 1px solid var(--line); padding: 2px 0; }
  .numeros dt { color: var(--muted); }
  .numeros dd { margin: 0; font-weight: 600; }
  .eventos { gap: 4px; }
  .ev { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: baseline; padding: 5px 0; }
  .ev .tag { font-size: 11.5px; padding: 1px 6px; }
  .ev-txt { min-width: 0; overflow-wrap: anywhere; }
  .ev time { white-space: nowrap; }
</style>
