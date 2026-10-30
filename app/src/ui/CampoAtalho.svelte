<script lang="ts">
  // Campo de atalho global: clica em "Gravar", aperta a combinação, e o texto vai para a config. O motor
  // (engine/motor.ts) registra os atalhos quando a config muda; aqui ninguém registra nada.
  import { partesAtalho, capturarAtalho } from '../lib/ui-atalhos';

  let {
    rotulo,
    valor,
    onmudar,
    validar,
  }: {
    rotulo: string;
    valor: string | null;
    /** Devolve a mensagem de erro (ex.: atalho repetido) ou null se gravou. */
    onmudar: (atalho: string | null) => Promise<string | null>;
    validar: (atalho: string) => string | null;
  } = $props();

  const uid = 'at-' + Math.random().toString(36).slice(2, 9);
  let gravando = $state(false);
  let parcial = $state('');
  let erro = $state('');
  let botao = $state<HTMLButtonElement | null>(null);

  function comecar() {
    gravando = true;
    parcial = '';
    erro = '';
    queueMicrotask(() => botao?.focus());
  }

  async function onkeydown(e: KeyboardEvent) {
    if (!gravando) return;
    e.preventDefault();
    e.stopPropagation();
    const c = capturarAtalho(e);
    if (c.tipo === 'parcial') {
      parcial = c.texto;
      return;
    }
    if (c.tipo === 'cancelar') {
      gravando = false;
      return;
    }
    if (c.tipo === 'invalido') {
      erro = c.motivo;
      return;
    }
    if (c.tipo === 'limpar') {
      gravando = false;
      erro = (await onmudar(null)) ?? '';
      return;
    }
    const msg = validar(c.atalho);
    if (msg) {
      erro = msg;
      return;
    }
    gravando = false;
    erro = (await onmudar(c.atalho)) ?? '';
  }
</script>

<div class="atalho">
  <span class="rot" id="{uid}-r">{rotulo}</span>
  <div class="row">
    <button
      bind:this={botao}
      type="button"
      class="campo"
      class:gravando
      aria-labelledby="{uid}-r"
      aria-describedby="{uid}-d"
      onclick={() => (gravando ? (gravando = false) : comecar())}
      {onkeydown}
      onblur={() => (gravando = false)}
    >
      {#if gravando}
        <span class="muted">{parcial || 'Aperte a combinação…'}</span>
      {:else if valor}
        {#each partesAtalho(valor) as p, i (i)}{#if i}<span class="mais">+</span>{/if}<kbd>{p}</kbd>{/each}
      {:else}
        <span class="muted">Sem atalho</span>
      {/if}
    </button>
    {#if valor && !gravando}
      <button type="button" class="linkbtn small" onclick={async () => (erro = (await onmudar(null)) ?? '')}>Remover</button>
    {/if}
  </div>
  <span id="{uid}-d" class="small" class:bad-text={!!erro} class:muted={!erro}>
    {erro || (gravando ? 'Esc cancela. Use Ctrl, Alt ou Win junto com a tecla.' : '')}
  </span>
</div>

<style>
  .atalho { display: grid; gap: 4px; }
  .rot { font-weight: 600; font-size: 14px; }
  .campo {
    font: inherit; font-size: 14px; min-width: 190px; min-height: 34px; display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 4px 10px; cursor: pointer; text-align: left;
  }
  .campo:hover { border-color: var(--accent); }
  .campo.gravando { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .mais { color: var(--muted); font-size: 12px; }
  .small:empty { display: none; }
</style>
