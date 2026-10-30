<script lang="ts">
  // "Quanto vale arriscar": monta o set, consulta o custo no AODP (POST /api/risk) e mostra o que se perde por zona.
  import { untrack } from 'svelte';
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import type { RiskQuote } from '../../shared/types';
  import { ZONE_RULES } from '../../shared/zones';
  import { QUALITIES, cityName, fmtDateTime, qualityName } from '../lib/format';
  import { itemHref } from '../lib/player/format';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  import ItemPicker from '../lib/player/ItemPicker.svelte';
  import ItemIcon from '../lib/player/ItemIcon.svelte';
  import Money from '../lib/ui/Money.svelte';
  import AgeDot from '../lib/ui/AgeDot.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import {
    MAX_PIECES, PRESETS, coverageText, loseLabel, loseTone, newPiece, parseSetParam, piecesSignature, presetPieces,
    presetText, readyPieces, setParam, zoneText, type Piece,
  } from '../lib/novato/arriscar';

  // params não usado: o set vive em ?set= no endereço (dá para compartilhar)
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const fromUrl = (() => {
    try { return parseSetParam(new URLSearchParams(location.search).get('set')); } catch { return []; }
  })();

  let pieces = $state<Piece[]>(fromUrl.length ? fromUrl : [newPiece()]);
  let quote = $state<RiskQuote | null>(null);
  let quoteSig = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let seq = 0;

  const ready = $derived(readyPieces(pieces));
  const currentSig = $derived(piecesSignature(ready));
  const outdated = $derived(quote != null && quoteSig !== currentSig);
  const names = $derived(new Map(pieces.filter((p) => p.itemId).map((p) => [p.itemId.toUpperCase(), p.itemName])));

  function addPiece() {
    if (pieces.length < MAX_PIECES) pieces.push(newPiece());
  }
  function removePiece(key: number) {
    pieces = pieces.filter((p) => p.key !== key);
    if (!pieces.length) pieces = [newPiece()];
  }
  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    pieces = presetPieces(p);
    quote = null;
    error = null;
    calc();
  }
  function clearAll() {
    pieces = [newPiece()];
    quote = null;
    error = null;
    saveUrl([]);
  }

  function saveUrl(items: { id: string; quality: 1 | 2 | 3 | 4 | 5 }[]) {
    try {
      const u = new URL(location.href);
      if (items.length) u.searchParams.set('set', setParam(items)); else u.searchParams.delete('set');
      history.replaceState(history.state, '', u.pathname + u.search);
    } catch { /* sem history: segue */ }
  }

  async function calc() {
    const items = readyPieces(pieces);
    if (!items.length) return;
    const my = ++seq;
    loading = true;
    error = null;
    saveUrl(items);
    try {
      const r = await api.risk(items);
      if (my !== seq) return;
      quote = r;
      quoteSig = piecesSignature(items);
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === seq) loading = false;
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    calc();
  }

  $effect(() => {
    // mesmo título de worker/seo.ts (FIXED_ROUTES e FIXED_ES)
    document.title = tx('Quanto vale arriscar · Guarita', 'Cuánto vale arriesgar · Guarita');
    // untrack: o cálculo lê as peças, e o efeito não pode rodar de novo a cada peça mudada
    if (fromUrl.length) untrack(() => calc());
  });
</script>

<section class="page stack">
  <header>
    <h1>{tx('Quanto vale arriscar', 'Cuánto vale arriesgar')}</h1>
    <p class="muted">{tx(
      'Monte o set que você pretende usar, veja quanto ele custa hoje no mercado e o que você perde se morrer em cada tipo de zona.',
      'Arma el set que piensas usar, mira cuánto cuesta hoy en el mercado y qué pierdes si mueres en cada tipo de zona.',
    )}</p>
  </header>

  <div class="card stack">
    <h2 class="h3">{tx('Começar de um exemplo', 'Empezar con un ejemplo')}</h2>
    <div class="presets">
      {#each PRESETS as p (p.id)}
        {@const pt = presetText(p, getLocale())}
        <button type="button" class="btn preset" onclick={() => applyPreset(p.id)}>
          <strong>{pt.label}</strong>
          <span class="muted small">{pt.hint}</span>
        </button>
      {/each}
    </div>
  </div>

  <form class="card stack" onsubmit={submit} aria-labelledby="set-titulo">
    <div class="section-head first">
      <h2 class="h3" id="set-titulo">{tx('Seu set', 'Tu set')}</h2>
      <span class="muted small">{tx(`${pieces.length} de ${MAX_PIECES} peças`, `${pieces.length} de ${MAX_PIECES} piezas`)}</span>
    </div>

    <ol class="pieces">
      {#each pieces as p, i (p.key)}
        <li class="piece">
          <div class="piece-item">
            <label class="small" for="peca-{p.key}">{tx(`Peça ${i + 1}`, `Pieza ${i + 1}`)}</label>
            <ItemPicker bind:itemId={p.itemId} bind:itemName={p.itemName} inputId="peca-{p.key}" />
          </div>
          <div class="piece-q">
            <label class="small" for="qual-{p.key}">{tx('Qualidade', 'Calidad')}</label>
            <select id="qual-{p.key}" class="input" bind:value={p.quality}>
              {#each QUALITIES as q (q)}<option value={q}>{qualityName(q)}</option>{/each}
            </select>
          </div>
          <button type="button" class="btn remove" onclick={() => removePiece(p.key)} aria-label={tx(`Remover a peça ${i + 1}`, `Quitar la pieza ${i + 1}`)}>{tx('Remover', 'Quitar')}</button>
        </li>
      {/each}
    </ol>

    <div class="row">
      <button type="button" class="btn" onclick={addPiece} disabled={pieces.length >= MAX_PIECES}>{tx('Adicionar peça', 'Agregar pieza')}</button>
      <button type="submit" class="btn primary" disabled={!ready.length || loading}>{loading ? tx('Calculando…', 'Calculando…') : tx('Calcular', 'Calcular')}</button>
      <button type="button" class="linkbtn small" onclick={clearAll}>{tx('Limpar', 'Limpiar')}</button>
    </div>
    {#if pieces.length >= MAX_PIECES}<p class="muted small">{tx(`Limite de ${MAX_PIECES} peças por cálculo.`, `Límite de ${MAX_PIECES} piezas por cálculo.`)}</p>{/if}
  </form>

  <div aria-live="polite" class="stack">
    {#if loading && !quote}
      <div class="card"><Loading lines={4} label={tx('Consultando os preços…', 'Consultando los precios…')} /></div>
    {:else if error}
      <ErrorBox title={tx('Não deu para calcular', 'No se pudo calcular')} message={error} onretry={calc} />
    {:else if quote}
      {#if outdated}
        {#if getLocale() === 'es'}
          <p class="callout warn small">Las piezas cambiaron después del último cálculo. Toca <strong>Calcular</strong> para actualizar.</p>
        {:else}
          <p class="callout warn small">As peças mudaram depois do último cálculo. Toque em <strong>Calcular</strong> para atualizar.</p>
        {/if}
      {/if}

      <div class="card stack">
        <div class="total">
          <span class="kpi-label">{tx('Custo do set hoje', 'Costo del set hoy')}</span>
          <span class="kpi"><Money value={quote.total || null} />{#if quote.total}<span class="kpi-unit">{tx('prata', 'plata')}</span>{/if}</span>
          <span class="muted small">{coverageText(quote)}</span>
        </div>
        <ul class="lines">
          {#each quote.items as it, i (i)}
            <li class="line">
              <ItemIcon id={it.id} quality={it.quality} alt="" size={40} />
              <span class="line-name">
                <a href={href(itemHref(it.id, it.quality))} onclick={go}>{names.get(it.id) || it.id}</a>
                <span class="muted small">{it.city
                  ? tx(`${qualityName(it.quality)} · mais barato em ${it.city}`, `${qualityName(it.quality)} · más barato en ${cityName(it.city)}`)
                  : qualityName(it.quality)}</span>
              </span>
              <span class="line-price">
                {#if it.price != null}
                  <Money value={it.price} />
                  <AgeDot min={it.ageMin} />
                {:else}
                  <span class="muted small">{tx('sem preço', 'sin precio')}</span>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
        <p class="muted small">{tx(
          `Menor preço de venda entre as cidades reais e Caerleon, na qualidade escolhida ou melhor, pelo Albion Online Data Project. Preço visto há muito tempo pode ter mudado. Consulta de ${fmtDateTime(quote.fetchedAt)} (horário de Brasília).`,
          `Precio de venta más bajo entre las ciudades reales y Caerleon, en la calidad elegida o mejor, según el Albion Online Data Project. Un precio visto hace mucho tiempo puede haber cambiado. Consulta del ${fmtDateTime(quote.fetchedAt)} (horario de Brasilia).`,
        )}</p>
      </div>

      <h2 class="section-head">{tx('O que você perde em cada zona', 'Qué pierdes en cada zona')}</h2>
      <div class="grid zones">
        {#each quote.zones as z (z.zone)}
          {@const zt = zoneText(z.zone, getLocale())}
          <article class="card zone zone-{loseTone(z.lose)}">
            <header class="zone-head">
              <h3 class="h4">{getLocale() === 'es' ? zt.label : z.labelPt}</h3>
              <span class="tag {loseTone(z.lose)}">{loseLabel(z.lose)}</span>
            </header>
            <p class="zone-amount">
              {#if z.lose === 'tudo'}
                <Money value={z.amount || null} />
                <span class="muted small">{z.amount ? tx('de prata em risco', 'de plata en riesgo') : tx('sem preço para estimar', 'sin precio para estimar')}</span>
              {:else}
                <span>{tx('Só o reparo', 'Solo la reparación')}</span>
              {/if}
            </p>
            <p class="small"><strong>{tx('Quem ataca:', 'Quién ataca:')}</strong> {zt.who}</p>
            <p class="small"><strong>{tx('Ao morrer:', 'Al morir:')}</strong> {zt.death}</p>
            <p class="muted small">{getLocale() === 'es' ? zt.note : z.note}</p>
          </article>
        {/each}
      </div>
    {:else}
      <div class="card stack">
        <h2 class="h3">{tx('Regras de perda por zona', 'Reglas de pérdida por zona')}</h2>
        <ul class="rules">
          {#each ZONE_RULES as r (r.zone)}
            {@const zt = zoneText(r.zone, getLocale())}
            <li><strong>{zt.label}:</strong> <span class="tag {loseTone(r.lose)}">{loseLabel(r.lose)}</span> {zt.death}</li>
          {/each}
        </ul>
        <p class="muted small">{tx(
          'Escolha as peças e toque em Calcular para ver o valor em risco em cada zona.',
          'Elige las piezas y toca Calcular para ver el valor en riesgo en cada zona.',
        )}</p>
      </div>
    {/if}
  </div>

  {#if getLocale() === 'es'}
    <p class="callout small">
      Las reglas resumen lo que el juego aplica hoy y pueden cambiar con las actualizaciones; revisa siempre el tipo de zona en el mapa antes de entrar.
      El valor en riesgo no incluye lo que llevas en la bolsa ni el costo de reparación.
      Lee también las <a href={href('/golpes')} onclick={go}>estafas más comunes</a> y el <a href={href('/glossario')} onclick={go}>glosario</a>.
    </p>
  {:else}
    <p class="callout small">
      As regras resumem o que o jogo aplica hoje e podem mudar com atualizações; confira sempre o tipo da zona no mapa antes de entrar.
      O valor em risco não inclui o que você carrega na bolsa nem o custo de reparo.
      Leia também os <a href={href('/golpes')} onclick={go}>golpes mais comuns</a> e o <a href={href('/glossario')} onclick={go}>glossário</a>.
    </p>
  {/if}
</section>

<style>
  header p { margin: 0; }
  .h3 { font-size: 18px; margin: 0; }
  .h4 { font-size: 16px; margin: 0; }
  .first { margin-top: 0; }
  .presets { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); }
  .preset { display: grid; gap: 2px; text-align: left; justify-items: start; padding: 10px 12px; white-space: normal; }
  .pieces { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .piece { display: grid; gap: 8px; grid-template-columns: 1fr; padding-bottom: 12px; border-bottom: 1px solid var(--line); min-width: 0; }
  .piece:last-child { border-bottom: 0; padding-bottom: 0; }
  .piece label { display: block; margin-bottom: 4px; color: var(--muted); }
  .piece-item { min-width: 0; }
  .remove { justify-self: start; }
  @media (min-width: 640px) {
    .piece { grid-template-columns: minmax(0, 1fr) 170px auto; align-items: start; }
    .remove { margin-top: 26px; }
  }
  .total { display: grid; gap: 2px; }
  .kpi-unit { margin-left: 6px; font-size: 15px; font-weight: 500; color: var(--muted); }
  .lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .line { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 10px; align-items: center; }
  .line-name { display: grid; min-width: 0; }
  .line-name a { overflow-wrap: anywhere; }
  .line-price { display: grid; justify-items: end; gap: 2px; text-align: right; }
  .zones { align-items: stretch; }
  .zone { display: grid; gap: 6px; align-content: start; border-top-width: 4px; }
  .zone-bad { border-top-color: var(--bad); }
  .zone-warn { border-top-color: var(--warn); }
  .zone-good { border-top-color: var(--good); }
  .zone-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .zone p { margin: 0; }
  .zone-amount { font-size: 20px; font-weight: 700; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .rules { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
  .callout a { color: var(--accent); }
</style>
