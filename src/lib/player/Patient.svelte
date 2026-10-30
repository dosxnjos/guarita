<script lang="ts">
  // Carregando com paciência: skeleton + mensagem que muda com o tempo (o killboard oficial é lento).
  // Sem `what`, diz "os dados do killboard" na língua atual (a tela passa o texto já traduzido com tx()).
  import { tx } from '../i18n/index.svelte';
  let { lines = 4, what }: { lines?: number; what?: string } = $props();

  let secs = $state(0);
  $effect(() => {
    const t = setInterval(() => (secs += 1), 1000);
    return () => clearInterval(t);
  });
  const subject = $derived(what ?? tx('os dados do killboard', 'los datos del killboard'));
  const msg = $derived(
    secs < 8
      ? tx(`Buscando ${subject}…`, `Buscando ${subject}…`)
      : secs < 30
        ? tx('O killboard oficial está demorando. Isso é comum: ele pode levar até 1 minuto.', 'El killboard oficial está tardando. Es algo común: puede tardar hasta 1 minuto.')
        : tx('Ainda esperando o killboard. Se passar de 1 minuto, tente de novo daqui a pouco.', 'Todavía esperando el killboard. Si pasa de 1 minuto, inténtalo de nuevo en un rato.'),
  );
</script>

<div class="patient" role="status" aria-live="polite" aria-busy="true">
  <p class="muted small">{msg}</p>
  <div class="stack" aria-hidden="true">
    {#each Array.from({ length: lines }) as _, i (i)}
      <div class="skeleton" style:height={i === 0 ? '64px' : '20px'} style:width={i % 3 === 2 ? '70%' : '100%'}></div>
    {/each}
  </div>
</div>

<style>
  .patient { padding: 8px 0; }
</style>
