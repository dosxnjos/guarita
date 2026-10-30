<script lang="ts">
  // /live: painel para a fonte de navegador do OBS. Sem parâmetros (ou com ?config) abre a configuração, com o site
  // normal; com parâmetros, só o painel, sobre fundo transparente e sem topo nem rodapé do site.
  // A transparência é uma classe no <html> posta e tirada aqui (o CSS :global abaixo só vale com ela), para não
  // mexer no App.svelte e não deixar resíduo ao sair da página. Configuração: src/lib/live/config.ts.
  import LivePanel from '../lib/live/LivePanel.svelte';
  import LiveConfigForm from '../lib/live/LiveConfigForm.svelte';
  import { isConfigMode, parseLiveConfig } from '../lib/live/config';
  import { tx } from '../lib/i18n/index.svelte';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // O roteador só olha o caminho: a query string é lida aqui e relida a cada navegação (popstate).
  let search = $state(location.search);
  $effect(() => {
    const on = () => (search = location.search);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  });

  const configMode = $derived(isConfigMode(search));
  const cfg = $derived(parseLiveConfig(search));

  $effect(() => {
    if (configMode) return;
    const el = document.documentElement;
    el.classList.add('live-obs');
    return () => el.classList.remove('live-obs');
  });
</script>

<svelte:head><title>{configMode ? tx('Painel de live para o OBS · Guarita', 'Panel para directos en OBS · Guarita') : tx('Painel de live · Guarita', 'Panel para directos · Guarita')}</title></svelte:head>

{#if configMode}
  {#key search}<LiveConfigForm initial={search} />{/key}
{:else}
  <LivePanel {cfg} />
{/if}

<style>
  /* Só com a classe live-obs (modo painel): fundo transparente para o OBS e nada do site em volta. */
  :global(html.live-obs),
  :global(html.live-obs body) {
    background: transparent !important;
    color-scheme: normal !important;
  }
  :global(html.live-obs body) { overflow: hidden; }
  :global(html.live-obs .topbar),
  :global(html.live-obs .footer),
  :global(html.live-obs .skip-link),
  :global(html.live-obs .lang-hint) {
    display: none !important;
  }
  :global(html.live-obs main.wrap) { max-width: none; margin: 0; padding: 0; }
</style>
