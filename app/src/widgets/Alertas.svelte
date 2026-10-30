<script lang="ts">
  // Widget "Alertas": regras de preço LOCAIS, checadas pelo app só enquanto ele está aberto (engine/alerts.ts, no
  // painel). Aqui se cria, lista, pausa e apaga regra e se vê os últimos avisos. Para avisar com o PC desligado
  // existem os alertas do site (notificação no celular) e do bot do Discord.
  import type { ItemHit } from '../../../shared/items';
  import type { City, Quality } from '../../../shared/types';
  import { onConfigChange, updateConfig, type GuaritaConfig, type RegraLocal } from '../lib/config';
  import { QUALITIES, cityName, fmtDateTime, qualityName } from '../lib/format';
  import { brasilia, getLocale, linkSite, tx } from '../lib/i18n.svelte';
  import { abrirLink } from '../lib/links';
  import {
    CIDADES_ALERTA, ESPERAS, INTERVALOS, detalhesRegra, formRegraPadrao, kindForSide, montarRegra, ultimosDisparos, validarFormRegra,
    type FormRegra,
  } from '../lib/ui-alertas';
  import { fmtAgo } from '../../../src/lib/player/format';
  import ItemBusca from '../ui/ItemBusca.svelte';

  const SITE_ALERTAS = linkSite('/alertas');

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
      erros = { form: tx('Não foi possível salvar a regra. Confira os campos.', 'No fue posible guardar la regla. Revisa los campos.') };
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
      const det = err instanceof Error ? err.message : String(err);
      erros = { form: tx(`Não foi possível salvar: ${det}`, `No fue posible guardar: ${det}`) };
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
    <summary class="small">{tx('Só checa com o app aberto', 'Solo revisa con la app abierta')}</summary>
    {#if getLocale() === 'es'}
      <p class="small m0">
        La app consulta los precios cada {cfg?.intervaloRegrasMin ?? 3} minutos mientras está abierta y avisa con notificación de Windows y voz.
        Si cierras la app, se detiene: nada queda funcionando en la computadora. Para recibir avisos con la PC apagada, usa las
        <a href={SITE_ALERTAS} onclick={(e) => abrirLink(e, SITE_ALERTAS)}>alertas del sitio</a> (notificación en el celular) o el bot de Discord.
      </p>
    {:else}
      <p class="small m0">
        O app consulta os preços a cada {cfg?.intervaloRegrasMin ?? 3} minutos enquanto está aberto e avisa com notificação do Windows e voz.
        Fechou o app, parou: nada fica rodando no computador. Para ser avisado com o PC desligado, use os
        <a href={SITE_ALERTAS} onclick={(e) => abrirLink(e, SITE_ALERTAS)}>alertas do site</a> (notificação no celular) ou o bot do Discord.
      </p>
    {/if}
  </details>

  {#if semSaida}
    <p class="callout warn small m0">{tx('A notificação e a voz estão desligadas no painel: as regras checam, mas ninguém vai ouvir o aviso.', 'La notificación y la voz están desactivadas en el panel: las reglas se revisan, pero nadie va a recibir el aviso.')}</p>
  {/if}
  {#if erroGeral}<p class="callout bad small m0" role="alert">{erroGeral}</p>{/if}

  {#if criando}
    <form class="stack form" onsubmit={salvar} novalidate>
      <div class="stack campo">
        <span class="rot">{tx('Item', 'Objeto')}</span>
        {#if f.itemId}
          <div class="row escolhido">
            <strong title={f.itemId}>{f.itemName || f.itemId}</strong>
            <button type="button" class="linkbtn small" onclick={() => ((f.itemId = ''), (f.itemName = ''))}>{tx('trocar', 'cambiar')}</button>
          </div>
        {:else}
          <ItemBusca onselect={escolherItem} autofocus label={tx('Item da regra', 'Objeto de la regla')} placeholder={tx('Buscar item', 'Buscar objeto')} />
        {/if}
        {#if erros.item}<span class="small bad-text">{erros.item}</span>{/if}
      </div>

      <div class="duas">
        <label class="stack campo">
          <span class="rot">{tx('Qualidade', 'Calidad')}</span>
          <select class="input" bind:value={f.quality}>
            {#each QUALITIES as q (q)}<option value={q as Quality}>{qualityName(q)}</option>{/each}
          </select>
        </label>
        <label class="stack campo">
          <span class="rot">{tx('Avisar no máximo', 'Avisar como máximo')}</span>
          <select class="input" bind:value={f.cooldownMin}>
            {#each ESPERAS as m (m)}<option value={m}>{tx('1 vez a cada', '1 vez cada')} {m < 60 ? `${m} min` : `${m / 60} h`}</option>{/each}
          </select>
        </label>
      </div>

      <fieldset class="campo">
        <legend class="rot">{tx('Quero', 'Quiero')}</legend>
        <div class="seg">
          <button type="button" aria-pressed={f.side === 'sell'} onclick={() => mudarLado('sell')}>{tx('Comprar barato', 'Comprar barato')}</button>
          <button type="button" aria-pressed={f.side === 'buy'} onclick={() => mudarLado('buy')}>{tx('Vender caro', 'Vender caro')}</button>
        </div>
      </fieldset>

      <div class="duas">
        <label class="stack campo">
          <span class="rot">{tx('Quando o preço ficar', 'Cuando el precio quede')}</span>
          <select class="input" bind:value={f.kind}>
            <option value="below">{tx('abaixo de', 'por debajo de')}</option>
            <option value="above">{tx('acima de', 'por encima de')}</option>
            <option value="belowMedianPct">{tx('% abaixo da mediana', '% por debajo de la mediana')}</option>
          </select>
        </label>
        <label class="stack campo">
          <span class="rot">{f.kind === 'belowMedianPct' ? tx('Porcentagem', 'Porcentaje') : tx('Prata', 'Plata')}</span>
          <input class="input" inputmode="numeric" bind:value={f.valor} placeholder={f.kind === 'belowMedianPct' ? tx('Ex.: 15', 'Ej.: 15') : tx('Ex.: 12.000', 'Ej.: 12,000')} />
        </label>
      </div>
      {#if erros.valor}<span class="small bad-text">{erros.valor}</span>{/if}

      <fieldset class="campo">
        <legend class="rot">{tx('Cidades', 'Ciudades')}</legend>
        <div class="cidades">
          {#each CIDADES_ALERTA as c (c)}
            {@const bloqueada = c === 'Black Market' && f.side === 'sell'}
            <label class="check chk" class:muted={bloqueada} title={bloqueada ? tx('O Black Market só compra: vale para "Vender caro".', 'El Mercado Negro solo compra: sirve para "Vender caro".') : undefined}>
              <input type="checkbox" checked={f.cities.includes(c) && !bloqueada} disabled={bloqueada} onchange={(e) => alternarCidade(c, e.currentTarget.checked)} />
              <span class="small">{cityName(c)}</span>
            </label>
          {/each}
        </div>
        {#if erros.cities}<span class="small bad-text">{erros.cities}</span>{/if}
      </fieldset>

      <label class="check chk"><input type="checkbox" bind:checked={f.voz} /><span class="small">{tx('Falar o aviso em voz alta', 'Leer el aviso en voz alta')}</span></label>

      {#if erros.form}<p class="callout bad small m0" role="alert">{erros.form}</p>{/if}
      <div class="row">
        <button type="submit" class="btn primary mini-btn" disabled={salvando}>{tx('Salvar regra', 'Guardar regla')}</button>
        <button type="button" class="btn mini-btn" onclick={() => ((criando = false), (erros = {}))}>{tx('Cancelar', 'Cancelar')}</button>
      </div>
    </form>
  {:else}
    <div class="row topo">
      <button type="button" class="btn primary mini-btn" onclick={() => ((criando = true), (f = formRegraPadrao()))}>{tx('Nova regra', 'Nueva regla')}</button>
      <label class="row small intervalo">
        <span class="muted">{tx('Checar a cada', 'Revisar cada')}</span>
        <select class="input sel" value={cfg?.intervaloRegrasMin ?? 3} onchange={(e) => mudarIntervalo(Number(e.currentTarget.value))}>
          {#each INTERVALOS as m (m)}<option value={m}>{m} min</option>{/each}
        </select>
      </label>
    </div>

    {#if regras.length}
      <ul class="plain-list regras" aria-label={tx('Regras', 'Reglas')}>
        {#each regras as r (r.id)}
          <li class="regra" class:pausada={!r.ativa}>
            <div class="regra-cab">
              <strong class="regra-nome" title={r.itemId}>{r.itemName || r.itemId}</strong>
              <span class="row">
                <label class="check chk" title={tx('Regra ligada', 'Regla activada')}>
                  <input type="checkbox" checked={r.ativa} onchange={(e) => mudarRegra(r.id, (x) => (x.ativa = e.currentTarget.checked))} />
                  <span class="small">{r.ativa ? tx('Ligada', 'Activada') : tx('Pausada', 'Pausada')}</span>
                </label>
                <label class="check chk" title={tx('Falar o aviso em voz alta', 'Leer el aviso en voz alta')}>
                  <input type="checkbox" checked={r.voz} onchange={(e) => mudarRegra(r.id, (x) => (x.voz = e.currentTarget.checked))} />
                  <span class="small">{tx('Voz', 'Voz')}</span>
                </label>
              </span>
            </div>
            <p class="small muted m0">{detalhesRegra(r)}</p>
            <div class="row regra-pe">
              <span class="small muted">{r.lastFiredAt ? tx(`Último aviso ${fmtAgo(r.lastFiredAt)}`, `Último aviso ${fmtAgo(r.lastFiredAt)}`) : tx('Ainda não avisou', 'Todavía no avisó')}</span>
              {#if apagar === r.id}
                <span class="row">
                  <button type="button" class="btn mini-btn perigo" onclick={() => confirmarApagar(r.id)}>{tx('Apagar', 'Borrar')}</button>
                  <button type="button" class="btn mini-btn" onclick={() => (apagar = null)}>{tx('Manter', 'Conservar')}</button>
                </span>
              {:else}
                <button type="button" class="linkbtn small" onclick={() => (apagar = r.id)}>{tx('Apagar', 'Borrar')}</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small muted m0">{tx('Nenhuma regra ainda. Crie uma para ser avisado quando um item ficar barato ou caro.', 'Todavía no hay reglas. Crea una para recibir un aviso cuando un objeto esté barato o caro.')}</p>
    {/if}

    {#if disparos.length}
      <section class="stack ultimos" aria-label={tx('Últimos avisos', 'Últimos avisos')}>
        <span class="kpi-label">{tx('Últimos avisos', 'Últimos avisos')}</span>
        <ul class="plain-list">
          {#each disparos as d (d.regraId + d.quando)}
            <li class="small">
              <span>{d.mensagem}</span>
              <span class="muted" title="{fmtDateTime(d.quando)} ({brasilia()})"> · {fmtAgo(d.quando)}</span>
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
