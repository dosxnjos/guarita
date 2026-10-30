<script lang="ts">
  // Golpes comuns no Albion (catálogo) + checagem de nick parecido pela busca pública do killboard.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import type { PlayerHit } from '../../shared/types';
  import { SCAMS, SCAM_REPORT_NOTE } from '../../shared/scams';
  import { fmtCompact, playerHref, playerQuery } from '../lib/player/format';
  import ErrorBox from '../lib/player/ErrorBox.svelte';
  import { nickQueries, similarNicks, type NickMatch } from '../lib/novato/similar';

  // params não usado
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  let nick = $state('');
  let matches = $state<NickMatch[] | null>(null);
  let checked = $state('');
  let loading = $state(false);
  let slow = $state(false);
  let error = $state<string | null>(null);
  let partial = $state(false);
  let seq = 0;

  const valid = $derived(playerQuery(nick).ok);

  async function check() {
    const { q, ok } = playerQuery(nick);
    if (!ok) return;
    const my = ++seq;
    loading = true; slow = false; error = null; partial = false;
    const slowT = setTimeout(() => { if (my === seq) slow = true; }, 6000);
    try {
      const results = await Promise.allSettled(nickQueries(q).map((x) => api.searchPlayers(x)));
      if (my !== seq) return;
      const ok = results.filter((r): r is PromiseFulfilledResult<{ players: PlayerHit[] }> => r.status === 'fulfilled');
      if (!ok.length) {
        const first = results[0];
        throw first && first.status === 'rejected' ? first.reason : new Error('sem resposta');
      }
      partial = ok.length < results.length;
      matches = similarNicks(q, ok.flatMap((r) => r.value.players ?? []));
      checked = q;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(slowT);
      if (my === seq) loading = false;
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    check();
  }

  function orgLine(h: PlayerHit): string {
    const org = h.alliance ? `${h.guild || 'Sem guilda'} · [${h.alliance}]` : h.guild || 'Sem guilda';
    return `${org} · fama de abate ${fmtCompact(h.killFame)}`;
  }

  // Link do índice abre o golpe (o <details> começa fechado) e leva o foco ao título dele: teclado e leitor de tela
  // continuam no golpe escolhido, não no topo da página.
  function openScam(id: string, focus = true) {
    const el = document.getElementById(`golpe-${id}`);
    if (!(el instanceof HTMLDetailsElement)) return;
    el.open = true;
    if (focus) el.querySelector('summary')?.focus({ preventScroll: true });
  }

  // Link compartilhado (/golpes#golpe-rmt) ou voltar/avançar no histórico: abre o golpe do endereço.
  $effect(() => {
    const fromHash = () => {
      const m = /^#golpe-([\w-]+)$/.exec(location.hash);
      if (!m) return;
      openScam(m[1], false);
      document.getElementById(`golpe-${m[1]}`)?.scrollIntoView({ block: 'start' });
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  });

  const exact = $derived(matches?.filter((m) => m.kind === 'exato') ?? []);
  const similar = $derived(matches?.filter((m) => m.kind !== 'exato') ?? []);

  $effect(() => {
    document.title = 'Golpes comuns · Guarita';
  });
</script>

<section class="page stack">
  <header>
    <h1>Golpes comuns</h1>
    <p class="muted">Os truques que mais pegam jogador novo no Albion, como reconhecer e como se proteger. No jogo, o que você entrega por vontade própria não volta.</p>
  </header>

  <nav class="card" aria-label="Golpes do catálogo">
    <ul class="index">
      {#each SCAMS as s (s.id)}<li><a href="#golpe-{s.id}" onclick={() => openScam(s.id)}>{s.title}</a></li>{/each}
      <li><a href="#nick">Checar nick parecido</a></li>
    </ul>
  </nav>

  <div class="stack">
    {#each SCAMS as s (s.id)}
      <details class="card scam" id="golpe-{s.id}">
        <summary>
          <span class="scam-title">{s.title}</span>
          <span class="muted small">{s.summary}</span>
        </summary>
        <div class="scam-body stack">
          <div>
            <h3 class="h4">Como funciona</h3>
            <p>{s.how}</p>
          </div>
          <div>
            <h3 class="h4">Sinais</h3>
            <ul>{#each s.signs as x (x)}<li>{x}</li>{/each}</ul>
          </div>
          <div>
            <h3 class="h4">Como se proteger</h3>
            <ul>{#each s.protect as x (x)}<li>{x}</li>{/each}</ul>
          </div>
        </div>
      </details>
    {/each}
  </div>

  <p class="callout info small">{SCAM_REPORT_NOTE}</p>

  <section class="card stack" id="nick" aria-labelledby="nick-titulo">
    <h2 class="h3" id="nick-titulo">Checar nick parecido</h2>
    <p class="muted small">
      Golpista costuma usar o nome de alguém conhecido com uma letra trocada: “I” maiúsculo no lugar de “l”, zero no lugar de “O”.
      Digite o nome exato de quem você conhece e veja se aparecem nomes parecidos no servidor Americas.
    </p>
    <form class="stack" onsubmit={submit} role="search">
      <label for="nick-input"><strong>Nome do personagem</strong></label>
      <div class="row nowrap">
        <input id="nick-input" class="input" type="search" autocomplete="off" spellcheck="false" minlength="3"
          placeholder="Ex.: o nome do líder da sua guilda" bind:value={nick} aria-describedby="nick-ajuda" />
        <button class="btn primary" type="submit" disabled={!valid || loading}>Checar</button>
      </div>
      <p id="nick-ajuda" class="muted small">
        {#if nick.trim() && !valid}Digite pelo menos 3 letras.{:else}O killboard oficial às vezes leva até 1 minuto para responder.{/if}
      </p>
    </form>

    <div aria-live="polite" class="stack">
      {#if loading}
        <div class="stack" role="status" aria-busy="true">
          <p class="muted small">{slow ? 'O killboard oficial está lento agora. Continuamos esperando a resposta…' : 'Procurando nomes parecidos…'}</p>
          {#each [0, 1, 2] as i (i)}<div class="skeleton" style:height="44px"></div>{/each}
        </div>
      {:else if error}
        <ErrorBox message={error} onretry={check} />
      {:else if matches}
        {#if exact.length}
          <p class="small">Nome exato encontrado:</p>
          <ul class="hits">
            {#each exact as m (m.hit.id)}
              <li>
                <a class="hit card" href={playerHref(m.hit.id)} onclick={go}>
                  <span class="name">{m.hit.name}</span>
                  <span class="muted small">{orgLine(m.hit)}</span>
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">O nome exato “{checked}” não apareceu na busca. Confira a grafia com a pessoa por outro canal.</p>
        {/if}

        {#if similar.length}
          <p class="small"><strong>{similar.length} {similar.length === 1 ? 'nome parecido' : 'nomes parecidos'}</strong> com “{checked}”:</p>
          <ul class="hits">
            {#each similar as m (m.hit.id)}
              <li>
                <a class="hit card" href={playerHref(m.hit.id)} onclick={go}>
                  <span class="name mono">{m.hit.name}</span>
                  <span class="small"><span class="tag {m.kind === 'homoglifo' ? 'warn' : 'info'}">{m.kind === 'homoglifo' ? 'Igual na tela' : m.kind === 'caixa' ? 'Muda a caixa' : 'Parecido'}</span> {m.reason}</span>
                  <span class="muted small">{orgLine(m.hit)}</span>
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">Nenhum nome parecido apareceu na busca.</p>
        {/if}

        {#if partial}<p class="muted small">Uma das buscas não respondeu; a lista pode estar incompleta.</p>{/if}
        <p class="callout warn small">
          Nome parecido não quer dizer golpe: muita gente escolhe nomes semelhantes sem má intenção. Use isto só para
          conferir com quem você está falando, comparando guilda e fama. A busca do killboard devolve poucos nomes e
          só os que começam ou contêm o que foi digitado, então “nenhum parecido” não garante que não exista.
        </p>
      {/if}
    </div>
  </section>
</section>

<style>
  header p { margin: 0; }
  .h3 { font-size: 18px; margin: 0; }
  .h4 { font-size: 15px; margin: 0 0 4px; }
  .index { margin: 0; padding-left: 18px; columns: 2 220px; column-gap: 24px; }
  .index li { margin: 2px 0; break-inside: avoid; }
  .scam summary { cursor: pointer; display: grid; gap: 2px; list-style: none; }
  .scam summary::-webkit-details-marker { display: none; }
  .scam-title::before { content: '▸'; display: inline-block; width: 1.1em; color: var(--accent); }
  .scam[open] .scam-title::before { content: '▾'; }
  .scam-title { font-weight: 700; }
  .scam-body { margin-top: 10px; }
  .scam-body p { margin: 0; }
  .scam-body ul { margin: 0; padding-left: 18px; }
  .scam:target { border-color: var(--accent); }
  form label { display: block; }
  form p, section > p { margin: 0; }
  .nowrap { flex-wrap: nowrap; }
  .nowrap .input { flex: 1; min-width: 0; }
  .hits { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .hit { display: grid; gap: 4px; color: var(--ink); text-decoration: none; }
  .hit:hover { border-color: var(--accent); }
  .name { font-weight: 700; color: var(--accent); overflow-wrap: anywhere; }
</style>
