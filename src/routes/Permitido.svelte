<script lang="ts">
  // "Isso é permitido?": a régua da Guarita diante dos Termos da Sandbox Interactive, com as citações oficiais.
  // Texto com marcação no meio (negrito, link) vai em {#if es} … {:else} … {/if}, com o português intacto no else.
  import { go } from '../lib/router';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // Mesmo título que o _worker.js injeta (worker/seo.ts, FIXED_ROUTES e FIXED_ES).
  $effect(() => {
    document.title = tx('Isso é permitido? · Guarita', '¿Esto está permitido? · Guarita');
  });

  const POST_URL = 'https://forum.albiononline.com/index.php/Thread/124819';
  const es = $derived(getLocale() === 'es');
</script>

<section class="page stack">
  <header>
    <h1>{tx('Isso é permitido?', '¿Esto está permitido?')}</h1>
    <p class="lead">{tx(
      'Resposta curta: a Guarita lê dados públicos fora do jogo. Ela não toca no cliente e não te dá vantagem em tempo real dentro da partida. A única leitura do tráfego de rede é opcional, fica no app de PC, vem desligada e mostra só a sua própria sessão.',
      'Respuesta corta: la Guarita lee datos públicos fuera del juego. No toca el cliente y no te da ventaja en tiempo real dentro de la partida. La única lectura del tráfico de red es opcional, está en la app de PC, viene desactivada y muestra solo tu propia sesión.',
    )}</p>
  </header>

  <div class="grid">
    <div class="card yes">
      <h2 class="first"><span class="tag good">{tx('Faz', 'Hace')}</span> {tx('O que a Guarita faz', 'Lo que hace la Guarita')}</h2>
      {#if es}
        <ul>
          <li>Lee precios del <strong>Albion Data Project</strong>, proyecto comunitario que reúne el mercado.</li>
          <li>Lee el <strong>killboard oficial</strong> (API pública del sitio del juego) para dosieres y autopsias.</li>
          <li>Lee el <strong>estado oficial del servidor</strong>.</li>
          <li>Muestra todo en el navegador, en Discord o en una notificación, fuera del juego.</li>
          <li>El sitio, el bot y la extensión <strong>no leen el tráfico de red</strong>, y nada de la Guarita <strong>toca el juego</strong>.</li>
          <li>En la app de PC (desde la versión 0.2), una función <strong>opcional y desactivada por defecto</strong> lee de forma
            pasiva el tráfico del juego en tu PC para mostrar <strong>tu</strong> sesión: plata, fama, botín y muertes.
            Descarta todo lo relacionado con otros jugadores, no envía nada al juego y solo se activa después de que leas el
            aviso. Leer el tráfico solo para análisis es tolerado por Sandbox Interactive desde 2017 (ver abajo), pero no está
            permitido oficialmente: el riesgo de usarlo es tuyo (lo que está en juego es tu cuenta de Albion).</li>
        </ul>
      {:else}
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
      {/if}
    </div>
    <div class="card no">
      <h2 class="first"><span class="tag bad">{tx('Nunca', 'Nunca')}</span> {tx('O que a Guarita nunca fará', 'Lo que la Guarita nunca hará')}</h2>
      <ul>
        <li>{tx('Radar ou mapa de jogadores próximos.', 'Radar o mapa de jugadores cercanos.')}</li>
        <li>{tx('Alerta disparado quando um jogador é avistado.', 'Alerta que se dispara cuando se avista a un jugador.')}</li>
        <li>{tx('Inspeção automática de equipamento de outros jogadores.', 'Inspección automática del equipo de otros jugadores.')}</li>
        <li>{tx('Macro, automação de clique ou de teclado.', 'Macros ni automatización de clics o de teclado.')}</li>
        <li>{tx('Leitura da memória do jogo.', 'Lectura de la memoria del juego.')}</li>
        <li>{tx('Sobreposição (overlay) dentro do cliente do jogo.', 'Superposición (overlay) dentro del cliente del juego.')}</li>
        <li>{tx('RMT: troca de dinheiro real por prata, item ou vantagem.', 'RMT: cambio de dinero real por plata, objetos o ventajas.')}</li>
      </ul>
    </div>
  </div>

  <article class="card stack">
    <h2 class="first">{tx('O que a Sandbox Interactive já disse', 'Lo que Sandbox Interactive ya dijo')}</h2>
    <div class="source">
      <p>
        <strong>21/02/2020</strong> · {tx('post oficial no fórum', 'publicación oficial en el foro')}
        <a href={POST_URL} target="_blank" rel="noopener">“Regarding 3rd Party Software and Network Traffic (aka: do not cheat.)”</a>
      </p>
      <p class="small muted">{tx('Trechos em inglês, como no original, com tradução livre.', 'Fragmentos en inglés, como en el original, con traducción libre.')}</p>
      <blockquote>
        <p lang="en">“any type of auto-inspect tool or any type of radar tool”</p>
        <p class="small">{tx('Proibido: qualquer ferramenta de inspeção automática ou de radar.', 'Prohibido: cualquier herramienta de inspección automática o de radar.')}</p>
      </blockquote>
      <blockquote>
        <p lang="en">“‘auto-scouting’ tool that generates a discord message if it spots a player”</p>
        <p class="small">{tx('Proibido: ferramenta de “batedor automático” que manda mensagem no Discord ao avistar um jogador.', 'Prohibido: herramienta de “explorador automático” que envía un mensaje a Discord al avistar a un jugador.')}</p>
      </blockquote>
      <blockquote>
        <p lang="en">“displaying extra information to the player in the client”</p>
        <p class="small">{tx('Proibido: mostrar informação extra ao jogador dentro do cliente.', 'Prohibido: mostrar información extra al jugador dentro del cliente.')}</p>
      </blockquote>
      <blockquote class="ok">
        {#if es}
          <p class="mixed">Los sitios que reúnen datos de mercado se toleran cuando los recopilan <q lang="en">using technical means
            approved by us ... not through an in-game modification or overlay ... if it does not provide a real-time
            in-game advantage</q>.</p>
        {:else}
          <p class="mixed">Sites que agregam dado de mercado são tolerados quando coletam <q lang="en">using technical means
            approved by us ... not through an in-game modification or overlay ... if it does not provide a real-time
            in-game advantage</q>.</p>
        {/if}
        <p class="small">{tx(
          'Tolerado: agregar preços por meios técnicos aprovados por eles, sem modificar o jogo nem sobrepor o cliente, desde que não dê vantagem em tempo real dentro do jogo.',
          'Tolerado: reunir precios por medios técnicos aprobados por ellos, sin modificar el juego ni superponerse al cliente, siempre que no dé ventaja en tiempo real dentro del juego.',
        )}</p>
      </blockquote>
    </div>
    <div class="source">
      <p><strong>2017</strong> · {tx(
        'MadDave, desenvolvedor da Sandbox Interactive, sobre ferramentas que leem o tráfego de rede do jogo para análise',
        'MadDave, desarrollador de Sandbox Interactive, sobre herramientas que leen el tráfico de red del juego para análisis',
      )}</p>
      <blockquote class="ok">
        <p lang="en">“As long as you just look and analyze we are ok with it”</p>
        <p class="small">{tx(
          'Sobre ferramentas que só leem o tráfego de rede para análise: enquanto você só olha e analisa, tudo bem para eles. A Guarita nem isso faz: ela não lê o tráfego do jogo.',
          'Sobre herramientas que solo leen el tráfico de red para análisis: mientras solo mires y analices, para ellos está bien. La Guarita ni siquiera hace eso: no lee el tráfico del juego.',
        )}</p>
      </blockquote>
    </div>
  </article>

  <div class="card stack">
    <h2 class="first"><span class="tag good">{tx('Faz', 'Hace')}</span> {tx('Killfeed, regear e Oráculo MCP', 'Killfeed, regear y Oráculo MCP')}</h2>
    {#if es}
      <ul>
        <li>El <strong>killfeed del gremio en Discord</strong> es historial: repite asesinatos y muertes que el killboard oficial ya
          publicó, con minutos de retraso. No dice dónde está nadie y no avisa cuando aparece un enemigo. Por eso no es
          el “explorador automático” que la SBI prohíbe.</li>
        <li><strong>Pedir regear</strong> solo arma la lista del equipo perdido con el precio de mercado. Aprobar y pagar
          queda en manos del gremio, dentro del juego. La Guarita no guarda, no mueve ni vende plata.</li>
        <li>El <a href={href('/mcp')} onclick={go}>Oráculo MCP</a> permite que asistentes de IA consulten la Guarita. Solo lee los
          mismos datos públicos del sitio (precios, reloj, killboard) y nunca muestra alertas, ids de Discord ni datos de quien
          usa la Guarita.</li>
        <li>Las <strong>pérdidas PvP</strong> y la <strong>página del gremio</strong> usan una muestra del killboard público
          guardada por la Guarita. Son estadísticas del pasado, no la posición de jugadores.</li>
      </ul>
    {:else}
      <ul>
        <li><strong>Killfeed da guilda no Discord</strong> é histórico: repete kills e mortes que o killboard oficial já
          publicou, com atraso de minutos. Não diz onde ninguém está e não avisa quando um inimigo aparece. Por isso não é
          o “batedor automático” que a SBI proíbe.</li>
        <li><strong>Pedir regear</strong> só monta a lista do equipamento perdido com o preço de mercado. Aprovar e pagar
          fica com a guilda, dentro do jogo. A Guarita não guarda, não move e não vende prata.</li>
        <li>O <a href={href('/mcp')} onclick={go}>Oráculo MCP</a> deixa assistentes de IA consultarem a Guarita. Ele só lê o
          mesmo dado público do site (preços, relógio, killboard) e nunca mostra alertas, ids do Discord ou dado de quem
          usa a Guarita.</li>
        <li>As <strong>perdas PvP</strong> e a <strong>página da guilda</strong> usam uma amostra do killboard público
          guardada pela Guarita. São estatísticas do passado, não posição de jogadores.</li>
      </ul>
    {/if}
  </div>

  <div class="card stack">
    <h2 class="first"><span class="tag warn">{tx('Zona cinza', 'Zona gris')}</span> {tx('A janela flutuante', 'La ventana flotante')}</h2>
    <p>{tx(
      'A Guarita tem uma janela pequena que fica por cima das outras no computador (recurso do próprio navegador). Ela mostra as mesmas informações do site, sem ler nada do jogo. Mesmo assim, uma janela por cima do jogo fica perto da linha de “informação extra no cliente” que a SBI proíbe.',
      'La Guarita tiene una ventana pequeña que queda encima de las demás en la computadora (función del propio navegador). Muestra la misma información del sitio, sin leer nada del juego. Aun así, una ventana encima del juego queda cerca de la línea de “información extra en el cliente” que la SBI prohíbe.',
    )}</p>
    {#if es}
      <ul>
        <li>Viene <strong>desactivada</strong>. Solo funciona si la activas.</li>
        <li>Activarla es tu decisión, y <strong>el riesgo es tuyo</strong>: lo que está en juego es tu cuenta de Albion.</li>
        <li>Nunca muestra radar, jugadores avistados ni nada en tiempo real de la partida. Por eso el dosier de jugador queda
          solo en el sitio, fuera de la ventana.</li>
      </ul>
    {:else}
      <ul>
        <li>Ela vem <strong>desligada</strong>. Só funciona se você ligar.</li>
        <li>Ligar é decisão sua, e <strong>o risco é da sua conta</strong>.</li>
        <li>Ela nunca mostra radar, jogador avistado nem nada em tempo real da partida. Por isso o dossiê de jogador fica
          só no site, fora da janela.</li>
      </ul>
    {/if}
    <p class="small"><a href={href('/janela')} onclick={go}>{tx('Ver a janela flutuante', 'Ver la ventana flotante')}</a></p>
  </div>

  <div class="callout warn">
    <p><strong>{tx('Tolerância não é permissão.', 'Tolerancia no es permiso.')}</strong> {tx(
      'A Sandbox Interactive pode mudar de posição a qualquer momento, e a Guarita acompanha: se algo deixar de ser aceito, sai do ar. A Guarita não é afiliada à Sandbox Interactive GmbH nem endossada por ela.',
      'Sandbox Interactive puede cambiar de postura en cualquier momento, y la Guarita la acompaña: si algo deja de ser aceptado, se retira. La Guarita no está afiliada a Sandbox Interactive GmbH ni respaldada por ella.',
    )}</p>
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
