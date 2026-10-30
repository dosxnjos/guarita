<script lang="ts">
  // Escolha de item com autocomplete do índice estático (PT-BR/EN; na versão em espanhol, o índice ES/EN do
  // itemsClient). Se o índice falhar, aceita o código do item.
  import { untrack } from 'svelte';
  import { loadIndex } from '../itemsClient';
  import { itemName as nameOf, searchItems, tierLabel, type ItemHit, type ItemsIndex } from '../../../shared/items';
  import { tx } from '../i18n/index.svelte';
  import ItemIcon from './ItemIcon.svelte';

  let { itemId = $bindable(''), itemName = $bindable(''), inputId = 'item-picker', invalid = false }:
    { itemId?: string; itemName?: string; inputId?: string; invalid?: boolean } = $props();

  let index = $state<ItemsIndex | null>(null);
  let indexError = $state(false);
  let text = $state('');
  let hits = $state<ItemHit[]>([]);
  let open = $state(false);
  let active = $state(-1);
  const listId = $derived(`${inputId}-list`);

  // carrega o índice uma vez; com item já escolhido (ex.: ?item=), mostra o nome.
  // untrack: digitar muda itemId e não pode recarregar o índice nem apagar o texto.
  $effect(() => {
    let alive = true;
    untrack(() => {
      if (itemId) text = itemName || itemId;
    });
    loadIndex()
      .then((ix) => {
        if (!alive) return;
        index = ix;
        untrack(() => {
          if (itemId && !itemName) {
            try { itemName = nameOf(ix, itemId); } catch { /* nome fica vazio */ }
            if (itemName) text = itemName;
          }
        });
      })
      .catch(() => { if (alive) { indexError = true; untrack(() => (text = itemId)); } });
    return () => { alive = false; };
  });

  function onInput() {
    if (indexError || !index) { itemId = text.trim().toUpperCase(); itemName = ''; return; }
    itemId = ''; itemName = '';
    const q = text.trim();
    if (q.length < 2) { hits = []; open = false; return; }
    try { hits = searchItems(index, q, 12); } catch { hits = []; }
    open = hits.length > 0;
    active = hits.length ? 0 : -1;
  }

  function label(h: ItemHit) {
    const t = tierLabel(h.tier, h.ench);
    return t ? `${t} ${h.pt || h.en}` : h.pt || h.en || h.id;
  }

  function pick(h: ItemHit) {
    itemId = h.id;
    itemName = label(h);
    text = itemName;
    open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % hits.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + hits.length) % hits.length; }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active]); }
    else if (e.key === 'Escape') { open = false; }
  }
</script>

<div class="picker">
  <input
    id={inputId}
    class="input"
    type="text"
    autocomplete="off"
    spellcheck="false"
    role="combobox"
    aria-expanded={open}
    aria-controls={listId}
    aria-autocomplete="list"
    aria-invalid={invalid}
    aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
    placeholder={indexError
      ? tx('Código do item, ex.: T4_BAG', 'Código del objeto, p. ej.: T4_BAG')
      : tx('Nome do item, ex.: bolsa do adepto, t6 espada', 'Nombre del objeto, p. ej.: bolsa del iniciado, t6 espada')}
    bind:value={text}
    oninput={onInput}
    onkeydown={onKey}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
  {#if open}
    <ul class="list" id={listId} role="listbox">
      {#each hits as h, i (h.id)}
        <li id="{listId}-{i}" role="option" aria-selected={i === active} class:active={i === active}
          onmousedown={(e) => { e.preventDefault(); pick(h); }}>
          <ItemIcon id={h.id} alt="" size={32} />
          <span class="txt"><span>{label(h)}</span><span class="muted small mono">{h.id}</span></span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if indexError}
    <p class="muted small">{tx(
      'Não conseguimos carregar a lista de itens agora. Digite o código do item (aparece no endereço da página do item).',
      'No pudimos cargar la lista de objetos ahora. Escribe el código del objeto (aparece en la dirección de la página del objeto).',
    )}</p>
  {:else if itemId}
    <p class="muted small chosen"><ItemIcon id={itemId} alt="" size={24} /> {tx('Escolhido', 'Elegido')}: <span class="mono">{itemId}</span></p>
  {/if}
</div>

<style>
  .picker { position: relative; }
  .list { position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + 4px); max-height: 320px; overflow-y: auto;
    list-style: none; margin: 0; padding: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
  li { display: flex; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 6px; cursor: pointer; min-width: 0; }
  li.active, li:hover { background: var(--accent-soft); }
  .txt { display: grid; min-width: 0; }
  .txt span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  p { margin: 6px 0 0; }
  .chosen { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
</style>
