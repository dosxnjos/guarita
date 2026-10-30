<script lang="ts">
  // Glossário do Albion em PT-BR/EN: busca instantânea, índice por letra e filtro por assunto.
  import { go } from '../lib/router';
  import {
    GLOSSARY, GLOSSARY_CATEGORY_LABEL, glossLetter, searchGlossary, type GlossaryCategory, type GlossaryTerm,
  } from '../../shared/glossary';

  // params não usado: a busca vive em ?q= no endereço
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const initial = (() => {
    try { return new URLSearchParams(location.search).get('q') ?? ''; } catch { return ''; }
  })();

  let q = $state(initial);
  let cat = $state<GlossaryCategory | ''>('');
  const cats = Object.keys(GLOSSARY_CATEGORY_LABEL) as GlossaryCategory[];

  const results = $derived(searchGlossary(q).filter((t) => !cat || t.cat === cat));
  const searching = $derived(q.trim().length > 0);
  // Sem busca: agrupa por letra. Com busca: lista por relevância.
  const groups = $derived.by(() => {
    const m = new Map<string, GlossaryTerm[]>();
    for (const t of results) {
      const l = glossLetter(t);
      if (!m.has(l)) m.set(l, []);
      m.get(l)!.push(t);
    }
    return [...m.entries()];
  });
  const letters = $derived(groups.map(([l]) => l));

  function onInput() {
    try {
      const u = new URL(location.href);
      if (q.trim()) u.searchParams.set('q', q.trim()); else u.searchParams.delete('q');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch { /* sem history: segue */ }
  }

  function jump(e: MouseEvent, l: string) {
    e.preventDefault();
    document.getElementById(`letra-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $effect(() => {
    document.title = 'Glossário · Guarita';
  });
</script>

<section class="page stack">
  <header>
    <h1>Glossário</h1>
    <p class="muted">{GLOSSARY.length} termos e gírias que você vai ouvir no chat, no Discord e nos vídeos, em português e em inglês.</p>
  </header>

  <div class="card stack sticky">
    <label for="gloss-q" class="sr-only">Buscar termo</label>
    <input id="gloss-q" class="input" type="search" autocomplete="off" spellcheck="false"
      placeholder="Buscar: gank, regear, zona preta, IP…" bind:value={q} oninput={onInput} />
    <div class="seg" role="group" aria-label="Assunto">
      <button type="button" aria-pressed={cat === ''} onclick={() => (cat = '')}>Todos</button>
      {#each cats as c (c)}
        <button type="button" aria-pressed={cat === c} onclick={() => (cat = cat === c ? '' : c)}>{GLOSSARY_CATEGORY_LABEL[c]}</button>
      {/each}
    </div>
    {#if !searching && letters.length > 1}
      <nav aria-label="Letras" class="letters">
        {#each letters as l (l)}<a href="#letra-{l}" onclick={(e) => jump(e, l)}>{l}</a>{/each}
      </nav>
    {/if}
  </div>

  <p class="sr-only" aria-live="polite">{results.length} {results.length === 1 ? 'termo encontrado' : 'termos encontrados'}</p>

  {#if !results.length}
    <p class="empty card">Nenhum termo com “{q.trim()}”. Tente a palavra em inglês ou só o começo dela.</p>
  {:else if searching}
    <dl class="terms">
      {#each results as t (t.id)}{@render term(t)}{/each}
    </dl>
  {:else}
    {#each groups as [l, list] (l)}
      <section aria-labelledby="letra-{l}">
        <h2 class="letter" id="letra-{l}">{l}</h2>
        <dl class="terms">
          {#each list as t (t.id)}{@render term(t)}{/each}
        </dl>
      </section>
    {/each}
  {/if}

  <p class="callout small">
    Faltou algum termo? Ele pode estar na página de <a href="/golpes" onclick={go}>golpes</a> ou na de
    <a href="/arriscar" onclick={go}>quanto vale arriscar</a>, que explica as regras de cada zona.
  </p>
</section>

{#snippet term(t: GlossaryTerm)}
  <div class="term card" id="termo-{t.id}">
    <dt>
      <span class="term-name">{t.term}</span>
      {#if t.aka.length}<span class="muted small aka">{t.aka.join(' · ')}</span>{/if}
    </dt>
    <dd>
      <p>{t.def}</p>
      <span class="tag">{GLOSSARY_CATEGORY_LABEL[t.cat]}</span>
    </dd>
  </div>
{/snippet}

<style>
  header p { margin: 0; }
  .sticky { position: sticky; top: 52px; z-index: 4; }
  .letters { display: flex; flex-wrap: wrap; gap: 2px; }
  .letters a { min-width: 32px; min-height: 32px; display: inline-flex; align-items: center; justify-content: center;
    border-radius: 6px; text-decoration: none; color: var(--accent); font-weight: 600; }
  .letters a:hover, .letters a:focus-visible { background: var(--accent-soft); }
  .letter { font-size: 20px; margin: 8px 0 6px; color: var(--muted); scroll-margin-top: 220px; }
  .terms { margin: 0; display: grid; gap: 8px; }
  .term { display: grid; gap: 4px; }
  dt { display: grid; gap: 2px; }
  .term-name { font-weight: 700; font-size: 17px; }
  .aka { overflow-wrap: anywhere; }
  dd { margin: 0; display: grid; gap: 6px; justify-items: start; }
  dd p { margin: 0; }
  .callout a { color: var(--accent); }
  @media (max-width: 639px) {
    .sticky { position: static; }
    .letter { scroll-margin-top: 70px; }
  }
</style>
