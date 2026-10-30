<script lang="ts">
  // Busca de guilda por nome no killboard público (servidor Americas) → página da guilda.
  import { go, navigate } from '../lib/router';
  import { api } from '../lib/api';
  import type { GuildHit } from '../../shared/types';
  import { guildHref, guildQuery } from '../lib/insights/format';
  import { fmtCompact } from '../lib/player/format';
  import ErrorBox from '../lib/player/ErrorBox.svelte';
  import { href, tx } from '../lib/i18n/index.svelte';

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
    // Igual a worker/seo.ts (FIXED_ROUTES e FIXED_ES).
    document.title = tx('Guildas · Guarita', 'Gremios · Guarita');
    const { q, ok } = guildQuery(initial);
    if (ok) run(q);
    return () => clearTimeout(timer);
  });

  const tooShort = $derived(text.trim().length > 0 && !guildQuery(text).ok);
</script>

<section class="page stack">
  <header>
    <h1>{tx('Guildas', 'Gremios')}</h1>
    <p class="muted">
      {tx(
        'Procure uma guilda do servidor Americas e veja membros, fama, quem mais mata, armas e os horários em que ela mais luta.',
        'Busca un gremio del servidor Americas y mira sus miembros, fama, quién más mata, armas y los horarios en que más pelea.',
      )}
    </p>
  </header>

  <form class="card stack" role="search" onsubmit={submit}>
    <label for="busca-guilda"><strong>{tx('Nome da guilda', 'Nombre del gremio')}</strong></label>
    <div class="row nowrap">
      <input id="busca-guilda" class="input" type="search" autocomplete="off" spellcheck="false" minlength="3" maxlength="64"
        placeholder={tx('Mínimo de 3 letras', 'Mínimo 3 letras')} bind:value={text} oninput={schedule} aria-describedby="busca-guilda-ajuda" />
      <button class="btn primary" type="submit" disabled={!guildQuery(text).ok || loading}>{tx('Buscar', 'Buscar')}</button>
    </div>
    <p id="busca-guilda-ajuda" class="muted small">
      {#if tooShort}{tx('Digite pelo menos 3 letras.', 'Escribe al menos 3 letras.')}{:else}{tx('O killboard oficial às vezes leva até 1 minuto para responder.', 'El killboard oficial a veces tarda hasta 1 minuto en responder.')}{/if}
    </p>
  </form>

  <div aria-live="polite">
    {#if loading}
      <div class="card stack" role="status" aria-busy="true">
        <p class="muted small">{slow
          ? tx('O killboard oficial está lento agora. Continuamos esperando a resposta…', 'El killboard oficial está lento ahora. Seguimos esperando la respuesta…')
          : tx('Buscando no killboard…', 'Buscando en el killboard…')}</p>
        {#each [0, 1, 2] as i (i)}<div class="skeleton" style:height="44px"></div>{/each}
      </div>
    {:else if error}
      <ErrorBox message={error} onretry={() => run(guildQuery(text).q)} />
      <p class="small direct">{tx('Se você sabe o nome exato,', 'Si sabes el nombre exacto,')} <a href={href(guildHref(searched))} onclick={go}>{tx(`abra a guilda “${searched}” direto`, `abre el gremio “${searched}” directamente`)}</a>.</p>
    {:else if results && results.length === 0}
      <p class="empty card">
        {tx(
          `Nenhuma guilda encontrada com “${searched}” no servidor Americas. Confira a grafia: espaços e símbolos contam.`,
          `No se encontró ningún gremio con “${searched}” en el servidor Americas. Revisa cómo se escribe: los espacios y los símbolos cuentan.`,
        )}
      </p>
    {:else if results}
      <p class="muted small">{tx(
        `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'} para “${searched}”`,
        `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'} para “${searched}”`,
      )}</p>
      <ul class="hits">
        {#each results as g (g.id)}
          <li>
            <a class="hit card" href={href(guildHref(g.name))} onclick={go}>
              <span class="name">{g.name}</span>
              <span class="muted small">{g.alliance ? tx(`Aliança ${g.alliance}`, `Alianza ${g.alliance}`) : tx('Sem aliança', 'Sin alianza')}</span>
              {#if g.deathFame !== null}
                <span class="small"><span class="muted">{tx('Fama de morte', 'Fama por muertes')}</span> <span class="num">{fmtCompact(g.deathFame)}</span></span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <p class="callout small">
    {tx(
      'A página da guilda usa só dados públicos do killboard, com atraso de minutos. A Guarita nunca detecta jogadores no jogo.',
      'La página del gremio usa solo datos públicos del killboard, con minutos de retraso. La Guarita nunca detecta jugadores en el juego.',
    )} <a href={href('/permitido')} onclick={go}>{tx('Entenda o que fazemos e o que nunca faremos.', 'Entiende lo que hacemos y lo que nunca haremos.')}</a>
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
