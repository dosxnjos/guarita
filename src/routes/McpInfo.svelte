<script lang="ts">
  // /mcp: explica o servidor MCP público da Guarita e como ligá-lo no Claude, no Cursor e no VS Code.
  // A lista de ferramentas vem de worker/mcp/catalog.ts, que não importa nada (não puxa código do Worker).
  import { MCP_TOOLS, MCP_URL, MCP_CALLS_PER_MIN } from '../../worker/mcp/catalog';
  import { go } from '../lib/router';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const claudeCode = `claude mcp add --transport http guarita ${MCP_URL}`;
  const cursorJson = JSON.stringify({ mcpServers: { guarita: { url: MCP_URL } } }, null, 2);
  const vscodeJson = JSON.stringify({ servers: { guarita: { type: 'http', url: MCP_URL } } }, null, 2);
  const curlCmd =
    `curl -s ${MCP_URL} -H "content-type: application/json" ` +
    `-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"relogio","arguments":{}}}'`;

  const examples = [
    'Quanto está a Bolsa do Adepto 4.1 e em qual cidade compro mais barato?',
    'Vale a pena fazer flip da Bolsa do Mestre para o Black Market agora?',
    'O servidor está online? Tem algum bônus ativo hoje?',
    'Quanto custa o Premium em prata pela cotação do ouro de hoje?',
    'Me mostra o dossiê do jogador (nome do personagem): que armas ele usa e se joga solo.',
    'Quais itens mais se perderam no PvP nesta semana? O que vale a pena craftar?',
  ];

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

<svelte:head><title>Guarita no Claude (MCP) · Guarita</title></svelte:head>

<section class="page stack">
  <header class="stack">
    <h1>Guarita no seu assistente de IA</h1>
    <p class="lead">O MCP (Model Context Protocol) é um padrão aberto que deixa assistentes de IA, como o Claude e o
      Cursor, consultarem ferramentas externas. Ligando o servidor MCP da Guarita, você pergunta preço, relógio do
      servidor, dossiê de jogador e perdas no PvP em português, e o assistente responde com o dado da Guarita.</p>
  </header>

  <div class="card stack">
    <h2 class="first">Endereço do servidor</h2>
    <div class="copyrow">
      <code class="url">{MCP_URL}</code>
      <button type="button" class="btn" onclick={() => copy('url', MCP_URL)} aria-label="Copiar o endereço do servidor">
        {copied === 'url' ? 'Copiado' : 'Copiar'}
      </button>
    </div>
    <p class="small muted">Sem login e sem chave. Transporte HTTP (“Streamable HTTP”). Abrir este endereço no navegador
      mostra esta página; o assistente conversa com ele por trás.</p>
  </div>

  <div class="card stack">
    <h2 class="first">Como ligar</h2>

    <div class="step stack">
      <h3>Claude Code (terminal)</h3>
      <p>Rode no terminal:</p>
      <div class="copyrow">
        <pre><code>{claudeCode}</code></pre>
        <button type="button" class="btn" onclick={() => copy('cc', claudeCode)} aria-label="Copiar o comando do Claude Code">
          {copied === 'cc' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p class="small muted">Depois, dentro do Claude Code, <code>/mcp</code> mostra se a Guarita conectou.</p>
    </div>

    <div class="step stack">
      <h3>Claude (app no computador ou site)</h3>
      <ol>
        <li>Abra as <strong>Configurações</strong> e vá em <strong>Conectores</strong>.</li>
        <li>Escolha <strong>Adicionar conector personalizado</strong>.</li>
        <li>Dê o nome <strong>Guarita</strong> e cole o endereço <code>{MCP_URL}</code>.</li>
      </ol>
      <p class="small muted">O nome dos menus pode mudar conforme a versão do aplicativo e o seu plano.</p>
    </div>

    <div class="step stack">
      <h3>Cursor</h3>
      <p>Acrescente ao arquivo <code>~/.cursor/mcp.json</code> (ou <code>.cursor/mcp.json</code> do projeto):</p>
      <div class="copyrow">
        <pre><code>{cursorJson}</code></pre>
        <button type="button" class="btn" onclick={() => copy('cursor', cursorJson)} aria-label="Copiar a configuração do Cursor">
          {copied === 'cursor' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>

    <div class="step stack">
      <h3>VS Code</h3>
      <p>No arquivo <code>.vscode/mcp.json</code> do projeto:</p>
      <div class="copyrow">
        <pre><code>{vscodeJson}</code></pre>
        <button type="button" class="btn" onclick={() => copy('vscode', vscodeJson)} aria-label="Copiar a configuração do VS Code">
          {copied === 'vscode' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
    <p class="sr-only" aria-live="polite">{copied ? 'Copiado para a área de transferência.' : ''}</p>
  </div>

  <div class="card stack">
    <h2 class="first">Exemplos de perguntas</h2>
    <ul class="examples">
      {#each examples as q (q)}
        <li>“{q}”</li>
      {/each}
    </ul>
  </div>

  <div class="card stack">
    <h2 class="first">Ferramentas</h2>
    <dl class="tools">
      {#each MCP_TOOLS as t (t.name)}
        <div class="tool">
          <dt><code>{t.name}</code> <span class="muted">· {t.title}</span></dt>
          <dd>
            <p>{t.description}</p>
            <p class="small muted">Exemplo: “{t.example}”</p>
          </dd>
        </div>
      {/each}
    </dl>
  </div>

  <div class="callout info">
    <p><strong>Só dado público.</strong> O servidor MCP lê o mesmo que o site: preços do Albion Data Project, o
      killboard oficial e o status do servidor. Ele não acessa sua conta, seus alertas, seu Discord nem nada do jogo.
      O killboard chega com minutos de atraso: é histórico, nunca a posição atual de alguém. Os preços são enviados por
      jogadores e podem estar atrasados; confirme no jogo antes de comprar ou vender.</p>
    <p class="small">Limite de {MCP_CALLS_PER_MIN} consultas por minuto por endereço IP. O dossiê de jogador pode levar até
      1 minuto, porque o killboard oficial é lento. Mais sobre a régua da Guarita em
      <a href="/permitido" onclick={go}>Isso é permitido?</a>.</p>
  </div>

  <details class="card">
    <summary>Para desenvolvedores</summary>
    <div class="stack dev">
      <p>JSON-RPC 2.0 por <code>POST</code>, respostas sempre em JSON (sem SSE e sem sessão). Métodos:
        <code>initialize</code>, <code>ping</code>, <code>tools/list</code> e <code>tools/call</code>. Cada resultado
        traz um resumo em texto e o dado estruturado em <code>structuredContent</code>.</p>
      <div class="copyrow">
        <pre><code>{curlCmd}</code></pre>
        <button type="button" class="btn" onclick={() => copy('curl', curlCmd)} aria-label="Copiar o exemplo com curl">
          {copied === 'curl' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  </details>

  <p class="small muted">A Guarita não é afiliada à Sandbox Interactive GmbH nem endossada por ela.</p>
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
