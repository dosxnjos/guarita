<script lang="ts">
  // Erro com mensagem em PT-BR (ApiError já vem traduzido) e botão de tentar de novo.
  let { mensagem, ontentar }: { mensagem: string; ontentar?: () => void } = $props();
</script>

<div class="callout bad stack" role="alert">
  <span>{mensagem}</span>
  {#if ontentar}
    <div><button type="button" class="btn" onclick={ontentar}>Tentar de novo</button></div>
  {/if}
</div>
