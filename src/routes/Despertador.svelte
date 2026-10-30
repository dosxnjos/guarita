<script lang="ts">
  // Despertador da ilha e do foco: timers pessoais (plantação, animais, foco cheio ou tempo livre) que avisam por
  // notificação no horário, mesmo com a aba fechada. Os timers ficam presos à inscrição push deste aparelho.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import { currentSubId, enablePush, forgetSubId, isSubGone, pushSupported } from '../lib/push';
  import { isIosUA } from '../lib/player/format';
  import { fmtCountdown, fmtDateTime, fmtInt } from '../lib/format';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  import type { Timer } from '../../shared/types';
  import {
    FOCUS_MAX, FOCUS_PER_DAY_PREMIUM, LABEL_MAX, MAX_TIMERS, MOUNT_BABY_MIN, MOUNT_TIERS, PRESETS,
    defaultTimerForm, endsAtFrom, fmtDuration, formDuration, formLabel, kindLabel, presetById, presetText, splitTimers,
    type PresetId, type TimerFormState,
  } from '../lib/timers/presets';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

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
  /** O servidor não conhece mais a inscrição deste aparelho: os timers dela foram junto. */
  let subLost = $state(false);

  // ---- relógio da tela (contagem regressiva) ----
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // ---- timers deste aparelho ----
  let timers = $state<Timer[]>([]);
  let loading = $state(false);
  let listError = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let lastAutoReload = 0;

  const split = $derived(splitTimers(timers));
  const atLimit = $derived(split.pending.length >= MAX_TIMERS);

  function dropLocalSub() {
    forgetSubId();
    subId = null;
    timers = [];
    subLost = true;
  }

  async function loadTimers(owner: string) {
    loading = true; listError = null;
    try {
      const r = await api.timers(owner);
      timers = r.timers ?? [];
    } catch (e) {
      if (isSubGone(e)) dropLocalSub();
      else listError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (subId) loadTimers(subId);
  });

  // Um timer passou do horário há mais de 20 s: recarrega (no máximo 1 vez por minuto) para mostrar que já tocou.
  $effect(() => {
    if (!subId || loading) return;
    const overdue = split.pending.some((t) => Date.parse(t.endsAt) + 20_000 < now);
    if (overdue && now - lastAutoReload > 60_000) {
      lastAutoReload = now;
      loadTimers(subId);
    }
  });

  // Com a permissão já dada, renova a inscrição em silêncio (mesmo cuidado da tela de alertas).
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
    document.title = tx('Despertador · Guarita', 'Despertador · Guarita');
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

  // ---- formulário ----
  let form = $state<TimerFormState>(defaultTimerForm());
  let tried = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let saved = $state<string | null>(null);

  const preset = $derived(presetById(form.preset));
  const duration = $derived(formDuration(form, getLocale()));
  // O rótulo sugerido vai para o servidor e volta na notificação: na língua de quem criou.
  const labelPreview = $derived(formLabel(form, getLocale()));

  function pick(id: PresetId) {
    form.preset = id;
    tried = false;
    saveError = null;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    tried = true; saved = null; saveError = null;
    if (!subId || !duration.ok || atLimit) return;
    saving = true;
    try {
      const t = await api.createTimer({ owner: subId, kind: preset.kind, label: labelPreview, endsAt: endsAtFrom(duration.minutes) });
      saved = tx(
        `“${t.label}” vai tocar em ${fmtDateTime(t.endsAt, undefined, true)} (horário de Brasília).`,
        `“${t.label}” sonará el ${fmtDateTime(t.endsAt, undefined, true)} (hora de Brasilia).`,
      );
      const keepPreset = form.preset;
      form = { ...defaultTimerForm(), preset: keepPreset, premium: form.premium, tier: form.tier };
      tried = false;
      timers = [...timers.filter((x) => x.id !== t.id), t];
    } catch (err) {
      if (isSubGone(err)) dropLocalSub();
      else saveError = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  async function remove(t: Timer) {
    if (!subId) return;
    deleting = t.id; listError = null;
    try {
      await api.deleteTimer(subId, t.id);
      timers = timers.filter((x) => x.id !== t.id);
    } catch (e) {
      if (isSubGone(e)) dropLocalSub();
      else if (e && typeof e === 'object' && (e as { status?: number }).status === 404) timers = timers.filter((x) => x.id !== t.id);
      else listError = e instanceof Error ? e.message : String(e);
    } finally {
      deleting = null;
    }
  }

  const focusPerHour = FOCUS_PER_DAY_PREMIUM / 24;
</script>

<section class="page stack">
  <header>
    <h1>{tx('Despertador da ilha', 'Despertador de la isla')}</h1>
    <p class="muted">{tx(
      'Plantou, colocou filhote no pasto ou está esperando o foco encher? Crie um despertador e a Guarita avisa na hora certa.',
      '¿Sembraste, dejaste una cría en el pasto o esperas a que se llene el foco? Crea un despertador y la Guarita te avisa en el momento justo.',
    )}</p>
  </header>

  <div class="callout small">
    {#if getLocale() === 'es'}
      <p><strong>Cómo llega el aviso:</strong> por notificación del navegador, incluso con la pestaña de la Guarita cerrada. Si el dispositivo
        está apagado o sin internet, la notificación llega cuando vuelva (hasta 12 horas después).</p>
      <p>En iPhone y iPad solo funciona con la Guarita instalada en la pantalla de inicio. El aviso puede tardar unos segundos.</p>
    {:else}
      <p><strong>Como o aviso chega:</strong> por notificação do navegador, mesmo com a aba da Guarita fechada. Se o aparelho
        estiver desligado ou sem internet, a notificação chega quando ele voltar (até 12 horas depois).</p>
      <p>No iPhone e no iPad, só funciona com a Guarita instalada na tela inicial. O aviso pode atrasar alguns segundos.</p>
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
        `Este navegador não aceita notificações da web${ios && !standalone ? ' fora do app instalado' : ''}. Abra a Guarita no Chrome, Edge ou Firefox para usar o despertador.`,
        `Este navegador no acepta notificaciones web${ios && !standalone ? ' fuera de la app instalada' : ''}. Abre la Guarita en Chrome, Edge o Firefox para usar el despertador.`,
      )}</p>
    {:else if subId}
      {#if subLost}
        <p class="callout warn small" role="status">{tx(
          'A inscrição deste aparelho tinha expirado no servidor e foi renovada. Os despertadores antigos foram apagados junto: crie de novo os que quiser.',
          'La suscripción de este dispositivo había vencido en el servidor y se renovó. Los despertadores anteriores se borraron con ella: vuelve a crear los que quieras.',
        )}</p>
      {/if}
      <p class="row"><span class="tag good">{tx('Ativado', 'Activado')}</span> <span class="small">{tx(
        'Este aparelho recebe os despertadores abaixo. Para desativar, use a tela de ',
        'Este dispositivo recibe los despertadores de abajo. Para desactivarlos, usa la pantalla de ',
      )}<a href={href('/alertas')} onclick={go}>{tx('alertas', 'alertas')}</a>.</span></p>
    {:else}
      {#if subLost}
        <p class="callout warn small" role="status">{tx(
          'Os avisos deste aparelho foram desligados no servidor (a inscrição expirou ou parou de responder) e os despertadores dele foram apagados. Ative de novo para voltar a usar.',
          'Los avisos de este dispositivo se desactivaron en el servidor (la suscripción venció o dejó de responder) y sus despertadores se borraron. Actívalos de nuevo para volver a usarlos.',
        )}</p>
      {/if}
      {#if permission === 'denied'}
        <p class="callout warn small">{tx(
          'As notificações da Guarita estão bloqueadas neste navegador. Libere nas configurações do site (ícone ao lado do endereço) e tente de novo.',
          'Las notificaciones de la Guarita están bloqueadas en este navegador. Permítelas en la configuración del sitio (ícono junto a la dirección) e intenta de nuevo.',
        )}</p>
      {/if}
      <p class="small">{tx(
        'O navegador vai pedir permissão para mostrar notificações. Os mesmos avisos servem para os alertas de preço; dá para desativar a qualquer momento.',
        'El navegador te pedirá permiso para mostrar notificaciones. Los mismos avisos sirven para las alertas de precio; puedes desactivarlos en cualquier momento.',
      )}</p>
      <div>
        <button class="btn primary" type="button" onclick={activate} disabled={enabling}>
          {enabling ? tx('Ativando…', 'Activando…') : tx('Ativar avisos neste aparelho', 'Activar avisos en este dispositivo')}
        </button>
      </div>
    {/if}
    {#if pushError}<p class="callout warn small" role="alert">{tx('Não deu para ativar os avisos', 'No se pudieron activar los avisos')}: {pushError}</p>{/if}
  </div>

  <!-- formulário -->
  <form class="card stack" onsubmit={submit} novalidate aria-labelledby="novo-timer">
    <h2 class="first" id="novo-timer">{tx('Novo despertador', 'Nuevo despertador')}</h2>
    {#if !subId}
      <p class="muted small">{tx('Ative os avisos neste aparelho para criar despertadores.', 'Activa los avisos en este dispositivo para crear despertadores.')}</p>
    {:else if atLimit}
      <p class="callout warn small">{tx(
        `Este aparelho já tem ${MAX_TIMERS} despertadores esperando, o limite. Apague um para criar outro.`,
        `Este dispositivo ya tiene ${MAX_TIMERS} despertadores pendientes, el límite. Borra uno para crear otro.`,
      )}</p>
    {/if}

    <fieldset class="stack" disabled={!subId || atLimit}>
      <fieldset class="field">
        <legend>{tx('O que você quer lembrar', 'Qué quieres recordar')}</legend>
        <div class="choices">
          {#each PRESETS as p (p.id)}
            {@const text = presetText(p, getLocale())}
            <label class="choice">
              <input type="radio" name="preset" checked={form.preset === p.id} onchange={() => pick(p.id)} />
              <span><strong>{text.title}</strong><br /><span class="muted small">{text.hint}</span></span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if form.preset === 'filhote-montaria'}
        <div class="field">
          <label for="timer-tier">{tx('Tier do filhote', 'Tier de la cría')}</label>
          <select id="timer-tier" class="input narrow" bind:value={form.tier}>
            {#each MOUNT_TIERS as t (t)}<option value={t}>T{t} · {fmtDuration(MOUNT_BABY_MIN[t])}</option>{/each}
          </select>
          <p class="muted small hint">{tx(
            'Vale para boi, cavalo e as montarias do canil. Exceções: o filhote de draco leva bem mais; confira no jogo.',
            'Vale para buey, caballo y las monturas de la perrera. Excepciones: la cría de draco tarda mucho más; confírmalo en el juego.',
          )}</p>
        </div>
      {:else if form.preset === 'foco'}
        <div class="field">
          <label for="timer-foco">{tx('Foco que você tem agora', 'Foco que tienes ahora')}</label>
          <div class="value">
            <input id="timer-foco" class="input num" inputmode="numeric" placeholder={tx('Ex.: 12.500', `Ej.: ${fmtInt(12500, 'es')}`)} bind:value={form.focus}
              aria-invalid={tried && !duration.ok} aria-describedby="foco-nota" />
            <span class="muted">{tx('de', 'de')} {fmtInt(FOCUS_MAX, getLocale())}</span>
          </div>
          <label class="check"><input type="checkbox" bind:checked={form.premium} /> {tx('Tenho Premium ativo', 'Tengo Premium activo')}</label>
          <p id="foco-nota" class="muted small hint">
            {#if getLocale() === 'es'}
              Con Premium el foco se recupera {fmtInt(FOCUS_PER_DAY_PREMIUM, 'es')} por día (unos {fmtInt(focusPerHour, 'es')} por hora), hasta {fmtInt(FOCUS_MAX, 'es')}.
              Sin Premium no se recupera solo. Si el Premium se acaba antes, el aviso llega demasiado pronto.
            {:else}
              Com Premium o foco volta {fmtInt(FOCUS_PER_DAY_PREMIUM)} por dia (cerca de {fmtInt(focusPerHour)} por hora), até {fmtInt(FOCUS_MAX)}.
              Sem Premium ele não volta sozinho. Se o Premium acabar antes, o aviso chega cedo demais.
            {/if}
          </p>
        </div>
      {:else if form.preset === 'livre'}
        <fieldset class="field">
          <legend>{tx('Tempo até tocar', 'Tiempo hasta que suene')}</legend>
          <div class="hm">
            <label class="unit"><input class="input num" inputmode="numeric" placeholder="0" bind:value={form.hours} aria-invalid={tried && !duration.ok} /> <span>{tx('horas', 'horas')}</span></label>
            <label class="unit"><input class="input num" inputmode="numeric" placeholder="0" bind:value={form.minutes} aria-invalid={tried && !duration.ok} /> <span>{tx('minutos', 'minutos')}</span></label>
          </div>
          <p class="muted small hint">{tx('De 1 minuto a 30 dias.', 'De 1 minuto a 30 días.')}</p>
        </fieldset>
      {/if}

      <div class="field">
        <label for="timer-rotulo">{tx('Nome do despertador', 'Nombre del despertador')} <span class="muted small">{tx('(opcional)', '(opcional)')}</span></label>
        <input id="timer-rotulo" class="input" maxlength={LABEL_MAX} placeholder={labelPreview} bind:value={form.label} />
      </div>

      {#if duration.ok}
        <p class="summary small">
          {#if getLocale() === 'es'}
            Suena en <strong>{fmtDuration(duration.minutes)}</strong>, a las <strong>{fmtDateTime(now + duration.minutes * 60_000, undefined, true)}</strong> (hora de Brasilia).
          {:else}
            Toca em <strong>{fmtDuration(duration.minutes)}</strong>, às <strong>{fmtDateTime(now + duration.minutes * 60_000, undefined, true)}</strong> (horário de Brasília).
          {/if}
        </p>
      {:else if tried || (form.preset === 'foco' && form.focus.trim()) || (form.preset === 'livre' && (form.hours.trim() || form.minutes.trim()))}
        <p class="err small" role="alert">{duration.error}</p>
      {/if}

      <div class="row">
        <button class="btn primary" type="submit" disabled={saving || (tried && !duration.ok)}>{saving ? tx('Criando…', 'Creando…') : tx('Criar despertador', 'Crear despertador')}</button>
        <span class="muted small">{tx(`${split.pending.length} de ${MAX_TIMERS} em uso`, `${split.pending.length} de ${MAX_TIMERS} en uso`)}</span>
      </div>
    </fieldset>
    {#if saveError}<p class="callout warn small" role="alert">{tx('Não deu para criar o despertador', 'No se pudo crear el despertador')}: {saveError}</p>{/if}
    {#if saved}<p class="callout good small" role="status">{saved}</p>{/if}
  </form>

  <!-- lista -->
  {#if subId}
    <div class="card stack">
      <h2 class="first">{tx('Despertadores deste aparelho', 'Despertadores de este dispositivo')}</h2>
      {#if loading && !timers.length}
        {#each [0, 1] as i (i)}<div class="skeleton" style:height="48px"></div>{/each}
      {:else if listError && !timers.length}
        <div class="callout warn small" role="alert">
          {tx('Não deu para carregar os despertadores', 'No se pudieron cargar los despertadores')}: {listError}
          <button class="btn" type="button" onclick={() => subId && loadTimers(subId)}>{tx('Tentar de novo', 'Intentar de nuevo')}</button>
        </div>
      {:else if !split.pending.length && !split.fired.length}
        <p class="empty">{tx('Nenhum despertador ainda. Crie o primeiro acima.', 'Todavía no hay despertadores. Crea el primero arriba.')}</p>
      {:else}
        {#if listError}<p class="callout warn small" role="alert">{listError}</p>{/if}
        {#if split.pending.length}
          <ul class="timers">
            {#each split.pending as t (t.id)}
              {@const left = Date.parse(t.endsAt) - now}
              <li>
                <div class="desc">
                  <strong>{t.label}</strong>
                  <span class="muted small">{kindLabel(t.kind, getLocale())} · {tx('toca em', 'suena el')} {fmtDateTime(t.endsAt, undefined, true)}</span>
                </div>
                <span class="count num" class:due={left <= 0} aria-label={left > 0 ? tx(`faltam ${fmtCountdown(left)}`, `faltan ${fmtCountdown(left, 'es')}`) : tx('tocando agora', 'sonando ahora')}>
                  {left > 0 ? fmtCountdown(left, getLocale()) : tx('tocando', 'sonando')}
                </span>
                <button class="btn" type="button" onclick={() => remove(t)} disabled={deleting === t.id} aria-label={tx(`Apagar o despertador ${t.label}`, `Borrar el despertador ${t.label}`)}>
                  {deleting === t.id ? tx('Apagando…', 'Borrando…') : tx('Apagar', 'Borrar')}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">{tx('Nenhum despertador esperando.', 'No hay despertadores pendientes.')}</p>
        {/if}

        {#if split.fired.length}
          <h3>{tx('Já tocaram', 'Ya sonaron')} <span class="muted small">{tx('(últimos 7 dias)', '(últimos 7 días)')}</span></h3>
          <ul class="timers fired">
            {#each split.fired as t (t.id)}
              <li>
                <div class="desc">
                  <span>{t.label}</span>
                  {#if t.delivery === 'falhou'}
                    <span class="small bad-text">{kindLabel(t.kind, getLocale())} · {tx(
                      `não foi possível avisar em ${fmtDateTime(t.firedAt, undefined, true)}. Confira se as notificações deste aparelho continuam ativas.`,
                      `no se pudo avisar el ${fmtDateTime(t.firedAt, undefined, true)}. Revisa si las notificaciones de este dispositivo siguen activas.`,
                    )}</span>
                  {:else}
                    <span class="muted small">{kindLabel(t.kind, getLocale())} · {tx('tocou em', 'sonó el')} {fmtDateTime(t.firedAt, undefined, true)}</span>
                  {/if}
                </div>
                <button class="btn" type="button" onclick={() => remove(t)} disabled={deleting === t.id} aria-label={tx(`Remover ${t.label} da lista`, `Quitar ${t.label} de la lista`)}>
                  {deleting === t.id ? tx('Removendo…', 'Quitando…') : tx('Remover', 'Quitar')}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}

  <p class="muted small">{tx(
    'Tempos-padrão tirados dos dados do próprio jogo (crescimento de sementes e filhotes, produção dos animais e regeneração de foco). Se o jogo mudar algum tempo, use o tempo livre.',
    'Tiempos predeterminados tomados de los datos del propio juego (crecimiento de semillas y crías, producción de los animales y regeneración de foco). Si el juego cambia algún tiempo, usa el tiempo libre.',
  )}</p>
</section>

<style>
  header p { margin: 0; }
  p { margin: 0; }
  h2.first { margin-top: 0; }
  h3 { margin: 8px 0 0; font-size: 16px; }
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  legend, .field > label:first-child { font-weight: 600; margin-bottom: 6px; padding: 0; display: block; }
  .field { min-width: 0; }
  .hint { margin-top: 6px; }
  .choices { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
  .choice { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; cursor: pointer; min-width: 0; }
  .choice:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .choice input { margin-top: 4px; }
  .narrow { max-width: 260px; }
  .value { display: flex; gap: 8px; align-items: center; max-width: 320px; }
  .value .input { flex: 1; min-width: 0; }
  .check { display: flex; gap: 8px; align-items: center; margin-top: 8px; font-weight: 400; }
  .hm { display: flex; gap: 12px; flex-wrap: wrap; }
  .unit { display: flex; gap: 6px; align-items: center; font-weight: 400; }
  .unit .input { width: 90px; }
  .summary { background: var(--surface-2); border-radius: 8px; padding: 8px 10px; }
  .err { color: var(--bad); }
  .timers { list-style: none; margin: 0; padding: 0; display: grid; }
  .timers li { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); min-width: 0; flex-wrap: wrap; }
  .timers li:last-child { border-bottom: 0; }
  .desc { flex: 1 1 180px; min-width: 0; display: grid; overflow-wrap: anywhere; }
  .count { font-weight: 700; font-size: 18px; white-space: nowrap; }
  .count.due { color: var(--accent); }
  .fired .desc span:first-child { color: var(--muted); }
  fieldset:disabled { opacity: 0.6; }
</style>
