<script lang="ts">
  // 404: caminho que não existe. Oferece a busca e os atalhos principais.
  import { go } from '../lib/router';
  import SearchBox from '../lib/ui/SearchBox.svelte';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();
</script>

<svelte:head><title>Página não encontrada · Guarita</title></svelte:head>

<section class="page stack" style="max-width:640px">
  <h1>Página não encontrada</h1>
  <p class="muted" style="margin:0">O endereço <code>{location.pathname}</code> não existe na Guarita. Talvez o link esteja incompleto.</p>
  <SearchBox label="Buscar um item" />
  <p class="row">
    <a class="btn primary" href="/" onclick={go}>Ir para o início</a>
    <a class="btn" href="/relogio" onclick={go}>Relógio</a>
    <a class="btn" href="/jogador" onclick={go}>Dossiê de jogador</a>
  </p>
</section>
