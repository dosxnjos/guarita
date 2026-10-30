<script lang="ts">
  // Página /extensao: a extensão de navegador da Guarita (pasta extension/ do repo). O que faz, como instalar
  // enquanto não está nas lojas ("carregar sem compactação" a partir do .zip das releases do GitHub), permissões e
  // por quê, privacidade.
  // O botão consulta as releases (lib/appRelease.ts): sem o .zip publicado, mostra "Em breve".
  import { onMount } from 'svelte';
  import { buscarExtensao, fmtTamanho, RELEASES_URL, type EstadoDownload } from '../lib/appRelease';
  import { go } from '../lib/router';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();
  // Texto com marcação no meio (negrito, código, link) vai em {#if es} … {:else} … {/if}, com o português intacto no else.
  // A extensão fala português e espanhol desde a 0.2.0 (opção de idioma; nomes de item do índice ES): a página em
  // espanhol descreve a extensão em espanhol, e a ilustração do cartão acompanha a língua da página.
  const es = $derived(getLocale() === 'es');

  let download = $state<EstadoDownload>({ tipo: 'conferindo' });
  onMount(() => {
    let vivo = true;
    void buscarExtensao().then((e) => vivo && (download = e));
    return () => (vivo = false);
  });

  // Mesmo título que o _worker.js injeta (worker/seo.ts, FIXED_ROUTES e FIXED_ES).
  $effect(() => {
    document.title = tx('Extensão de navegador · Guarita', 'Extensión de navegador · Guarita');
  });

  const CODIGO = 'https://github.com/dosxnjos/guarita/tree/main/extension';

  const RECURSOS = $derived<[titulo: string, desc: string][]>([
    [tx('Cartão ao passar o mouse', 'Tarjeta al pasar el mouse'), tx('Nos sites de Albion da lista, pare o mouse sobre o ícone de um item: aparece o nome em português, o tier, o melhor preço confiável para comprar, há quanto tempo foi visto e o selo de confiança.', 'En los sitios de Albion de la lista, detén el mouse sobre el ícono de un objeto: aparece el nombre en español, el tier, el mejor precio confiable para comprar, hace cuánto se vio y su nivel de confianza.')],
    [tx('Busca rápida de preço', 'Búsqueda rápida de precios'), tx('Clique no ícone da Guarita na barra do navegador e digite o nome do item, em português ou em inglês.', 'Haz clic en el ícono de la Guarita en la barra del navegador y escribe el nombre del objeto, en español o en inglés.')],
    [tx('Mini relógio', 'Mini reloj'), tx('Hora de Brasília e do servidor, status do servidor, bônus do dia e cotação do ouro, no mesmo popup.', 'Hora de Brasilia y del servidor, estado del servidor, bonificaciones del día y cotización del oro, en el mismo popup.')],
    [tx('Do seu jeito', 'A tu manera'), tx('Nas opções, desligue o cartão nos sites onde não quiser e escolha a qualidade padrão dos preços.', 'En las opciones, elige el idioma (español o portugués; por defecto, el del navegador), desactiva la tarjeta en los sitios donde no la quieras y elige la calidad predeterminada de los precios.')],
  ]);

  const SITES = $derived<[site: string, endereco: string][]>([
    [tx('Wiki oficial do Albion', 'Wiki oficial de Albion'), 'wiki.albiononline.com'],
    [tx('Killboard oficial', 'Killboard oficial'), 'albiononline.com/killboard'],
    ['Albion Free Market', 'albionfreemarket.com'],
    ['Albion Online 2D', 'albiononline2d.com'],
    ['Murder Ledger', 'murderledger.com'],
    ['Albion Online Data Project', 'www.albion-online-data.com'],
  ]);

  const PERMISSOES = $derived<[permissao: string, porque: string][]>([
    [tx('Ler e alterar dados nos sites de Albion da lista', 'Leer y cambiar datos en los sitios de Albion de la lista'), tx('Para encontrar os ícones de item na página e desenhar o cartão por cima. Só nesses sites; em nenhum outro a extensão roda.', 'Para encontrar los íconos de objetos en la página y dibujar la tarjeta encima. Solo en esos sitios; en ningún otro funciona la extensión.')],
    [tx('Acessar guarita.pages.dev', 'Acceder a guarita.pages.dev'), tx('Para buscar o preço, a lista de nomes em português e o relógio na API da Guarita.', 'Para buscar el precio, la lista de nombres en español y el reloj en la API de la Guarita.')],
    [tx('Armazenamento', 'Almacenamiento'), tx('Para guardar no seu navegador as suas opções e a lista de nomes dos itens (atualizada uma vez por dia).', 'Para guardar en tu navegador tus opciones y la lista de nombres de los objetos (actualizada una vez al día).')],
  ]);

  const FAQ = $derived<[pergunta: string, resposta: string][]>([
    [tx('Pode dar banimento?', '¿Me pueden banear?'), tx('Não. A extensão só funciona em sites, no navegador: não toca no jogo, não lê o cliente e não manda nada ao servidor do Albion. Os preços são os mesmos do site da Guarita.', 'No. La extensión solo funciona en sitios web, en el navegador: no toca el juego, no lee el cliente y no envía nada al servidor de Albion. Los precios son los mismos del sitio de la Guarita.')],
    [tx('Por que o preço às vezes está velho ou falta?', '¿Por qué a veces el precio está viejo o falta?'), tx('Os preços vêm do Albion Data Project, alimentado por jogadores que usam o cliente do projeto. Item pouco negociado fica sem preço recente; por isso o cartão mostra a idade e o selo de confiança.', 'Los precios vienen del Albion Data Project, que alimentan los jugadores que usan el cliente del proyecto. Un objeto poco negociado se queda sin precio reciente; por eso la tarjeta muestra la antigüedad y el sello de confianza.')],
    [tx('O cartão não aparece', 'La tarjeta no aparece'), tx('Confira se o site está ligado nas opções da extensão e recarregue a página. Ele só aparece sobre o ícone oficial do item (render.albiononline.com) e espera o mouse parar por um instante.', 'Revisa si el sitio está activado en las opciones de la extensión y recarga la página. Solo aparece sobre el ícono oficial del objeto (render.albiononline.com) y espera a que el mouse se detenga un instante.')],
    [tx('Aparece "muitas consultas em pouco tempo"', 'Aparece "Demasiadas consultas en poco tiempo"'), tx('A extensão faz no máximo 20 consultas de item por minuto, para não sobrecarregar o serviço gratuito. Espere alguns segundos; itens já vistos voltam da memória na hora.', 'La extensión hace como máximo 20 consultas de objetos por minuto, para no sobrecargar el servicio gratuito. Espera unos segundos; los objetos ya vistos vuelven de la memoria al instante.')],
    [tx('Funciona no celular?', '¿Funciona en el celular?'), tx('Não: navegadores de celular, em geral, não aceitam extensões. No celular, use o site da Guarita.', 'No: los navegadores de celular, en general, no aceptan extensiones. En el celular, usa el sitio de la Guarita.')],
  ]);
</script>

<section class="page stack" style="max-width:860px">
  <header class="hero">
    <h1>{tx('Extensão de navegador', 'Extensión de navegador')}</h1>
    <p class="lead">
      {tx(
        'Preço e nome em português sem sair da página: na wiki, no killboard e em outros sites de Albion, pare o mouse sobre o ícone de um item e a Guarita mostra o que ele vale agora.',
        'Precio y nombre del objeto sin salir de la página: en la wiki, en el killboard y en otros sitios de Albion, detén el mouse sobre el ícono de un objeto y la Guarita muestra cuánto vale ahora.',
      )}
    </p>
    <div class="row">
      {#if download.tipo === 'pronto'}
        <a class="btn primary" href={download.instalador.url} rel="noopener">
          {tx('Baixar o .zip (versão', 'Descargar el .zip (versión')} {download.instalador.versao}{download.instalador.tamanhoBytes ? `, ${fmtTamanho(download.instalador.tamanhoBytes)}` : ''})
        </a>
      {:else if download.tipo === 'pagina'}
        <a class="btn primary" href={RELEASES_URL} target="_blank" rel="noopener">{tx('Baixar o .zip no GitHub', 'Descargar el .zip en GitHub')}</a>
      {:else if download.tipo === 'em-breve'}
        <button type="button" class="btn primary" disabled>{tx('Em breve', 'Próximamente')}</button>
      {:else}
        <button type="button" class="btn primary" disabled>{tx('Conferindo a versão…', 'Revisando la versión…')}</button>
      {/if}
      <a class="btn" href={CODIGO} target="_blank" rel="noopener">{tx('Ver o código', 'Ver el código')}</a>
    </div>
    <p class="small muted" style="margin:8px 0 0">
      {tx(
        'Chrome, Edge e Firefox no computador. Gratuita e de código aberto. Nas lojas de extensões, em breve.',
        'Chrome, Edge y Firefox en la computadora. Gratuita y de código abierto, en español y en portugués. En las tiendas de extensiones, próximamente.',
      )}
    </p>
  </header>

  <figure class="ilustra" aria-labelledby="ext-legenda">
    <svg viewBox="0 0 560 220" role="img" aria-labelledby="ext-titulo">
      <title id="ext-titulo">{tx('Ilustração: uma página de site com ícones de item; sobre um deles, o cartão da Guarita com nome, preço e selo.', 'Ilustración: una página web con íconos de objetos; sobre uno de ellos, la tarjeta de la Guarita con nombre, precio y sello.')}</title>
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
      <!-- Cartão como a extensão desenha, na língua da página (os textos são os de extension/lib/core.js). -->
      {#if es}
        <g transform="translate(250 46)" lang="es">
          <rect width="286" height="150" rx="10" class="s-janela" />
          <text x="14" y="26" class="s-titulo">Bolsa del iniciado</text>
          <rect x="14" y="36" width="34" height="18" rx="9" class="s-tag" /><text x="31" y="49" text-anchor="middle" class="s-tagtxt">T4</text>
          <text x="14" y="76" class="s-mudo">Mejor precio confiable para comprar</text>
          <text x="14" y="100" class="s-valor">4,120 plata</text>
          <text x="122" y="100" class="s-texto">en Martlock</text>
          <circle cx="18" cy="120" r="4" class="s-ok" />
          <text x="28" y="124" class="s-mudo">visto hace 8 min · confianza alta</text>
          <text x="272" y="142" text-anchor="end" class="s-link">Ver en la Guarita</text>
        </g>
      {:else}
      <g transform="translate(250 46)" lang="pt-BR">
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
      {/if}
    </svg>
    <figcaption id="ext-legenda" class="small muted">{tx('Ilustração. O cartão some quando o mouse sai do ícone, quando você rola a página ou aperta Esc.', 'Ilustración. La tarjeta desaparece cuando el mouse sale del ícono, cuando te desplazas por la página o presionas Esc.')}</figcaption>
  </figure>

  <h2>{tx('O que a extensão faz', 'Lo que hace la extensión')}</h2>
  <div class="grid">
    {#each RECURSOS as [titulo, desc] (titulo)}
      <div class="card recurso">
        <strong>{titulo}</strong>
        <span class="small muted">{desc}</span>
      </div>
    {/each}
  </div>

  <div class="card stack">
    <h2 class="first">{tx('Onde o cartão aparece', 'Dónde aparece la tarjeta')}</h2>
    <ul class="lista">
      {#each SITES as [site, endereco] (endereco)}
        <li><strong>{site}</strong> <span class="muted small">({endereco})</span></li>
      {/each}
    </ul>
    <p class="small muted" style="margin:0">{tx('Em qualquer outro site a extensão não roda.', 'En cualquier otro sitio la extensión no funciona.')}</p>
  </div>

  <h2>{tx('Como instalar', 'Cómo instalar')}</h2>
  {#if es}
    <p style="margin:0">
      Mientras la extensión no llegue a las tiendas, la instalación es manual y toma un minuto. El archivo viene de las
      <a href={RELEASES_URL} target="_blank" rel="noopener">releases de GitHub</a> de la Guarita, con el nombre
      <code>{download.tipo === 'pronto' ? download.instalador.nome : 'guarita-extensao-0.2.0.zip'}</code> (el número cambia en cada versión).
    </p>
  {:else}
    <p style="margin:0">
      Enquanto a extensão não chega às lojas, a instalação é manual e leva um minuto. O arquivo vem das
      <a href={RELEASES_URL} target="_blank" rel="noopener">releases do GitHub</a> da Guarita, com o nome
      <code>{download.tipo === 'pronto' ? download.instalador.nome : 'guarita-extensao-0.2.0.zip'}</code> (o número muda a cada versão).
    </p>
  {/if}
  {#if download.tipo === 'em-breve'}
    <p class="small muted" style="margin:0">{tx('O primeiro .zip ainda não foi publicado nas releases. Volte em breve.', 'El primer .zip todavía no se publicó en las releases. Vuelve pronto.')}</p>
  {/if}
  {#if es}
    <div class="grid">
      <div class="card stack">
        <strong>Chrome o Edge</strong>
        <ol class="passos">
          <li>Descarga el <code>.zip</code> y extráelo en una carpeta que no vayas a borrar (ej.: Documentos\Guarita).</li>
          <li>Abre <code>chrome://extensions</code> (en Edge, <code>edge://extensions</code>) en la barra de direcciones.</li>
          <li>Activa el <strong>Modo de desarrollador</strong>.</li>
          <li>Haz clic en <strong>Cargar descomprimida</strong> y elige la carpeta extraída, la que tiene el archivo <code>manifest.json</code>.</li>
          <li>Fija el ícono de la Guarita en la barra del navegador (ícono de rompecabezas) para abrir la búsqueda con un clic.</li>
        </ol>
        <p class="small muted" style="margin:0">
          El navegador puede avisar sobre extensiones en modo de desarrollador; es lo esperado para extensiones fuera de la tienda.
          No borres la carpeta: la extensión se carga desde ahí.
        </p>
      </div>
      <div class="card stack">
        <strong>Firefox</strong>
        <ol class="passos">
          <li>Descarga el <code>.zip</code> (no hace falta extraerlo).</li>
          <li>Abre <code>about:debugging#/runtime/this-firefox</code> en la barra de direcciones.</li>
          <li>Haz clic en <strong>Cargar complemento temporal</strong> y elige el archivo <code>.zip</code>.</li>
          <li>Si el popup lo pide, haz clic en <strong>Permitir acceso</strong> para que la extensión consulte la Guarita.</li>
        </ol>
        <p class="small muted" style="margin:0">
          En Firefox, la extensión temporal desaparece cuando se cierra el navegador. La versión permanente llega con la publicación en la
          tienda de complementos.
        </p>
      </div>
    </div>
    <p class="small muted" style="margin:0">
      Para actualizar: descarga el <code>.zip</code> nuevo, reemplaza los archivos de la carpeta y haz clic en recargar en la tarjeta de la
      Guarita, en <code>chrome://extensions</code>. Tus opciones se mantienen.
    </p>
  {:else}
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
  {/if}

  <div class="card stack">
    <h2 class="first">{tx('Permissões e por quê', 'Permisos y por qué')}</h2>
    <dl class="perm">
      {#each PERMISSOES as [p, porque] (p)}
        <dt>{p}</dt>
        <dd class="small muted">{porque}</dd>
      {/each}
    </dl>
  </div>

  <div class="card stack">
    <h2 class="first">{tx('Privacidade', 'Privacidad')}</h2>
    <p style="margin:0">
      {tx(
        'A extensão não coleta nada sobre você: não tem conta, não rastreia, não guarda histórico de navegação e não exibe anúncio. Ela só lê o endereço da imagem do item embaixo do mouse e pede à Guarita o preço daquele item (o código do item e a qualidade). Suas opções ficam no seu navegador.',
        'La extensión no recopila nada sobre ti: no tiene cuenta, no rastrea, no guarda historial de navegación y no muestra anuncios. Solo lee la dirección de la imagen del objeto que está bajo el mouse y le pide a la Guarita el precio de ese objeto (el código del objeto y la calidad). Tus opciones quedan en tu navegador.',
      )}
    </p>
    <p class="small muted" style="margin:0">
      {tx(
        'Não lê o que você digita nos sites, não vê outros dados da página e não manda nada para terceiros. O código está aberto para conferir.',
        'No lee lo que escribes en los sitios, no ve otros datos de la página y no envía nada a terceros. El código está abierto para que lo revises.',
      )}
    </p>
  </div>

  <div class="card no stack">
    <h2 class="first"><span class="tag bad">{tx('Nunca', 'Nunca')}</span> {tx('O que a extensão não faz', 'Lo que la extensión no hace')}</h2>
    <ul class="lista">
      <li>{tx('Não toca no jogo nem no cliente do Albion: só funciona dentro do navegador, nos sites da lista.', 'No toca el juego ni el cliente de Albion: solo funciona dentro del navegador, en los sitios de la lista.')}</li>
      <li>{tx('Não manda nada ao servidor do jogo.', 'No envía nada al servidor del juego.')}</li>
      <li>{tx('Não avisa sobre jogadores nem acompanha ninguém.', 'No avisa sobre jugadores ni sigue a nadie.')}</li>
      <li>{tx('Não pede login nem senha da sua conta do Albion.', 'No pide el usuario ni la contraseña de tu cuenta de Albion.')}</li>
    </ul>
    <p class="small muted" style="margin:0">{tx('Régua completa em', 'Reglas completas en')} <a href={href('/permitido')} onclick={go}>{tx('Isso é permitido?', '¿Esto está permitido?')}</a></p>
  </div>

  <h2>{tx('Perguntas frequentes', 'Preguntas frecuentes')}</h2>
  <div class="stack">
    {#each FAQ as [pergunta, resposta] (pergunta)}
      <details class="card faq">
        <summary><strong>{pergunta}</strong></summary>
        <p style="margin:8px 0 0">{resposta}</p>
      </details>
    {/each}
  </div>

  {#if es}
    <p class="small muted" style="margin:0">
      También está la <a href={href('/app')} onclick={go}>app para PC</a> y el sitio funciona en cualquier dispositivo. No afiliado a
      Sandbox Interactive.
    </p>
  {:else}
    <p class="small muted" style="margin:0">
      Também há o <a href={href('/app')} onclick={go}>app para PC</a> e o site funciona em qualquer aparelho. Não afiliado à
      Sandbox Interactive.
    </p>
  {/if}
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
