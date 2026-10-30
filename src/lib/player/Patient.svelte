<script lang="ts">
  // Carregando com paciência: skeleton + mensagem que muda com o tempo (o killboard oficial é lento).
  let { lines = 4, what = 'os dados do killboard' }: { lines?: number; what?: string } = $props();

  let secs = $state(0);
  $effect(() => {
    const t = setInterval(() => (secs += 1), 1000);
    return () => clearInterval(t);
  });
  const msg = $derived(
    secs < 8
      ? `Buscando ${what}…`
      : secs < 30
        ? 'O killboard oficial está demorando. Isso é comum: ele pode levar até 1 minuto.'
        : 'Ainda esperando o killboard. Se passar de 1 minuto, tente de novo daqui a pouco.',
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
