<script lang="ts">
  // Página /extensao: a extensão de navegador da Guarita (pasta extension/ do repo). O que faz, como instalar
  // enquanto não está nas lojas ("carregar sem compactação" a partir do .zip das releases do GitHub), permissões e
  // por quê, privacidade.
  // O botão consulta as releases (lib/appRelease.ts): sem o .zip publicado, mostra "Em breve".
  import { onMount } from 'svelte';
  import { buscarExtensao, fmtTamanho, RELEASES_URL, type EstadoDownload } from '../lib/appRelease';
  import { go } from '../lib/router';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  let download = $state<EstadoDownload>({ tipo: 'conferindo' });
  onMount(() => {
    let vivo = true;
    void buscarExtensao().then((e) => vivo && (download = e));
    return () => (vivo = false);
  });

  $effect(() => {
    document.title = 'Extensão de navegador · Guarita';
  });

  const CODIGO = 'https://github.com/dosxnjos/guarita/tree/main/extension';

  const RECURSOS: [titulo: string, desc: string][] = [
    ['Cartão ao passar o mouse', 'Nos sites de Albion da lista, pare o mouse sobre o ícone de um item: aparece o nome em português, o tier, o melhor preço confiável para comprar, há quanto tempo foi visto e o selo de confiança.'],
    ['Busca rápida de preço', 'Clique no ícone da Guarita na barra do navegador e digite o nome do item, em português ou em inglês.'],
    ['Mini relógio', 'Hora de Brasília e do servidor, status do servidor, bônus do dia e cotação do ouro, no mesmo popup.'],
    ['Do seu jeito', 'Nas opções, desligue o cartão nos sites onde não quiser e escolha a qualidade padrão dos preços.'],
  ];

  const SITES: [site: string, endereco: string][] = [
    ['Wiki oficial do Albion', 'wiki.albiononline.com'],
    ['Killboard oficial', 'albiononline.com/killboard'],
    ['Albion Free Market', 'albionfreemarket.com'],
    ['Albion Online 2D', 'albiononline2d.com'],
    ['Murder Ledger', 'murderledger.com'],
    ['Albion Online Data Project', 'www.albion-online-data.com'],
  ];

  const PERMISSOES: [permissao: string, porque: string][] = [
    ['Ler e alterar dados nos sites de Albion da lista', 'Para encontrar os ícones de item na página e desenhar o cartão por cima. Só nesses sites; em nenhum outro a extensão roda.'],
    ['Acessar guarita.pages.dev', 'Para buscar o preço, a lista de nomes em português e o relógio na API da Guarita.'],
    ['Armazenamento', 'Para guardar no seu navegador as suas opções e a lista de nomes dos itens (atualizada uma vez por dia).'],
  ];

  const FAQ: [pergunta: string, resposta: string][] = [
    ['Pode dar banimento?', 'Não. A extensão só funciona em sites, no navegador: não toca no jogo, não lê o cliente e não manda nada ao servidor do Albion. Os preços são os mesmos do site da Guarita.'],
    ['Por que o preço às vezes está velho ou falta?', 'Os preços vêm do Albion Data Project, alimentado por jogadores que usam o cliente do projeto. Item pouco negociado fica sem preço recente; por isso o cartão mostra a idade e o selo de confiança.'],
    ['O cartão não aparece', 'Confira se o site está ligado nas opções da extensão e recarregue a página. Ele só aparece sobre o ícone oficial do item (render.albiononline.com) e espera o mouse parar por um instante.'],
    ['Aparece "muitas consultas em pouco tempo"', 'A extensão faz no máximo 20 consultas de item por minuto, para não sobrecarregar o serviço gratuito. Espere alguns segundos; itens já vistos voltam da memória na hora.'],
    ['Funciona no celular?', 'Não: navegadores de celular, em geral, não aceitam extensões. No celular, use o site da Guarita.'],
  ];
</script>

<section class="page stack" style="max-width:860px">
  <header class="hero">
    <h1>Extensão de navegador</h1>
    <p class="lead">
      Preço e nome em português sem sair da página: na wiki, no killboard e em outros sites de Albion, pare o mouse sobre
      o ícone de um item e a Guarita mostra o que ele vale agora.
    </p>
    <div class="row">
      {#if download.tipo === 'pronto'}
        <a class="btn primary" href={download.instalador.url} rel="noopener">
          Baixar o .zip (versão {download.instalador.versao}{download.instalador.tamanhoBytes ? `, ${fmtTamanho(download.instalador.tamanhoBytes)}` : ''})
        </a>
      {:else if download.tipo === 'pagina'}
        <a class="btn primary" href={RELEASES_URL} target="_blank" rel="noopener">Baixar o .zip no GitHub</a>
      {:else if download.tipo === 'em-breve'}
        <button type="button" class="btn primary" disabled>Em breve</button>
      {:else}
        <button type="button" class="btn primary" disabled>Conferindo a versão…</button>
      {/if}
      <a class="btn" href={CODIGO} target="_blank" rel="noopener">Ver o código</a>
    </div>
    <p class="small muted" style="margin:8px 0 0">
      Chrome, Edge e Firefox no computador. Gratuita e de código aberto. Nas lojas de extensões, em breve.
    </p>
  </header>

  <figure class="ilustra" aria-labelledby="ext-legenda">
    <svg viewBox="0 0 560 220" role="img" aria-labelledby="ext-titulo">
      <title id="ext-titulo">Ilustração: uma página de site com ícones de item; sobre um deles, o cartão da Guarita com nome, preço e selo.</title>
      <rect x="1" y="1" width="558" height="218" rx="14" class="s-tela" />
      <rect x="1" y="1" width="558" height="30" rx="14" class="s-barra" />
      <rect x="1" y="20" width="558" height="11" class="s-barra" />
      <circle cx="20" cy="16" r="5" class="s-mudo-f" /><circle cx="36" cy="16" r="5" class="s-mudo-f" /><circle cx="52" cy="16" r="5" class="s-mudo-f" />
      <rect x="24" y="52" width="56" height="56" rx="8" class="s-icone" />
      <rect x="92" y="52" width="56" height="56" rx="8" class="s-icone ativo" />
      <rect x="160" y="52" width="56" height="56" rx="8" class="s-icone" />
      <rect x="24" y="126" width="200" height="10" rx="5" class="s-linha" />
      <rect x="24" y="146" width="160" height="10" rx="5" class="s-linha" />
      <rect x="24" y="166" width="180" height="10" rx="5" class="s-linha" />
      <path d="M128 92 l0 22 l6 -6 l5 11 l4 -2 l-5 -11 l8 0 z" class="s-cursor" />
      <g transform="translate(250 46)">
        <rect width="286" height="150" rx="10" class="s-janela" />
        <text x="14" y="26" class="s-titulo">Bolsa do Adepto</text>
        <rect x="14" y="36" width="34" height="18" rx="9" class="s-tag" /><text x="31" y="49" text-anchor="middle" class="s-tagtxt">T4</text>
        <text x="14" y="76" class="s-mudo">Melhor preço confiável para comprar</text>
        <text x="14" y="100" class="s-valor">4.120 prata</text>
        <text x="122" y="100" class="s-texto">em Martlock</text>
        <circle cx="18" cy="120" r="4" class="s-ok" />
        <text x="28" y="124" class="s-mudo">visto há 8 min · selo alta</text>
        <text x="272" y="142" text-anchor="end" class="s-link">Ver na Guarita</text>
      </g>
    </svg>
    <figcaption id="ext-legenda" class="small muted">Ilustração. O cartão some quando o mouse sai do ícone, quando você rola a página ou aperta Esc.</figcaption>
  </figure>

  <h2>O que a extensão faz</h2>
  <div class="grid">
    {#each RECURSOS as [titulo, desc] (titulo)}
      <div class="card recurso">
        <strong>{titulo}</strong>
        <span class="small muted">{desc}</span>
      </div>
    {/each}
  </div>

  <div class="card stack">
    <h2 class="first">Onde o cartão aparece</h2>
    <ul class="lista">
      {#each SITES as [site, endereco] (endereco)}
        <li><strong>{site}</strong> <span class="muted small">({endereco})</span></li>
      {/each}
    </ul>
    <p class="small muted" style="margin:0">Em qualquer outro site a extensão não roda.</p>
  </div>

  <h2>Como instalar</h2>
  <p style="margin:0">
    Enquanto a extensão não chega às lojas, a instalação é manual e leva um minuto. O arquivo vem das
    <a href={RELEASES_URL} target="_blank" rel="noopener">releases do GitHub</a> da Guarita, com o nome
    <code>{download.tipo === 'pronto' ? download.instalador.nome : 'guarita-extensao-0.1.0.zip'}</code> (o número muda a cada versão).
  </p>
  {#if download.tipo === 'em-breve'}
    <p class="small muted" style="margin:0">O primeiro .zip ainda não foi publicado nas releases. Volte em breve.</p>
  {/if}
  <div class="grid">
    <div class="card stack">
      <strong>Chrome ou Edge</strong>
      <ol class="passos">
        <li>Baixe o <code>.zip</code> e extraia numa pasta que você não vá apagar (ex.: Documentos\Guarita).</li>
        <li>Abra <code>chrome://extensions</code> (no Edge, <code>edge://extensions</code>) na barra de endereço.</li>
        <li>Ligue o <strong>Modo do desenvolvedor</strong>.</li>
        <li>Clique em <strong>Carregar sem compactação</strong> e escolha a pasta extraída, a que tem o arquivo <code>manifest.json</code>.</li>
        <li>Fixe o ícone da Guarita na barra do navegador (ícone de quebra-cabeça) para abrir a busca com um clique.</li>
      </ol>
      <p class="small muted" style="margin:0">
        O navegador pode avisar sobre extensões em modo de desenvolvedor; é o esperado para extensões fora da loja.
        Não apague a pasta: a extensão é carregada dela.
      </p>
    </div>
    <div class="card stack">
      <strong>Firefox</strong>
      <ol class="passos">
        <li>Baixe o <code>.zip</code> (não precisa extrair).</li>
        <li>Abra <code>about:debugging#/runtime/this-firefox</code> na barra de endereço.</li>
        <li>Clique em <strong>Carregar extensão temporária</strong> e escolha o arquivo <code>.zip</code>.</li>
        <li>Se o popup pedir, clique em <strong>Permitir acesso</strong> para a extensão consultar a Guarita.</li>
      </ol>
      <p class="small muted" style="margin:0">
        No Firefox, a extensão temporária some quando o navegador fecha. A versão permanente vem com a publicação na
        loja de complementos.
      </p>
    </div>
  </div>
  <p class="small muted" style="margin:0">
    Para atualizar: baixe o <code>.zip</code> novo, substitua os arquivos da pasta e clique em recarregar no cartão da
    Guarita, em <code>chrome://extensions</code>. Suas opções continuam.
  </p>

  <div class="card stack">
    <h2 class="first">Permissões e por quê</h2>
    <dl class="perm">
      {#each PERMISSOES as [p, porque] (p)}
        <dt>{p}</dt>
        <dd class="small muted">{porque}</dd>
      {/each}
    </dl>
  </div>

  <div class="card stack">
    <h2 class="first">Privacidade</h2>
    <p style="margin:0">
      A extensão não coleta nada sobre você: não tem conta, não rastreia, não guarda histórico de navegação e não exibe
      anúncio. Ela só lê o endereço da imagem do item embaixo do mouse e pede à Guarita o preço daquele item (o código
      do item e a qualidade). Suas opções ficam no seu navegador.
    </p>
    <p class="small muted" style="margin:0">
      Não lê o que você digita nos sites, não vê outros dados da página e não manda nada para terceiros. O código está
      aberto para conferir.
    </p>
  </div>

  <div class="card no stack">
    <h2 class="first"><span class="tag bad">Nunca</span> O que a extensão não faz</h2>
    <ul class="lista">
      <li>Não toca no jogo nem no cliente do Albion: só funciona dentro do navegador, nos sites da lista.</li>
      <li>Não manda nada ao servidor do jogo.</li>
      <li>Não avisa sobre jogadores nem acompanha ninguém.</li>
      <li>Não pede login nem senha da sua conta do Albion.</li>
    </ul>
    <p class="small muted" style="margin:0">Régua completa em <a href="/permitido" onclick={go}>Isso é permitido?</a></p>
  </div>

  <h2>Perguntas frequentes</h2>
  <div class="stack">
    {#each FAQ as [pergunta, resposta] (pergunta)}
      <details class="card faq">
        <summary><strong>{pergunta}</strong></summary>
        <p style="margin:8px 0 0">{resposta}</p>
      </details>
    {/each}
  </div>

  <p class="small muted" style="margin:0">
    Também há o <a href="/app" onclick={go}>app para PC</a> e o site funciona em qualquer aparelho. Não afiliado à
    Sandbox Interactive.
  </p>
</section>

<style>
  .hero { padding-top: 8px; }
  .first { margin-top: 0; }
  .recurso { display: grid; gap: 4px; }
  .lista { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
  .passos { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .faq summary { cursor: pointer; }
  .perm { margin: 0; display: grid; gap: 4px; }
  .perm dt { font-weight: 600; }
  .perm dd { margin: 0 0 8px; }
  code { overflow-wrap: anywhere; }
  .ilustra { margin: 0; display: grid; gap: 6px; }
  .ilustra svg { width: 100%; height: auto; display: block; }
  .s-tela { fill: var(--surface-2); stroke: var(--line); }
  .s-barra { fill: var(--accent-soft); }
  .s-mudo-f { fill: var(--line); }
  .s-icone { fill: var(--surface); stroke: var(--line); }
  .s-icone.ativo { stroke: var(--accent); stroke-width: 2; }
  .s-linha { fill: var(--line); }
  .s-cursor { fill: var(--ink); stroke: var(--surface); stroke-width: 1; }
  .s-janela { fill: var(--surface); stroke: var(--line); }
  .s-titulo { fill: var(--ink); font-size: 14px; font-weight: 700; }
  .s-tag { fill: var(--surface-2); }
  .s-tagtxt { fill: var(--muted); font-size: 11px; font-weight: 600; }
  .s-texto { fill: var(--ink); font-size: 13px; }
  .s-valor { fill: var(--accent); font-size: 17px; font-weight: 700; }
  .s-mudo { fill: var(--muted); font-size: 12px; }
  .s-ok { fill: var(--good); }
  .s-link { fill: var(--accent); font-size: 12px; font-weight: 600; }
</style>
