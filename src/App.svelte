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
  // Fase 2
  import Mais from './routes/Mais.svelte';
  import Perdas from './routes/Perdas.svelte';
  import Guilda from './routes/Guilda.svelte';
  import Guildas from './routes/Guildas.svelte';
  import Arriscar from './routes/Arriscar.svelte';
  import Golpes from './routes/Golpes.svelte';
  import Glossario from './routes/Glossario.svelte';
  import Ouro from './routes/Ouro.svelte';
  import Saude from './routes/Saude.svelte';
  import McpInfo from './routes/McpInfo.svelte';
  import Despertador from './routes/Despertador.svelte';

  const VIEWS: Record<string, any> = {
    inicio: Inicio, item: Item, relogio: Relogio, janela: Janela, jogadores: Jogadores, dossie: Dossie,
    autopsia: Autopsia, alertas: Alertas, apoie: Apoie, permitido: Permitido, 'nao-encontrado': NaoEncontrado,
    mais: Mais, perdas: Perdas, guilda: Guilda, guildas: Guildas, arriscar: Arriscar, golpes: Golpes,
    glossario: Glossario, ouro: Ouro, saude: Saude, mcp: McpInfo, despertador: Despertador,
  };

  let route = $state(match(location.pathname));
  $effect(() => {
    const on = () => (route = match(location.pathname));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  });
  const View = $derived(VIEWS[route.name] ?? NaoEncontrado);

  // Item da navegação ativo para cada rota (aria-current).
  const SECTION: Record<string, string> = {
    inicio: '/', item: '/', relogio: '/relogio', jogadores: '/jogador', dossie: '/jogador', autopsia: '/jogador',
    alertas: '/alertas', janela: '/mais', perdas: '/perdas', mais: '/mais', guilda: '/mais', guildas: '/mais',
    arriscar: '/mais', golpes: '/mais', glossario: '/mais', ouro: '/mais', saude: '/mais', mcp: '/mais',
    despertador: '/mais',
  };
  const NAV: [href: string, label: string][] = [
    ['/', 'Mercado'], ['/perdas', 'Perdas PvP'], ['/relogio', 'Relógio'], ['/jogador', 'Dossiê'], ['/alertas', 'Alertas'],
    ['/mais', 'Mais'],
  ];
  const current = $derived(SECTION[route.name] ?? '');

  // Tema: automático (segue o sistema), claro ou escuro; lembrado neste aparelho.
  type Theme = 'auto' | 'light' | 'dark';
  const THEME_KEY = 'guarita.tema';
  const THEME_LABEL: Record<Theme, string> = { auto: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: escuro' };
  function readTheme(): Theme {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'auto';
    } catch {
      return 'auto';
    }
  }
  let theme = $state<Theme>(readTheme());
  $effect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
    try {
      if (theme === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  });
  function cycleTheme() {
    theme = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
  }

  // Ao trocar de tela, o foco vai para o conteúdo (leitor de tela anuncia a página nova).
  let mainEl = $state<HTMLElement | null>(null);
  let firstRoute = true;
  $effect(() => {
    void route;
    if (firstRoute) {
      firstRoute = false;
      return;
    }
    mainEl?.focus({ preventScroll: true });
  });
</script>

<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
<header class="topbar">
  <a class="brand" href="/" onclick={go} aria-label="Guarita, início"><img src="/icons/icon.svg" alt="" width="26" height="26" /><span>Guarita</span></a>
  <nav aria-label="Principal">
    {#each NAV as [href, label]}
      <a {href} onclick={go} aria-current={current === href ? 'page' : undefined}>{label}</a>
    {/each}
  </nav>
  <button type="button" class="theme-btn" onclick={cycleTheme} aria-label="{THEME_LABEL[theme]}. Trocar tema" title={THEME_LABEL[theme]}>
    {theme === 'auto' ? '◐' : theme === 'dark' ? '☾' : '☀'}
  </button>
</header>
<main class="wrap" id="conteudo" tabindex="-1" bind:this={mainEl} style="outline:none">
  <View params={route.params} />
</main>
<footer class="wrap footer">
  <a href="/permitido" onclick={go}>Isso é permitido?</a> · <a href="/apoie" onclick={go}>Apoie</a> ·
  <a href="https://github.com/dosxnjos/guarita" target="_blank" rel="noopener">Código aberto</a>
  <p>Não afiliado à Sandbox Interactive GmbH. Albion Online é marca deles. Preços: Albion Online Data Project
    (comunitário); killboard: API pública do jogo.</p>
</footer>
