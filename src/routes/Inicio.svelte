<script lang="ts">
  // Início: busca grande, atalhos populares, cartão do relógio e o que a Guarita faz diferente.
  // Modelo de tela nas duas línguas: texto com tx('pt', 'es'), link com href('/x') + onclick={go}, número via format.ts
  // com getLocale(). Nome de item: loadIndex() já carrega o índice da língua (itemsClient.ts).
  import type { ClockResponse } from '../../shared/types';
  import { itemName, tierLabel } from '../../shared/items';
  import { festivityLabel } from '../../shared/festivities';
  import { loadIndex } from '../lib/itemsClient';
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import { fmtSilver, serverLabel, serverTone, splitFestivities, tierFromId, trendArrow, fmtCountdown } from '../lib/format';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  import SearchBox from '../lib/ui/SearchBox.svelte';
  import ItemIcon from '../lib/ui/ItemIcon.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import { DISCORD_INVITE } from '../lib/ui/links';

  // A rota não usa parâmetros; a prop existe porque o App passa params para toda tela.
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // Mesmo título que o _worker.js injeta no primeiro carregamento (worker/seo.ts, FIXED_ROUTES e FIXED_ES).
  $effect(() => {
    document.title = tx('Guarita: companheiro do Albion Online em português', 'Guarita: compañero de Albion Online en español');
  });

  // Atalhos: nome de reserva caso o índice de itens ainda não tenha carregado.
  const GROUPS = $derived<{ title: string; items: [id: string, fallback: string][] }[]>([
    {
      title: tx('Bolsas e capas', 'Bolsas y capas'),
      items: (
        [['T4_BAG', tx('Bolsa', 'Bolsa')], ['T5_BAG', tx('Bolsa', 'Bolsa')], ['T6_BAG', tx('Bolsa', 'Bolsa')],
          ['T4_CAPE', tx('Capa', 'Capa')], ['T5_CAPE', tx('Capa', 'Capa')], ['T6_CAPE', tx('Capa', 'Capa')]] as [string, string][]
      ),
    },
    {
      title: tx('Recursos refinados', 'Recursos refinados'),
      items: (
        [
          ['PLANKS', tx('Tábuas', 'Tablas')], ['METALBAR', tx('Barra de metal', 'Lingote de metal')], ['CLOTH', tx('Tecido', 'Tela')],
          ['LEATHER', tx('Couro', 'Cuero')], ['STONEBLOCK', tx('Bloco de pedra', 'Bloque de piedra')],
        ] as [string, string][]
      ).flatMap(([k, n]) => [4, 5, 6].map((t) => [`T${t}_${k}`, n] as [string, string])),
    },
  ]);

  let names = $state<Record<string, string>>({});
  $effect(() => {
    const groups = GROUPS;
    loadIndex()
      .then((idx) => {
        const out: Record<string, string> = {};
        for (const g of groups) for (const [id] of g.items) {
          try { out[id] = itemName(idx, id); } catch { /* fica o nome de reserva */ }
        }
        names = out;
      })
      .catch(() => {});
  });

  let clock = $state<ClockResponse | null>(null);
  let clockError = $state(false);
  let now = $state(Date.now());
  async function loadClock() {
    try {
      clock = await api.clock();
      clockError = false;
    } catch {
      clockError = true;
    }
  }
  $effect(() => {
    loadClock();
    const a = setInterval(loadClock, 120000);
    const b = setInterval(() => (now = Date.now()), 30000);
    return () => { clearInterval(a); clearInterval(b); };
  });
  const fest = $derived(clock ? splitFestivities(clock.festivities, now) : null);
</script>

<svelte:head><title>{tx('Guarita · preços do Albion com idade e confiança', 'Guarita · precios de Albion con antigüedad y confianza')}</title></svelte:head>

<section class="page">
  <div class="hero">
    <h1>{tx('Preço do Albion com idade e confiança', 'Precios de Albion con antigüedad y confianza')}</h1>
    <p class="lead">{tx(
      'Busque qualquer item e veja o preço em cada cidade do servidor Americas, há quanto tempo foi visto e se dá para confiar.',
      'Busca cualquier objeto y mira el precio en cada ciudad del servidor Americas, hace cuánto se vio y si es confiable.',
    )}</p>
    <SearchBox size="lg" label={tx('Qual item você quer ver?', '¿Qué objeto quieres ver?')} autofocus />
    {#if getLocale() === 'es'}
      <p class="small muted">Consejo: escribe parte del nombre en español o inglés, con el tier si quieres (“bolsa t5”, “capa de martlock”). <kbd>↑</kbd> <kbd>↓</kbd> eligen, <kbd>Enter</kbd> abre.</p>
    {:else}
      <p class="small muted">Dica: digite parte do nome em português ou inglês, com o tier se quiser (“bolsa t5”, “capa martlock”). <kbd>↑</kbd> <kbd>↓</kbd> escolhem, <kbd>Enter</kbd> abre.</p>
    {/if}
  </div>

  <div class="grid home-grid">
    <div class="card stack">
      <div class="section-head" style="margin-top:0">
        <h2 style="margin:0">{tx('Relógio do Americas', 'Reloj de Americas')}</h2>
        <a href={href('/relogio')} onclick={go} class="small">{tx('Ver tudo', 'Ver todo')}</a>
      </div>
      {#if clock}
        <p class="row" style="margin:0">
          <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>
          <strong>{tx('Servidor', 'Servidor')}: {serverLabel(clock.server.status, getLocale())}</strong>
        </p>
        <div>
          <div class="kpi-label">{tx('Bônus de hoje', 'Bonificaciones de hoy')}</div>
          {#if fest && fest.active.length}
            <ul class="plain-list small">
              {#each fest.active.slice(0, 3) as f}
                <li class="festa"><span>{festivityLabel(f, getLocale())}</span><span class="muted">{tx('termina em', 'termina en')} {fmtCountdown(f.msLeft, getLocale())}</span></li>
              {/each}
            </ul>
          {:else}
            <p class="small muted" style="margin:2px 0 0">{tx('Nenhuma festividade ativa agora.', 'No hay ninguna festividad activa ahora.')}</p>
          {/if}
        </div>
        <div class="row" style="justify-content:space-between">
          <span><span class="kpi-label">{tx('Ouro', 'Oro')}</span><br /><strong class="num">{fmtSilver(clock.gold.price, false, getLocale())}</strong> <span class="small muted">{tx('prata', 'plata')} {trendArrow(clock.gold.trend)}</span></span>
          {#if clock.premiumSilver}<span style="text-align:right"><span class="kpi-label">{tx('Premium 30 dias', 'Premium 30 días')}</span><br /><strong class="num">{fmtSilver(clock.premiumSilver, true, getLocale())}</strong> <span class="small muted">{tx('prata', 'plata')}</span></span>{/if}
        </div>
      {:else if clockError}
        <p class="small muted">{tx('Não deu para carregar o relógio agora.', 'No se pudo cargar el reloj ahora.')} <button type="button" class="linkbtn" onclick={loadClock}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
      {:else}
        <Loading lines={3} label={tx('Carregando o relógio', 'Cargando el reloj')} />
      {/if}
    </div>

    <div class="card stack">
      <h2 style="margin:0">{tx('O que muda aqui', 'Qué cambia aquí')}</h2>
      {#if getLocale() === 'es'}
        <ul class="plain-list">
          <li><strong>Antigüedad del precio.</strong> Cada precio muestra cuándo se vio: <span class="age fresh" aria-hidden="true"></span> hasta 1 h, <span class="age stale" aria-hidden="true"></span> hasta 6 h, <span class="age" aria-hidden="true"></span> más antiguo.</li>
          <li><strong>Sello de confianza.</strong> Una nota de 0 a 100 dice si el precio es sólido o si puede ser un anuncio aislado, con los motivos.</li>
          <li><strong>Avisos.</strong> Crea una alerta y recibe un aviso en el celular o en Discord cuando el precio llegue a donde quieres.</li>
        </ul>
      {:else}
        <ul class="plain-list">
          <li><strong>Idade do preço.</strong> Cada preço mostra quando foi visto: <span class="age fresh" aria-hidden="true"></span> até 1 h, <span class="age stale" aria-hidden="true"></span> até 6 h, <span class="age" aria-hidden="true"></span> mais velho.</li>
          <li><strong>Selo de confiança.</strong> Uma nota de 0 a 100 diz se o preço é sólido ou se pode ser um anúncio isolado, com os motivos.</li>
          <li><strong>Avisos.</strong> Crie um alerta e receba no celular ou no Discord quando o preço chegar onde você quer.</li>
        </ul>
      {/if}
    </div>
  </div>

  {#each GROUPS as g}
    <h2>{g.title}</h2>
    <div class="chips">
      {#each g.items as [id, fallback]}
        {@const t = tierFromId(id)}
        <a class="chip" href={href(`/item/${id}`)} onclick={go}>
          <ItemIcon {id} size={36} />
          <span class="chip-name">{names[id] ?? fallback}</span>
          <span class="tag">{tierLabel(t.tier, t.ench)}</span>
        </a>
      {/each}
    </div>
  {/each}

  <div class="grid" style="margin-top:28px">
    <div class="card stack">
      <h2 style="margin:0">{tx('Alertas de preço', 'Alertas de precio')}</h2>
      <p class="muted" style="margin:0">{tx(
        'Escolha o item, a cidade e o preço. A Guarita confere a cada 5 minutos e avisa no navegador ou no Discord.',
        'Elige el objeto, la ciudad y el precio. La Guarita revisa cada 5 minutos y te avisa en el navegador o en Discord.',
      )}</p>
      <p style="margin:0"><a class="btn primary" href={href('/alertas')} onclick={go}>{tx('Criar um alerta', 'Crear una alerta')}</a></p>
    </div>
    <div class="card stack">
      <h2 style="margin:0">{tx('Guarita no Discord', 'Guarita en Discord')}</h2>
      {#if getLocale() === 'es'}
        <p class="muted" style="margin:0">Consulta sin salir del servidor del gremio: <code>/precio</code> muestra el precio por ciudad y <code>/reloj</code> muestra el estado, las bonificaciones y el oro.</p>
      {:else}
        <p class="muted" style="margin:0">Consulte sem sair do servidor da guilda: <code>/preco</code> mostra o preço por cidade e <code>/relogio</code> mostra status, bônus e ouro.</p>
      {/if}
      {#if DISCORD_INVITE}
        <p style="margin:0"><a class="btn" href={DISCORD_INVITE} target="_blank" rel="noopener">{tx('Adicionar ao meu servidor', 'Agregar a mi servidor')}</a></p>
      {:else}
        <p class="small muted" style="margin:0">{tx('O convite do bot abre em breve.', 'La invitación del bot estará disponible pronto.')}</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .home-grid { margin-top: 24px; }
</style>
