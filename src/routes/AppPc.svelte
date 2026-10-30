<script lang="ts">
  // Página /app: o app da Guarita para Windows (pasta app/ do repo). O que faz, o que não faz, requisitos,
  // download pelo GitHub Releases e o aviso do SmartScreen (app ainda sem certificado de assinatura).
  import { go } from '../lib/router';
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  $effect(() => {
    document.title = 'App para PC · Guarita';
  });

  const RELEASES = 'https://github.com/dosxnjos/guarita/releases/latest';
  const CODIGO = 'https://github.com/dosxnjos/guarita/tree/main/app';
  const AODP = 'https://www.albion-online-data.com/';

  const RECURSOS: [titulo: string, desc: string][] = [
    ['Preço rápido', 'Digite o item e veja a cidade mais barata, o preço, há quanto tempo foi visto e o selo de confiança.'],
    ['Relógio do Americas', 'Servidor, bônus do dia e fim da temporada em horário de Brasília. Avisa quando o servidor cai, quando volta e quando o bônus está acabando.'],
    ['Alertas de preço no PC', 'Regras de preço conferidas pelo próprio app a cada 2 a 5 minutos, com notificação do Windows e voz.'],
    ['Despertador', 'Lembrete de colheita, animais e foco cheio, tocado pelo app.'],
    ['Dossiê', 'Histórico público de um jogador pelo nome, quando você pesquisa.'],
    ['Lente de mercado (experimental)', 'Com o cliente oficial do Albion Data Project aberto, mostra o preço do item aberto no mercado nas outras cidades.'],
  ];

  const NAO_FAZ: string[] = [
    'Não lê a memória nem o processo do jogo.',
    'Não captura tráfego de rede por conta própria.',
    'Não manda tecla nem clique ao jogo: nada de macro ou automação.',
    'Não desenha nada dentro do cliente do jogo; as janelas são do Windows, separadas.',
    'Não avisa quando um jogador aparece perto de você.',
    'Não pede login nem senha da sua conta do Albion.',
  ];

  const FAQ: [pergunta: string, resposta: string][] = [
    ['Preciso do app e do site?', 'Não, cada um funciona sozinho e os dados são os mesmos. O site serve em qualquer aparelho, inclusive no celular. O app fica aberto no PC enquanto você joga, com janelas pequenas, voz e avisos do Windows.'],
    ['O app fica rodando escondido?', 'Não. Ele só trabalha enquanto está aberto: fechou, parou. Não cria tarefa agendada nem serviço do Windows. Iniciar com o Windows e fechar para a bandeja são opções que vêm desligadas; se você ligar, o ícone aparece na bandeja.'],
    ['Os alertas do app e os do site são iguais?', 'Os do site chegam pelo navegador, pelo celular ou pelo Discord mesmo com o computador desligado, porque quem confere é o servidor da Guarita. Os do app são conferidos pelo próprio app e só tocam com ele aberto.'],
    ['Pode dar banimento?', 'O app não toca no jogo: lê só dados públicos, as mesmas fontes do site. A única zona cinza é deixar uma janela por cima da tela do jogo, e por isso essa opção vem desligada e só liga depois de você ler o aviso. O risco de usá-la é da sua conta.'],
    ['É pago? Precisa de conta?', 'É de graça, sem conta e sem cadastro. O código é aberto, sob a licença MIT.'],
    ['Funciona no Mac ou no Linux?', 'Por enquanto, só no Windows 10 e 11.'],
    ['Como atualizo?', 'Nesta versão não há atualização automática. Quando sair uma versão nova, baixe o instalador de novo por esta página; suas configurações continuam.'],
    ['Como desinstalo?', 'Em Configurações do Windows, Aplicativos, procure “Guarita” e escolha Desinstalar.'],
  ];
</script>

<section class="page stack" style="max-width:860px">
  <header class="hero">
    <h1>Guarita no PC</h1>
    <p class="lead">
      O companheiro que fica aberto enquanto você joga: janelas pequenas ao lado do jogo ou em outra tela, voz em
      português, atalhos e avisos do Windows. Usa os mesmos dados do site.
    </p>
    <div class="row">
      <a class="btn primary" href={RELEASES} target="_blank" rel="noopener">Baixar para Windows</a>
      <a class="btn" href={CODIGO} target="_blank" rel="noopener">Ver o código</a>
    </div>
    <p class="small muted" style="margin:8px 0 0">Windows 10 ou 11, 64 bits. Gratuito e de código aberto.</p>
  </header>

  <figure class="ilustra" aria-labelledby="ilustra-legenda">
    <svg viewBox="0 0 560 280" role="img" aria-labelledby="ilustra-titulo">
      <title id="ilustra-titulo">Ilustração: a tela do jogo à esquerda e duas janelas pequenas da Guarita ao lado, com preço e relógio.</title>
      <rect x="1" y="1" width="558" height="278" rx="14" class="s-tela" />
      <path d="M1 210 C 120 170, 200 230, 330 190 L 330 279 L 1 279 Z" class="s-chao" />
      <circle cx="80" cy="60" r="22" class="s-sol" />
      <text x="24" y="250" class="s-legenda">jogo (janela sem borda)</text>

      <g transform="translate(350 22)">
        <rect width="190" height="136" rx="10" class="s-janela" />
        <rect width="190" height="26" rx="10" class="s-barra" />
        <rect y="16" width="190" height="10" class="s-barra" />
        <text x="12" y="18" class="s-titulo">Preço rápido</text>
        <rect x="12" y="38" width="166" height="22" rx="6" class="s-campo" />
        <text x="20" y="53" class="s-texto">Bolsa do Adepto</text>
        <text x="12" y="82" class="s-texto">Martlock</text>
        <text x="178" y="82" text-anchor="end" class="s-valor">4.120</text>
        <text x="12" y="102" class="s-texto">Lymhurst</text>
        <text x="178" y="102" text-anchor="end" class="s-valor">4.380</text>
        <circle cx="16" cy="122" r="4" class="s-ok" />
        <text x="26" y="126" class="s-mudo">visto há 8 min · selo alta</text>
      </g>

      <g transform="translate(350 172)">
        <rect width="190" height="86" rx="10" class="s-janela" />
        <rect width="190" height="26" rx="10" class="s-barra" />
        <rect y="16" width="190" height="10" class="s-barra" />
        <text x="12" y="18" class="s-titulo">Relógio</text>
        <text x="12" y="56" class="s-hora">21:42</text>
        <text x="86" y="50" class="s-texto">Servidor online</text>
        <text x="86" y="68" class="s-mudo">bônus acaba em 1 h</text>
      </g>
    </svg>
    <figcaption id="ilustra-legenda" class="small muted">Ilustração. As janelas se movem, mudam de tamanho e de opacidade e lembram onde ficaram.</figcaption>
  </figure>

  <h2>O que o app faz</h2>
  <div class="grid">
    {#each RECURSOS as [titulo, desc] (titulo)}
      <div class="card recurso">
        <strong>{titulo}</strong>
        <span class="small muted">{desc}</span>
      </div>
    {/each}
  </div>
  <p class="small muted" style="margin:0">
    Avisos falados em português com as vozes do Windows, atalhos de teclado que você escolhe (eles só abrem janelas da
    Guarita) e notificações do Windows.
  </p>

  <div class="card stack">
    <h2 class="first">Só funciona com o app aberto</h2>
    <p style="margin:0">
      Nada fica rodando por trás: o app não cria tarefa agendada nem serviço do Windows. Iniciar com o Windows existe
      como opção e vem desligada. Fechou o app, parou tudo.
    </p>
  </div>

  <div class="card no stack">
    <h2 class="first"><span class="tag bad">Nunca</span> O que o app não faz</h2>
    <ul class="lista">
      {#each NAO_FAZ as t (t)}<li>{t}</li>{/each}
    </ul>
    <p class="small muted" style="margin:0">
      A lente de mercado só escuta o cliente oficial do <a href={AODP} target="_blank" rel="noopener">Albion Data
      Project</a>, se você instalar e ligar esse cliente. A Guarita não lê o mercado do jogo por conta própria.
    </p>
  </div>

  <div class="callout warn stack">
    <strong>Janela por cima do jogo vem desligada</strong>
    <p style="margin:0">
      Em 2020 a Sandbox Interactive proibiu ferramentas que fazem “<span lang="en">displaying extra information to the
      player in the client</span>” (mostrar informação extra ao jogador dentro do cliente do jogo). As janelas do app são
      separadas do cliente: não leem, não alteram e não desenham nada dentro do jogo. Mesmo assim, ficar por cima da
      tela do jogo é uma zona cinza nas regras. Por isso “sempre por cima” só liga depois de você ler esse aviso.
      <strong>O risco é da sua conta.</strong>
    </p>
    <p class="small" style="margin:0"><a href="/permitido" onclick={go}>Entenda o que é e o que não é permitido</a></p>
  </div>

  <h2>Instalar</h2>
  <div class="grid">
    <div class="card stack">
      <strong>Requisitos</strong>
      <ul class="lista small">
        <li>Windows 10 ou 11, 64 bits.</li>
        <li>Microsoft Edge WebView2, que já vem no Windows 11; no Windows 10, o instalador baixa se faltar.</li>
        <li>Internet, para buscar os preços e o relógio.</li>
      </ul>
    </div>
    <div class="card stack">
      <strong>Aviso do Windows na primeira vez</strong>
      <p class="small" style="margin:0">
        O app ainda não tem certificado de assinatura de código, então o Windows pode mostrar “O Windows protegeu o
        computador” (SmartScreen). Clique em <strong>Mais informações</strong> e depois em
        <strong>Executar assim mesmo</strong>.
      </p>
      <p class="small muted" style="margin:0">Baixe só pelo botão desta página, que leva ao GitHub oficial da Guarita.</p>
    </div>
  </div>
  <div class="row">
    <a class="btn primary" href={RELEASES} target="_blank" rel="noopener">Baixar para Windows</a>
  </div>

  <h2>Perguntas frequentes</h2>
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
