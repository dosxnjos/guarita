<script lang="ts">
  // 404: caminho que não existe. Oferece a busca e os atalhos principais.
  import { go } from '../lib/router';
  import { href, tx } from '../lib/i18n/index.svelte';
  import SearchBox from '../lib/ui/SearchBox.svelte';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();
</script>

<svelte:head><title>{tx('Página não encontrada · Guarita', 'Página no encontrada · Guarita')}</title></svelte:head>

<section class="page stack" style="max-width:640px">
  <h1>{tx('Página não encontrada', 'Página no encontrada')}</h1>
  <p class="muted" style="margin:0">{tx('O endereço', 'La dirección')} <code>{location.pathname}</code> {tx('não existe na Guarita. Talvez o link esteja incompleto.', 'no existe en la Guarita. Tal vez el enlace esté incompleto.')}</p>
  <SearchBox label={tx('Buscar um item', 'Buscar un objeto')} />
  <p class="row">
    <a class="btn primary" href={href('/')} onclick={go}>{tx('Ir para o início', 'Ir al inicio')}</a>
    <a class="btn" href={href('/relogio')} onclick={go}>{tx('Relógio', 'Reloj')}</a>
    <a class="btn" href={href('/jogador')} onclick={go}>{tx('Dossiê de jogador', 'Dosier de jugador')}</a>
  </p>
</section>
