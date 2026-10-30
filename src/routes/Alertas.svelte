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
  import { cityName, fmtAge, fmtInt, parseQuality, qualityName } from '../lib/format';
  import { minutesSinceIso } from '../lib/ui/time';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
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

  // Em espanhol "12,000" é milhar: parseNumberBR de alertForm.ts recebe a língua (validate e toRule repassam).
  const errors = $derived(validate(form, rules.length, getLocale()));
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
    document.title = tx('Alertas · Guarita', 'Alertas · Guarita');
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
    if (!confirm(tx(
      'Desativar os avisos neste aparelho? As regras dele param de avisar.',
      '¿Desactivar los avisos en este dispositivo? Las reglas de este dispositivo dejarán de avisar.',
    ))) return;
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
      const payload = toRule(form, subId, getLocale());
      const rule = await api.createAlert(payload);
      saved = tx(
        `Regra criada: ${describeRule(rule, nameFor(rule), 'pt')}.`,
        `Regla creada: ${describeRule(rule, nameFor(rule), 'es')}.`,
      );
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

  const QUALITIES = $derived(Object.keys(QUALITY_LABEL).map((q) => ({ q: Number(q) as Quality, l: qualityName(Number(q) as Quality, getLocale()) })));

  /** "Último aviso há 5 min": o português segue o fmtAgo de sempre; o espanhol usa o fmtAge de format.ts. */
  function lastFiredText(r: AlertRule): string {
    if (!r.lastFiredAt) return tx('Ainda não avisou', 'Todavía no avisó');
    return tx(`Último aviso ${fmtAgo(r.lastFiredAt)}`, `Último aviso ${fmtAge(minutesSinceIso(r.lastFiredAt), 'es')}`);
  }
</script>

<section class="page stack">
  <header>
    <h1>{tx('Alertas de preço', 'Alertas de precio')}</h1>
    <p class="muted">{tx(
      'A Guarita olha o mercado por você e avisa quando o preço chega onde você quer. Sem ficar apertando F5.',
      'La Guarita vigila el mercado por ti y te avisa cuando el precio llega a donde quieres. Sin estar presionando F5.',
    )}</p>
  </header>

  <div class="grid">
    <div class="card">
      <h2 class="first">{tx('Neste navegador', 'En este navegador')}</h2>
      <p class="small">{tx(
        'Uma notificação aparece no celular ou no computador, mesmo com a Guarita fechada. As regras ficam presas a este aparelho, sem conta nem login.',
        'Aparece una notificación en el celular o en la computadora, incluso con la Guarita cerrada. Las reglas quedan ligadas a este dispositivo, sin cuenta ni inicio de sesión.',
      )}</p>
    </div>
    <div class="card">
      <h2 class="first">{tx('No Discord', 'En Discord')}</h2>
      {#if DISCORD_INVITE}
        {#if getLocale() === 'es'}
          <p class="small">Usa el comando <code>/alerta crear</code> con el bot de la Guarita y recibe el aviso por mensaje directo. Las reglas de Discord se administran allí.</p>
        {:else}
          <p class="small">Use o comando <code>/alerta criar</code> com o bot da Guarita e receba o aviso por mensagem direta. As regras do Discord são gerenciadas por lá.</p>
        {/if}
        <p class="small"><a href={DISCORD_INVITE} target="_blank" rel="noopener">{tx('Adicionar a Guarita ao meu servidor', 'Agregar la Guarita a mi servidor')}</a></p>
      {:else}
        <p class="small">{tx(
          'O bot do Discord abre em breve. Até lá, os avisos chegam por notificação neste navegador.',
          'El bot de Discord llegará pronto. Mientras tanto, los avisos llegan por notificación en este navegador.',
        )}</p>
      {/if}
    </div>
  </div>

  <div class="callout warn small">
    {#if getLocale() === 'es'}
      Revisamos cada 5 minutos. El precio viene de jugadores que usan el cliente del Albion Data Project, así que puede tardar
      en aparecer, sobre todo en objetos poco comerciados.
    {:else}
      Verificamos a cada 5 minutos. O preço vem de jogadores que usam o cliente do Albion Data Project, então pode demorar
      para aparecer, principalmente em item pouco negociado.
    {/if}
  </div>

  <!-- ativação do push -->
  <div class="card stack">
    <h2 class="first">{tx('Avisos neste aparelho', 'Avisos en este dispositivo')}</h2>
    {#if ios && !standalone}
      <div class="callout small">
        {#if getLocale() === 'es'}
          <strong>En iPhone y iPad</strong>, las notificaciones solo funcionan con la Guarita instalada en la pantalla de inicio: en Safari,
          toca Compartir y luego “Agregar a inicio”. Abre la Guarita desde el ícono y vuelve aquí.
        {:else}
          <strong>No iPhone e no iPad</strong>, as notificações só funcionam com a Guarita instalada na tela inicial: no Safari,
          toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra a Guarita pelo ícone e volte aqui.
        {/if}
      </div>
    {/if}

    {#if !supported}
      <p>{tx(
        `Este navegador não aceita notificações da web${ios && !standalone ? ' fora do app instalado' : ''}. Use o Discord ou abra a Guarita no Chrome, Edge ou Firefox.`,
        `Este navegador no acepta notificaciones web${ios && !standalone ? ' fuera de la app instalada' : ''}. Usa Discord o abre la Guarita en Chrome, Edge o Firefox.`,
      )}</p>
    {:else if subId}
      {#if subLost}
        <p class="callout warn small" role="status">{tx(
          'A inscrição deste aparelho tinha expirado no servidor e foi renovada. As regras antigas foram apagadas junto: crie de novo as que quiser.',
          'La suscripción de este dispositivo había vencido en el servidor y se renovó. Las reglas anteriores se borraron con ella: vuelve a crear las que quieras.',
        )}</p>
      {/if}
      <p class="row"><span class="tag good">{tx('Ativado', 'Activado')}</span> <span class="small">{tx('Este aparelho recebe os avisos das regras abaixo.', 'Este dispositivo recibe los avisos de las reglas de abajo.')}</span></p>
      <div><button class="btn" type="button" onclick={deactivate}>{tx('Desativar avisos neste aparelho', 'Desactivar avisos en este dispositivo')}</button></div>
    {:else}
      {#if subLost}
        <p class="callout warn small" role="status">{tx(
          'Os avisos deste aparelho foram desligados no servidor (a inscrição expirou ou parou de responder) e as regras dele foram apagadas. Ative de novo para voltar a receber.',
          'Los avisos de este dispositivo se desactivaron en el servidor (la suscripción venció o dejó de responder) y sus reglas se borraron. Actívalos de nuevo para volver a recibirlos.',
        )}</p>
      {/if}
      {#if permission === 'denied'}
        <p class="callout warn small">{tx(
          'As notificações da Guarita estão bloqueadas neste navegador. Libere nas configurações do site (ícone ao lado do endereço) e tente de novo.',
          'Las notificaciones de la Guarita están bloqueadas en este navegador. Permítelas en la configuración del sitio (ícono junto a la dirección) e intenta de nuevo.',
        )}</p>
      {/if}
      <p class="small">{tx(
        'O navegador vai pedir permissão para mostrar notificações. Só usamos isso para os alertas que você criar; dá para desativar a qualquer momento.',
        'El navegador te pedirá permiso para mostrar notificaciones. Solo lo usamos para las alertas que crees; puedes desactivarlas en cualquier momento.',
      )}</p>
      <div>
        <button class="btn primary" type="button" onclick={activate} disabled={enabling}>
          {enabling ? tx('Ativando…', 'Activando…') : tx('Ativar avisos neste aparelho', 'Activar avisos en este dispositivo')}
        </button>
      </div>
    {/if}
    {#if pushError}<p class="callout warn small" role="alert">{tx('Não deu para mudar os avisos', 'No se pudieron cambiar los avisos')}: {pushError}</p>{/if}
  </div>

  <!-- formulário -->
  <form class="card stack" onsubmit={submit} novalidate aria-labelledby="nova-regra">
    <h2 class="first" id="nova-regra">{tx('Nova regra', 'Nueva regla')}</h2>
    {#if !subId}
      <p class="muted small">{tx('Ative os avisos neste aparelho para criar regras.', 'Activa los avisos en este dispositivo para crear reglas.')}</p>
    {:else if atLimit}
      <p class="callout warn small">{tx(
        `Este aparelho já tem ${MAX_RULES} regras, o limite. Apague uma para criar outra.`,
        `Este dispositivo ya tiene ${MAX_RULES} reglas, el límite. Borra una para crear otra.`,
      )}</p>
    {/if}

    <fieldset class="stack" disabled={!subId || atLimit}>
      <div class="field">
        <label for="alerta-item">{tx('Item', 'Objeto')}</label>
        {#key pickerKey}
          <ItemPicker inputId="alerta-item" bind:itemId={form.itemId} bind:itemName={form.itemName} invalid={tried && !!errors.item} />
        {/key}
        {#if tried && errors.item}<p class="err small">{errors.item}</p>{/if}
      </div>

      <div class="field">
        <label for="alerta-qualidade">{tx('Qualidade', 'Calidad')}</label>
        <select id="alerta-qualidade" class="input" bind:value={form.quality}>
          {#each QUALITIES as o (o.q)}<option value={o.q}>{o.l}</option>{/each}
        </select>
      </div>

      <fieldset class="field">
        <legend>{tx('O que você quer fazer', 'Qué quieres hacer')}</legend>
        <div class="choices">
          <label class="choice"><input type="radio" name="lado" checked={form.side === 'sell'} onchange={() => setSide('sell')} />
            <span><strong>{tx('Comprar barato', 'Comprar barato')}</strong><br /><span class="muted small">{tx('olha as ordens de venda', 'mira las órdenes de venta')}</span></span></label>
          <label class="choice"><input type="radio" name="lado" checked={form.side === 'buy'} onchange={() => setSide('buy')} />
            <span><strong>{tx('Vender caro', 'Vender caro')}</strong><br /><span class="muted small">{tx('olha as ordens de compra', 'mira las órdenes de compra')}</span></span></label>
        </div>
      </fieldset>

      <fieldset class="field">
        <legend>{tx('Cidades', 'Ciudades')}</legend>
        <div class="cities">
          {#each ALL_CITIES as c (c)}
            {@const bmLocked = c === BM_CITY && form.side === 'sell'}
            <label class="city" class:locked={bmLocked}>
              <input type="checkbox" checked={form.cities.includes(c)} disabled={bmLocked}
                aria-describedby={bmLocked ? 'bm-nota' : undefined} onchange={(e) => toggleCity(c, e.currentTarget.checked)} /> {cityName(c, getLocale())}
            </label>
          {/each}
        </div>
        {#if form.side === 'sell'}
          <p id="bm-nota" class="muted small">{tx('O Black Market só compra; ele aparece em “Vender caro”.', 'El Mercado Negro solo compra; aparece en “Vender caro”.')}</p>
        {/if}
        {#if tried && errors.cities}<p class="err small">{errors.cities}</p>{/if}
      </fieldset>

      <fieldset class="field">
        <legend>{tx('Quando avisar', 'Cuándo avisar')}</legend>
        <div class="choices">
          <label class="choice"><input type="radio" name="cond" value="below" bind:group={form.kind} /> <span>{tx('Preço abaixo de', 'Precio por debajo de')}</span></label>
          <label class="choice"><input type="radio" name="cond" value="above" bind:group={form.kind} /> <span>{tx('Preço acima de', 'Precio por encima de')}</span></label>
          <label class="choice"><input type="radio" name="cond" value="belowMedianPct" bind:group={form.kind} /> <span>{tx('% abaixo da mediana de 7 dias da cidade', '% por debajo de la mediana de 7 días de la ciudad')}</span></label>
        </div>
        <div class="value">
          <label for="alerta-valor" class="visually-hidden">{form.kind === 'belowMedianPct' ? tx('Porcentagem', 'Porcentaje') : tx('Preço em prata', 'Precio en plata')}</label>
          <input id="alerta-valor" class="input num" inputmode={form.kind === 'belowMedianPct' ? 'decimal' : 'numeric'}
            placeholder={form.kind === 'belowMedianPct' ? tx('Ex.: 20', 'Ej.: 20') : tx('Ex.: 12.000', `Ej.: ${fmtInt(12000, 'es')}`)} bind:value={form.value}
            aria-invalid={tried && !!errors.value} />
          <span class="muted">{form.kind === 'belowMedianPct' ? '%' : tx('prata', 'plata')}</span>
        </div>
        {#if tried && errors.value}<p class="err small">{errors.value}</p>{/if}
      </fieldset>

      <div class="field">
        <label for="alerta-intervalo">{tx('Intervalo mínimo entre avisos', 'Intervalo mínimo entre avisos')}</label>
        <select id="alerta-intervalo" class="input" bind:value={form.cooldownMin}>
          {#each COOLDOWNS as m (m)}<option value={m}>{m < 60 ? tx(`${m} minutos`, `${m} minutos`) : `${m / 60} ${m === 60 ? tx('hora', 'hora') : tx('horas', 'horas')}`}</option>{/each}
        </select>
      </div>

      <div class="row">
        <button class="btn primary" type="submit" disabled={saving || (tried && !canSubmit)}>{saving ? tx('Criando…', 'Creando…') : tx('Criar alerta', 'Crear alerta')}</button>
        <span class="muted small">{tx(`${rules.length} de ${MAX_RULES} regras usadas`, `${rules.length} de ${MAX_RULES} reglas usadas`)}</span>
      </div>
    </fieldset>
    {#if saveError}<p class="callout warn small" role="alert">{tx('Não deu para criar a regra', 'No se pudo crear la regla')}: {saveError}</p>{/if}
    {#if saved}<p class="callout small" role="status">{saved}</p>{/if}
  </form>

  <!-- lista -->
  {#if subId}
    <div class="card stack">
      <h2 class="first">{tx('Regras deste aparelho', 'Reglas de este dispositivo')}</h2>
      {#if rulesLoading && !rules.length}
        {#each [0, 1] as i (i)}<div class="skeleton" style:height="48px"></div>{/each}
      {:else if rulesError}
        <div class="callout warn small" role="alert">
          {tx('Não deu para carregar as regras', 'No se pudieron cargar las reglas')}: {rulesError}
          <button class="btn" type="button" onclick={() => subId && loadRules(subId)}>{tx('Tentar de novo', 'Intentar de nuevo')}</button>
        </div>
      {:else if !rules.length}
        <p class="empty">{tx('Nenhuma regra ainda. Crie a primeira acima.', 'Todavía no hay reglas. Crea la primera arriba.')}</p>
      {:else}
        <ul class="rules">
          {#each rules as r (r.id)}
            <li>
              <ItemIcon id={r.itemId} quality={r.quality} alt="" size={36} />
              <div class="desc">
                <a href={href(`/item/${encodeURIComponent(r.itemId)}`)} onclick={go}>{nameFor(r)}</a>
                <span class="small">{ruleDetails(r, getLocale())}</span>
                <span class="muted small">{lastFiredText(r)}</span>
              </div>
              <button class="btn" type="button" onclick={() => remove(r)} disabled={deleting === r.id} aria-label={tx(`Apagar a regra de ${nameFor(r)}`, `Borrar la regla de ${nameFor(r)}`)}>
                {deleting === r.id ? tx('Apagando…', 'Borrando…') : tx('Apagar', 'Borrar')}
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
