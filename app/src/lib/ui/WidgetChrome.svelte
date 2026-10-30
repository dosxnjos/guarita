<script lang="ts">
  // Moldura fina própria dos widgets (a janela nasce sem a moldura do Windows): barra de arrasto com título e
  // botões de opacidade, fixar por cima, minimizar e fechar. "Fixar" passa pelo aviso da SBI na primeira vez.
  // Também cuida da memória da janela: abriu → `aberta: true` (o painel reabre ao iniciar); fechou pela barra →
  // `aberta: false`; estava fixada por cima → fixa de novo ao abrir (o Rust cria toda janela sem "por cima").
  import type { Snippet } from 'svelte';
  import { getConfig, loadConfig, onConfigChange, updateConfig } from '../config';
  import { fmtOpacidade, proximaOpacidade } from '../ui-janelas';
  import { closeSelf, isTauri, minimizeSelf, setOnTop, type WidgetLabel } from '../windows';
  import AvisoSbi from './AvisoSbi.svelte';

  let { label, titulo, children }: { label: WidgetLabel; titulo: string; children: Snippet } = $props();

  let porCima = $state(false);
  let opacidade = $state(1);
  let pedindoAviso = $state(false);
  let erro = $state<string | null>(null);

  $effect(() =>
    onConfigChange((c) => {
      porCima = c.janelas[label]?.porCima ?? false;
      opacidade = c.janelas[label]?.opacidade ?? 1;
    }),
  );

  $effect(() => {
    if (!isTauri()) return;
    void (async () => {
      const c = await loadConfig();
      const j = c.janelas[label];
      if (!j.aberta) await updateConfig((d) => void (d.janelas[label].aberta = true)).catch(() => {});
      if (j.porCima && c.avisoSbiAceitoEm) await aplicarPorCima(true);
      else if (j.porCima) await updateConfig((d) => void (d.janelas[label].porCima = false)).catch(() => {});
    })();
  });

  async function aplicarPorCima(on: boolean) {
    erro = null;
    try {
      await setOnTop(label, on);
      await updateConfig((c) => {
        c.janelas[label].porCima = on;
      });
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      if (on) await updateConfig((c) => void (c.janelas[label].porCima = false)).catch(() => {});
    }
  }

  function alternarPorCima() {
    if (porCima) return void aplicarPorCima(false);
    if (!getConfig().avisoSbiAceitoEm) {
      pedindoAviso = true;
      return;
    }
    void aplicarPorCima(true);
  }

  function trocarOpacidade() {
    const v = proximaOpacidade(opacidade);
    opacidade = v;
    void updateConfig((c) => void (c.janelas[label].opacidade = v));
  }

  async function fechar() {
    // Fechou pela barra: não reabre no próximo início. (Fechar o app com o widget aberto mantém `aberta`.)
    await updateConfig((c) => void (c.janelas[label].aberta = false)).catch(() => {});
    await closeSelf();
  }
</script>

<div class="widget">
  <header class="barra" data-tauri-drag-region>
    <span class="titulo" data-tauri-drag-region>{titulo}</span>
    <div class="botoes">
      <button type="button" class="icone" title="Opacidade do fundo: {fmtOpacidade(opacidade)}. Clique para trocar." onclick={trocarOpacidade}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11" /><path d="M8 4.5h3.2M8 7h5M8 9.5h4.6M8 12h2.6" class="fino" /></svg>
        <span class="sr">Opacidade do fundo: {fmtOpacidade(opacidade)}</span>
      </button>
      <button
        type="button"
        class="icone"
        class:ativo={porCima}
        aria-pressed={porCima}
        title={porCima ? 'Soltar (deixa de ficar por cima)' : 'Fixar por cima das outras janelas'}
        onclick={alternarPorCima}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5 14.5 6.5 12 7.5 9.5 10 9 13.5 2.5 7 6 6.5 8.5 4z M5 11 1.5 14.5" /></svg>
        <span class="sr">{porCima ? 'Soltar' : 'Fixar por cima'}</span>
      </button>
      <button type="button" class="icone" title="Minimizar" onclick={() => void minimizeSelf()}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5h10" /></svg>
        <span class="sr">Minimizar</span>
      </button>
      <button type="button" class="icone fechar" title="Fechar" onclick={() => void fechar()}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        <span class="sr">Fechar</span>
      </button>
    </div>
  </header>

  <main class="corpo">
    {#if pedindoAviso}
      <AvisoSbi
        compacto
        onaceitar={() => {
          pedindoAviso = false;
          void aplicarPorCima(true);
        }}
        oncancelar={() => (pedindoAviso = false)}
      />
    {:else}
      {#if erro}<p class="callout bad small" role="alert">{erro}</p>{/if}
      {@render children()}
    {/if}
  </main>
</div>

<style>
  .widget {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    /* coluna presa à largura da janela: tabela larga rola dentro dela em vez de esticar o widget */
    grid-template-columns: minmax(0, 1fr);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    background: color-mix(in srgb, var(--bg) calc(var(--janela-alpha, 1) * 100%), transparent);
    font-size: 14px;
  }
  .barra {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 4px 0 12px;
    background: color-mix(in srgb, var(--surface) calc(var(--janela-alpha, 1) * 100%), transparent);
    border-bottom: 1px solid var(--line);
    user-select: none;
    cursor: grab;
  }
  .titulo { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .botoes { display: flex; gap: 2px; flex: none; }
  .icone {
    width: 28px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .icone:hover { background: var(--surface-2); color: var(--ink); }
  .icone:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .icone.ativo { color: var(--accent); }
  .icone.fechar:hover { background: var(--bad-bg); color: var(--bad); }
  .icone svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .icone svg .fino { stroke-width: 1.1; }
  .corpo { overflow: auto; padding: 10px 12px 12px; min-height: 0; }
  .corpo :global(.small) { font-size: 13px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
