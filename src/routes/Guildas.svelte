<script lang="ts">
  // Busca de guilda por nome no killboard público (servidor Americas) → página da guilda.
  import { go, navigate } from '../lib/router';
  import { api } from '../lib/api';
  import type { GuildHit } from '../../shared/types';
  import { guildHref, guildQuery } from '../lib/insights/format';
  import { fmtCompact } from '../lib/player/format';
  import ErrorBox from '../lib/player/ErrorBox.svelte';

  // params não usado: o termo da busca vive em ?q= no endereço
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const initial = (() => {
    try { return new URLSearchParams(location.search).get('q') ?? ''; } catch { return ''; }
  })();

  let text = $state(initial);
  let results = $state<GuildHit[] | null>(null);
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
      const r = await api.searchGuilds(q);
      if (my !== seq) return;
      results = r.guilds ?? [];
      searched = q;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : String(e);
      searched = q;
    } finally {
      clearTimeout(slowT);
      if (my === seq) loading = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    const { q, ok } = guildQuery(text);
    try {
      const u = new URL(location.href);
      if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
      history.replaceState(history.state, '', u.pathname + u.search);
    } catch { /* sem history: segue */ }
    if (!ok) { seq++; loading = false; results = null; error = null; return; }
    timer = setTimeout(() => run(q), 500);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    clearTimeout(timer);
    const { q, ok } = guildQuery(text);
    if (!ok) return;
    // Nome idêntico a um resultado já na tela: vai direto para a guilda.
    const exact = results?.find((g) => g.name.toLowerCase() === q.toLowerCase());
    if (exact) navigate(guildHref(exact.name));
    else run(q);
  }

  $effect(() => {
    document.title = 'Guildas · Guarita';
    const { q, ok } = guildQuery(initial);
    if (ok) run(q);
    return () => clearTimeout(timer);
  });

  const tooShort = $derived(text.trim().length > 0 && !guildQuery(text).ok);
</script>

<section class="page stack">
  <header>
    <h1>Guildas</h1>
    <p class="muted">
      Procure uma guilda do servidor Americas e veja membros, fama, quem mais mata, armas e os horários em que ela
      mais luta.
    </p>
  </header>

  <form class="card stack" role="search" onsubmit={submit}>
    <label for="busca-guilda"><strong>Nome da guilda</strong></label>
    <div class="row nowrap">
      <input id="busca-guilda" class="input" type="search" autocomplete="off" spellcheck="false" minlength="3" maxlength="64"
        placeholder="Mínimo de 3 letras" bind:value={text} oninput={schedule} aria-describedby="busca-guilda-ajuda" />
      <button class="btn primary" type="submit" disabled={!guildQuery(text).ok || loading}>Buscar</button>
    </div>
    <p id="busca-guilda-ajuda" class="muted small">
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
      <ErrorBox message={error} onretry={() => run(guildQuery(text).q)} />
      <p class="small direct">Se você sabe o nome exato, <a href={guildHref(searched)} onclick={go}>abra a guilda “{searched}” direto</a>.</p>
    {:else if results && results.length === 0}
      <p class="empty card">
        Nenhuma guilda encontrada com “{searched}” no servidor Americas. Confira a grafia: espaços e símbolos contam.
      </p>
    {:else if results}
      <p class="muted small">{results.length} {results.length === 1 ? 'resultado' : 'resultados'} para “{searched}”</p>
      <ul class="hits">
        {#each results as g (g.id)}
          <li>
            <a class="hit card" href={guildHref(g.name)} onclick={go}>
              <span class="name">{g.name}</span>
              <span class="muted small">{g.alliance ? `Aliança ${g.alliance}` : 'Sem aliança'}</span>
              {#if g.deathFame !== null}
                <span class="small"><span class="muted">Fama de morte</span> <span class="num">{fmtCompact(g.deathFame)}</span></span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <p class="callout small">
    A página da guilda usa só dados públicos do killboard, com atraso de minutos. A Guarita nunca detecta jogadores
    no jogo. <a href="/permitido" onclick={go}>Entenda o que fazemos e o que nunca faremos.</a>
  </p>
</section>

<style>
  header p { margin: 0; }
  form label { display: block; }
  form p { margin: 0; }
  .nowrap { flex-wrap: nowrap; }
  .nowrap .input { flex: 1; min-width: 0; }
  .direct { margin: 8px 0 0; overflow-wrap: anywhere; }
  .hits { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .hit { display: grid; gap: 2px; color: var(--ink); text-decoration: none; }
  .hit:hover { border-color: var(--accent); }
  .name { font-weight: 700; color: var(--accent); overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
