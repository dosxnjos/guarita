<script lang="ts">
  // Widget "Lente de mercado" (experimental, desligada por padrão). Dono: módulo (c).
  // Só escuta o websocket do cliente do Albion Data Project (projeto comunitário, sem ligação com a SBI) rodando no
  // computador do usuário (lib/lens/aodpWs.ts). A Guarita não captura rede nem lê o jogo: quem lê o tráfego de rede
  // do jogo é esse cliente, instalado por escolha do usuário. A tela diz isso antes do passo a passo.
  // Com um item aberto no mercado do jogo, mostra o preço dele nas outras cidades pela API da Guarita.
  import { onMount } from 'svelte';
  import type { CityQuote, ItemResponse, Quality } from '../../../shared/types';
  import { findItem, tierLabel, type ItemsIndex } from '../../../shared/items';
  import { RENDER_BASE } from '../../../shared/market';
  import { api } from '../lib/api';
  import { carregarItens } from '../lib/ui-itens';
  import { onConfigChange, updateConfig } from '../lib/config';
  import { criarLente, resumirOfertas, type EstadoLente, type OfertaVista } from '../lib/lens/aodpWs';
  import { abrirLink } from '../lib/links';
  import {
    QUALITIES,
    QUALITY_LABEL,
    ageTone,
    ageToneLabel,
    confidenceTone,
    fmtAge,
    fmtPct,
    fmtSilver,
    fmtTime,
    sortCities,
  } from '../lib/format';
  import Carregando from '../lib/ui/Carregando.svelte';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';

  const SITE_AODP = 'https://www.albion-online-data.com/';
  const PERMITIDO = 'https://guarita.pages.dev/permitido';
  const CONFIG_YAML = 'EnableWebsockets: true\nAllowedWebsocketHosts:\n  - tauri.localhost';

  const lente = criarLente();
  let ligada = $state(false);
  let urlLente = '';
  let estado = $state<EstadoLente>('desligada');
  let salvando = $state(false);

  let itemId = $state<string | null>(null);
  let ofertas = $state.raw<OfertaVista[]>([]);
  let vistoEm = $state<string | null>(null);
  let qualidade = $state<Quality>(1);

  let quote = $state.raw<ItemResponse | null>(null);
  let carregando = $state(false);
  let erro = $state<string | null>(null);
  let indice = $state.raw<ItemsIndex | null>(null);
  let copiado = $state(false);

  const tupla = $derived(indice && itemId ? findItem(indice, itemId) : undefined);
  const nome = $derived(tupla ? tupla[1] || tupla[2] || itemId : itemId);
  const tier = $derived(tupla ? tierLabel(tupla[3], tupla[4]) : '');
  const resumo = $derived(resumirOfertas(ofertas.filter((o) => o.quality === qualidade)));
  const qualidadesVistas = $derived(new Set(ofertas.map((o) => o.quality)));
  const linhas = $derived<CityQuote[]>(quote ? sortCities(quote.cities) : []);

  onMount(() => {
    const offEstado = lente.onEstado((e) => (estado = e));
    const offItem = lente.onItemAberto(aoVerItem);
    // Liga e desliga só quando a escolha muda (outras mudanças de config não derrubam a conexão).
    let aplicada: boolean | null = null;
    const offCfg = onConfigChange((c) => {
      ligada = c.lente.ligada;
      if (c.lente.ligada === aplicada && c.lente.url === urlLente) return;
      aplicada = c.lente.ligada;
      urlLente = c.lente.url;
      if (c.lente.ligada) lente.conectar(c.lente.url);
      else lente.desconectar();
    });
    return () => {
      offCfg();
      offItem();
      offEstado();
      lente.desconectar();
    };
  });

  function aoVerItem(id: string, vistas: OfertaVista[]) {
    const novo = id !== itemId;
    itemId = id;
    ofertas = vistas;
    vistoEm = vistas[0]?.at ?? null;
    if (novo || !vistas.some((o) => o.quality === qualidade)) qualidade = resumirOfertas(vistas).quality;
    void carregarPreco();
    void garantirIndice();
  }

  let seq = 0;
  async function carregarPreco() {
    if (!itemId) return;
    const meu = ++seq;
    carregando = true;
    erro = null;
    try {
      const r = await api.item(itemId, qualidade);
      if (meu !== seq) return;
      quote = r.data;
    } catch (e) {
      if (meu !== seq) return;
      quote = null;
      erro = e instanceof Error ? e.message : 'Não foi possível consultar o preço agora.';
    } finally {
      if (meu === seq) carregando = false;
    }
  }

  async function garantirIndice() {
    if (indice) return;
    try {
      // Mesma cópia local do preço rápido (Cache Storage): sem baixar 1 MB a cada abertura e funciona sem internet.
      indice = await carregarItens();
    } catch {
      /* sem índice: mostra o id do item, o preço continua */
    }
  }

  async function alternar() {
    salvando = true;
    try {
      await updateConfig((c) => {
        c.lente.ligada = !c.lente.ligada;
      });
    } finally {
      salvando = false;
    }
  }

  async function copiarConfig() {
    try {
      await navigator.clipboard.writeText(CONFIG_YAML);
      copiado = true;
      setTimeout(() => (copiado = false), 2000);
    } catch {
      copiado = false;
    }
  }

  const ROTULO_ESTADO: Record<EstadoLente, [texto: string, tom: string]> = {
    desligada: ['Desligada', ''],
    conectando: ['Procurando o cliente', 'info'],
    conectada: ['Conectada', 'good'],
    'sem-cliente': ['Cliente não encontrado', 'warn'],
    erro: ['Conexão caiu', 'bad'],
  };

  function diferenca(c: CityQuote): string {
    const aqui = resumo.venda?.price;
    if (!aqui || c.sellMin === null || c.city === resumo.city) return '';
    return fmtPct((c.sellMin - aqui) / aqui, true);
  }
</script>

<div class="lente stack">
  <div class="topo">
    <button type="button" class="switch" role="switch" aria-checked={ligada} disabled={salvando} onclick={alternar}>
      <span class="switch-track" aria-hidden="true"></span>
      <span class="small"><strong>Lente</strong></span>
    </button>
    <span class="tag {ROTULO_ESTADO[estado][1]}" role="status" aria-live="polite">{ROTULO_ESTADO[estado][0]}</span>
  </div>

  {#if estado === 'desligada'}
    <p class="small" style="margin:0">
      Com o <strong>cliente do Albion Data Project</strong> aberto no seu computador, a lente mostra o preço do item
      que você abriu no mercado do jogo nas outras cidades.
    </p>
    <p class="small muted" style="margin:0">
      O cliente do Albion Data Project é um programa comunitário, sem ligação com a Sandbox Interactive, que lê o
      tráfego de rede do jogo no seu PC para registrar os preços do mercado. Instalar é escolha sua.
    </p>
    <p class="small muted" style="margin:0">
      A Guarita só escuta o que esse cliente publica no seu próprio computador. Ela não captura rede, não lê o jogo e
      não manda nada ao cliente. Fica desligada até você ligar.
    </p>
  {:else if estado === 'conectando'}
    <Carregando texto="Procurando o cliente do Albion Data Project…" />
  {:else if estado === 'sem-cliente' || estado === 'erro'}
    <div class="callout warn stack">
      {#if estado === 'erro'}
        <strong>A conexão com o cliente caiu</strong>
        <p class="small" style="margin:0">O cliente foi fechado ou reiniciado. A Guarita tenta de novo sozinha enquanto a lente estiver ligada.</p>
      {:else}
        <strong>Não encontramos o cliente com o websocket ligado</strong>
        <p class="small" style="margin:0">A Guarita tenta de novo sozinha a cada poucos segundos enquanto a lente estiver ligada.</p>
      {/if}
    </div>
    <details class="passos" open={estado === 'sem-cliente'}>
      <summary class="small"><strong>Como ligar, passo a passo</strong></summary>
      <ol class="small">
        <li>
          Instale e abra o cliente do Albion Data Project (projeto comunitário):
          <a href={SITE_AODP} onclick={(e) => abrirLink(e, SITE_AODP)}>albion-online-data.com</a>. Ele lê o tráfego
          de rede do jogo no seu PC; instalar é escolha sua.
        </li>
        <li>
          Na pasta onde o cliente está instalado (a mesma do <span class="mono">albiondata-client.exe</span>), crie ou
          edite o arquivo <span class="mono">config.yaml</span> com:
          <pre class="mono yaml">{CONFIG_YAML}</pre>
          <button type="button" class="btn mini-btn" onclick={copiarConfig}>{copiado ? 'Copiado' : 'Copiar'}</button>
        </li>
        <li>Feche e abra o cliente de novo para ele ler o arquivo.</li>
      </ol>
      <p class="small muted" style="margin:0">
        Sem a linha <span class="mono">tauri.localhost</span>, o cliente recusa a conexão do app e a tela fica igual à de
        cliente fechado.
      </p>
      <p class="small muted" style="margin:0">
        <strong>Por que vale a pena:</strong> o cliente envia ao Albion Data Project os preços que você vê no mercado. São
        esses envios que mantêm os preços da Guarita e de outros sites atualizados para toda a comunidade.
        O cliente é um projeto comunitário de código aberto, separado da Guarita; usar ou não é escolha sua.
        <a href={PERMITIDO} onclick={(e) => abrirLink(e, PERMITIDO)}>O que é e o que não é permitido</a>.
      </p>
    </details>
    <div><button type="button" class="btn mini-btn" onclick={() => lente.conectar(urlLente)}>Tentar agora</button></div>
  {:else if !itemId}
    <p class="small" style="margin:0">Conectada ao cliente. Abra um item no mercado do jogo e o preço nas outras cidades aparece aqui.</p>
  {/if}

  {#if estado === 'conectada' && itemId}
    <div class="item">
      <img
        class="item-icon"
        src="{RENDER_BASE}/{encodeURIComponent(itemId)}.png?quality={qualidade}&size=64"
        alt=""
        width="40"
        height="40"
      />
      <div class="nome">
        <strong>{nome}</strong>
        <span class="small muted">{tier}{tier ? ' · ' : ''}{QUALITY_LABEL[qualidade]}</span>
      </div>
      <label class="q">
        <span class="sr-only">Qualidade</span>
        <select class="input" bind:value={qualidade} onchange={() => void carregarPreco()}>
          {#each QUALITIES as q (q)}
            <option value={q}>{QUALITY_LABEL[q]}{qualidadesVistas.has(q) ? ' •' : ''}</option>
          {/each}
        </select>
      </label>
    </div>

    <p class="small visto" style="margin:0">
      {#if resumo.venda || resumo.compra}
        Visto agora{resumo.city ? ` em ${resumo.city}` : ''}{vistoEm ? ` (${fmtTime(vistoEm, undefined, false)})` : ''}:
        {#if resumo.venda}venda a partir de <strong>{fmtSilver(resumo.venda.price)}</strong>{/if}{#if resumo.venda && resumo.compra}{'; '}{/if}{#if resumo.compra}compra até <strong>{fmtSilver(resumo.compra.price)}</strong>{/if}.
      {:else}
        <span class="muted">Nenhuma ordem vista nesta qualidade no seu mercado.</span>
      {/if}
    </p>

    {#if carregando && !quote}
      <Carregando texto="Consultando as outras cidades…" />
    {:else if erro}
      <ErroCaixa mensagem={erro} ontentar={() => void carregarPreco()} />
    {:else if quote}
      <div class="table-wrap">
        <table class="data tabela">
          <thead>
            <tr><th>Cidade</th><th class="num">Venda</th><th class="num">Compra</th><th>Idade</th><th>Selo</th></tr>
          </thead>
          <tbody>
            {#each linhas as c (c.city)}
              <tr class:aqui={c.city === resumo.city}>
                <td>{c.city}{#if c.city === resumo.city}<span class="sr-only"> (você está aqui)</span>{/if}</td>
                <td class="num">
                  {c.sellMin === null ? '—' : fmtSilver(c.sellMin)}
                  {#if diferenca(c)}<span class="dif muted">{diferenca(c)}</span>{/if}
                </td>
                <td class="num">{c.buyMax === null ? '—' : fmtSilver(c.buyMax)}</td>
                <td>
                  <span class="age-wrap" title={ageToneLabel(ageTone(c.ageMin))}>
                    <span class="age {ageTone(c.ageMin)}" aria-hidden="true"></span>{fmtAge(c.ageMin)}
                  </span>
                </td>
                <td><span class="tag {confidenceTone(c.confidence.label)}" title={c.confidence.reasons.join(' · ')}>{c.confidence.label}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small muted" style="margin:0">
        Outras cidades: Albion Data Project, pela Guarita. A diferença compara com a venda mais barata vista aqui.
      </p>
    {/if}
  {/if}
</div>

<style>
  .lente { gap: 10px; }
  .topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .item { display: flex; align-items: center; gap: 10px; }
  .nome { display: grid; min-width: 0; flex: 1; }
  .nome strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .q select { padding: 4px 6px; font-size: 13px; width: auto; }
  .tabela { font-size: 13px; }
  .tabela th, .tabela td { padding: 5px 6px; }
  .tabela tr.aqui td { background: var(--accent-soft); }
  .dif { display: block; font-size: 11px; }
  .passos ol { margin: 6px 0; padding-left: 18px; display: grid; gap: 6px; }
  .yaml { margin: 6px 0 4px; padding: 8px 10px; background: var(--surface-2); border-radius: 6px; font-size: 12px; white-space: pre; overflow-x: auto; }
  .mini-btn { padding: 4px 10px; font-size: 13px; }
  summary { cursor: pointer; }
</style>
