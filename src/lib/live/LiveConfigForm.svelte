<script lang="ts">
  // Configuração do painel de live: monta a URL para colar na fonte de navegador do OBS, com prévia ao lado.
  import type { City } from '../../../shared/types';
  import type { ItemHit, ItemsIndex } from '../../../shared/items';
  import { itemName, tierLabel } from '../../../shared/items';
  import { ALL_CITIES } from '../../../shared/market';
  import { loadIndex } from '../itemsClient';
  import { go } from '../router';
  import { cityName, tierFromId } from '../format';
  import { getLocale, href, tx } from '../i18n/index.svelte';
  import SearchBox from '../ui/SearchBox.svelte';
  import ItemIcon from '../ui/ItemIcon.svelte';
  import LivePanel from './LivePanel.svelte';
  import {
    LIVE_BLOCKS, liveBlockLabel, LIVE_MAX_ITEMS, LIVE_SCALE_MAX, LIVE_SCALE_MIN, buildLiveUrl, parseGuild, parseLiveConfig,
    type LiveBlock, type LiveConfig, type LiveTheme,
  } from './config';

  let { initial }: { initial: string } = $props();

  // Aberta com parâmetros (?config&itens=...), a tela parte da configuração da URL; sem nada, de um exemplo útil.
  const start = (() => {
    const p = new URLSearchParams(initial);
    p.delete('config');
    if ([...p.keys()].length === 0) return null;
    return parseLiveConfig(p);
  })();

  let blocks = $state<Record<LiveBlock, boolean>>({
    relogio: start ? start.blocks.includes('relogio') : true,
    precos: start ? start.blocks.includes('precos') || start.items.length > 0 : true,
    guilda: start ? start.blocks.includes('guilda') || start.guild !== '' : false,
  });
  let items = $state<string[]>(start?.items ?? ['T4_BAG', 'T5_BAG']);
  let guildDraft = $state(start?.guild ?? '');
  let guild = $state(start?.guild ?? '');
  let theme = $state<LiveTheme>(start?.theme ?? 'escuro');
  let scale = $state(start?.scale ?? 1);
  let city = $state<City | ''>(start?.city ?? '');
  const CITIES = ALL_CITIES.filter((c) => c !== 'Black Market');

  // Guilda só vale para a prévia depois de uma pausa na digitação (cada nome é uma consulta ao killboard).
  $effect(() => {
    const g = guildDraft;
    const t = setTimeout(() => (guild = parseGuild(g)), 700);
    return () => clearTimeout(t);
  });
  const guildHint = $derived(guildDraft.trim() !== '' && parseGuild(guildDraft) === '' ? tx('O nome precisa ter de 3 a 64 caracteres.', 'El nombre debe tener de 3 a 64 caracteres.') : '');

  let index = $state<ItemsIndex | null>(null);
  $effect(() => {
    loadIndex().then((ix) => (index = ix), () => { /* sem índice: mostra o id */ });
  });
  const name = (id: string) => (index ? itemName(index, id) : id);
  const tier = (id: string) => { const t = tierFromId(id); return tierLabel(t.tier, t.ench); };

  let itemMsg = $state('');
  function addItem(hit: ItemHit) {
    itemMsg = '';
    if (items.includes(hit.id)) { itemMsg = tx('Esse item já está na lista.', 'Ese objeto ya está en la lista.'); return; }
    if (items.length >= LIVE_MAX_ITEMS) { itemMsg = tx(`Até ${LIVE_MAX_ITEMS} itens por painel.`, `Hasta ${LIVE_MAX_ITEMS} objetos por panel.`); return; }
    items = [...items, hit.id];
    blocks.precos = true;
  }
  function removeItem(id: string) {
    items = items.filter((x) => x !== id);
    itemMsg = '';
  }
  function moveItem(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const a = [...items];
    [a[i], a[j]] = [a[j], a[i]];
    items = a;
  }

  // Ordem dos blocos: a fixa (relógio, preços, guilda); o parse aceita outra ordem para quem editar a URL à mão.
  const cfg = $derived<LiveConfig>(
    parseLiveConfig(
      new URLSearchParams({
        blocos: LIVE_BLOCKS.filter((b) => blocks[b]).join(','),
        itens: items.join(','),
        guilda: guild,
        tema: theme,
        tamanho: String(scale),
        cidade: city,
      }),
    ),
  );
  // Em espanhol o endereço sai em /es/live: o painel no OBS abre na mesma língua desta tela.
  const url = $derived(buildLiveUrl(cfg, location.origin, getLocale()));
  const missing = $derived(
    [blocks.precos && !items.length ? tx('Escolha ao menos um item para o bloco de preços aparecer.', 'Elige al menos un objeto para que aparezca el bloque de precios.') : '',
     blocks.guilda && !guild ? tx('Digite o nome exato da guilda para o bloco dela aparecer.', 'Escribe el nombre exacto del gremio para que aparezca su bloque.') : '',
     !LIVE_BLOCKS.some((b) => blocks[b]) ? tx('Nenhum bloco marcado: o painel mostra só o relógio.', 'Ningún bloque marcado: el panel muestra solo el reloj.') : ''].filter(Boolean),
  );

  let copyMsg = $state('');
  let urlInput = $state<HTMLInputElement | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copyMsg = tx('Endereço copiado. Cole no campo URL da fonte de navegador do OBS.', 'Dirección copiada. Pégala en el campo URL de la fuente de navegador de OBS.');
    } catch {
      urlInput?.select();
      copyMsg = tx('Não foi possível copiar sozinho: o endereço está selecionado, use Ctrl+C.', 'No se pudo copiar automáticamente: la dirección está seleccionada, usa Ctrl+C.');
    }
  }
  $effect(() => {
    url;
    copyMsg = '';
  });

  let previewBg = $state<'jogo' | 'claro'>('jogo');
</script>

<section class="page">
  <h1>{tx('Painel de live para o OBS', 'Panel para directos en OBS')}</h1>
  <p class="muted" style="margin-top:0">
    {tx(
      'Relógio do servidor, preço dos itens que você escolher e o histórico da sua guilda por cima da transmissão. Fundo transparente, letra grande, atualiza sozinho. Monte aqui, copie o endereço e cole no OBS.',
      'Reloj del servidor, precio de los objetos que elijas y el historial de tu gremio encima de la transmisión. Fondo transparente, letra grande, se actualiza solo. Ármalo aquí, copia la dirección y pégala en OBS.',
    )}
  </p>

  <div class="live-cfg">
    <form class="card stack" onsubmit={(e) => e.preventDefault()} aria-label={tx('Configurar o painel', 'Configurar el panel')}>
      <fieldset class="stack">
        <legend class="kpi-label">{tx('Blocos', 'Bloques')}</legend>
        {#each LIVE_BLOCKS as b (b)}
          <label class="row check"><input type="checkbox" bind:checked={blocks[b]} /> {liveBlockLabel(b, getLocale())}</label>
        {/each}
      </fieldset>

      {#if blocks.precos}
        <fieldset class="stack">
          <legend class="kpi-label">{tx(`Itens (${items.length} de ${LIVE_MAX_ITEMS})`, `Objetos (${items.length} de ${LIVE_MAX_ITEMS})`)}</legend>
          <SearchBox size="sm" label={tx('Acrescentar item', 'Agregar objeto')} placeholder={tx('Ex.: bolsa T4, tábuas T5', 'Ej.: bolsa T4, tablas T5')} onselect={addItem} />
          {#if itemMsg}<p class="small muted" role="status" style="margin:0">{itemMsg}</p>{/if}
          {#if items.length}
            <ul class="li-list">
              {#each items as id, i (id)}
                <li class="li-row">
                  <ItemIcon {id} size={32} />
                  <span class="li-name">{name(id)}<span class="muted small li-tier">{tier(id)}</span></span>
                  <button type="button" class="icon-btn" onclick={() => moveItem(i, -1)} disabled={i === 0} aria-label="{tx('Subir', 'Subir')} {name(id)}">↑</button>
                  <button type="button" class="icon-btn" onclick={() => moveItem(i, 1)} disabled={i === items.length - 1} aria-label="{tx('Descer', 'Bajar')} {name(id)}">↓</button>
                  <button type="button" class="icon-btn" onclick={() => removeItem(id)} aria-label="{tx('Remover', 'Quitar')} {name(id)}">✕</button>
                </li>
              {/each}
            </ul>
          {/if}
          <label class="stack field">
            <span class="small">{tx('Cidade do preço', 'Ciudad del precio')}</span>
            <select class="input" bind:value={city}>
              <option value="">{tx('Melhor cidade (a mais barata com preço confiável)', 'Mejor ciudad (la más barata con precio confiable)')}</option>
              {#each CITIES as c (c)}<option value={c}>{cityName(c)}</option>{/each}
            </select>
          </label>
        </fieldset>
      {/if}

      {#if blocks.guilda}
        <label class="stack field">
          <span class="small">{tx('Nome exato da guilda', 'Nombre exacto del gremio')}</span>
          <input class="input" type="text" bind:value={guildDraft} maxlength="64" autocomplete="off" spellcheck="false"
            aria-describedby="live-guild-hint" />
          <span id="live-guild-hint" class="small muted">{guildHint || tx('Kills e mortes do dia e da semana, com atraso (histórico do killboard).', 'Asesinatos y muertes del día y de la semana, con retraso (historial del killboard).')}</span>
        </label>
      {/if}

      <fieldset class="stack">
        <legend class="kpi-label">{tx('Aparência', 'Apariencia')}</legend>
        <div class="seg" role="radiogroup" aria-label={tx('Tema do painel', 'Tema del panel')}>
          <label><input type="radio" name="live-tema" value="escuro" bind:group={theme} /> {tx('Escuro', 'Oscuro')}</label>
          <label><input type="radio" name="live-tema" value="claro" bind:group={theme} /> {tx('Claro', 'Claro')}</label>
        </div>
        <label class="stack field">
          <span class="small">{tx('Tamanho da letra:', 'Tamaño de la letra:')} <strong class="num">{Math.round(scale * 100)}%</strong></span>
          <input type="range" min={LIVE_SCALE_MIN} max={LIVE_SCALE_MAX} step="0.1" bind:value={scale} />
        </label>
      </fieldset>
    </form>

    <div class="stack">
      <div class="card stack">
        <label class="stack field">
          <span class="kpi-label">{tx('Endereço para o OBS', 'Dirección para OBS')}</span>
          <input class="input mono small" type="text" readonly value={url} bind:this={urlInput} onfocus={(e) => e.currentTarget.select()} />
        </label>
        <div class="row">
          <button type="button" class="btn primary" onclick={copy}>{tx('Copiar endereço', 'Copiar dirección')}</button>
          <a class="btn" href={url} target="_blank" rel="noopener">{tx('Abrir o painel', 'Abrir el panel')}</a>
        </div>
        <p class="small" role="status" aria-live="polite" style="margin:0">{copyMsg}</p>
        {#each missing as m (m)}<p class="small muted" style="margin:0">{m}</p>{/each}
      </div>

      <div class="card stack">
        <div class="section-head" style="margin:0">
          <span class="kpi-label">{tx('Prévia', 'Vista previa')}</span>
          <div class="seg" role="radiogroup" aria-label={tx('Fundo da prévia', 'Fondo de la vista previa')}>
            <label><input type="radio" name="live-bg" value="jogo" bind:group={previewBg} /> {tx('Fundo escuro', 'Fondo oscuro')}</label>
            <label><input type="radio" name="live-bg" value="claro" bind:group={previewBg} /> {tx('Fundo claro', 'Fondo claro')}</label>
          </div>
        </div>
        <div class="preview-box" class:bg-claro={previewBg === 'claro'}>
          <LivePanel {cfg} preview />
        </div>
        <p class="small muted" style="margin:0">{tx('A prévia usa dado real. No OBS o fundo some e só os blocos aparecem.', 'La vista previa usa datos reales. En OBS el fondo desaparece y solo se ven los bloques.')}</p>
      </div>

      <div class="card stack">
        <span class="kpi-label">{tx('Como pôr no OBS', 'Cómo ponerlo en OBS')}</span>
        {#if getLocale() === 'es'}
          <ol class="small steps">
            <li>En <strong>Fuentes</strong>, haz clic en <strong>+</strong> y elige <strong>Navegador</strong>.</li>
            <li>Pega la dirección en el campo <strong>URL</strong>. Un ancho de 520 y un alto de 720 sirven para empezar; ajústalos al tamaño de la letra.</li>
            <li>El fondo ya es transparente: arrastra la fuente a la esquina de la escena.</li>
            <li>El panel se actualiza solo (precios cada 90 segundos, reloj y gremio cada 2 minutos). Para cambiar algo, vuelve aquí y cambia la dirección.</li>
          </ol>
          <p class="small muted" style="margin:0">
            Solo datos públicos y con retraso: precio comunitario e historial del killboard. Nada lee el juego ni avisa de jugadores
            cercanos (consulta <a href={href('/permitido')} onclick={go}>¿Esto está permitido?</a>).
          </p>
        {:else}
          <ol class="small steps">
            <li>Em <strong>Fontes</strong>, clique em <strong>+</strong> e escolha <strong>Navegador</strong>.</li>
            <li>Cole o endereço no campo <strong>URL</strong>. Largura 520 e altura 720 servem para começar; ajuste ao tamanho da letra.</li>
            <li>O fundo já é transparente: arraste a fonte para o canto da cena.</li>
            <li>O painel se atualiza sozinho (preços a cada 90 segundos, relógio e guilda a cada 2 minutos). Para mudar algo, volte aqui e troque o endereço.</li>
          </ol>
          <p class="small muted" style="margin:0">
            Só dado público e com atraso: preço comunitário e histórico do killboard. Nada lê o jogo nem avisa de jogador
            por perto (veja <a href={href('/permitido')} onclick={go}>Isso é permitido?</a>).
          </p>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .live-cfg { display: grid; gap: 12px; grid-template-columns: 1fr; align-items: start; }
  @media (min-width: 900px) { .live-cfg { grid-template-columns: minmax(300px, 380px) 1fr; } }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  legend { padding: 0; margin-bottom: 6px; }
  .check { gap: 10px; cursor: pointer; }
  .check input { width: 18px; height: 18px; accent-color: var(--accent); }
  .field { gap: 4px; }
  input[type='range'] { width: 100%; accent-color: var(--accent); }
  .li-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .li-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 8px; padding: 4px 6px; background: var(--surface-2); min-width: 0; }
  .li-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .li-tier { margin-left: 6px; }
  .icon-btn { font: inherit; flex: none; width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: pointer; }
  .icon-btn:hover:not(:disabled) { border-color: var(--accent); }
  .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .preview-box {
    border-radius: 8px; padding: 12px; overflow: auto; max-height: 75vh; min-height: 160px;
    /* simula uma cena do jogo: verde e marrom escuros com xadrez discreto (lembra o fundo transparente) */
    background:
      repeating-conic-gradient(rgb(255 255 255 / 4%) 0 25%, transparent 0 50%) 0 0 / 24px 24px,
      linear-gradient(135deg, #2e3b26, #4a3d2a 55%, #24301f);
  }
  .preview-box.bg-claro {
    background:
      repeating-conic-gradient(rgb(0 0 0 / 5%) 0 25%, transparent 0 50%) 0 0 / 24px 24px,
      linear-gradient(135deg, #c9d6b8, #e8dcc2 55%, #b9c7a6);
  }
  .steps { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
</style>
