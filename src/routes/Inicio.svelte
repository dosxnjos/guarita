<script lang="ts">
  // Início: busca grande, atalhos populares, cartão do relógio e o que a Guarita faz diferente.
  import type { ClockResponse } from '../../shared/types';
  import { itemName, tierLabel } from '../../shared/items';
  import { loadIndex } from '../lib/itemsClient';
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import { fmtSilver, serverLabel, serverTone, splitFestivities, tierFromId, trendArrow, fmtCountdown } from '../lib/format';
  import SearchBox from '../lib/ui/SearchBox.svelte';
  import ItemIcon from '../lib/ui/ItemIcon.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import { DISCORD_INVITE } from '../lib/ui/links';

  // A rota não usa parâmetros; a prop existe porque o App passa params para toda tela.
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // Mesmo título que o _worker.js injeta no primeiro carregamento (worker/seo.ts).
  $effect(() => {
    document.title = 'Guarita: companheiro do Albion Online em português';
  });

  // Atalhos: nome de reserva caso o índice de itens ainda não tenha carregado.
  const GROUPS: { title: string; items: [id: string, fallback: string][] }[] = [
    {
      title: 'Bolsas e capas',
      items: [['T4_BAG', 'Bolsa'], ['T5_BAG', 'Bolsa'], ['T6_BAG', 'Bolsa'], ['T4_CAPE', 'Capa'], ['T5_CAPE', 'Capa'], ['T6_CAPE', 'Capa']],
    },
    {
      title: 'Recursos refinados',
      items: (
        [['PLANKS', 'Tábuas'], ['METALBAR', 'Barra de metal'], ['CLOTH', 'Tecido'], ['LEATHER', 'Couro'], ['STONEBLOCK', 'Bloco de pedra']] as const
      ).flatMap(([k, n]) => [4, 5, 6].map((t) => [`T${t}_${k}`, n] as [string, string])),
    },
  ];

  let names = $state<Record<string, string>>({});
  $effect(() => {
    loadIndex()
      .then((idx) => {
        const out: Record<string, string> = {};
        for (const g of GROUPS) for (const [id] of g.items) {
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

<svelte:head><title>Guarita · preços do Albion com idade e confiança</title></svelte:head>

<section class="page">
  <div class="hero">
    <h1>Preço do Albion com idade e confiança</h1>
    <p class="lead">Busque qualquer item e veja o preço em cada cidade do servidor Americas, há quanto tempo foi visto e se dá para confiar.</p>
    <SearchBox size="lg" label="Qual item você quer ver?" autofocus />
    <p class="small muted">Dica: digite parte do nome em português ou inglês, com o tier se quiser (“bolsa t5”, “capa martlock”). <kbd>↑</kbd> <kbd>↓</kbd> escolhem, <kbd>Enter</kbd> abre.</p>
  </div>

  <div class="grid home-grid">
    <div class="card stack">
      <div class="section-head" style="margin-top:0">
        <h2 style="margin:0">Relógio do Americas</h2>
        <a href="/relogio" onclick={go} class="small">Ver tudo</a>
      </div>
      {#if clock}
        <p class="row" style="margin:0">
          <span class="dot {serverTone(clock.server.status)}" aria-hidden="true"></span>
          <strong>Servidor: {serverLabel(clock.server.status)}</strong>
        </p>
        <div>
          <div class="kpi-label">Bônus de hoje</div>
          {#if fest && fest.active.length}
            <ul class="plain-list small">
              {#each fest.active.slice(0, 3) as f}
                <li class="festa"><span>{f.labelPt}</span><span class="muted">termina em {fmtCountdown(f.msLeft)}</span></li>
              {/each}
            </ul>
          {:else}
            <p class="small muted" style="margin:2px 0 0">Nenhuma festividade ativa agora.</p>
          {/if}
        </div>
        <div class="row" style="justify-content:space-between">
          <span><span class="kpi-label">Ouro</span><br /><strong class="num">{fmtSilver(clock.gold.price)}</strong> <span class="small muted">prata {trendArrow(clock.gold.trend)}</span></span>
          {#if clock.premiumSilver}<span style="text-align:right"><span class="kpi-label">Premium 30 dias</span><br /><strong class="num">{fmtSilver(clock.premiumSilver, true)}</strong> <span class="small muted">prata</span></span>{/if}
        </div>
      {:else if clockError}
        <p class="small muted">Não deu para carregar o relógio agora. <button type="button" class="linkbtn" onclick={loadClock}>Tentar de novo</button></p>
      {:else}
        <Loading lines={3} label="Carregando o relógio" />
      {/if}
    </div>

    <div class="card stack">
      <h2 style="margin:0">O que muda aqui</h2>
      <ul class="plain-list">
        <li><strong>Idade do preço.</strong> Cada preço mostra quando foi visto: <span class="age fresh" aria-hidden="true"></span> até 1 h, <span class="age stale" aria-hidden="true"></span> até 6 h, <span class="age" aria-hidden="true"></span> mais velho.</li>
        <li><strong>Selo de confiança.</strong> Uma nota de 0 a 100 diz se o preço é sólido ou se pode ser um anúncio isolado, com os motivos.</li>
        <li><strong>Avisos.</strong> Crie um alerta e receba no celular ou no Discord quando o preço chegar onde você quer.</li>
      </ul>
    </div>
  </div>

  {#each GROUPS as g}
    <h2>{g.title}</h2>
    <div class="chips">
      {#each g.items as [id, fallback]}
        {@const t = tierFromId(id)}
        <a class="chip" href="/item/{id}" onclick={go}>
          <ItemIcon {id} size={36} />
          <span class="chip-name">{names[id] ?? fallback}</span>
          <span class="tag">{tierLabel(t.tier, t.ench)}</span>
        </a>
      {/each}
    </div>
  {/each}

  <div class="grid" style="margin-top:28px">
    <div class="card stack">
      <h2 style="margin:0">Alertas de preço</h2>
      <p class="muted" style="margin:0">Escolha o item, a cidade e o preço. A Guarita confere a cada 5 minutos e avisa no navegador ou no Discord.</p>
      <p style="margin:0"><a class="btn primary" href="/alertas" onclick={go}>Criar um alerta</a></p>
    </div>
    <div class="card stack">
      <h2 style="margin:0">Guarita no Discord</h2>
      <p class="muted" style="margin:0">Consulte sem sair do servidor da guilda: <code>/preco</code> mostra o preço por cidade e <code>/relogio</code> mostra status, bônus e ouro.</p>
      {#if DISCORD_INVITE}
        <p style="margin:0"><a class="btn" href={DISCORD_INVITE} target="_blank" rel="noopener">Adicionar ao meu servidor</a></p>
      {:else}
        <p class="small muted" style="margin:0">O convite do bot abre em breve.</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .home-grid { margin-top: 24px; }
</style>
