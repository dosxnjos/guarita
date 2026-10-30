<script lang="ts">
  // "Isso é permitido?": a régua da Guarita diante dos Termos da Sandbox Interactive, com as citações oficiais.
  import { go } from '../lib/router';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  $effect(() => {
    document.title = 'Isso é permitido? · Guarita';
  });

  const POST_URL = 'https://forum.albiononline.com/index.php/Thread/124819';
</script>

<section class="page stack">
  <header>
    <h1>Isso é permitido?</h1>
    <p class="lead">Resposta curta: a Guarita lê dados públicos fora do jogo. Ela não toca no cliente e não te dá vantagem
      em tempo real dentro da partida. A única leitura do tráfego de rede é opcional, fica no app de PC, vem desligada e
      mostra só a sua própria sessão.</p>
  </header>

  <div class="grid">
    <div class="card yes">
      <h2 class="first"><span class="tag good">Faz</span> O que a Guarita faz</h2>
      <ul>
        <li>Lê preços do <strong>Albion Data Project</strong>, projeto comunitário que agrega o mercado.</li>
        <li>Lê o <strong>killboard oficial</strong> (API pública do site do jogo) para dossiês e autópsias.</li>
        <li>Lê o <strong>status oficial do servidor</strong>.</li>
        <li>Mostra tudo no navegador, no Discord ou numa notificação, fora do jogo.</li>
        <li>O site, o bot e a extensão <strong>não leem o tráfego de rede</strong>, e nada da Guarita <strong>toca no jogo</strong>.</li>
        <li>No app de PC (a partir da versão 0.2), uma função <strong>opcional e desligada por padrão</strong> lê de forma
          passiva o tráfego do jogo no seu PC para mostrar a <strong>sua</strong> sessão: prata, fama, loot e mortes. Ela
          descarta tudo sobre outros jogadores, não manda nada ao jogo e só liga depois de você ler o aviso. Ler o tráfego só
          para análise é tolerado pela Sandbox Interactive desde 2017 (veja abaixo), mas não é permitido oficialmente: o
          risco de usar é da sua conta.</li>
      </ul>
    </div>
    <div class="card no">
      <h2 class="first"><span class="tag bad">Nunca</span> O que a Guarita nunca fará</h2>
      <ul>
        <li>Radar ou mapa de jogadores próximos.</li>
        <li>Alerta disparado quando um jogador é avistado.</li>
        <li>Inspeção automática de equipamento de outros jogadores.</li>
        <li>Macro, automação de clique ou de teclado.</li>
        <li>Leitura da memória do jogo.</li>
        <li>Sobreposição (overlay) dentro do cliente do jogo.</li>
        <li>RMT: troca de dinheiro real por prata, item ou vantagem.</li>
      </ul>
    </div>
  </div>

  <article class="card stack">
    <h2 class="first">O que a Sandbox Interactive já disse</h2>
    <div class="source">
      <p>
        <strong>21/02/2020</strong> · post oficial no fórum
        <a href={POST_URL} target="_blank" rel="noopener">“Regarding 3rd Party Software and Network Traffic (aka: do not cheat.)”</a>
      </p>
      <p class="small muted">Trechos em inglês, como no original, com tradução livre.</p>
      <blockquote>
        <p lang="en">“any type of auto-inspect tool or any type of radar tool”</p>
        <p class="small">Proibido: qualquer ferramenta de inspeção automática ou de radar.</p>
      </blockquote>
      <blockquote>
        <p lang="en">“‘auto-scouting’ tool that generates a discord message if it spots a player”</p>
        <p class="small">Proibido: ferramenta de “batedor automático” que manda mensagem no Discord ao avistar um jogador.</p>
      </blockquote>
      <blockquote>
        <p lang="en">“displaying extra information to the player in the client”</p>
        <p class="small">Proibido: mostrar informação extra ao jogador dentro do cliente.</p>
      </blockquote>
      <blockquote class="ok">
        <p class="mixed">Sites que agregam dado de mercado são tolerados quando coletam <q lang="en">using technical means
          approved by us ... not through an in-game modification or overlay ... if it does not provide a real-time
          in-game advantage</q>.</p>
        <p class="small">Tolerado: agregar preços por meios técnicos aprovados por eles, sem modificar o jogo nem sobrepor o
          cliente, desde que não dê vantagem em tempo real dentro do jogo.</p>
      </blockquote>
    </div>
    <div class="source">
      <p><strong>2017</strong> · MadDave, desenvolvedor da Sandbox Interactive, sobre ferramentas que leem o tráfego de rede do jogo para análise</p>
      <blockquote class="ok">
        <p lang="en">“As long as you just look and analyze we are ok with it”</p>
        <p class="small">Sobre ferramentas que só leem o tráfego de rede para análise: enquanto você só olha e analisa, tudo bem
          para eles. A Guarita nem isso faz: ela não lê o tráfego do jogo.</p>
      </blockquote>
    </div>
  </article>

  <div class="card stack">
    <h2 class="first"><span class="tag good">Faz</span> Killfeed, regear e Oráculo MCP</h2>
    <ul>
      <li><strong>Killfeed da guilda no Discord</strong> é histórico: repete kills e mortes que o killboard oficial já
        publicou, com atraso de minutos. Não diz onde ninguém está e não avisa quando um inimigo aparece. Por isso não é
        o “batedor automático” que a SBI proíbe.</li>
      <li><strong>Pedir regear</strong> só monta a lista do equipamento perdido com o preço de mercado. Aprovar e pagar
        fica com a guilda, dentro do jogo. A Guarita não guarda, não move e não vende prata.</li>
      <li>O <a href="/mcp" onclick={go}>Oráculo MCP</a> deixa assistentes de IA consultarem a Guarita. Ele só lê o
        mesmo dado público do site (preços, relógio, killboard) e nunca mostra alertas, ids do Discord ou dado de quem
        usa a Guarita.</li>
      <li>As <strong>perdas PvP</strong> e a <strong>página da guilda</strong> usam uma amostra do killboard público
        guardada pela Guarita. São estatísticas do passado, não posição de jogadores.</li>
    </ul>
  </div>

  <div class="card stack">
    <h2 class="first"><span class="tag warn">Zona cinza</span> A janela flutuante</h2>
    <p>A Guarita tem uma janela pequena que fica por cima das outras no computador (recurso do próprio navegador). Ela
      mostra as mesmas informações do site, sem ler nada do jogo. Mesmo assim, uma janela por cima do jogo fica perto da
      linha de “informação extra no cliente” que a SBI proíbe.</p>
    <ul>
      <li>Ela vem <strong>desligada</strong>. Só funciona se você ligar.</li>
      <li>Ligar é decisão sua, e <strong>o risco é da sua conta</strong>.</li>
      <li>Ela nunca mostra radar, jogador avistado nem nada em tempo real da partida. Por isso o dossiê de jogador fica
        só no site, fora da janela.</li>
    </ul>
    <p class="small"><a href="/janela" onclick={go}>Ver a janela flutuante</a></p>
  </div>

  <div class="callout warn">
    <p><strong>Tolerância não é permissão.</strong> A Sandbox Interactive pode mudar de posição a qualquer momento, e a
      Guarita acompanha: se algo deixar de ser aceito, sai do ar. A Guarita não é afiliada à Sandbox Interactive GmbH nem
      endossada por ela.</p>
  </div>
</section>

<style>
  header p { margin: 0; }
  .lead { font-size: 18px; }
  h2.first { margin: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  ul { margin: 10px 0 0; padding-left: 20px; display: grid; gap: 6px; }
  .yes { border-top: 4px solid var(--good); }
  .no { border-top: 4px solid var(--bad); }
  .source { display: grid; gap: 8px; }
  .source > p { margin: 0; }
  blockquote { margin: 0; padding: 8px 12px; border-left: 4px solid var(--bad); background: var(--surface-2); border-radius: 6px; }
  blockquote.ok { border-left-color: var(--good); }
  blockquote p { margin: 0; }
  blockquote p[lang='en'], blockquote q { font-style: italic; overflow-wrap: anywhere; }
  blockquote p + p { margin-top: 4px; }
  .stack > p { margin: 0; }
  .callout p { margin: 0; }
</style>
