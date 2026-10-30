<script lang="ts">
  // Widget "Alertas": regras de preço LOCAIS, checadas pelo app só enquanto ele está aberto (engine/alerts.ts, no
  // painel). Aqui se cria, lista, pausa e apaga regra e se vê os últimos avisos. Para avisar com o PC desligado
  // existem os alertas do site (notificação no celular) e do bot do Discord.
  import type { ItemHit } from '../../../shared/items';
  import type { City, Quality } from '../../../shared/types';
  import { onConfigChange, updateConfig, type GuaritaConfig, type RegraLocal } from '../lib/config';
  import { QUALITIES, QUALITY_LABEL, fmtDateTime } from '../lib/format';
  import { abrirLink } from '../lib/links';
  import {
    CIDADES_ALERTA, ESPERAS, INTERVALOS, detalhesRegra, formRegraPadrao, kindForSide, montarRegra, ultimosDisparos, validarFormRegra,
    type FormRegra,
  } from '../lib/ui-alertas';
  import { fmtAgo } from '../../../src/lib/player/format';
  import ItemBusca from '../ui/ItemBusca.svelte';

  const SITE_ALERTAS = 'https://guarita.pages.dev/alertas';

  let cfg = $state<GuaritaConfig | null>(null);
  $effect(() => onConfigChange((c) => (cfg = c)));

  let criando = $state(false);
  let f = $state<FormRegra>(formRegraPadrao());
  let erros = $state<Record<string, string>>({});
  let salvando = $state(false);
  let apagar = $state<string | null>(null);
  let erroGeral = $state('');

  const regras = $derived(cfg?.regras ?? []);
  const disparos = $derived(cfg ? ultimosDisparos(cfg.disparos, cfg.regras, 5) : []);
  const semSaida = $derived(!!cfg && !cfg.avisos.notificacao && !cfg.voz.ligada);

  function escolherItem(hit: ItemHit) {
    f.itemId = hit.id;
    f.itemName = hit.pt;
    erros = { ...erros, item: '' };
  }

  function mudarLado(side: 'sell' | 'buy') {
    f.side = side;
    f.kind = kindForSide(side, f.kind);
  }

  function alternarCidade(c: City, on: boolean) {
    f.cities = on ? [...f.cities, c] : f.cities.filter((x) => x !== c);
  }

  async function salvar(e: SubmitEvent) {
    e.preventDefault();
    erros = validarFormRegra(f, regras.length);
    if (Object.values(erros).some(Boolean)) return;
    const regra = montarRegra(f);
    if (!regra) {
      erros = { form: 'Não foi possível salvar a regra. Confira os campos.' };
      return;
    }
    salvando = true;
    try {
      await updateConfig((c) => {
        c.regras = [regra, ...c.regras];
      });
      f = formRegraPadrao();
      criando = false;
    } catch (err) {
      erros = { form: `Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      salvando = false;
    }
  }

  async function mudarRegra(id: string, fn: (r: RegraLocal) => void) {
    erroGeral = '';
    try {
      await updateConfig((c) => {
        const r = c.regras.find((x) => x.id === id);
        if (r) fn(r);
      });
    } catch (err) {
      erroGeral = err instanceof Error ? err.message : String(err);
    }
  }

  async function confirmarApagar(id: string) {
    apagar = null;
    erroGeral = '';
    try {
      await updateConfig((c) => {
        c.regras = c.regras.filter((r) => r.id !== id);
      });
    } catch (err) {
      erroGeral = err instanceof Error ? err.message : String(err);
    }
  }

  async function mudarIntervalo(min: number) {
    await updateConfig((c) => {
      c.intervaloRegrasMin = min;
    });
  }
</script>

<div class="alertas stack">
  <details class="explica">
    <summary class="small">Só checa com o app aberto</summary>
    <p class="small m0">
      O app consulta os preços a cada {cfg?.intervaloRegrasMin ?? 3} minutos enquanto está aberto e avisa com notificação do Windows e voz.
      Fechou o app, parou: nada fica rodando no computador. Para ser avisado com o PC desligado, use os
      <a href={SITE_ALERTAS} onclick={(e) => abrirLink(e, SITE_ALERTAS)}>alertas do site</a> (notificação no celular) ou o bot do Discord.
    </p>
  </details>

  {#if semSaida}
    <p class="callout warn small m0">A notificação e a voz estão desligadas no painel: as regras checam, mas ninguém vai ouvir o aviso.</p>
  {/if}
  {#if erroGeral}<p class="callout bad small m0" role="alert">{erroGeral}</p>{/if}

  {#if criando}
    <form class="stack form" onsubmit={salvar} novalidate>
      <div class="stack campo">
        <span class="rot">Item</span>
        {#if f.itemId}
          <div class="row escolhido">
            <strong title={f.itemId}>{f.itemName || f.itemId}</strong>
            <button type="button" class="linkbtn small" onclick={() => ((f.itemId = ''), (f.itemName = ''))}>trocar</button>
          </div>
        {:else}
          <ItemBusca onselect={escolherItem} autofocus label="Item da regra" placeholder="Buscar item" />
        {/if}
        {#if erros.item}<span class="small bad-text">{erros.item}</span>{/if}
      </div>

      <div class="duas">
        <label class="stack campo">
          <span class="rot">Qualidade</span>
          <select class="input" bind:value={f.quality}>
            {#each QUALITIES as q (q)}<option value={q as Quality}>{QUALITY_LABEL[q]}</option>{/each}
          </select>
        </label>
        <label class="stack campo">
          <span class="rot">Avisar no máximo</span>
          <select class="input" bind:value={f.cooldownMin}>
            {#each ESPERAS as m (m)}<option value={m}>1 vez a cada {m < 60 ? `${m} min` : `${m / 60} h`}</option>{/each}
          </select>
        </label>
      </div>

      <fieldset class="campo">
        <legend class="rot">Quero</legend>
        <div class="seg">
          <button type="button" aria-pressed={f.side === 'sell'} onclick={() => mudarLado('sell')}>Comprar barato</button>
          <button type="button" aria-pressed={f.side === 'buy'} onclick={() => mudarLado('buy')}>Vender caro</button>
        </div>
      </fieldset>

      <div class="duas">
        <label class="stack campo">
          <span class="rot">Quando o preço ficar</span>
          <select class="input" bind:value={f.kind}>
            <option value="below">abaixo de</option>
            <option value="above">acima de</option>
            <option value="belowMedianPct">% abaixo da mediana</option>
          </select>
        </label>
        <label class="stack campo">
          <span class="rot">{f.kind === 'belowMedianPct' ? 'Porcentagem' : 'Prata'}</span>
          <input class="input" inputmode="numeric" bind:value={f.valor} placeholder={f.kind === 'belowMedianPct' ? 'Ex.: 15' : 'Ex.: 12.000'} />
        </label>
      </div>
      {#if erros.valor}<span class="small bad-text">{erros.valor}</span>{/if}

      <fieldset class="campo">
        <legend class="rot">Cidades</legend>
        <div class="cidades">
          {#each CIDADES_ALERTA as c (c)}
            {@const bloqueada = c === 'Black Market' && f.side === 'sell'}
            <label class="check chk" class:muted={bloqueada} title={bloqueada ? 'O Black Market só compra: vale para "Vender caro".' : undefined}>
              <input type="checkbox" checked={f.cities.includes(c) && !bloqueada} disabled={bloqueada} onchange={(e) => alternarCidade(c, e.currentTarget.checked)} />
              <span class="small">{c}</span>
            </label>
          {/each}
        </div>
        {#if erros.cities}<span class="small bad-text">{erros.cities}</span>{/if}
      </fieldset>

      <label class="check chk"><input type="checkbox" bind:checked={f.voz} /><span class="small">Falar o aviso em voz alta</span></label>

      {#if erros.form}<p class="callout bad small m0" role="alert">{erros.form}</p>{/if}
      <div class="row">
        <button type="submit" class="btn primary mini-btn" disabled={salvando}>Salvar regra</button>
        <button type="button" class="btn mini-btn" onclick={() => ((criando = false), (erros = {}))}>Cancelar</button>
      </div>
    </form>
  {:else}
    <div class="row topo">
      <button type="button" class="btn primary mini-btn" onclick={() => ((criando = true), (f = formRegraPadrao()))}>Nova regra</button>
      <label class="row small intervalo">
        <span class="muted">Checar a cada</span>
        <select class="input sel" value={cfg?.intervaloRegrasMin ?? 3} onchange={(e) => mudarIntervalo(Number(e.currentTarget.value))}>
          {#each INTERVALOS as m (m)}<option value={m}>{m} min</option>{/each}
        </select>
      </label>
    </div>

    {#if regras.length}
      <ul class="plain-list regras" aria-label="Regras">
        {#each regras as r (r.id)}
          <li class="regra" class:pausada={!r.ativa}>
            <div class="regra-cab">
              <strong class="regra-nome" title={r.itemId}>{r.itemName || r.itemId}</strong>
              <span class="row">
                <label class="check chk" title="Regra ligada">
                  <input type="checkbox" checked={r.ativa} onchange={(e) => mudarRegra(r.id, (x) => (x.ativa = e.currentTarget.checked))} />
                  <span class="small">{r.ativa ? 'Ligada' : 'Pausada'}</span>
                </label>
                <label class="check chk" title="Falar o aviso em voz alta">
                  <input type="checkbox" checked={r.voz} onchange={(e) => mudarRegra(r.id, (x) => (x.voz = e.currentTarget.checked))} />
                  <span class="small">Voz</span>
                </label>
              </span>
            </div>
            <p class="small muted m0">{detalhesRegra(r)}</p>
            <div class="row regra-pe">
              <span class="small muted">{r.lastFiredAt ? `Último aviso ${fmtAgo(r.lastFiredAt)}` : 'Ainda não avisou'}</span>
              {#if apagar === r.id}
                <span class="row">
                  <button type="button" class="btn mini-btn perigo" onclick={() => confirmarApagar(r.id)}>Apagar</button>
                  <button type="button" class="btn mini-btn" onclick={() => (apagar = null)}>Manter</button>
                </span>
              {:else}
                <button type="button" class="linkbtn small" onclick={() => (apagar = r.id)}>Apagar</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small muted m0">Nenhuma regra ainda. Crie uma para ser avisado quando um item ficar barato ou caro.</p>
    {/if}

    {#if disparos.length}
      <section class="stack ultimos" aria-label="Últimos avisos">
        <span class="kpi-label">Últimos avisos</span>
        <ul class="plain-list">
          {#each disparos as d (d.regraId + d.quando)}
            <li class="small">
              <span>{d.mensagem}</span>
              <span class="muted" title="{fmtDateTime(d.quando)} (Brasília)"> · {fmtAgo(d.quando)}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</div>

<style>
  .alertas { gap: 10px; }
  .m0 { margin: 0; }
  .explica summary { cursor: pointer; color: var(--muted); }
  .explica p { margin-top: 6px; }
  .topo { justify-content: space-between; }
  .intervalo { gap: 6px; }
  .sel { width: auto; padding: 4px 8px; font-size: 13px; }
  .mini-btn { padding: 4px 10px; font-size: 13px; }
  .perigo { border-color: var(--bad); color: var(--bad); }
  .form { gap: 8px; }
  .campo { gap: 4px; border: 0; padding: 0; margin: 0; min-width: 0; }
  .rot { font-size: 13px; font-weight: 600; padding: 0; }
  .form .input { padding: 6px 8px; font-size: 14px; }
  .duas { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
  .escolhido { gap: 8px; }
  .seg button { font-size: 13px; padding: 4px 10px; }
  .cidades { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 2px 8px; }
  .check.chk { gap: 6px; align-items: center; }
  .check.chk input { width: 15px; height: 15px; margin: 0; }
  .regra { display: grid; gap: 2px; }
  .regra.pausada .regra-nome { color: var(--muted); }
  .regra-cab { display: flex; justify-content: space-between; gap: 8px; align-items: center; flex-wrap: wrap; }
  .regra-nome { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .regra-pe { justify-content: space-between; }
  .ultimos { gap: 2px; }
  .ultimos .plain-list > li { padding: 4px 0; }
</style>
