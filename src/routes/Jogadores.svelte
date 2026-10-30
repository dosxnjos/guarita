<script lang="ts">
  // Busca de jogador por nome no killboard público (servidor Americas) → dossiê.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import type { PlayerHit } from '../../shared/types';
  import { fmtCompact, playerHref, playerQuery } from '../lib/player/format';
  import ErrorBox from '../lib/player/ErrorBox.svelte';

  // params não usado: o termo da busca vive em ?q= no endereço
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const initial = (() => {
    try { return new URLSearchParams(location.search).get('q') ?? ''; } catch { return ''; }
  })();

  let text = $state(initial);
  let results = $state<PlayerHit[] | null>(null);
  let loading = $state(false);
  let slow = $state(false);
  let error = $state<string | null>(null);
  let searched = $state('');
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function run(q: string) {
    const my = ++seq;
    loading = true; slow = false; error = null;
    const slowT = setTimeout(() => { if (my === seq) slow = true; }, 6000);
    try {
      const r = await api.searchPlayers(q);
      if (my !== seq) return;
      results = r.players ?? [];
      searched = q;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(slowT);
      if (my === seq) loading = false;
    }
  }

  // debounce de 400 ms; guarda o termo no endereço para o "voltar" do navegador
  function schedule() {
    clearTimeout(timer);
    const { q, ok } = playerQuery(text);
    try {
      const u = new URL(location.href);
      if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
      history.replaceState(history.state, '', u.pathname + u.search);
    } catch { /* sem history: segue */ }
    if (!ok) { seq++; loading = false; results = null; error = null; return; }
    timer = setTimeout(() => run(q), 400);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    clearTimeout(timer);
    const { q, ok } = playerQuery(text);
    if (ok) run(q);
  }

  $effect(() => {
    document.title = 'Dossiê de jogador · Guarita';
    if (playerQuery(initial).ok) run(playerQuery(initial).q);
    return () => clearTimeout(timer);
  });

  const tooShort = $derived(text.trim().length > 0 && !playerQuery(text).ok);
</script>

<section class="page stack">
  <header>
    <h1>Dossiê de jogador</h1>
    <p class="muted">Procure alguém do servidor Americas pelo nome do personagem e veja kills, mortes, armas e o nível de perigo.</p>
  </header>

  <form class="card stack" role="search" onsubmit={submit}>
    <label for="busca-jogador"><strong>Nome do personagem</strong></label>
    <div class="row nowrap">
      <input id="busca-jogador" class="input" type="search" autocomplete="off" spellcheck="false" minlength="3"
        placeholder="Mínimo de 3 letras" bind:value={text} oninput={schedule} aria-describedby="busca-ajuda" />
      <button class="btn primary" type="submit" disabled={!playerQuery(text).ok || loading}>Buscar</button>
    </div>
    <p id="busca-ajuda" class="muted small">
      {#if tooShort}Digite pelo menos 3 letras.{:else}O killboard oficial às vezes leva até 1 minuto para responder.{/if}
    </p>
  </form>

  <div aria-live="polite">
    {#if loading}
      <div class="card stack" role="status" aria-busy="true">
        <p class="muted small">{slow ? 'O killboard oficial está lento agora. Continuamos esperando a resposta…' : 'Buscando no killboard…'}</p>
        {#each [0, 1, 2] as i (i)}<div class="skeleton" style:height="44px"></div>{/each}
      </div>
    {:else if error}
      <ErrorBox message={error} onretry={() => run(playerQuery(text).q)} />
    {:else if results && results.length === 0}
      <p class="empty card">Nenhum jogador encontrado com “{searched}” no servidor Americas. Confira a grafia: o nome precisa ser o do personagem.</p>
    {:else if results}
      <p class="muted small">{results.length} {results.length === 1 ? 'resultado' : 'resultados'} para “{searched}”</p>
      <ul class="hits">
        {#each results as p (p.id)}
          <li>
            <a class="hit card" href={playerHref(p.id)} onclick={go}>
              <span class="name">{p.name}</span>
              <span class="muted small org">
                {p.guild || 'Sem guilda'}{#if p.alliance} · [{p.alliance}]{/if}
              </span>
              <span class="fame small">
                <span><span class="muted">Fama de abate</span> <span class="num">{fmtCompact(p.killFame)}</span></span>
                <span><span class="muted">Fama de morte</span> <span class="num">{fmtCompact(p.deathFame)}</span></span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <p class="callout small">
    O dossiê usa só dados públicos do killboard; a Guarita nunca detecta jogadores no jogo.
    <a href="/permitido" onclick={go}>Entenda o que fazemos e o que nunca faremos.</a>
  </p>
</section>

<style>
  header p { margin: 0; }
  form label { display: block; }
  form p { margin: 0; }
  .nowrap { flex-wrap: nowrap; }
  .nowrap .input { flex: 1; min-width: 0; }
  .hits { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .hit { display: grid; gap: 2px; color: var(--ink); text-decoration: none; }
  .hit:hover { border-color: var(--accent); }
  .name { font-weight: 700; color: var(--accent); overflow-wrap: anywhere; }
  .org { overflow-wrap: anywhere; }
  .fame { display: flex; flex-wrap: wrap; gap: 4px 16px; }
</style>
