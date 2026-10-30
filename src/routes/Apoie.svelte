<script lang="ts">
  // Apoie: a Guarita é grátis; apoio voluntário (Pix, cartão, cripto) ainda sem conta: tudo "em breve", nada inventado.
  // Contrapartidas e recorrência ainda não foram decididas (decisão do Gabriel): não prometer nada aqui.
  import { go } from '../lib/router';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  $effect(() => {
    document.title = 'Apoie · Guarita';
  });

  const REPO_URL = 'https://github.com/dosxnjos/guarita';

  const ways = [
    { name: 'Pix', text: 'Transferência instantânea, sem taxa para quem apoia.' },
    { name: 'Cartão', text: 'Apoio com cartão de crédito.' },
    { name: 'Cripto', text: 'Para quem prefere apoiar com criptomoeda.' },
  ];
</script>

<section class="page stack">
  <header>
    <h1>Apoie a Guarita</h1>
    <p class="lead">A Guarita é e continua grátis. O apoio é voluntário e ajuda o projeto a seguir no ar e melhorando.</p>
  </header>

  <div class="grid">
    {#each ways as w (w.name)}
      <div class="card way" aria-disabled="true">
        <div class="row"><h2 class="first">{w.name}</h2><span class="tag info">Em breve</span></div>
        <p class="muted small">{w.text}</p>
        <p class="small">Ainda não está disponível. Os dados para apoio serão publicados aqui, só aqui.</p>
      </div>
    {/each}
  </div>

  <p class="callout warn small">
    Enquanto esta página disser “em breve”, a Guarita não recebe apoio por nenhum canal. Se alguém pedir dinheiro em nome
    da Guarita, é golpe.
  </p>

  <div class="grid">
    <div class="card">
      <h2 class="first">O que o apoio paga</h2>
      <ul>
        <li>Servidor e serviços que mantêm o site, os alertas e o bot funcionando.</li>
        <li>Domínio próprio.</li>
        <li>Tempo de desenvolvimento para novos recursos e correções.</li>
      </ul>
    </div>
    <div class="card">
      <h2 class="first">Contrapartidas</h2>
      <p>As contrapartidas para quem apoia serão anunciadas aqui quando o apoio abrir.</p>
    </div>
    <div class="card never">
      <h2 class="first">O que nunca entra no apoio</h2>
      <ul>
        <li>Prata, itens ou qualquer coisa dentro do jogo.</li>
        <li>Vantagem no jogo de qualquer tipo.</li>
      </ul>
      <p class="small">Trocar dinheiro real por coisa do jogo é RMT (real money trading), proibido pelos Termos do Albion
        Online. A Guarita não faz e não fará isso. <a href="/permitido" onclick={go}>Veja a régua completa.</a></p>
    </div>
  </div>

  <div class="card">
    <h2 class="first">Transparência</h2>
    <p>Os custos do projeto e o uso do dinheiro recebido serão publicados aqui quando o apoio abrir. O site, a API e o bot
      têm <a href={REPO_URL} target="_blank" rel="noopener">código aberto</a>. O motor de alertas roda num serviço privado,
      que guarda só o necessário para avisar: o id do Discord ou o da inscrição de notificação do navegador.</p>
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
