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
    ageTone,
    ageToneLabel,
    cityName,
    confidenceText,
    confidenceTone,
    fmtAge,
    fmtPct,
    fmtSilver,
    fmtTime,
    qualityName,
    sortCities,
  } from '../lib/format';
  import { getLocale, linkSite, tx } from '../lib/i18n.svelte';
  import Carregando from '../lib/ui/Carregando.svelte';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';

  const SITE_AODP = 'https://www.albion-online-data.com/';
  const PERMITIDO = linkSite('/permitido');
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
      erro = e instanceof Error ? e.message : tx('Não foi possível consultar o preço agora.', 'No fue posible consultar el precio ahora.');
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
    desligada: [tx('Desligada', 'Desactivada'), ''],
    conectando: [tx('Procurando o cliente', 'Buscando el cliente'), 'info'],
    conectada: [tx('Conectada', 'Conectada'), 'good'],
    'sem-cliente': [tx('Cliente não encontrado', 'Cliente no encontrado'), 'warn'],
    erro: [tx('Conexão caiu', 'Se cayó la conexión'), 'bad'],
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
      <span class="small"><strong>{tx('Lente', 'Lente')}</strong></span>
    </button>
    <span class="tag {ROTULO_ESTADO[estado][1]}" role="status" aria-live="polite">{ROTULO_ESTADO[estado][0]}</span>
  </div>

  {#if estado === 'desligada' && getLocale() === 'es'}
    <p class="small" style="margin:0">
      Con el <strong>cliente del Albion Data Project</strong> abierto en tu computadora, la lente muestra el precio en
      las demás ciudades del objeto que abriste en el mercado del juego.
    </p>
    <p class="small muted" style="margin:0">
      El cliente del Albion Data Project es un programa comunitario, sin relación con Sandbox Interactive, que lee el
      tráfico de red del juego en tu PC para registrar los precios del mercado. Instalarlo es tu decisión.
    </p>
    <p class="small muted" style="margin:0">
      La Guarita solo escucha lo que ese cliente publica en tu propia computadora. No captura la red, no lee el juego y
      no envía nada al cliente. Queda desactivada hasta que la actives.
    </p>
  {:else if estado === 'desligada'}
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
    <Carregando texto={tx('Procurando o cliente do Albion Data Project…', 'Buscando el cliente del Albion Data Project…')} />
  {:else if estado === 'sem-cliente' || estado === 'erro'}
    <div class="callout warn stack">
      {#if estado === 'erro'}
        <strong>{tx('A conexão com o cliente caiu', 'Se cayó la conexión con el cliente')}</strong>
        <p class="small" style="margin:0">{tx('O cliente foi fechado ou reiniciado. A Guarita tenta de novo sozinha enquanto a lente estiver ligada.', 'El cliente se cerró o se reinició. La Guarita vuelve a intentarlo sola mientras la lente esté activada.')}</p>
      {:else}
        <strong>{tx('Não encontramos o cliente com o websocket ligado', 'No encontramos el cliente con el websocket activado')}</strong>
        <p class="small" style="margin:0">{tx('A Guarita tenta de novo sozinha a cada poucos segundos enquanto a lente estiver ligada.', 'La Guarita vuelve a intentarlo sola cada pocos segundos mientras la lente esté activada.')}</p>
      {/if}
    </div>
    {#if getLocale() === 'es'}
    <details class="passos" open={estado === 'sem-cliente'}>
      <summary class="small"><strong>Cómo activarla, paso a paso</strong></summary>
      <ol class="small">
        <li>
          Instala y abre el cliente del Albion Data Project (proyecto comunitario):
          <a href={SITE_AODP} onclick={(e) => abrirLink(e, SITE_AODP)}>albion-online-data.com</a>. Lee el tráfico
          de red del juego en tu PC; instalarlo es tu decisión.
        </li>
        <li>
          En la carpeta donde está instalado el cliente (la misma de <span class="mono">albiondata-client.exe</span>), crea o
          edita el archivo <span class="mono">config.yaml</span> con:
          <pre class="mono yaml">{CONFIG_YAML}</pre>
          <button type="button" class="btn mini-btn" onclick={copiarConfig}>{copiado ? 'Copiado' : 'Copiar'}</button>
        </li>
        <li>Cierra y vuelve a abrir el cliente para que lea el archivo.</li>
      </ol>
      <p class="small muted" style="margin:0">
        Sin la línea <span class="mono">tauri.localhost</span>, el cliente rechaza la conexión de la app y la pantalla queda igual que
        con el cliente cerrado.
      </p>
      <p class="small muted" style="margin:0">
        <strong>Por qué vale la pena:</strong> el cliente envía al Albion Data Project los precios que ves en el mercado. Son
        esos envíos los que mantienen actualizados los precios de la Guarita y de otros sitios para toda la comunidad.
        El cliente es un proyecto comunitario de código abierto, separado de la Guarita; usarlo o no es tu decisión.
        <a href={PERMITIDO} onclick={(e) => abrirLink(e, PERMITIDO)}>Qué está permitido y qué no</a>.
      </p>
    </details>
    {:else}
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
    {/if}
    <div><button type="button" class="btn mini-btn" onclick={() => lente.conectar(urlLente)}>{tx('Tentar agora', 'Intentar ahora')}</button></div>
  {:else if !itemId}
    <p class="small" style="margin:0">{tx('Conectada ao cliente. Abra um item no mercado do jogo e o preço nas outras cidades aparece aqui.', 'Conectada al cliente. Abre un objeto en el mercado del juego y el precio en las demás ciudades aparece aquí.')}</p>
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
        <span class="small muted">{tier}{tier ? ' · ' : ''}{qualityName(qualidade)}</span>
      </div>
      <label class="q">
        <span class="sr-only">{tx('Qualidade', 'Calidad')}</span>
        <select class="input" bind:value={qualidade} onchange={() => void carregarPreco()}>
          {#each QUALITIES as q (q)}
            <option value={q}>{qualityName(q)}{qualidadesVistas.has(q) ? ' •' : ''}</option>
          {/each}
        </select>
      </label>
    </div>

    <p class="small visto" style="margin:0">
      {#if (resumo.venda || resumo.compra) && getLocale() === 'es'}
        Visto ahora{resumo.city ? ` en ${cityName(resumo.city)}` : ''}{vistoEm ? ` (${fmtTime(vistoEm, undefined, false)})` : ''}:
        {#if resumo.venda}venta desde <strong>{fmtSilver(resumo.venda.price)}</strong>{/if}{#if resumo.venda && resumo.compra}{'; '}{/if}{#if resumo.compra}compra hasta <strong>{fmtSilver(resumo.compra.price)}</strong>{/if}.
      {:else if resumo.venda || resumo.compra}
        Visto agora{resumo.city ? ` em ${resumo.city}` : ''}{vistoEm ? ` (${fmtTime(vistoEm, undefined, false)})` : ''}:
        {#if resumo.venda}venda a partir de <strong>{fmtSilver(resumo.venda.price)}</strong>{/if}{#if resumo.venda && resumo.compra}{'; '}{/if}{#if resumo.compra}compra até <strong>{fmtSilver(resumo.compra.price)}</strong>{/if}.
      {:else}
        <span class="muted">{tx('Nenhuma ordem vista nesta qualidade no seu mercado.', 'No se vio ninguna orden en esta calidad en tu mercado.')}</span>
      {/if}
    </p>

    {#if carregando && !quote}
      <Carregando texto={tx('Consultando as outras cidades…', 'Consultando las demás ciudades…')} />
    {:else if erro}
      <ErroCaixa mensagem={erro} ontentar={() => void carregarPreco()} />
    {:else if quote}
      <div class="table-wrap">
        <table class="data tabela">
          <thead>
            <tr><th>{tx('Cidade', 'Ciudad')}</th><th class="num">{tx('Venda', 'Venta')}</th><th class="num">{tx('Compra', 'Compra')}</th><th>{tx('Idade', 'Antigüedad')}</th><th>{tx('Selo', 'Confianza')}</th></tr>
          </thead>
          <tbody>
            {#each linhas as c (c.city)}
              <tr class:aqui={c.city === resumo.city}>
                <td>{cityName(c.city)}{#if c.city === resumo.city}<span class="sr-only"> {tx('(você está aqui)', '(estás aquí)')}</span>{/if}</td>
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
                <td><span class="tag {confidenceTone(c.confidence.label)}" title={c.confidence.reasons.join(' · ')}>{confidenceText(c.confidence.label)}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small muted" style="margin:0">
        {tx('Outras cidades: Albion Data Project, pela Guarita. A diferença compara com a venda mais barata vista aqui.', 'Demás ciudades: Albion Data Project, a través de la Guarita. La diferencia compara con la venta más barata vista aquí.')}
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
