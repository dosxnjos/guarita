<script lang="ts">
  // /mcp: explica o servidor MCP público da Guarita e como ligá-lo no Claude, no Cursor e no VS Code.
  // A lista de ferramentas vem de worker/mcp/catalog.ts, que não importa nada (não puxa código do Worker).
  import { MCP_TOOLS, MCP_URL, MCP_CALLS_PER_MIN } from '../../worker/mcp/catalog';
  import { go } from '../lib/router';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // Espanhol das ferramentas, por nome (o catálogo do Worker é só pt e é o que o assistente lê). Ferramenta nova sem
  // entrada aqui aparece em pt na tela em espanhol.
  const TOOL_ES: Record<string, { title: string; description: string; example: string }> = {
    buscar_item: {
      title: 'Buscar objeto',
      description:
        'Busca objetos de Albion Online por el nombre en portugués o inglés (ej.: "bolsa adepto", "espada larga t6", ' +
        '"T4_BAG@1") y devuelve hasta 10 resultados con el id interno y el nombre en portugués. Úsala antes de preco_item ' +
        'cuando no sepas el id exacto. El tier puede venir como número (t4, 4.1) o nombre (adepto, mestre).',
      example: '¿Cuál es el id de la Bolsa del iniciado con encantamiento 1?',
    },
    preco_item: {
      title: 'Precio del objeto',
      description:
        'Precio actual de un objeto en el mercado del servidor Americas: venta más baja y compra más alta por ciudad, ' +
        'antigüedad del dato, mediana de 7 días, rango normal, veredicto (barato, normal, caro) y la mejor reventa al ' +
        'Mercado Negro. Datos del Albion Data Project, enviados por jugadores: pueden tener minutos u horas de retraso; ' +
        'confírmalo en el juego.',
      example: '¿Cuánto cuesta la Bolsa del iniciado 4.1 y dónde la compro más barata?',
    },
    relogio: {
      title: 'Reloj de Americas',
      description:
        'Estado del servidor Americas, bonificaciones y festividades activas, cotización del oro, precio del Premium en ' +
        'plata y fin aproximado de la temporada. Fechas en horario de Brasilia.',
      example: '¿El servidor está en línea? ¿Cuánto está el oro hoy?',
    },
    dossie_jogador: {
      title: 'Dosier de jugador',
      description:
        'Dosier público de un jugador de Americas según el killboard oficial: gremio, fama, armas más usadas, estilo ' +
        '(solo o en grupo), últimos asesinatos y muertes y una nota de peligro. El killboard oficial es lento: la ' +
        'respuesta puede tardar hasta 1 minuto. Dato histórico, nunca la posición actual del jugador.',
      example: 'Muéstrame el dosier del jugador (nombre del personaje).',
    },
    perdas_pvp: {
      title: 'Objetos más perdidos en PvP',
      description:
        'Objetos más perdidos en el PvP de Americas (killboard recopilado por la Guarita) con el precio actual y el ' +
        'valor total perdido en las muertes (una parte se saquea, no se destruye): sirve para saber qué fabricar y ' +
        'vender. Ventana de 1 (hoy, UTC) a 7 días.',
      example: '¿Qué objetos se perdieron más en PvP esta semana? ¿Qué vale la pena fabricar?',
    },
    o_que_fazer: {
      title: 'Qué hacer hoy',
      description:
        'Sugiere qué hacer con la plata y el tiempo del jugador en Americas, con datos en vivo del Albion Data Project: ' +
        'hasta 3 opciones por camino (reventa al Mercado Negro, refinado en la ciudad con bonificación y la bonificación ' +
        'del día, transporte entre ciudades), cada una con pasos, el cálculo a la vista (compra, venta, impuestos, ' +
        'ganancia), sello de confianza de 0 a 100, antigüedad de los precios y riesgos de ruta. Es una estimación, no una ' +
        'promesa de ganancia: los precios vienen de jugadores y cambian rápido.',
      example: 'Tengo 5 millones de plata y una hora, sin Premium. ¿Qué puedo hacer hoy?',
    },
  };
  function toolText(t: { name: string; title: string; description: string; example: string }) {
    return getLocale() === 'es' && TOOL_ES[t.name] ? TOOL_ES[t.name] : t;
  }

  const claudeCode = `claude mcp add --transport http guarita ${MCP_URL}`;
  const cursorJson = JSON.stringify({ mcpServers: { guarita: { url: MCP_URL } } }, null, 2);
  const vscodeJson = JSON.stringify({ servers: { guarita: { type: 'http', url: MCP_URL } } }, null, 2);
  const curlCmd =
    `curl -s ${MCP_URL} -H "content-type: application/json" ` +
    `-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"relogio","arguments":{}}}'`;

  const examples = $derived(
    getLocale() === 'es'
      ? [
        '¿Cuánto cuesta la Bolsa del iniciado 4.1 y en qué ciudad la compro más barata?',
        '¿Vale la pena revender la Bolsa del maestro al Mercado Negro ahora?',
        '¿El servidor está en línea? ¿Hay alguna bonificación activa hoy?',
        '¿Cuánto cuesta el Premium en plata con la cotización del oro de hoy?',
        'Muéstrame el dosier del jugador (nombre del personaje): qué armas usa y si juega solo.',
        '¿Qué objetos se perdieron más en PvP esta semana? ¿Qué vale la pena fabricar?',
      ]
      : [
        'Quanto está a Bolsa do Adepto 4.1 e em qual cidade compro mais barato?',
        'Vale a pena fazer flip da Bolsa do Mestre para o Black Market agora?',
        'O servidor está online? Tem algum bônus ativo hoje?',
        'Quanto custa o Premium em prata pela cotação do ouro de hoje?',
        'Me mostra o dossiê do jogador (nome do personagem): que armas ele usa e se joga solo.',
        'Quais itens mais se perderam no PvP nesta semana? O que vale a pena craftar?',
      ],
  );

  let copied = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = null), 2000);
    } catch {
      copied = null;
    }
  }
</script>

<!-- O título em espanhol é o de worker/seo.ts (FIXED_ES['/mcp']). -->
<svelte:head><title>{tx('Guarita no Claude (MCP) · Guarita', 'La Guarita en tu asistente de IA · Guarita')}</title></svelte:head>

<section class="page stack">
  <header class="stack">
    <h1>{tx('Guarita no seu assistente de IA', 'La Guarita en tu asistente de IA')}</h1>
    {#if getLocale() === 'es'}
      <p class="lead">El MCP (Model Context Protocol) es un estándar abierto que permite que asistentes de IA, como Claude y
        Cursor, consulten herramientas externas. Al conectar el servidor MCP de la Guarita, puedes preguntar precios, el reloj del
        servidor, el dosier de un jugador, las pérdidas en PvP y qué hacer hoy con tu plata, y el asistente responde con los datos
        de la Guarita. Las herramientas devuelven el resumen en portugués; tu asistente puede responderte en español.</p>
    {:else}
      <p class="lead">O MCP (Model Context Protocol) é um padrão aberto que deixa assistentes de IA, como o Claude e o
        Cursor, consultarem ferramentas externas. Ligando o servidor MCP da Guarita, você pergunta preço, relógio do
        servidor, dossiê de jogador, perdas no PvP e o que fazer hoje com a sua prata em português, e o assistente responde com o dado da Guarita.</p>
    {/if}
  </header>

  <div class="card stack">
    <h2 class="first">{tx('Endereço do servidor', 'Dirección del servidor')}</h2>
    <div class="copyrow">
      <code class="url">{MCP_URL}</code>
      <button type="button" class="btn" onclick={() => copy('url', MCP_URL)} aria-label={tx('Copiar o endereço do servidor', 'Copiar la dirección del servidor')}>
        {copied === 'url' ? tx('Copiado', 'Copiado') : tx('Copiar', 'Copiar')}
      </button>
    </div>
    <p class="small muted">{tx(
      'Sem login e sem chave. Transporte HTTP (“Streamable HTTP”). Abrir este endereço no navegador mostra esta página; o assistente conversa com ele por trás.',
      'Sin inicio de sesión y sin clave. Transporte HTTP (“Streamable HTTP”). Abrir esta dirección en el navegador muestra esta página; el asistente se comunica con ella en segundo plano.',
    )}</p>
  </div>

  <div class="card stack">
    <h2 class="first">{tx('Como ligar', 'Cómo conectarla')}</h2>

    <div class="step stack">
      <h3>{tx('Claude Code (terminal)', 'Claude Code (terminal)')}</h3>
      <p>{tx('Rode no terminal:', 'Ejecuta en la terminal:')}</p>
      <div class="copyrow">
        <pre><code>{claudeCode}</code></pre>
        <button type="button" class="btn" onclick={() => copy('cc', claudeCode)} aria-label={tx('Copiar o comando do Claude Code', 'Copiar el comando de Claude Code')}>
          {copied === 'cc' ? tx('Copiado', 'Copiado') : tx('Copiar', 'Copiar')}
        </button>
      </div>
      {#if getLocale() === 'es'}
        <p class="small muted">Después, dentro de Claude Code, <code>/mcp</code> muestra si la Guarita se conectó.</p>
      {:else}
        <p class="small muted">Depois, dentro do Claude Code, <code>/mcp</code> mostra se a Guarita conectou.</p>
      {/if}
    </div>

    <div class="step stack">
      <h3>{tx('Claude (app no computador ou site)', 'Claude (app de escritorio o sitio)')}</h3>
      {#if getLocale() === 'es'}
        <ol>
          <li>Abre la <strong>Configuración</strong> y ve a <strong>Conectores</strong>.</li>
          <li>Elige <strong>Añadir conector personalizado</strong>.</li>
          <li>Ponle el nombre <strong>Guarita</strong> y pega la dirección <code>{MCP_URL}</code>.</li>
        </ol>
        <p class="small muted">El nombre de los menús puede cambiar según la versión de la aplicación y tu plan.</p>
      {:else}
        <ol>
          <li>Abra as <strong>Configurações</strong> e vá em <strong>Conectores</strong>.</li>
          <li>Escolha <strong>Adicionar conector personalizado</strong>.</li>
          <li>Dê o nome <strong>Guarita</strong> e cole o endereço <code>{MCP_URL}</code>.</li>
        </ol>
        <p class="small muted">O nome dos menus pode mudar conforme a versão do aplicativo e o seu plano.</p>
      {/if}
    </div>

    <div class="step stack">
      <h3>Cursor</h3>
      {#if getLocale() === 'es'}
        <p>Agrega al archivo <code>~/.cursor/mcp.json</code> (o <code>.cursor/mcp.json</code> del proyecto):</p>
      {:else}
        <p>Acrescente ao arquivo <code>~/.cursor/mcp.json</code> (ou <code>.cursor/mcp.json</code> do projeto):</p>
      {/if}
      <div class="copyrow">
        <pre><code>{cursorJson}</code></pre>
        <button type="button" class="btn" onclick={() => copy('cursor', cursorJson)} aria-label={tx('Copiar a configuração do Cursor', 'Copiar la configuración de Cursor')}>
          {copied === 'cursor' ? tx('Copiado', 'Copiado') : tx('Copiar', 'Copiar')}
        </button>
      </div>
    </div>

    <div class="step stack">
      <h3>VS Code</h3>
      {#if getLocale() === 'es'}
        <p>En el archivo <code>.vscode/mcp.json</code> del proyecto:</p>
      {:else}
        <p>No arquivo <code>.vscode/mcp.json</code> do projeto:</p>
      {/if}
      <div class="copyrow">
        <pre><code>{vscodeJson}</code></pre>
        <button type="button" class="btn" onclick={() => copy('vscode', vscodeJson)} aria-label={tx('Copiar a configuração do VS Code', 'Copiar la configuración de VS Code')}>
          {copied === 'vscode' ? tx('Copiado', 'Copiado') : tx('Copiar', 'Copiar')}
        </button>
      </div>
    </div>
    <p class="sr-only" aria-live="polite">{copied ? tx('Copiado para a área de transferência.', 'Copiado al portapapeles.') : ''}</p>
  </div>

  <div class="card stack">
    <h2 class="first">{tx('Exemplos de perguntas', 'Ejemplos de preguntas')}</h2>
    <ul class="examples">
      {#each examples as q (q)}
        <li>“{q}”</li>
      {/each}
    </ul>
  </div>

  <div class="card stack">
    <h2 class="first">{tx('Ferramentas', 'Herramientas')}</h2>
    <dl class="tools">
      {#each MCP_TOOLS as t (t.name)}
        {@const tt = toolText(t)}
        <div class="tool">
          <dt><code>{t.name}</code> <span class="muted">· {tt.title}</span></dt>
          <dd>
            <p>{tt.description}</p>
            <p class="small muted">{tx(`Exemplo: “${tt.example}”`, `Ejemplo: “${tt.example}”`)}</p>
          </dd>
        </div>
      {/each}
    </dl>
  </div>

  <div class="callout info">
    {#if getLocale() === 'es'}
      <p><strong>Solo datos públicos.</strong> El servidor MCP lee lo mismo que el sitio: precios del Albion Data Project, el
        killboard oficial y el estado del servidor. No accede a tu cuenta, a tus alertas, a tu Discord ni a nada del juego.
        El killboard llega con minutos de retraso: es historial, nunca la posición actual de alguien. Los precios los envían
        jugadores y pueden estar atrasados; confírmalo en el juego antes de comprar o vender.</p>
      <p class="small">Límite de {MCP_CALLS_PER_MIN} consultas por minuto por dirección IP. El dosier de jugador puede tardar hasta
        1 minuto, porque el killboard oficial es lento. Más sobre las reglas de la Guarita en
        <a href={href('/permitido')} onclick={go}>¿Esto está permitido?</a>.</p>
    {:else}
      <p><strong>Só dado público.</strong> O servidor MCP lê o mesmo que o site: preços do Albion Data Project, o
        killboard oficial e o status do servidor. Ele não acessa sua conta, seus alertas, seu Discord nem nada do jogo.
        O killboard chega com minutos de atraso: é histórico, nunca a posição atual de alguém. Os preços são enviados por
        jogadores e podem estar atrasados; confirme no jogo antes de comprar ou vender.</p>
      <p class="small">Limite de {MCP_CALLS_PER_MIN} consultas por minuto por endereço IP. O dossiê de jogador pode levar até
        1 minuto, porque o killboard oficial é lento. Mais sobre a régua da Guarita em
        <a href={href('/permitido')} onclick={go}>Isso é permitido?</a>.</p>
    {/if}
  </div>

  <details class="card">
    <summary>{tx('Para desenvolvedores', 'Para desarrolladores')}</summary>
    <div class="stack dev">
      {#if getLocale() === 'es'}
        <p>JSON-RPC 2.0 por <code>POST</code>, respuestas siempre en JSON (sin SSE y sin sesión). Métodos:
          <code>initialize</code>, <code>ping</code>, <code>tools/list</code> y <code>tools/call</code>. Cada resultado
          trae un resumen en texto y el dato estructurado en <code>structuredContent</code>.</p>
      {:else}
        <p>JSON-RPC 2.0 por <code>POST</code>, respostas sempre em JSON (sem SSE e sem sessão). Métodos:
          <code>initialize</code>, <code>ping</code>, <code>tools/list</code> e <code>tools/call</code>. Cada resultado
          traz um resumo em texto e o dado estruturado em <code>structuredContent</code>.</p>
      {/if}
      <div class="copyrow">
        <pre><code>{curlCmd}</code></pre>
        <button type="button" class="btn" onclick={() => copy('curl', curlCmd)} aria-label={tx('Copiar o exemplo com curl', 'Copiar el ejemplo con curl')}>
          {copied === 'curl' ? tx('Copiado', 'Copiado') : tx('Copiar', 'Copiar')}
        </button>
      </div>
    </div>
  </details>

  <p class="small muted">{tx(
    'A Guarita não é afiliada à Sandbox Interactive GmbH nem endossada por ela.',
    'La Guarita no está afiliada a Sandbox Interactive GmbH ni cuenta con su respaldo.',
  )}</p>
</section>

<style>
  header p, .stack > p { margin: 0; }
  .lead { font-size: 18px; }
  h2.first { margin: 0; }
  h3 { margin: 0; font-size: 16px; }
  .step + .step { border-top: 1px solid var(--line); padding-top: 12px; }
  .step p { margin: 0; }
  ol, .examples { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .copyrow { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
  .copyrow .btn { flex: none; }
  .url { overflow-wrap: anywhere; font-size: 15px; padding: 6px 8px; flex: 1; min-width: 0; }
  pre { margin: 0; flex: 1; min-width: 0; background: var(--surface-2); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
  pre code { background: none; padding: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .tools { margin: 0; display: grid; gap: 12px; }
  .tool + .tool { border-top: 1px solid var(--line); padding-top: 12px; }
  .tool dt { font-weight: 600; }
  .tool dd { margin: 4px 0 0; }
  .tool dd p { margin: 0 0 4px; }
  .callout p { margin: 0 0 6px; }
  summary { cursor: pointer; font-weight: 600; }
  .dev { margin-top: 10px; }
  @media (max-width: 480px) {
    .copyrow { flex-direction: column; align-items: stretch; }
    .copyrow .btn { align-self: flex-start; }
  }
</style>
