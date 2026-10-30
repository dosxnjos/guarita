<script lang="ts">
  import { match, go } from './lib/router';
  import {
    browserPrefersSpanish, getLocale, href, htmlLang, rememberLocale, savedLocale, setLocale, switchPath, syncLocale, tx, type Locale,
  } from './lib/i18n/index.svelte';
  import { canRetryChunk, markChunkRetry } from './lib/lazyView';
  import Loading from './lib/ui/Loading.svelte';
  import ErrorBox from './lib/ui/ErrorBox.svelte';
  // Início e Item (as portas de entrada mais comuns e as páginas medidas pelo Lighthouse) vêm no pacote principal;
  // as outras telas são carregadas sob demanda (um arquivo por tela), para o primeiro carregamento não baixar e
  // executar o site inteiro. Pacote único tinha 605 kB.
  import Inicio from './routes/Inicio.svelte';
  import Item from './routes/Item.svelte';
  import NaoEncontrado from './routes/NaoEncontrado.svelte';

  type Loader = () => Promise<{ default: any }>;
  const LAZY: Record<string, Loader> = {
    relogio: () => import('./routes/Relogio.svelte'),
    janela: () => import('./routes/Janela.svelte'),
    jogadores: () => import('./routes/Jogadores.svelte'),
    dossie: () => import('./routes/Dossie.svelte'),
    autopsia: () => import('./routes/Autopsia.svelte'),
    alertas: () => import('./routes/Alertas.svelte'),
    apoie: () => import('./routes/Apoie.svelte'),
    permitido: () => import('./routes/Permitido.svelte'),
    // Fase 2
    mais: () => import('./routes/Mais.svelte'),
    perdas: () => import('./routes/Perdas.svelte'),
    guilda: () => import('./routes/Guilda.svelte'),
    guildas: () => import('./routes/Guildas.svelte'),
    arriscar: () => import('./routes/Arriscar.svelte'),
    golpes: () => import('./routes/Golpes.svelte'),
    glossario: () => import('./routes/Glossario.svelte'),
    ouro: () => import('./routes/Ouro.svelte'),
    saude: () => import('./routes/Saude.svelte'),
    mcp: () => import('./routes/McpInfo.svelte'),
    despertador: () => import('./routes/Despertador.svelte'),
    app: () => import('./routes/AppPc.svelte'),
    // Fase 3
    hoje: () => import('./routes/Hoje.svelte'),
    previsao: () => import('./routes/Previsao.svelte'),
    live: () => import('./routes/Live.svelte'),
    extensao: () => import('./routes/Extensao.svelte'),
    status: () => import('./routes/Status.svelte'),
  };
  // Telas já carregadas: voltar a uma delas é síncrono (sem esqueleto piscando).
  let loaded = $state<Record<string, any>>({ inicio: Inicio, item: Item, 'nao-encontrado': NaoEncontrado });
  let chunkError = $state('');

  let route = $state(match(location.pathname));
  $effect(() => {
    const on = () => {
      syncLocale(location.pathname);
      route = match(location.pathname);
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  });

  function loadView(name: string) {
    chunkError = '';
    LAZY[name]()
      .then((m) => {
        loaded[name] = m.default;
      })
      .catch(() => {
        // Depois de um deploy, a aba aberta ainda pede o arquivo antigo (nome com hash) e recebe 404. Recarregar uma
        // vez traz o index.html novo; se falhar de novo logo em seguida, é rede: mostra o erro com "tentar de novo".
        // Sem rede não recarrega: o reload cairia na offline.html do service worker e a página inteira sumiria.
        if (navigator.onLine !== false && canRetryChunk()) {
          markChunkRetry();
          location.reload();
          return;
        }
        chunkError = tx('Verifique a conexão e tente de novo.', 'Revisa la conexión e inténtalo de nuevo.');
      });
  }
  $effect(() => {
    const name = route.name;
    if (!loaded[name] && LAZY[name]) loadView(name);
  });
  // CSS de uma tela sob demanda que falha ao carregar também dispara este evento do Vite.
  $effect(() => {
    const onPreloadError = (e: Event) => {
      if (navigator.onLine === false || !canRetryChunk()) return;
      e.preventDefault();
      markChunkRetry();
      location.reload();
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => window.removeEventListener('vite:preloadError', onPreloadError);
  });
  const View = $derived(loaded[route.name] ?? (LAZY[route.name] ? null : NaoEncontrado));

  // Item da navegação ativo para cada rota (aria-current).
  const SECTION: Record<string, string> = {
    inicio: '/', item: '/', relogio: '/relogio', jogadores: '/jogador', dossie: '/jogador', autopsia: '/jogador',
    alertas: '/alertas', janela: '/mais', perdas: '/perdas', mais: '/mais', guilda: '/mais', guildas: '/mais',
    arriscar: '/mais', golpes: '/mais', glossario: '/mais', ouro: '/mais', saude: '/mais', mcp: '/mais',
    despertador: '/mais', app: '/app', hoje: '/mais', previsao: '/mais', live: '/mais', extensao: '/mais',
    status: '/mais',
  };
  // Caminho base (sem /es) e rótulo; o link sai com href() na língua atual. $derived: a troca de língua mantém o App.
  const NAV = $derived<[path: string, label: string][]>([
    ['/', tx('Mercado', 'Mercado')], ['/perdas', tx('Perdas PvP', 'Pérdidas PvP')], ['/relogio', tx('Relógio', 'Reloj')],
    ['/jogador', tx('Dossiê', 'Dosier')], ['/alertas', tx('Alertas', 'Alertas')], ['/app', tx('App para PC', 'App para PC')],
    ['/mais', tx('Mais', 'Más')],
  ]);
  const current = $derived(SECTION[route.name] ?? '');

  // Língua: <html lang> segue o caminho; o seletor leva ao mesmo caminho na outra língua.
  const locale = $derived(getLocale());
  $effect(() => {
    document.documentElement.lang = htmlLang();
  });
  const LANGS: [l: Locale, short: string, name: string, lang: string][] = [
    ['pt', 'PT', 'Português', 'pt-BR'],
    ['es', 'ES', 'Español', 'es'],
  ];
  // Link do seletor: o mesmo endereço na outra língua. Recalculado a cada navegação (route muda junto com o caminho) e
  // também quando a pessoa aponta, foca ou aperta o link (refreshLangHref): replaceState das telas (qualidade, filtros)
  // muda a query sem popstate, e o link aberto em nova aba ou copiado precisa sair com a query atual.
  function langHrefNow(): Record<Locale, string> {
    const tail = location.search + location.hash;
    return { pt: switchPath(location.pathname, tail, 'pt'), es: switchPath(location.pathname, tail, 'es') };
  }
  let langHref = $state<Record<Locale, string>>(langHrefNow());
  $effect(() => {
    void route;
    langHref = langHrefNow();
  });
  function refreshLangHref() {
    const next = langHrefNow();
    if (next.pt !== langHref.pt || next.es !== langHref.es) langHref = next;
  }
  function pickLang(e: MouseEvent, l: Locale) {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    hint = false;
    setLocale(l);
  }

  // Aviso discreto para quem tem o navegador em espanhol e chegou na versão em português. Nunca redireciona (link
  // compartilhado abre na língua do link); dispensar grava "pt" e o aviso não volta.
  let hint = $state(
    getLocale() === 'pt' && savedLocale() === null && typeof navigator !== 'undefined' && browserPrefersSpanish(navigator.languages ?? [navigator.language]),
  );
  function dismissHint() {
    hint = false;
    rememberLocale('pt');
  }

  // Tema: automático (segue o sistema), claro ou escuro; lembrado neste aparelho.
  type Theme = 'auto' | 'light' | 'dark';
  const THEME_KEY = 'guarita.tema';
  const THEME_LABEL = $derived<Record<Theme, string>>({
    auto: tx('Tema: automático', 'Tema: automático'),
    light: tx('Tema: claro', 'Tema: claro'),
    dark: tx('Tema: escuro', 'Tema: oscuro'),
  });
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
  // Só quando a TELA muda: link de âncora (#golpe-x) também dispara popstate e recria `route` com o mesmo nome, e
  // roubar o foco aí jogaria o leitor de tela de volta ao topo em vez do trecho escolhido.
  let mainEl = $state<HTMLElement | null>(null);
  let lastView: string | null = null;
  $effect(() => {
    const name = route.name;
    const prev = lastView;
    lastView = name;
    if (prev === null || prev === name) return;
    mainEl?.focus({ preventScroll: true });
  });
</script>

<a class="skip-link" href="#conteudo">{tx('Pular para o conteúdo', 'Saltar al contenido')}</a>
<header class="topbar">
  <a class="brand" href={href('/')} onclick={go} aria-label={tx('Guarita, início', 'Guarita, inicio')}><img src="/icons/icon.svg" alt="" width="26" height="26" /><span>Guarita</span></a>
  <nav aria-label={tx('Principal', 'Principal')}>
    {#each NAV as [path, label]}
      <a href={href(path)} onclick={go} aria-current={current === path ? 'page' : undefined}>{label}</a>
    {/each}
  </nav>
  <nav class="lang-switch" aria-label={tx('Língua', 'Idioma')}>
    {#each LANGS as [l, short, name, lang], i}
      {#if i > 0}<span class="lang-sep" aria-hidden="true">|</span>{/if}
      <a href={langHref[l]} hreflang={lang} {lang} aria-label="{short}, {name}" title={name} aria-current={locale === l ? 'true' : undefined}
        onpointerenter={refreshLangHref} onpointerdown={refreshLangHref} onfocus={refreshLangHref} oncontextmenu={refreshLangHref}
        onclick={(e) => pickLang(e, l)}>{short}</a>
    {/each}
  </nav>
  <button type="button" class="theme-btn" onclick={cycleTheme} aria-label="{THEME_LABEL[theme]}. {tx('Trocar tema', 'Cambiar tema')}" title={THEME_LABEL[theme]}>
    {theme === 'auto' ? '◐' : theme === 'dark' ? '☾' : '☀'}
  </button>
</header>
<!-- Nunca no /live: o painel vai para o OBS (fonte de navegador nova, sem preferência salva) e o aviso entraria na transmissão. -->
{#if hint && route.name !== 'live'}
  <div class="wrap lang-hint small" lang="es" role="note">
    <span>¿Prefieres español?</span>
    <a href={langHref.es} hreflang="es" onpointerenter={refreshLangHref} onpointerdown={refreshLangHref} onfocus={refreshLangHref}
      oncontextmenu={refreshLangHref} onclick={(e) => pickLang(e, 'es')}>Ver la Guarita en español</a>
    <button type="button" class="linkbtn" onclick={dismissHint}>No, gracias</button>
  </div>
{/if}
<main class="wrap" id="conteudo" tabindex="-1" bind:this={mainEl} style="outline:none">
  <!-- A troca de língua remonta a tela: texto calculado fora do template e format.ts (sem runes) se atualizam. -->
  {#key locale}
    {#if View}
      <View params={route.params} />
    {:else if chunkError}
      <section class="page"><ErrorBox message={chunkError} onretry={() => loadView(route.name)} /></section>
    {:else}
      <section class="page"><Loading lines={4} /></section>
    {/if}
  {/key}
</main>
<footer class="wrap footer">
  <a href={href('/permitido')} onclick={go}>{tx('Isso é permitido?', '¿Esto está permitido?')}</a> · <a href={href('/apoie')} onclick={go}>{tx('Apoie', 'Apoya')}</a> ·
  <a href="https://github.com/dosxnjos/guarita" target="_blank" rel="noopener">{tx('Código aberto', 'Código abierto')}</a>
  <p>{tx(
    'Não afiliado à Sandbox Interactive GmbH. Albion Online é marca deles. Preços: Albion Online Data Project (comunitário); killboard: API pública do jogo.',
    'No afiliado a Sandbox Interactive GmbH. Albion Online es una marca suya. Precios: Albion Online Data Project (comunitario); killboard: API pública del juego.',
  )}</p>
</footer>

<style>
  .lang-switch { display: flex; align-items: center; gap: 2px; flex: none; font-size: 13px; }
  .lang-switch a { color: var(--muted); text-decoration: none; padding: 4px 6px; border-radius: 6px; font-weight: 600; }
  .lang-switch a:hover { color: var(--ink); }
  .lang-switch a[aria-current='true'] { color: var(--ink); background: var(--accent-soft); }
  .lang-sep { color: var(--line); }
  .lang-hint { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 10px; color: var(--muted); }
</style>
