<script lang="ts">
  // Glossário do Albion em PT-BR/EN (em /es, ES/EN): busca instantânea, índice por letra e filtro por assunto.
  // O espanhol mora em src/lib/institucional/glossario.ts, pelo mesmo id; a busca roda sobre a lista da língua atual.
  import { go } from '../lib/router';
  import { glossLetter, searchGlossary, type GlossaryCategory, type GlossaryTerm } from '../../shared/glossary';
  import { glossaryCategoryLabel, glossaryFor } from '../lib/institucional/glossario';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';

  const GLOSSARY = $derived(glossaryFor(getLocale()));
  const GLOSSARY_CATEGORY_LABEL = $derived(glossaryCategoryLabel(getLocale()));

  // params não usado: a busca vive em ?q= no endereço
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const initial = (() => {
    try { return new URLSearchParams(location.search).get('q') ?? ''; } catch { return ''; }
  })();

  let q = $state(initial);
  let cat = $state<GlossaryCategory | ''>('');
  const cats = $derived(Object.keys(GLOSSARY_CATEGORY_LABEL) as GlossaryCategory[]);

  const results = $derived(searchGlossary(q, GLOSSARY).filter((t) => !cat || t.cat === cat));
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

  // Mesmo título que o _worker.js injeta (worker/seo.ts, FIXED_ROUTES e FIXED_ES).
  $effect(() => {
    document.title = tx('Glossário · Guarita', 'Glosario · Guarita');
  });
</script>

<section class="page stack">
  <header>
    <h1>{tx('Glossário', 'Glosario')}</h1>
    <p class="muted">{tx(
      `${GLOSSARY.length} termos e gírias que você vai ouvir no chat, no Discord e nos vídeos, em português e em inglês.`,
      `${GLOSSARY.length} términos y expresiones que vas a escuchar en el chat, en Discord y en los videos, en español y en inglés.`,
    )}</p>
  </header>

  <div class="card stack sticky">
    <label for="gloss-q" class="sr-only">{tx('Buscar termo', 'Buscar término')}</label>
    <input id="gloss-q" class="input" type="search" autocomplete="off" spellcheck="false"
      placeholder={tx('Buscar: gank, regear, zona preta, IP…', 'Buscar: gank, regear, zona negra, IP…')} bind:value={q} oninput={onInput} />
    <div class="seg" role="group" aria-label={tx('Assunto', 'Tema')}>
      <button type="button" aria-pressed={cat === ''} onclick={() => (cat = '')}>{tx('Todos', 'Todos')}</button>
      {#each cats as c (c)}
        <button type="button" aria-pressed={cat === c} onclick={() => (cat = cat === c ? '' : c)}>{GLOSSARY_CATEGORY_LABEL[c]}</button>
      {/each}
    </div>
    {#if !searching && letters.length > 1}
      <nav aria-label={tx('Letras', 'Letras')} class="letters">
        {#each letters as l (l)}<a href="#letra-{l}" onclick={(e) => jump(e, l)}>{l}</a>{/each}
      </nav>
    {/if}
  </div>

  <p class="sr-only" aria-live="polite">{results.length} {results.length === 1 ? tx('termo encontrado', 'término encontrado') : tx('termos encontrados', 'términos encontrados')}</p>

  {#if !results.length}
    <p class="empty card">{tx(
      `Nenhum termo com “${q.trim()}”. Tente a palavra em inglês ou só o começo dela.`,
      `Ningún término con “${q.trim()}”. Prueba la palabra en inglés o solo el comienzo.`,
    )}</p>
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

  {#if getLocale() === 'es'}
    <p class="callout small">
      ¿Falta algún término? Puede estar en la página de <a href={href('/golpes')} onclick={go}>estafas</a> o en la de
      <a href={href('/arriscar')} onclick={go}>cuánto vale arriesgar</a>, que explica las reglas de cada zona.
    </p>
  {:else}
    <p class="callout small">
      Faltou algum termo? Ele pode estar na página de <a href={href('/golpes')} onclick={go}>golpes</a> ou na de
      <a href={href('/arriscar')} onclick={go}>quanto vale arriscar</a>, que explica as regras de cada zona.
    </p>
  {/if}
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
