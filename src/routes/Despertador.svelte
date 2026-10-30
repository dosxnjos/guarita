<script lang="ts">
  // Despertador da ilha e do foco: timers pessoais (plantação, animais, foco cheio ou tempo livre) que avisam por
  // notificação no horário, mesmo com a aba fechada. Os timers ficam presos à inscrição push deste aparelho.
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import { currentSubId, enablePush, forgetSubId, isSubGone, pushSupported } from '../lib/push';
  import { isIosUA } from '../lib/player/format';
  import { fmtCountdown, fmtDateTime, fmtInt } from '../lib/format';
  import type { Timer } from '../../shared/types';
  import {
    FOCUS_MAX, FOCUS_PER_DAY_PREMIUM, KIND_LABEL, LABEL_MAX, MAX_TIMERS, MOUNT_BABY_MIN, MOUNT_TIERS, PRESETS,
    defaultTimerForm, endsAtFrom, fmtDuration, formDuration, formLabel, presetById, splitTimers, type PresetId, type TimerFormState,
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
    document.title = 'Despertador · Guarita';
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
  const duration = $derived(formDuration(form));
  const labelPreview = $derived(formLabel(form));

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
      saved = `“${t.label}” vai tocar em ${fmtDateTime(t.endsAt, undefined, true)} (horário de Brasília).`;
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
    <h1>Despertador da ilha</h1>
    <p class="muted">Plantou, colocou filhote no pasto ou está esperando o foco encher? Crie um despertador e a Guarita avisa na hora certa.</p>
  </header>

  <div class="callout small">
    <p><strong>Como o aviso chega:</strong> por notificação do navegador, mesmo com a aba da Guarita fechada. Se o aparelho
      estiver desligado ou sem internet, a notificação chega quando ele voltar (até 12 horas depois).</p>
    <p>No iPhone e no iPad, só funciona com a Guarita instalada na tela inicial. O aviso pode atrasar alguns segundos.</p>
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
      <p>Este navegador não aceita notificações da web{ios && !standalone ? ' fora do app instalado' : ''}. Abra a Guarita no Chrome, Edge ou Firefox para usar o despertador.</p>
    {:else if subId}
      {#if subLost}
        <p class="callout warn small" role="status">A inscrição deste aparelho tinha expirado no servidor e foi renovada. Os despertadores antigos foram apagados junto: crie de novo os que quiser.</p>
      {/if}
      <p class="row"><span class="tag good">Ativado</span> <span class="small">Este aparelho recebe os despertadores abaixo. Para desativar, use a tela de <a href="/alertas" onclick={go}>alertas</a>.</span></p>
    {:else}
      {#if subLost}
        <p class="callout warn small" role="status">Os avisos deste aparelho foram desligados no servidor (a inscrição expirou ou parou de responder) e os despertadores dele foram apagados. Ative de novo para voltar a usar.</p>
      {/if}
      {#if permission === 'denied'}
        <p class="callout warn small">As notificações da Guarita estão bloqueadas neste navegador. Libere nas configurações do site (ícone ao lado do endereço) e tente de novo.</p>
      {/if}
      <p class="small">O navegador vai pedir permissão para mostrar notificações. Os mesmos avisos servem para os alertas de preço; dá para desativar a qualquer momento.</p>
      <div>
        <button class="btn primary" type="button" onclick={activate} disabled={enabling}>
          {enabling ? 'Ativando…' : 'Ativar avisos neste aparelho'}
        </button>
      </div>
    {/if}
    {#if pushError}<p class="callout warn small" role="alert">Não deu para ativar os avisos: {pushError}</p>{/if}
  </div>

  <!-- formulário -->
  <form class="card stack" onsubmit={submit} novalidate aria-labelledby="novo-timer">
    <h2 class="first" id="novo-timer">Novo despertador</h2>
    {#if !subId}
      <p class="muted small">Ative os avisos neste aparelho para criar despertadores.</p>
    {:else if atLimit}
      <p class="callout warn small">Este aparelho já tem {MAX_TIMERS} despertadores esperando, o limite. Apague um para criar outro.</p>
    {/if}

    <fieldset class="stack" disabled={!subId || atLimit}>
      <fieldset class="field">
        <legend>O que você quer lembrar</legend>
        <div class="choices">
          {#each PRESETS as p (p.id)}
            <label class="choice">
              <input type="radio" name="preset" checked={form.preset === p.id} onchange={() => pick(p.id)} />
              <span><strong>{p.title}</strong><br /><span class="muted small">{p.hint}</span></span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if form.preset === 'filhote-montaria'}
        <div class="field">
          <label for="timer-tier">Tier do filhote</label>
          <select id="timer-tier" class="input narrow" bind:value={form.tier}>
            {#each MOUNT_TIERS as t (t)}<option value={t}>T{t} · {fmtDuration(MOUNT_BABY_MIN[t])}</option>{/each}
          </select>
          <p class="muted small hint">Vale para boi, cavalo e as montarias do canil. Exceções: o filhote de draco leva bem mais; confira no jogo.</p>
        </div>
      {:else if form.preset === 'foco'}
        <div class="field">
          <label for="timer-foco">Foco que você tem agora</label>
          <div class="value">
            <input id="timer-foco" class="input num" inputmode="numeric" placeholder="Ex.: 12.500" bind:value={form.focus}
              aria-invalid={tried && !duration.ok} aria-describedby="foco-nota" />
            <span class="muted">de {fmtInt(FOCUS_MAX)}</span>
          </div>
          <label class="check"><input type="checkbox" bind:checked={form.premium} /> Tenho Premium ativo</label>
          <p id="foco-nota" class="muted small hint">
            Com Premium o foco volta {fmtInt(FOCUS_PER_DAY_PREMIUM)} por dia (cerca de {fmtInt(focusPerHour)} por hora), até {fmtInt(FOCUS_MAX)}.
            Sem Premium ele não volta sozinho. Se o Premium acabar antes, o aviso chega cedo demais.
          </p>
        </div>
      {:else if form.preset === 'livre'}
        <fieldset class="field">
          <legend>Tempo até tocar</legend>
          <div class="hm">
            <label class="unit"><input class="input num" inputmode="numeric" placeholder="0" bind:value={form.hours} aria-invalid={tried && !duration.ok} /> <span>horas</span></label>
            <label class="unit"><input class="input num" inputmode="numeric" placeholder="0" bind:value={form.minutes} aria-invalid={tried && !duration.ok} /> <span>minutos</span></label>
          </div>
          <p class="muted small hint">De 1 minuto a 30 dias.</p>
        </fieldset>
      {/if}

      <div class="field">
        <label for="timer-rotulo">Nome do despertador <span class="muted small">(opcional)</span></label>
        <input id="timer-rotulo" class="input" maxlength={LABEL_MAX} placeholder={labelPreview} bind:value={form.label} />
      </div>

      {#if duration.ok}
        <p class="summary small">
          Toca em <strong>{fmtDuration(duration.minutes)}</strong>, às <strong>{fmtDateTime(now + duration.minutes * 60_000, undefined, true)}</strong> (horário de Brasília).
        </p>
      {:else if tried || (form.preset === 'foco' && form.focus.trim()) || (form.preset === 'livre' && (form.hours.trim() || form.minutes.trim()))}
        <p class="err small" role="alert">{duration.error}</p>
      {/if}

      <div class="row">
        <button class="btn primary" type="submit" disabled={saving || (tried && !duration.ok)}>{saving ? 'Criando…' : 'Criar despertador'}</button>
        <span class="muted small">{split.pending.length} de {MAX_TIMERS} em uso</span>
      </div>
    </fieldset>
    {#if saveError}<p class="callout warn small" role="alert">Não deu para criar o despertador: {saveError}</p>{/if}
    {#if saved}<p class="callout good small" role="status">{saved}</p>{/if}
  </form>

  <!-- lista -->
  {#if subId}
    <div class="card stack">
      <h2 class="first">Despertadores deste aparelho</h2>
      {#if loading && !timers.length}
        {#each [0, 1] as i (i)}<div class="skeleton" style:height="48px"></div>{/each}
      {:else if listError && !timers.length}
        <div class="callout warn small" role="alert">
          Não deu para carregar os despertadores: {listError}
          <button class="btn" type="button" onclick={() => subId && loadTimers(subId)}>Tentar de novo</button>
        </div>
      {:else if !split.pending.length && !split.fired.length}
        <p class="empty">Nenhum despertador ainda. Crie o primeiro acima.</p>
      {:else}
        {#if listError}<p class="callout warn small" role="alert">{listError}</p>{/if}
        {#if split.pending.length}
          <ul class="timers">
            {#each split.pending as t (t.id)}
              {@const left = Date.parse(t.endsAt) - now}
              <li>
                <div class="desc">
                  <strong>{t.label}</strong>
                  <span class="muted small">{KIND_LABEL[t.kind]} · toca em {fmtDateTime(t.endsAt, undefined, true)}</span>
                </div>
                <span class="count num" class:due={left <= 0} aria-label={left > 0 ? `faltam ${fmtCountdown(left)}` : 'tocando agora'}>
                  {left > 0 ? fmtCountdown(left) : 'tocando'}
                </span>
                <button class="btn" type="button" onclick={() => remove(t)} disabled={deleting === t.id} aria-label="Apagar o despertador {t.label}">
                  {deleting === t.id ? 'Apagando…' : 'Apagar'}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">Nenhum despertador esperando.</p>
        {/if}

        {#if split.fired.length}
          <h3>Já tocaram <span class="muted small">(últimos 7 dias)</span></h3>
          <ul class="timers fired">
            {#each split.fired as t (t.id)}
              <li>
                <div class="desc">
                  <span>{t.label}</span>
                  {#if t.delivery === 'falhou'}
                    <span class="small bad-text">{KIND_LABEL[t.kind]} · não foi possível avisar em {fmtDateTime(t.firedAt, undefined, true)}. Confira se as notificações deste aparelho continuam ativas.</span>
                  {:else}
                    <span class="muted small">{KIND_LABEL[t.kind]} · tocou em {fmtDateTime(t.firedAt, undefined, true)}</span>
                  {/if}
                </div>
                <button class="btn" type="button" onclick={() => remove(t)} disabled={deleting === t.id} aria-label="Remover {t.label} da lista">
                  {deleting === t.id ? 'Removendo…' : 'Remover'}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}

  <p class="muted small">Tempos-padrão tirados dos dados do próprio jogo (crescimento de sementes e filhotes, produção dos animais e regeneração de foco). Se o jogo mudar algum tempo, use o tempo livre.</p>
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
