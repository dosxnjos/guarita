<script lang="ts">
  import { match, go } from './lib/router';
  import Inicio from './routes/Inicio.svelte';
  import Item from './routes/Item.svelte';
  import Relogio from './routes/Relogio.svelte';
  import Janela from './routes/Janela.svelte';
  import Jogadores from './routes/Jogadores.svelte';
  import Dossie from './routes/Dossie.svelte';
  import Autopsia from './routes/Autopsia.svelte';
  import Alertas from './routes/Alertas.svelte';
  import Apoie from './routes/Apoie.svelte';
  import Permitido from './routes/Permitido.svelte';
  import NaoEncontrado from './routes/NaoEncontrado.svelte';

  const VIEWS: Record<string, any> = {
    inicio: Inicio, item: Item, relogio: Relogio, janela: Janela, jogadores: Jogadores, dossie: Dossie,
    autopsia: Autopsia, alertas: Alertas, apoie: Apoie, permitido: Permitido, 'nao-encontrado': NaoEncontrado,
  };

  let route = $state(match(location.pathname));
  $effect(() => {
    const on = () => (route = match(location.pathname));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  });
  const View = $derived(VIEWS[route.name] ?? NaoEncontrado);
</script>

<header class="topbar">
  <a class="brand" href="/" onclick={go}>Guarita</a>
  <nav>
    <a href="/" onclick={go}>Mercado</a>
    <a href="/relogio" onclick={go}>Relógio</a>
    <a href="/jogador" onclick={go}>Dossiê</a>
    <a href="/alertas" onclick={go}>Alertas</a>
    <a href="/janela" onclick={go}>Janela</a>
  </nav>
</header>
<main class="wrap">
  <View params={route.params} />
</main>
<footer class="wrap footer">
  <a href="/permitido" onclick={go}>Isso é permitido?</a> · <a href="/apoie" onclick={go}>Apoie</a> ·
  <a href="https://github.com/dosxnjos/guarita" target="_blank" rel="noopener">Código aberto</a>
  <p>Não afiliado à Sandbox Interactive GmbH. Albion Online é marca deles. Preços: Albion Online Data Project
    (comunitário); killboard: API pública do jogo.</p>
</footer>
