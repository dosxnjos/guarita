<script lang="ts">
  // Busca de item com autocomplete (combobox da WAI-ARIA): setas escolhem, Enter confirma, Esc fecha.
  // Adaptado do SearchBox do site: o índice vem de lib/ui-itens.ts (API pelo plugin-http + cópia local).
  import type { ItemHit, ItemsIndex } from '../../../shared/items';
  import { tierLabel } from '../../../shared/items';
  import ItemIcon from '../../../src/lib/ui/ItemIcon.svelte';
  import { buscarItens, carregarItens } from '../lib/ui-itens';
  import { tx } from '../lib/i18n.svelte';

  // Em espanhol o índice é o items-index-es.json: hit.pt traz o nome ES (mesma posição da tupla).
  let {
    onselect,
    label = tx('Buscar item', 'Buscar objeto'),
    placeholder = tx('Ex.: bolsa T4, capa de Martlock', 'Ej.: bolsa T4, capa de Martlock'),
    autofocus = false,
    limite = 8,
    input = $bindable(null),
  }: {
    onselect: (hit: ItemHit) => void;
    label?: string;
    placeholder?: string;
    autofocus?: boolean;
    limite?: number;
    input?: HTMLInputElement | null;
  } = $props();

  const uid = 'ib-' + Math.random().toString(36).slice(2, 9);
  let q = $state('');
  let index = $state<ItemsIndex | null>(null);
  let erro = $state('');
  let carregando = $state(false);
  let hits = $state<ItemHit[]>([]);
  let aberto = $state(false);
  let ativo = $state(-1);
  let listaEl = $state<HTMLUListElement | null>(null);

  async function garantirIndice() {
    if (index || carregando) return;
    carregando = true;
    erro = '';
    try {
      index = await carregarItens();
    } catch (e) {
      erro = e instanceof Error ? e.message : tx('Não foi possível carregar a lista de itens.', 'No fue posible cargar la lista de objetos.');
    } finally {
      carregando = false;
    }
  }

  $effect(() => {
    const termo = q.trim();
    const idx = index;
    if (!termo || !idx) {
      hits = [];
      return;
    }
    const t = setTimeout(() => {
      hits = buscarItens(idx, termo, limite);
      ativo = hits.length ? 0 : -1;
      aberto = true;
    }, 60);
    return () => clearTimeout(t);
  });

  $effect(() => {
    if (autofocus && input) input.focus({ preventScroll: true });
  });

  function escolher(hit: ItemHit) {
    aberto = false;
    q = '';
    onselect(hit);
  }

  function rolarAtivo() {
    queueMicrotask(() => listaEl?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto && hits.length) aberto = true;
      else if (hits.length) ativo = (ativo + 1) % hits.length;
      rolarAtivo();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hits.length) ativo = (ativo - 1 + hits.length) % hits.length;
      rolarAtivo();
    } else if (e.key === 'Enter') {
      const h = (aberto && hits[ativo]) || hits[0];
      if (h) {
        e.preventDefault();
        escolher(h);
      }
    } else if (e.key === 'Escape') {
      if (aberto) {
        e.preventDefault();
        aberto = false;
      } else if (q) {
        e.preventDefault();
        q = '';
      }
    }
  }

  const mostrar = $derived(aberto && q.trim().length > 0 && !!index);
</script>

<div class="ib">
  <label for={uid} class="sr-only">{label}</label>
  <input
    bind:this={input}
    id={uid}
    class="input ib-input"
    type="search"
    role="combobox"
    autocomplete="off"
    spellcheck="false"
    aria-autocomplete="list"
    aria-expanded={mostrar}
    aria-controls="{uid}-lista"
    aria-activedescendant={mostrar && ativo >= 0 ? `${uid}-o${ativo}` : undefined}
    {placeholder}
    bind:value={q}
    onfocus={() => {
      void garantirIndice();
      if (q.trim()) aberto = true;
    }}
    oninput={() => {
      void garantirIndice();
      aberto = true;
    }}
    onblur={() => setTimeout(() => (aberto = false), 120)}
    {onkeydown}
  />
  <p class="sr-only" aria-live="polite">
    {#if mostrar}{hits.length ? tx(`${hits.length} resultados; use as setas para escolher`, `${hits.length} resultados; usa las flechas para elegir`) : tx('Nenhum item encontrado', 'No se encontró ningún objeto')}{/if}
  </p>
  {#if erro}
    <p class="small bad-text ib-msg" role="alert">{erro} <button type="button" class="linkbtn" onclick={garantirIndice}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
  {:else if carregando && q.trim()}
    <p class="small muted ib-msg">{tx('Carregando a lista de itens…', 'Cargando la lista de objetos…')}</p>
  {/if}
  <ul bind:this={listaEl} id="{uid}-lista" class="ib-lista" role="listbox" aria-label={tx('Itens encontrados', 'Objetos encontrados')} hidden={!mostrar}>
    {#if mostrar}
      {#each hits as hit, i (hit.id)}
        <!-- teclado fica no campo (aria-activedescendant); o clique é atalho de mouse -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li id="{uid}-o{i}" role="option" aria-selected={i === ativo} class="ib-op"
          onmousedown={(e) => e.preventDefault()} onclick={() => escolher(hit)} onmousemove={() => (ativo = i)}>
          <ItemIcon id={hit.id} size={28} />
          <span class="ib-nome">{hit.pt}</span>
          {#if hit.tier}<span class="tag">{tierLabel(hit.tier, hit.ench)}</span>{/if}
        </li>
      {:else}
        <li class="small muted ib-vazio" role="presentation">{tx('Nenhum item com esse nome. Tente o nome em inglês ou uma palavra só.', 'Ningún objeto con ese nombre. Prueba el nombre en inglés o una sola palabra.')}</li>
      {/each}
    {/if}
  </ul>
</div>

<style>
  .ib { position: relative; }
  .ib-input { padding: 7px 10px; font-size: 14px; }
  .ib-msg { margin: 4px 0 0; }
  .ib-lista {
    position: absolute; z-index: 30; left: 0; right: 0; margin: 4px 0 0; padding: 4px; list-style: none;
    background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
    max-height: min(60vh, 320px); overflow-y: auto;
  }
  .ib-lista[hidden] { display: none; }
  .ib-op { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .ib-op[aria-selected='true'] { background: var(--accent-soft); }
  .ib-nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ib-vazio { padding: 8px; }
</style>
