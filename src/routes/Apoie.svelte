<script lang="ts">
  // Apoie: a Guarita é grátis; apoio voluntário (Pix, cartão, cripto) ainda sem conta: tudo "em breve", nada inventado.
  // Contrapartidas e recorrência ainda não foram decididas (decisão do Gabriel): não prometer nada aqui.
  import { go } from '../lib/router';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // Mesmo título que o _worker.js injeta (worker/seo.ts, FIXED_ROUTES e FIXED_ES).
  $effect(() => {
    document.title = tx('Apoie · Guarita', 'Apoya · Guarita');
  });

  const REPO_URL = 'https://github.com/dosxnjos/guarita';
  const es = $derived(getLocale() === 'es');

  const ways = $derived([
    { name: 'Pix', text: tx('Transferência instantânea, sem taxa para quem apoia.', 'Transferencia instantánea de Brasil, sin comisión para quien apoya.') },
    { name: tx('Cartão', 'Tarjeta'), text: tx('Apoio com cartão de crédito.', 'Apoyo con tarjeta de crédito.') },
    { name: tx('Cripto', 'Cripto'), text: tx('Para quem prefere apoiar com criptomoeda.', 'Para quien prefiere apoyar con criptomonedas.') },
  ]);
</script>

<section class="page stack">
  <header>
    <h1>{tx('Apoie a Guarita', 'Apoya a la Guarita')}</h1>
    <p class="lead">{tx('A Guarita é e continua grátis. O apoio é voluntário e ajuda o projeto a seguir no ar e melhorando.', 'La Guarita es y seguirá siendo gratis. El apoyo es voluntario y ayuda a que el proyecto siga en línea y mejorando.')}</p>
  </header>

  <div class="grid">
    {#each ways as w (w.name)}
      <div class="card way" aria-disabled="true">
        <div class="row"><h2 class="first">{w.name}</h2><span class="tag info">{tx('Em breve', 'Próximamente')}</span></div>
        <p class="muted small">{w.text}</p>
        <p class="small">{tx('Ainda não está disponível. Os dados para apoio serão publicados aqui, só aqui.', 'Todavía no está disponible. Los datos para apoyar se publicarán aquí, solo aquí.')}</p>
      </div>
    {/each}
  </div>

  <p class="callout warn small">
    {tx(
      'Enquanto esta página disser “em breve”, a Guarita não recebe apoio por nenhum canal. Se alguém pedir dinheiro em nome da Guarita, é golpe.',
      'Mientras esta página diga “próximamente”, la Guarita no recibe apoyo por ningún canal. Si alguien pide dinero en nombre de la Guarita, es una estafa.',
    )}
  </p>

  <div class="grid">
    <div class="card">
      <h2 class="first">{tx('O que o apoio paga', 'Qué paga el apoyo')}</h2>
      <ul>
        <li>{tx('Servidor e serviços que mantêm o site, os alertas e o bot funcionando.', 'Servidor y servicios que mantienen funcionando el sitio, las alertas y el bot.')}</li>
        <li>{tx('Domínio próprio.', 'Dominio propio.')}</li>
        <li>{tx('Tempo de desenvolvimento para novos recursos e correções.', 'Tiempo de desarrollo para nuevas funciones y correcciones.')}</li>
      </ul>
    </div>
    <div class="card">
      <h2 class="first">{tx('Contrapartidas', 'Recompensas')}</h2>
      <p>{tx('As contrapartidas para quem apoia serão anunciadas aqui quando o apoio abrir.', 'Las recompensas para quien apoya se anunciarán aquí cuando se abra el apoyo.')}</p>
    </div>
    <div class="card never">
      <h2 class="first">{tx('O que nunca entra no apoio', 'Lo que nunca forma parte del apoyo')}</h2>
      <ul>
        <li>{tx('Prata, itens ou qualquer coisa dentro do jogo.', 'Plata, objetos o cualquier cosa dentro del juego.')}</li>
        <li>{tx('Vantagem no jogo de qualquer tipo.', 'Ventajas en el juego de ningún tipo.')}</li>
      </ul>
      <p class="small">{tx(
        'Trocar dinheiro real por coisa do jogo é RMT (real money trading), proibido pelos Termos do Albion Online. A Guarita não faz e não fará isso.',
        'Cambiar dinero real por cosas del juego es RMT (real money trading), prohibido por los Términos de Albion Online. La Guarita no lo hace ni lo hará.',
      )} <a href={href('/permitido')} onclick={go}>{tx('Veja a régua completa.', 'Consulta las reglas completas.')}</a></p>
    </div>
  </div>

  <div class="card">
    <h2 class="first">{tx('Transparência', 'Transparencia')}</h2>
    {#if es}
      <p>Los costos del proyecto y el uso del dinero recibido se publicarán aquí cuando se abra el apoyo. El sitio, la API y el bot
        son de <a href={REPO_URL} target="_blank" rel="noopener">código abierto</a>. El motor de alertas funciona en un servicio privado,
        que guarda solo lo necesario para avisar: el id de Discord o el de la suscripción a notificaciones del navegador.</p>
    {:else}
      <p>Os custos do projeto e o uso do dinheiro recebido serão publicados aqui quando o apoio abrir. O site, a API e o bot
        têm <a href={REPO_URL} target="_blank" rel="noopener">código aberto</a>. O motor de alertas roda num serviço privado,
        que guarda só o necessário para avisar: o id do Discord ou o da inscrição de notificação do navegador.</p>
    {/if}
  </div>
</section>

<style>
  header p { margin: 0; }
  .lead { font-size: 18px; }
  h2.first { margin: 0; }
  .way { display: grid; gap: 8px; align-content: start; }
  .way .row { justify-content: space-between; }
  .way p { margin: 0; }
  ul { margin: 8px 0 0; padding-left: 20px; display: grid; gap: 4px; }
  .never { border-color: var(--bad); }
  .never p { margin: 10px 0 0; }
  .card > p { margin: 8px 0 0; }
</style>
