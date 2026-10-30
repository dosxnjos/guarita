<script lang="ts">
  // Alertas de preço: ativa push neste aparelho, cria regra (item, qualidade, cidades, lado, condição) e lista/apaga.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import { currentSubId, disablePush, enablePush, forgetSubId, isSubGone, pushSupported } from '../lib/push';
  import { loadIndex } from '../lib/itemsClient';
  import { itemName as indexName, type ItemsIndex } from '../../shared/items';
  import { ALL_CITIES } from '../../shared/market';
  import { BM_CITY } from '../../shared/alertLimits';
  import type { AlertRule, City, Quality } from '../../shared/types';
  import {
    COOLDOWNS, MAX_RULES, citiesForSide, defaultForm, describeRule, kindForSide, ruleDetails, toRule, validate, type AlertFormState,
  } from '../lib/player/alertForm';
  import { fmtAgo, isIosUA, QUALITY_LABEL } from '../lib/player/format';
  import { parseQuality } from '../lib/format';
  import { DISCORD_INVITE } from '../lib/ui/links';
  import ItemPicker from '../lib/player/ItemPicker.svelte';
  import ItemIcon from '../lib/player/ItemIcon.svelte';

  // params não usado: item e qualidade iniciais vêm de ?item= e ?q= no endereço (botão "Criar alerta" do item)
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const startParams = (() => {
    try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); }
  })();
  const startItem = (startParams.get('item') ?? '').trim().toUpperCase();
  const startQuality = parseQuality(startParams.get('q'));

  // ---- ambiente do aparelho ----
  const supported = pushSupported();
  const ios = typeof navigator !== 'undefined' && isIosUA(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const standalone = (() => {
    try {
      return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    } catch { return false; }
  })();
  const permission = (() => {
    try { return typeof Notification !== 'undefined' ? Notification.permission : 'default'; } catch { return 'default'; }
  })();

  let subId = $state<string | null>(currentSubId());
  let enabling = $state(false);
  let pushError = $state<string | null>(null);
  /** O servidor não conhece mais a inscrição deste aparelho (expirou, falhou demais ou foi desativada em outro lugar). */
  let subLost = $state(false);

  /** Inscrição sumiu no servidor: esquece o id e volta a oferecer "Ativar". */
  function dropLocalSub() {
    forgetSubId();
    subId = null;
    rules = [];
    subLost = true;
  }

  // ---- regras deste aparelho ----
  let rules = $state<AlertRule[]>([]);
  let rulesLoading = $state(false);
  let rulesError = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let index = $state<ItemsIndex | null>(null);

  // ---- formulário ----
  let form = $state<AlertFormState>(defaultForm(startItem, startQuality));
  let pickerKey = $state(0);
  let tried = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saved = $state<string | null>(null);

  const errors = $derived(validate(form, rules.length));
  const canSubmit = $derived(!!subId && Object.keys(errors).length === 0 && !saving);
  const atLimit = $derived(rules.length >= MAX_RULES);

  async function loadRules(owner: string) {
    rulesLoading = true; rulesError = null;
    try {
      const r = await api.alerts(owner);
      rules = r.alerts ?? [];
    } catch (e) {
      if (isSubGone(e)) dropLocalSub();
      else rulesError = e instanceof Error ? e.message : String(e);
    } finally {
      rulesLoading = false;
    }
  }

  $effect(() => {
    if (subId) loadRules(subId);
  });

  // Com a permissão já dada, renova a inscrição em silêncio ao abrir a tela: se o navegador trocou o endpoint,
  // o servidor fica sabendo antes do próximo aviso (sem pedir nada ao usuário). Falhou: fica como estava.
  // Id novo = o servidor tinha perdido a inscrição antiga, e as regras dela foram junto: avisa (só "Ativar" limpa o aviso).
  $effect(() => {
    const before = currentSubId();
    if (!supported || !before || permission !== 'granted') return;
    enablePush()
      .then((id) => {
        if (id !== before) { subId = id; subLost = true; }
      })
      .catch(() => {});
  });

  $effect(() => {
    document.title = 'Alertas · Guarita';
    loadIndex().then((ix) => (index = ix)).catch(() => {});
  });

  async function activate() {
    enabling = true; pushError = null;
    try {
      subId = await enablePush();
      subLost = false;
    } catch (e) {
      pushError = e instanceof Error ? e.message : String(e);
    } finally {
      enabling = false;
    }
  }

  async function deactivate() {
    if (!confirm('Desativar os avisos neste aparelho? As regras dele param de avisar.')) return;
    pushError = null;
    try {
      await disablePush();
      subId = currentSubId();
      if (!subId) rules = [];
    } catch (e) {
      pushError = e instanceof Error ? e.message : String(e);
    }
  }

  function toggleCity(c: City, on: boolean) {
    form.cities = on ? [...new Set([...form.cities, c])] : form.cities.filter((x) => x !== c);
  }

  function setSide(side: 'sell' | 'buy') {
    form.side = side;
    form.kind = kindForSide(side, form.kind);
    // Comprar barato no Black Market não existe (ele só compra): desmarca.
    form.cities = citiesForSide(side, form.cities);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    tried = true; saved = null; saveError = null;
    if (!subId || Object.keys(errors).length) return;
    saving = true;
    try {
      const payload = toRule(form, subId);
      const rule = await api.createAlert(payload);
      saved = `Regra criada: ${describeRule(rule, nameFor(rule))}.`;
      form = defaultForm();
      pickerKey++;
      tried = false;
      await loadRules(subId);
    } catch (err) {
      if (isSubGone(err)) dropLocalSub();
      else saveError = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  async function remove(r: AlertRule) {
    if (!subId) return;
    deleting = r.id;
    try {
      await api.deleteAlert(subId, r.id);
      rules = rules.filter((x) => x.id !== r.id);
    } catch (e) {
      rulesError = e instanceof Error ? e.message : String(e);
    } finally {
      deleting = null;
    }
  }

  function nameFor(r: AlertRule): string {
    if (r.itemName) return r.itemName;
    if (index) {
      try { return indexName(index, r.itemId); } catch { /* cai no id */ }
    }
    return r.itemId;
  }

  const QUALITIES = Object.entries(QUALITY_LABEL).map(([q, l]) => ({ q: Number(q) as Quality, l }));
</script>

<section class="page stack">
  <header>
    <h1>Alertas de preço</h1>
    <p class="muted">A Guarita olha o mercado por você e avisa quando o preço chega onde você quer. Sem ficar apertando F5.</p>
  </header>

  <div class="grid">
    <div class="card">
      <h2 class="first">Neste navegador</h2>
      <p class="small">Uma notificação aparece no celular ou no computador, mesmo com a Guarita fechada. As regras ficam presas a este aparelho, sem conta nem login.</p>
    </div>
    <div class="card">
      <h2 class="first">No Discord</h2>
      {#if DISCORD_INVITE}
        <p class="small">Use o comando <code>/alerta criar</code> com o bot da Guarita e receba o aviso por mensagem direta. As regras do Discord são gerenciadas por lá.</p>
        <p class="small"><a href={DISCORD_INVITE} target="_blank" rel="noopener">Adicionar a Guarita ao meu servidor</a></p>
      {:else}
        <p class="small">O bot do Discord abre em breve. Até lá, os avisos chegam por notificação neste navegador.</p>
      {/if}
    </div>
  </div>

  <div class="callout warn small">
    Verificamos a cada 5 minutos. O preço vem de jogadores que usam o cliente do Albion Data Project, então pode demorar
    para aparecer, principalmente em item pouco negociado.
  </div>

  <!-- ativação do push -->
  <div class="card stack">
    <h2 class="first">Avisos neste aparelho</h2>
    {#if ios && !standalone}
      <div class="callout small">
        <strong>No iPhone e no iPad</strong>, as notificações só funcionam com a Guarita instalada na tela inicial: no Safari,
        toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra a Guarita pelo ícone e volte aqui.
      </div>
    {/if}

    {#if !supported}
      <p>Este navegador não aceita notificações da web{ios && !standalone ? ' fora do app instalado' : ''}. Use o Discord ou abra a Guarita no Chrome, Edge ou Firefox.</p>
    {:else if subId}
      {#if subLost}
        <p class="callout warn small" role="status">A inscrição deste aparelho tinha expirado no servidor e foi renovada. As regras antigas foram apagadas junto: crie de novo as que quiser.</p>
      {/if}
      <p class="row"><span class="tag good">Ativado</span> <span class="small">Este aparelho recebe os avisos das regras abaixo.</span></p>
      <div><button class="btn" type="button" onclick={deactivate}>Desativar avisos neste aparelho</button></div>
    {:else}
      {#if subLost}
        <p class="callout warn small" role="status">Os avisos deste aparelho foram desligados no servidor (a inscrição expirou ou parou de responder) e as regras dele foram apagadas. Ative de novo para voltar a receber.</p>
      {/if}
      {#if permission === 'denied'}
        <p class="callout warn small">As notificações da Guarita estão bloqueadas neste navegador. Libere nas configurações do site (ícone ao lado do endereço) e tente de novo.</p>
      {/if}
      <p class="small">O navegador vai pedir permissão para mostrar notificações. Só usamos isso para os alertas que você criar; dá para desativar a qualquer momento.</p>
      <div>
        <button class="btn primary" type="button" onclick={activate} disabled={enabling}>
          {enabling ? 'Ativando…' : 'Ativar avisos neste aparelho'}
        </button>
      </div>
    {/if}
    {#if pushError}<p class="callout warn small" role="alert">Não deu para mudar os avisos: {pushError}</p>{/if}
  </div>

  <!-- formulário -->
  <form class="card stack" onsubmit={submit} novalidate aria-labelledby="nova-regra">
    <h2 class="first" id="nova-regra">Nova regra</h2>
    {#if !subId}
      <p class="muted small">Ative os avisos neste aparelho para criar regras.</p>
    {:else if atLimit}
      <p class="callout warn small">Este aparelho já tem {MAX_RULES} regras, o limite. Apague uma para criar outra.</p>
    {/if}

    <fieldset class="stack" disabled={!subId || atLimit}>
      <div class="field">
        <label for="alerta-item">Item</label>
        {#key pickerKey}
          <ItemPicker inputId="alerta-item" bind:itemId={form.itemId} bind:itemName={form.itemName} invalid={tried && !!errors.item} />
        {/key}
        {#if tried && errors.item}<p class="err small">{errors.item}</p>{/if}
      </div>

      <div class="field">
        <label for="alerta-qualidade">Qualidade</label>
        <select id="alerta-qualidade" class="input" bind:value={form.quality}>
          {#each QUALITIES as o (o.q)}<option value={o.q}>{o.l}</option>{/each}
        </select>
      </div>

      <fieldset class="field">
        <legend>O que você quer fazer</legend>
        <div class="choices">
          <label class="choice"><input type="radio" name="lado" checked={form.side === 'sell'} onchange={() => setSide('sell')} />
            <span><strong>Comprar barato</strong><br /><span class="muted small">olha as ordens de venda</span></span></label>
          <label class="choice"><input type="radio" name="lado" checked={form.side === 'buy'} onchange={() => setSide('buy')} />
            <span><strong>Vender caro</strong><br /><span class="muted small">olha as ordens de compra</span></span></label>
        </div>
      </fieldset>

      <fieldset class="field">
        <legend>Cidades</legend>
        <div class="cities">
          {#each ALL_CITIES as c (c)}
            {@const bmLocked = c === BM_CITY && form.side === 'sell'}
            <label class="city" class:locked={bmLocked}>
              <input type="checkbox" checked={form.cities.includes(c)} disabled={bmLocked}
                aria-describedby={bmLocked ? 'bm-nota' : undefined} onchange={(e) => toggleCity(c, e.currentTarget.checked)} /> {c}
            </label>
          {/each}
        </div>
        {#if form.side === 'sell'}
          <p id="bm-nota" class="muted small">O Black Market só compra; ele aparece em “Vender caro”.</p>
        {/if}
        {#if tried && errors.cities}<p class="err small">{errors.cities}</p>{/if}
      </fieldset>

      <fieldset class="field">
        <legend>Quando avisar</legend>
        <div class="choices">
          <label class="choice"><input type="radio" name="cond" value="below" bind:group={form.kind} /> <span>Preço abaixo de</span></label>
          <label class="choice"><input type="radio" name="cond" value="above" bind:group={form.kind} /> <span>Preço acima de</span></label>
          <label class="choice"><input type="radio" name="cond" value="belowMedianPct" bind:group={form.kind} /> <span>% abaixo da mediana de 7 dias da cidade</span></label>
        </div>
        <div class="value">
          <label for="alerta-valor" class="visually-hidden">{form.kind === 'belowMedianPct' ? 'Porcentagem' : 'Preço em prata'}</label>
          <input id="alerta-valor" class="input num" inputmode={form.kind === 'belowMedianPct' ? 'decimal' : 'numeric'}
            placeholder={form.kind === 'belowMedianPct' ? 'Ex.: 20' : 'Ex.: 12.000'} bind:value={form.value}
            aria-invalid={tried && !!errors.value} />
          <span class="muted">{form.kind === 'belowMedianPct' ? '%' : 'prata'}</span>
        </div>
        {#if tried && errors.value}<p class="err small">{errors.value}</p>{/if}
      </fieldset>

      <div class="field">
        <label for="alerta-intervalo">Intervalo mínimo entre avisos</label>
        <select id="alerta-intervalo" class="input" bind:value={form.cooldownMin}>
          {#each COOLDOWNS as m (m)}<option value={m}>{m < 60 ? `${m} minutos` : `${m / 60} ${m === 60 ? 'hora' : 'horas'}`}</option>{/each}
        </select>
      </div>

      <div class="row">
        <button class="btn primary" type="submit" disabled={saving || (tried && !canSubmit)}>{saving ? 'Criando…' : 'Criar alerta'}</button>
        <span class="muted small">{rules.length} de {MAX_RULES} regras usadas</span>
      </div>
    </fieldset>
    {#if saveError}<p class="callout warn small" role="alert">Não deu para criar a regra: {saveError}</p>{/if}
    {#if saved}<p class="callout small" role="status">{saved}</p>{/if}
  </form>

  <!-- lista -->
  {#if subId}
    <div class="card stack">
      <h2 class="first">Regras deste aparelho</h2>
      {#if rulesLoading && !rules.length}
        {#each [0, 1] as i (i)}<div class="skeleton" style:height="48px"></div>{/each}
      {:else if rulesError}
        <div class="callout warn small" role="alert">
          Não deu para carregar as regras: {rulesError}
          <button class="btn" type="button" onclick={() => subId && loadRules(subId)}>Tentar de novo</button>
        </div>
      {:else if !rules.length}
        <p class="empty">Nenhuma regra ainda. Crie a primeira acima.</p>
      {:else}
        <ul class="rules">
          {#each rules as r (r.id)}
            <li>
              <ItemIcon id={r.itemId} quality={r.quality} alt="" size={36} />
              <div class="desc">
                <a href="/item/{encodeURIComponent(r.itemId)}" onclick={go}>{nameFor(r)}</a>
                <span class="small">{ruleDetails(r)}</span>
                <span class="muted small">{r.lastFiredAt ? `Último aviso ${fmtAgo(r.lastFiredAt)}` : 'Ainda não avisou'}</span>
              </div>
              <button class="btn" type="button" onclick={() => remove(r)} disabled={deleting === r.id} aria-label="Apagar a regra de {nameFor(r)}">
                {deleting === r.id ? 'Apagando…' : 'Apagar'}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  header p { margin: 0; }
  p { margin: 0; }
  h2.first { margin-top: 0; }
  code { font-family: var(--mono); background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  legend, .field > label { font-weight: 600; margin-bottom: 6px; padding: 0; display: block; }
  .field { min-width: 0; }
  .choices { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); }
  .choice { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
  .choice:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .choice input { margin-top: 4px; }
  .cities { display: grid; gap: 6px 12px; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); }
  .city { display: flex; gap: 6px; align-items: center; }
  .city.locked { color: var(--muted); }
  #bm-nota { margin-top: 6px; }
  .value { display: flex; gap: 8px; align-items: center; margin-top: 8px; max-width: 320px; }
  .value .input { flex: 1; min-width: 0; }
  .err { color: var(--bad); margin-top: 4px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .rules { list-style: none; margin: 0; padding: 0; display: grid; }
  .rules li { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); min-width: 0; }
  .rules li:last-child { border-bottom: 0; }
  .desc { flex: 1; min-width: 0; display: grid; overflow-wrap: anywhere; }
  fieldset:disabled { opacity: 0.6; }
</style>
