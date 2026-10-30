<script lang="ts">
  // Busca de item com autocomplete (padrão combobox da WAI-ARIA): setas escolhem, Enter abre, Esc fecha.
  // Sem onselect, abre a página do item. O índice carrega no primeiro foco (loadIndex já guarda em cache).
  import type { ItemHit, ItemsIndex } from '../../../shared/items';
  import { searchItems, tierLabel } from '../../../shared/items';
  import { loadIndex } from '../itemsClient';
  import { navigate } from '../router';
  import ItemIcon from './ItemIcon.svelte';

  let {
    onselect,
    size = 'md',
    label = 'Buscar item',
    placeholder = 'Ex.: bolsa T4, capa de Martlock, tábuas T5.1',
    autofocus = false,
    limit = 8,
  }: {
    onselect?: (hit: ItemHit) => void;
    size?: 'sm' | 'md' | 'lg';
    label?: string;
    placeholder?: string;
    autofocus?: boolean;
    limit?: number;
  } = $props();

  const uid = 'sb-' + Math.random().toString(36).slice(2, 9);
  let q = $state('');
  let index = $state<ItemsIndex | null>(null);
  let indexError = $state('');
  let indexLoading = $state(false);
  let hits = $state<ItemHit[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let input = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);

  async function ensureIndex() {
    if (index || indexLoading) return;
    indexLoading = true;
    indexError = '';
    try {
      index = await loadIndex();
    } catch {
      indexError = 'Não foi possível carregar a lista de itens. Confira a conexão e tente de novo.';
    } finally {
      indexLoading = false;
    }
  }

  // Busca com pequeno atraso para não recalcular a cada tecla em celular lento.
  $effect(() => {
    const term = q.trim();
    const idx = index;
    if (!term || !idx) {
      hits = [];
      return;
    }
    const t = setTimeout(() => {
      try {
        hits = searchItems(idx, term, limit);
      } catch {
        hits = [];
      }
      active = hits.length ? 0 : -1;
      open = true;
    }, 70);
    return () => clearTimeout(t);
  });

  $effect(() => {
    // Só com mouse: no celular o foco automático abriria o teclado a cada visita.
    if (autofocus && input && matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
  });

  function choose(hit: ItemHit) {
    open = false;
    q = '';
    if (onselect) onselect(hit);
    else navigate(`/item/${encodeURIComponent(hit.id)}`);
  }

  function scrollActive() {
    queueMicrotask(() => listEl?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && hits.length) open = true;
      else if (hits.length) active = (active + 1) % hits.length;
      scrollActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hits.length) active = (active - 1 + hits.length) % hits.length;
      scrollActive();
    } else if (e.key === 'Enter') {
      if (open && hits[active]) {
        e.preventDefault();
        choose(hits[active]);
      } else if (hits[0]) {
        e.preventDefault();
        choose(hits[0]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        open = false;
      } else if (q) {
        e.preventDefault();
        q = '';
      }
    }
  }

  const showList = $derived(open && q.trim().length > 0 && !!index);
</script>

<div class="searchbox sb-{size}">
  <label for={uid} class={size === 'lg' ? 'sb-label' : 'sr-only'}>{label}</label>
  <div class="sb-field">
    <svg class="sb-glass" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
      ><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" /><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    <input
      bind:this={input}
      id={uid}
      class="input sb-input"
      type="search"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="search"
      aria-autocomplete="list"
      aria-expanded={showList}
      aria-controls="{uid}-list"
      aria-activedescendant={showList && active >= 0 ? `${uid}-o${active}` : undefined}
      aria-describedby="{uid}-status"
      {placeholder}
      bind:value={q}
      onfocus={() => {
        ensureIndex();
        if (q.trim()) open = true;
      }}
      oninput={() => {
        ensureIndex();
        open = true;
      }}
      onblur={() => setTimeout(() => (open = false), 120)}
      {onkeydown}
    />
  </div>
  <p id="{uid}-status" class="sr-only" aria-live="polite">
    {#if showList}{hits.length ? `${hits.length} resultados; use as setas para escolher` : 'Nenhum item encontrado'}{/if}
  </p>
  {#if indexError}
    <p class="small sb-error" role="alert">{indexError} <button type="button" class="linkbtn" onclick={ensureIndex}>Tentar de novo</button></p>
  {:else if indexLoading && q.trim()}
    <p class="small muted">Carregando a lista de itens…</p>
  {/if}
  <ul bind:this={listEl} id="{uid}-list" class="sb-list" role="listbox" aria-label="Itens encontrados" hidden={!showList}>
    {#if showList}
      {#each hits as hit, i (hit.id)}
        <!-- teclado fica no input (padrão combobox com aria-activedescendant); o clique é atalho de mouse/toque -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li id="{uid}-o{i}" role="option" aria-selected={i === active} class="sb-opt"
          onmousedown={(e) => e.preventDefault()} onclick={() => choose(hit)} onmousemove={() => (active = i)}>
          <ItemIcon id={hit.id} size={size === 'sm' ? 28 : 36} />
          <span class="sb-names">
            <span class="sb-pt">{hit.pt}</span>
            {#if hit.en && hit.en !== hit.pt}<span class="sb-en small muted">{hit.en}</span>{/if}
          </span>
          {#if hit.tier}<span class="tag">{tierLabel(hit.tier, hit.ench)}</span>{/if}
        </li>
      {:else}
        <li class="sb-none small muted" role="presentation">Nenhum item com esse nome. Tente o nome em inglês ou só uma palavra.</li>
      {/each}
    {/if}
  </ul>
</div>
