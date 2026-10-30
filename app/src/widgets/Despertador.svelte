<script lang="ts">
  // Widget "Despertador": lembretes locais (plantação, animais, foco, tempo livre) com contagem regressiva. O motor
  // (engine/timers.ts, no painel) avisa com notificação e voz, só com o app aberto.
  import { onConfigChange, updateConfig, type GuaritaConfig } from '../lib/config';
  import { fmtCountdown, fmtDateTime } from '../lib/format';
  import { abrirLink } from '../lib/links';
  import {
    KIND_LABEL, MOUNT_TIERS, PRESETS, defaultTimerForm, fmtDuration, formDuration, montarTimer, presetById, progresso, splitTimers,
    type PresetId, type TimerFormState,
  } from '../lib/ui-timers';
  import { fmtAgo } from '../../../src/lib/player/format';

  const SITE_DESPERTADOR = 'https://guarita.pages.dev/despertador';

  let cfg = $state<GuaritaConfig | null>(null);
  $effect(() => onConfigChange((c) => (cfg = c)));

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  let criando = $state(false);
  let f = $state<TimerFormState>(defaultTimerForm());
  let erro = $state('');

  const listas = $derived(splitTimers(cfg?.timers ?? []));
  const preset = $derived(presetById(f.preset));
  const duracao = $derived(formDuration(f));

  function trocarPreset(id: PresetId) {
    f.preset = id;
    erro = '';
  }

  async function criar(e: SubmitEvent) {
    e.preventDefault();
    const r = montarTimer(f, cfg?.timers.length ?? 0);
    if (!r.ok) {
      erro = r.erro;
      return;
    }
    try {
      await updateConfig((c) => {
        c.timers = [...c.timers, r.timer];
      });
      f = defaultTimerForm();
      criando = false;
      erro = '';
    } catch (err) {
      erro = `Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function remover(id: string) {
    await updateConfig((c) => {
      c.timers = c.timers.filter((t) => t.id !== id);
    });
  }

  async function limparAvisados() {
    await updateConfig((c) => {
      c.timers = c.timers.filter((t) => !t.firedAt);
    });
  }
</script>

<div class="desp stack">
  {#if criando}
    <form class="stack form" onsubmit={criar} novalidate>
      <label class="stack campo">
        <span class="rot">Lembrete de</span>
        <select class="input" value={f.preset} onchange={(e) => trocarPreset(e.currentTarget.value as PresetId)}>
          {#each PRESETS as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
        </select>
      </label>
      <p class="small muted m0">{preset.hint}</p>

      {#if f.preset === 'filhote-montaria'}
        <label class="stack campo">
          <span class="rot">Tier do filhote</span>
          <select class="input" bind:value={f.tier}>
            {#each MOUNT_TIERS as t (t)}<option value={t}>T{t}</option>{/each}
          </select>
        </label>
      {:else if f.preset === 'foco'}
        <label class="stack campo">
          <span class="rot">Foco que você tem agora</span>
          <input class="input" inputmode="numeric" placeholder="Ex.: 12.500" bind:value={f.focus} />
        </label>
        <label class="check chk"><input type="checkbox" bind:checked={f.premium} /><span class="small">Tenho Premium</span></label>
      {:else if f.preset === 'livre'}
        <div class="duas">
          <label class="stack campo"><span class="rot">Horas</span><input class="input" inputmode="numeric" placeholder="0" bind:value={f.hours} /></label>
          <label class="stack campo"><span class="rot">Minutos</span><input class="input" inputmode="numeric" placeholder="30" bind:value={f.minutes} /></label>
        </div>
      {/if}

      <label class="stack campo">
        <span class="rot">Nome (opcional)</span>
        <input class="input" maxlength="60" placeholder={preset.label || 'Ex.: Ilha da guilda'} bind:value={f.label} />
      </label>

      {#if duracao.ok}<p class="small m0">Avisa em <strong>{fmtDuration(duracao.minutes)}</strong>, por volta de {fmtDateTime(now + duracao.minutes * 60_000, undefined, true)} (Brasília).</p>{/if}
      {#if erro}<p class="callout bad small m0" role="alert">{erro}</p>{/if}
      <div class="row">
        <button type="submit" class="btn primary mini-btn">Criar lembrete</button>
        <button type="button" class="btn mini-btn" onclick={() => ((criando = false), (erro = ''))}>Cancelar</button>
      </div>
    </form>
  {:else}
    <div class="row topo">
      <button type="button" class="btn primary mini-btn" onclick={() => ((criando = true), (f = defaultTimerForm()))}>Novo lembrete</button>
    </div>

    {#if listas.pending.length}
      <ul class="plain-list" aria-label="Lembretes ativos">
        {#each listas.pending as t (t.id)}
          {@const falta = Date.parse(t.endsAt) - now}
          <li class="timer">
            <div class="timer-cab">
              <span class="timer-nome"><strong>{t.label || KIND_LABEL[t.kind]}</strong>{#if t.label && t.label !== KIND_LABEL[t.kind]} <span class="small muted">{KIND_LABEL[t.kind]}</span>{/if}</span>
              <span class="conta num" aria-label="Faltam {fmtCountdown(falta)}">{falta > 0 ? fmtCountdown(falta) : 'agora'}</span>
            </div>
            <div class="barra" aria-hidden="true"><div class="enche" style:width="{progresso(t, now) * 100}%"></div></div>
            <div class="row timer-pe">
              <span class="small muted">{fmtDateTime(t.endsAt, undefined, true)} (Brasília)</span>
              <button type="button" class="linkbtn small" onclick={() => remover(t.id)}>Apagar</button>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small muted m0">Nenhum lembrete ativo. Plantação e ovos levam 22 h; o app avisa na hora, se estiver aberto.</p>
    {/if}

    {#if listas.fired.length}
      <section class="stack avisados" aria-label="Já avisados">
        <div class="row topo">
          <span class="kpi-label">Já avisados</span>
          <button type="button" class="linkbtn small" onclick={limparAvisados}>Limpar</button>
        </div>
        <ul class="plain-list">
          {#each listas.fired.slice(0, 5) as t (t.id)}
            <li class="small"><span>{t.label || KIND_LABEL[t.kind]}</span> <span class="muted">· {fmtAgo(t.firedAt)}</span></li>
          {/each}
        </ul>
      </section>
    {/if}

    <p class="small muted m0">
      Só avisa com o app aberto. Para ser avisado no celular com o PC desligado, use o
      <a href={SITE_DESPERTADOR} onclick={(e) => abrirLink(e, SITE_DESPERTADOR)}>despertador do site</a>.
    </p>
  {/if}
</div>

<style>
  .desp { gap: 10px; }
  .m0 { margin: 0; }
  .topo { justify-content: space-between; }
  .mini-btn { padding: 4px 10px; font-size: 13px; }
  .form { gap: 8px; }
  .campo { gap: 4px; min-width: 0; }
  .rot { font-size: 13px; font-weight: 600; }
  .form .input { padding: 6px 8px; font-size: 14px; }
  .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .check.chk { gap: 6px; align-items: center; }
  .check.chk input { width: 15px; height: 15px; margin: 0; }
  .timer { display: grid; gap: 4px; }
  .timer-cab { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .timer-nome { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .conta { font-weight: 700; white-space: nowrap; }
  .barra { height: 4px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
  .enche { height: 100%; background: var(--accent); }
  .timer-pe { justify-content: space-between; }
  .avisados { gap: 2px; }
  .avisados .plain-list > li { padding: 3px 0; }
</style>
