<script lang="ts">
  // Página /app: o app da Guarita para Windows (pasta app/ do repo). O que faz, o que não faz, requisitos,
  // download pelo GitHub Releases e o aviso do SmartScreen (app ainda sem certificado de assinatura).
  // O botão de download consulta a última release (lib/appRelease.ts): sem release publicada, mostra "Em breve".
  import { onMount } from 'svelte';
  import { buscarInstalador, compararVersao, rotuloBaixar, RELEASES_URL, VERSAO_CAPTURA, type EstadoDownload } from '../lib/appRelease';
  import { go } from '../lib/router';
  import { fmtInt } from '../lib/format';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // Mesmo título que o _worker.js injeta (worker/seo.ts, FIXED_ROUTES e FIXED_ES).
  $effect(() => {
    document.title = tx('App para PC · Guarita', 'App para PC · Guarita');
  });
  // Texto com marcação no meio (negrito, link) vai em {#if es} … {:else} … {/if}, com o português intacto no else.
  const es = $derived(getLocale() === 'es');

  const CODIGO = 'https://github.com/dosxnjos/guarita/tree/main/app';
  const AODP = 'https://www.albion-online-data.com/';

  let download = $state<EstadoDownload>({ tipo: 'conferindo' });
  onMount(() => {
    let vivo = true;
    void buscarInstalador().then((e) => vivo && (download = e));
    return () => (vivo = false);
  });

  const RECURSOS = $derived<[titulo: string, desc: string][]>([
    [tx('Preço rápido', 'Precio rápido'), tx('Digite o item e veja a cidade mais barata, o preço, há quanto tempo foi visto e o selo de confiança.', 'Escribe el objeto y mira la ciudad más barata, el precio, hace cuánto se vio y el sello de confianza.')],
    [tx('Relógio do Americas', 'Reloj de Americas'), tx('Servidor, bônus do dia e fim da temporada em horário de Brasília. Avisa quando o servidor cai, quando volta e quando o bônus está acabando.', 'Servidor, bonificaciones del día y fin de la temporada en horario de Brasilia. Avisa cuando el servidor se cae, cuando vuelve y cuando la bonificación está por terminar.')],
    [tx('Alertas de preço no PC', 'Alertas de precio en la PC'), tx('Regras de preço conferidas pelo próprio app a cada 2 a 5 minutos, com notificação do Windows e voz.', 'Reglas de precio que la propia app revisa cada 2 a 5 minutos, con notificación de Windows y voz.')],
    [tx('Despertador', 'Despertador'), tx('Lembrete de colheita, animais e foco cheio, tocado pelo app.', 'Recordatorio de cosecha, animales y foco lleno, que suena desde la app.')],
    [tx('Dossiê', 'Dosier'), tx('Histórico público de um jogador pelo nome, quando você pesquisa.', 'Historial público de un jugador por su nombre, cuando lo buscas.')],
    [tx('Lente de mercado (experimental)', 'Lente de mercado (experimental)'), tx('Com o cliente do Albion Data Project (projeto comunitário) aberto, mostra o preço do item aberto no mercado nas outras cidades.', 'Con el cliente del Albion Data Project (proyecto comunitario) abierto, muestra el precio en las demás ciudades del objeto que abriste en el mercado.')],
  ]);
  const SESSAO_DESC = $derived(tx(
    'Prata, fama e loot por hora, com o valor estimado do loot, mortes e mapa, lidos de forma passiva do tráfego do jogo no seu PC. Precisa do Npcap, vem desligada e só liga depois do aviso.',
    'Plata, fama y botín por hora, con el valor estimado del botín, muertes y mapa, leídos de forma pasiva del tráfico del juego en tu PC. Necesita Npcap, viene desactivada y solo se activa después del aviso.',
  ));
  // A captura existe a partir da 0.2: com uma release mais antiga publicada, o recurso aparece como "em breve" em
  // vez de prometer o que o download não traz.
  const recursos = $derived<[string, string][]>([
    ...RECURSOS,
    [
      download.tipo === 'pronto' && compararVersao(download.instalador.versao, VERSAO_CAPTURA) < 0
        ? tx('Sua sessão (experimental, em breve na versão 0.2)', 'Tu sesión (experimental, próximamente en la versión 0.2)')
        : tx('Sua sessão (experimental, a partir da versão 0.2)', 'Tu sesión (experimental, desde la versión 0.2)'),
      SESSAO_DESC,
    ],
  ]);

  const NAO_FAZ = $derived<string[]>([
    tx('Não lê a memória nem o processo do jogo.', 'No lee la memoria ni el proceso del juego.'),
    tx('Não mostra nada sobre outros jogadores a partir do tráfego de rede: a captura opcional só lê a sua própria sessão.', 'No muestra nada sobre otros jugadores a partir del tráfico de red: la captura opcional solo lee tu propia sesión.'),
    tx('Não manda tecla nem clique ao jogo: nada de macro ou automação.', 'No envía teclas ni clics al juego: nada de macros ni automatización.'),
    tx('Não desenha nada dentro do cliente do jogo; as janelas são do Windows, separadas.', 'No dibuja nada dentro del cliente del juego; las ventanas son de Windows, separadas.'),
    tx('Não avisa quando um jogador aparece perto de você.', 'No avisa cuando un jugador aparece cerca de ti.'),
    tx('Não pede login nem senha da sua conta do Albion.', 'No pide el usuario ni la contraseña de tu cuenta de Albion.'),
  ]);

  const FAQ = $derived<[pergunta: string, resposta: string][]>([
    [tx('Preciso do app e do site?', '¿Necesito la app y el sitio?'), tx('Não, cada um funciona sozinho e os dados são os mesmos. O site serve em qualquer aparelho, inclusive no celular. O app fica aberto no PC enquanto você joga, com janelas pequenas, voz e avisos do Windows.', 'No, cada uno funciona por separado y los datos son los mismos. El sitio sirve en cualquier dispositivo, incluso en el celular. La app queda abierta en la PC mientras juegas, con ventanas pequeñas, voz y avisos de Windows.')],
    [tx('O app fica rodando escondido?', '¿La app queda funcionando a escondidas?'), tx('Não. Ele só trabalha enquanto está aberto: fechou, parou. Não cria tarefa agendada nem serviço do Windows. O ícone da Guarita fica na bandeja, perto do relógio do Windows, enquanto o app está aberto. Iniciar com o Windows e fechar para a bandeja vêm desligados: no padrão, fechar o painel encerra tudo. Com fechar para a bandeja ligado, fechar a janela deixa o app lá; use “Sair da Guarita” no ícone para encerrar.', 'No. Solo trabaja mientras está abierta: la cierras y se detiene. No crea tareas programadas ni servicios de Windows. El ícono de la Guarita queda en la bandeja, cerca del reloj de Windows, mientras la app está abierta. Iniciar con Windows y cerrar a la bandeja vienen desactivados: por defecto, cerrar el panel lo termina todo. Con cerrar a la bandeja activado, cerrar la ventana deja la app ahí; usa “Salir de la Guarita” en el ícono para terminarla.')],
    [tx('Os alertas do app e os do site são iguais?', '¿Las alertas de la app y las del sitio son iguales?'), tx('Os do site chegam pelo navegador, pelo celular ou pelo Discord mesmo com o computador desligado, porque quem confere é o servidor da Guarita. Os do app são conferidos pelo próprio app e só tocam com ele aberto.', 'Las del sitio llegan por el navegador, por el celular o por Discord incluso con la computadora apagada, porque quien las revisa es el servidor de la Guarita. Las de la app las revisa la propia app y solo suenan con ella abierta.')],
    [tx('Pode dar banimento?', '¿Me pueden banear?'), tx('O app não toca no processo do jogo: não lê a memória, não manda tecla nem clique e não envia nada ao servidor do Albion. Há duas zonas cinzas, as duas desligadas por padrão e só ligadas depois de você ler o aviso: deixar uma janela por cima da tela do jogo e a captura passiva da sua sessão (versão 0.2), que lê no seu PC o tráfego de rede do jogo, só o seu. Ler esse tráfego é uma prática que a Sandbox Interactive tolera desde 2017, mas não permite oficialmente. O risco de ligar qualquer uma das duas é da sua conta. O resto do app usa dados públicos, as mesmas fontes do site. A lente de mercado depende de outro programa, o cliente do Albion Data Project: ele é comunitário, sem ligação com a Sandbox Interactive, e também lê o tráfego de rede do jogo no seu PC para registrar os preços do mercado. Instalar esse cliente é escolha sua; o resto do app funciona sem ele.', 'La app no toca el proceso del juego: no lee la memoria, no envía teclas ni clics y no manda nada al servidor de Albion. Hay dos zonas grises, ambas desactivadas por defecto y que solo se activan después de que leas el aviso: dejar una ventana encima de la pantalla del juego y la captura pasiva de tu sesión (versión 0.2), que lee en tu PC el tráfico de red del juego, solo el tuyo. Leer ese tráfico es una práctica que Sandbox Interactive tolera desde 2017, pero no permite oficialmente. El riesgo de activar cualquiera de las dos es tuyo: lo que está en juego es tu cuenta de Albion. El resto de la app usa datos públicos, las mismas fuentes del sitio. La lente de mercado depende de otro programa, el cliente del Albion Data Project: es comunitario, sin relación con Sandbox Interactive, y también lee el tráfico de red del juego en tu PC para registrar los precios del mercado. Instalar ese cliente es tu decisión; el resto de la app funciona sin él.')],
    [tx('O jogo minimiza quando uso um atalho', 'El juego se minimiza cuando uso un atajo'), tx('Use o Albion em modo janela sem borda (nas configurações de vídeo do jogo). Em tela cheia exclusiva, o jogo cobre as janelas da Guarita, e o atalho, que passa o foco para a Guarita como um Alt+Tab, faz o jogo minimizar ou piscar.', 'Usa Albion en modo ventana sin bordes (en la configuración de video del juego). En pantalla completa exclusiva, el juego tapa las ventanas de la Guarita, y el atajo, que pasa el foco a la Guarita como un Alt+Tab, hace que el juego se minimice o parpadee.')],
    [tx('É pago? Precisa de conta?', '¿Es de pago? ¿Necesita cuenta?'), tx('É de graça, sem conta e sem cadastro. O código é aberto, sob a licença MIT.', 'Es gratis, sin cuenta y sin registro. El código es abierto, con licencia MIT.')],
    [tx('Funciona no Mac ou no Linux?', '¿Funciona en Mac o en Linux?'), tx('Por enquanto, só no Windows 10 e 11.', 'Por ahora, solo en Windows 10 y 11.')],
    [tx('Como atualizo?', '¿Cómo actualizo?'), tx('Nesta versão não há atualização automática. Quando sair uma versão nova, baixe o instalador de novo por esta página; suas configurações continuam.', 'En esta versión no hay actualización automática. Cuando salga una versión nueva, descarga otra vez el instalador desde esta página; tu configuración se mantiene.')],
    [tx('Como desinstalo?', '¿Cómo desinstalo?'), tx('Em Configurações do Windows, Aplicativos, procure “Guarita” e escolha Desinstalar.', 'En Configuración de Windows, Aplicaciones, busca “Guarita” y elige Desinstalar.')],
  ]);
</script>

{#snippet botaoBaixar()}
  {#if download.tipo === 'pronto'}
    <a class="btn primary" href={download.instalador.url} rel="noopener">{rotuloBaixar(download.instalador)}</a>
  {:else if download.tipo === 'pagina'}
    <a class="btn primary" href={RELEASES_URL} target="_blank" rel="noopener">{tx('Baixar para Windows', 'Descargar para Windows')}</a>
  {:else if download.tipo === 'em-breve'}
    <button type="button" class="btn primary" disabled>{tx('Em breve', 'Próximamente')}</button>
  {:else}
    <button type="button" class="btn primary" disabled>{tx('Conferindo a versão…', 'Revisando la versión…')}</button>
  {/if}
{/snippet}

<section class="page stack" style="max-width:860px">
  <header class="hero">
    <h1>{tx('Guarita no PC', 'La Guarita en la PC')}</h1>
    <p class="lead">
      {tx(
        'O companheiro que fica aberto enquanto você joga: janelas pequenas ao lado do jogo ou em outra tela, voz em português, atalhos e avisos do Windows. Usa os mesmos dados do site.',
        'El compañero que queda abierto mientras juegas: ventanas pequeñas junto al juego o en otra pantalla, voz en español, atajos y avisos de Windows. Usa los mismos datos del sitio.',
      )}
    </p>
    <div class="row">
      {@render botaoBaixar()}
      <a class="btn" href={CODIGO} target="_blank" rel="noopener">{tx('Ver o código', 'Ver el código')}</a>
    </div>
    <p class="small muted" style="margin:8px 0 0">{tx('Windows 10 ou 11, 64 bits. Gratuito e de código aberto.', 'Windows 10 u 11, 64 bits. Gratuita y de código abierto. En español y en portugués desde la versión 0.2.2.')}</p>
    {#if download.tipo === 'em-breve'}
      <p class="small muted" style="margin:4px 0 0">{tx('O instalador ainda não foi publicado. Acompanhe em', 'El instalador todavía no se publicó. Síguelo en')} <a href={RELEASES_URL} target="_blank" rel="noopener">github.com/dosxnjos/guarita/releases</a>.</p>
    {/if}
  </header>

  <figure class="ilustra" aria-labelledby="ilustra-legenda">
    <svg viewBox="0 0 560 280" role="img" aria-labelledby="ilustra-titulo">
      <title id="ilustra-titulo">{tx('Ilustração: a tela do jogo à esquerda e duas janelas pequenas da Guarita ao lado, com preço e relógio.', 'Ilustración: la pantalla del juego a la izquierda y dos ventanas pequeñas de la Guarita al lado, con precio y reloj.')}</title>
      <rect x="1" y="1" width="558" height="278" rx="14" class="s-tela" />
      <path d="M1 210 C 120 170, 200 230, 330 190 L 330 279 L 1 279 Z" class="s-chao" />
      <circle cx="80" cy="60" r="22" class="s-sol" />
      <text x="24" y="250" class="s-legenda">{tx('jogo (janela sem borda)', 'juego (ventana sin bordes)')}</text>

      <g transform="translate(350 22)">
        <rect width="190" height="136" rx="10" class="s-janela" />
        <rect width="190" height="26" rx="10" class="s-barra" />
        <rect y="16" width="190" height="10" class="s-barra" />
        <text x="12" y="18" class="s-titulo">{tx('Preço rápido', 'Precio rápido')}</text>
        <rect x="12" y="38" width="166" height="22" rx="6" class="s-campo" />
        <text x="20" y="53" class="s-texto">{tx('Bolsa do Adepto', 'Bolsa del iniciado')}</text>
        <text x="12" y="82" class="s-texto">Martlock</text>
        <text x="178" y="82" text-anchor="end" class="s-valor">{fmtInt(4120)}</text>
        <text x="12" y="102" class="s-texto">Lymhurst</text>
        <text x="178" y="102" text-anchor="end" class="s-valor">{fmtInt(4380)}</text>
        <circle cx="16" cy="122" r="4" class="s-ok" />
        <text x="26" y="126" class="s-mudo">{tx('visto há 8 min · selo alta', 'visto hace 8 min · confianza alta')}</text>
      </g>

      <g transform="translate(350 172)">
        <rect width="190" height="86" rx="10" class="s-janela" />
        <rect width="190" height="26" rx="10" class="s-barra" />
        <rect y="16" width="190" height="10" class="s-barra" />
        <text x="12" y="18" class="s-titulo">{tx('Relógio', 'Reloj')}</text>
        <text x="12" y="56" class="s-hora">21:42</text>
        <text x="86" y="50" class="s-texto">{tx('Servidor online', 'Servidor en línea')}</text>
        <text x="86" y="68" class="s-mudo">{tx('bônus acaba em 1 h', 'la bonificación acaba en 1 h')}</text>
      </g>
    </svg>
    <figcaption id="ilustra-legenda" class="small muted">{tx('Ilustração. As janelas se movem, mudam de tamanho e de opacidade e lembram onde ficaram.', 'Ilustración. Las ventanas se mueven, cambian de tamaño y de opacidad y recuerdan dónde quedaron.')}</figcaption>
  </figure>

  <h2>{tx('O que o app faz', 'Lo que hace la app')}</h2>
  <div class="grid">
    {#each recursos as [titulo, desc] (titulo)}
      <div class="card recurso">
        <strong>{titulo}</strong>
        <span class="small muted">{desc}</span>
      </div>
    {/each}
  </div>
  <p class="small muted" style="margin:0">
    {tx(
      'Avisos falados em português com as vozes do Windows, atalhos de teclado que você escolhe (eles só abrem janelas da Guarita) e notificações do Windows.',
      'Avisos hablados en español con las voces de Windows, atajos de teclado que tú eliges (solo abren ventanas de la Guarita) y notificaciones de Windows.',
    )}
  </p>

  <div class="card stack">
    <h2 class="first">{tx('Só funciona com o app aberto', 'Solo funciona con la app abierta')}</h2>
    <p style="margin:0">
      {tx(
        'Nada fica rodando por trás: o app não cria tarefa agendada nem serviço do Windows. Iniciar com o Windows existe como opção e vem desligada. Fechou o app, parou tudo.',
        'Nada queda funcionando en segundo plano: la app no crea tareas programadas ni servicios de Windows. Iniciar con Windows existe como opción y viene desactivada. Si cierras la app, se detiene todo.',
      )}
    </p>
  </div>

  <div class="card no stack">
    <h2 class="first"><span class="tag bad">{tx('Nunca', 'Nunca')}</span> {tx('O que o app não faz', 'Lo que la app no hace')}</h2>
    <ul class="lista">
      {#each NAO_FAZ as t (t)}<li>{t}</li>{/each}
    </ul>
    {#if es}
      <p class="small muted" style="margin:0">
        La lente de mercado solo escucha al cliente del <a href={AODP} target="_blank" rel="noopener">Albion Data Project</a>,
        si instalas y activas ese cliente. Es un programa comunitario, sin relación con Sandbox Interactive, que lee
        el tráfico de red del juego en tu PC para registrar los precios del mercado. Instalarlo es tu decisión. La Guarita no lee
        el mercado del juego por su cuenta; la captura opcional de la versión 0.2 lee solo tu sesión (plata, fama, botín).
      </p>
    {:else}
      <p class="small muted" style="margin:0">
        A lente de mercado só escuta o cliente do <a href={AODP} target="_blank" rel="noopener">Albion Data Project</a>,
        se você instalar e ligar esse cliente. Ele é um programa comunitário, sem ligação com a Sandbox Interactive, que lê
        o tráfego de rede do jogo no seu PC para registrar os preços do mercado. Instalar é escolha sua. A Guarita não lê
        o mercado do jogo por conta própria; a captura opcional da versão 0.2 lê só a sua sessão (prata, fama, loot).
      </p>
    {/if}
  </div>

  <div class="callout warn stack">
    <strong>{tx('Janela por cima do jogo vem desligada', 'La ventana encima del juego viene desactivada')}</strong>
    {#if es}
      <p style="margin:0">
        En 2020 Sandbox Interactive prohibió las herramientas que hacen “<span lang="en">displaying extra information to the
        player in the client</span>” (mostrar información extra al jugador dentro del cliente del juego). Las ventanas de la app están
        separadas del cliente: no leen, no alteran ni dibujan nada dentro del juego. Aun así, quedar encima de la
        pantalla del juego es una zona gris en las reglas. Por eso “siempre encima” solo se activa después de que leas este aviso.
        <strong>El riesgo es tuyo: lo que está en juego es tu cuenta de Albion.</strong>
      </p>
    {:else}
      <p style="margin:0">
        Em 2020 a Sandbox Interactive proibiu ferramentas que fazem “<span lang="en">displaying extra information to the
        player in the client</span>” (mostrar informação extra ao jogador dentro do cliente do jogo). As janelas do app são
        separadas do cliente: não leem, não alteram e não desenham nada dentro do jogo. Mesmo assim, ficar por cima da
        tela do jogo é uma zona cinza nas regras. Por isso “sempre por cima” só liga depois de você ler esse aviso.
        <strong>O risco é da sua conta.</strong>
      </p>
    {/if}
    <p class="small" style="margin:0"><a href={href('/permitido')} onclick={go}>{tx('Entenda o que é e o que não é permitido', 'Entiende qué está permitido y qué no')}</a></p>
  </div>

  <h2>{tx('Instalar', 'Instalar')}</h2>
  <div class="grid">
    <div class="card stack">
      <strong>{tx('Requisitos', 'Requisitos')}</strong>
      <ul class="lista small">
        <li>{tx('Windows 10 ou 11, 64 bits.', 'Windows 10 u 11, 64 bits.')}</li>
        <li>{tx('Microsoft Edge WebView2, que já vem no Windows 11; no Windows 10, o instalador baixa se faltar.', 'Microsoft Edge WebView2, que ya viene en Windows 11; en Windows 10, el instalador lo descarga si falta.')}</li>
        <li>{tx('Internet, para buscar os preços e o relógio.', 'Internet, para buscar los precios y el reloj.')}</li>
        <li>{tx('O Albion em modo janela sem borda, para ver as janelas da Guarita sobre o jogo.', 'Albion en modo ventana sin bordes, para ver las ventanas de la Guarita sobre el juego.')}</li>
      </ul>
    </div>
    <div class="card stack">
      <strong>{tx('Qual arquivo baixar', 'Qué archivo descargar')}</strong>
      {#if es}
        <p class="small" style="margin:0">
          Un solo archivo: el que termina en <span class="mono">-setup.exe</span> (por ejemplo,
          <span class="mono">Guarita_0.1.0_x64-setup.exe</span>). Los archivos “Source code” son el código fuente, no la app.
        </p>
        <p class="small muted" style="margin:0">
          La única dirección oficial es <a href={RELEASES_URL} target="_blank" rel="noopener">github.com/dosxnjos/guarita/releases</a>.
          Un instalador recibido por Discord, en un video o en otro sitio no es de la Guarita.
        </p>
      {:else}
        <p class="small" style="margin:0">
          Um arquivo só: o que termina em <span class="mono">-setup.exe</span> (por exemplo,
          <span class="mono">Guarita_0.1.0_x64-setup.exe</span>). Os arquivos “Source code” são o código-fonte, não o app.
        </p>
        <p class="small muted" style="margin:0">
          O único endereço oficial é <a href={RELEASES_URL} target="_blank" rel="noopener">github.com/dosxnjos/guarita/releases</a>.
          Instalador recebido por Discord, vídeo ou outro site não é da Guarita.
        </p>
      {/if}
    </div>
  </div>

  {#if es}
    <ol class="passos stack">
      <li>
        <strong>Al descargar.</strong> Edge puede avisar que el archivo “no se descarga con frecuencia”. Haz clic en los tres
        puntos (<strong>…</strong>) junto al aviso, después en <strong>Conservar</strong>, en <strong>Mostrar más</strong> y
        en <strong>Conservar de todos modos</strong>. En Chrome, elige <strong>Conservar</strong>.
      </li>
      <li>
        <strong>Verifica el archivo (opcional, recomendado).</strong> En PowerShell, ejecuta
        <span class="mono">Get-FileHash "$env:USERPROFILE\Downloads\{download.tipo === 'pronto' ? download.instalador.nome : 'Guarita_…-setup.exe'}"</span>
        y compara el resultado con el SHA-256
        {#if download.tipo === 'pronto' && download.instalador.sha256}
          de esta versión: <span class="mono hash">{download.instalador.sha256}</span>.
        {:else}
          publicado en las notas de la versión, en GitHub.
        {/if}
        Si es diferente, no lo ejecutes.
      </li>
      <li>
        <strong>Al abrir.</strong> La app todavía no tiene certificado de firma de código, así que Windows puede mostrar
        “Windows protegió su PC” (SmartScreen). Haz clic en <strong>Más información</strong> y después en
        <strong>Ejecutar de todas formas</strong>. El instalador no pide contraseña de administrador.
      </li>
    </ol>
  {:else}
    <ol class="passos stack">
      <li>
        <strong>Ao baixar.</strong> O Edge pode avisar que o arquivo “não é baixado com frequência”. Clique nos três
        pontos (<strong>…</strong>) ao lado do aviso, depois em <strong>Manter</strong>, em <strong>Mostrar mais</strong> e
        em <strong>Manter assim mesmo</strong>. No Chrome, escolha <strong>Manter</strong>.
      </li>
      <li>
        <strong>Confira o arquivo (opcional, recomendado).</strong> No PowerShell, rode
        <span class="mono">Get-FileHash "$env:USERPROFILE\Downloads\{download.tipo === 'pronto' ? download.instalador.nome : 'Guarita_…-setup.exe'}"</span>
        e compare o resultado com o SHA-256
        {#if download.tipo === 'pronto' && download.instalador.sha256}
          desta versão: <span class="mono hash">{download.instalador.sha256}</span>.
        {:else}
          publicado nas notas da versão, no GitHub.
        {/if}
        Se for diferente, não execute.
      </li>
      <li>
        <strong>Ao abrir.</strong> O app ainda não tem certificado de assinatura de código, então o Windows pode mostrar
        “O Windows protegeu o computador” (SmartScreen). Clique em <strong>Mais informações</strong> e depois em
        <strong>Executar assim mesmo</strong>. O instalador não pede senha de administrador.
      </li>
    </ol>
  {/if}
  <div class="row">
    {@render botaoBaixar()}
  </div>

  <h2>{tx('Perguntas frequentes', 'Preguntas frecuentes')}</h2>
  <div class="stack faq">
    {#each FAQ as [p, r] (p)}
      <details class="card">
        <summary><strong>{p}</strong></summary>
        <p style="margin:8px 0 0">{r}</p>
      </details>
    {/each}
  </div>
</section>

<style>
  .hero { padding-top: 8px; }
  .first { margin-top: 0; }
  .recurso { display: grid; gap: 4px; }
  .lista { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
  .faq summary { cursor: pointer; }
  .passos { margin: 0; padding-left: 20px; gap: 8px; }
  .hash { overflow-wrap: anywhere; font-size: 12px; }
  .ilustra { margin: 0; display: grid; gap: 6px; }
  .ilustra svg { width: 100%; height: auto; display: block; }
  .s-tela { fill: var(--surface-2); stroke: var(--line); }
  .s-chao { fill: color-mix(in srgb, var(--accent) 18%, var(--surface-2)); }
  .s-sol { fill: color-mix(in srgb, var(--accent) 45%, transparent); }
  .s-legenda { fill: var(--muted); font-size: 13px; }
  .s-janela { fill: var(--surface); stroke: var(--line); }
  .s-barra { fill: var(--accent-soft); }
  .s-titulo { fill: var(--ink); font-size: 12px; font-weight: 700; }
  .s-campo { fill: var(--surface-2); stroke: var(--line); }
  .s-texto { fill: var(--ink); font-size: 12px; }
  .s-valor { fill: var(--accent); font-size: 12px; font-weight: 700; }
  .s-mudo { fill: var(--muted); font-size: 11px; }
  .s-ok { fill: var(--good); }
  .s-hora { fill: var(--ink); font-size: 26px; font-weight: 700; }
</style>
