# Armadilhas do app (Guarita no PC)

Formato: **sintoma** → causa e o que fazer.

- **Toda chamada à API falha no app com erro de rede/CORS, mas funciona no navegador** → a API do site não manda
  `Access-Control-Allow-Origin` para `/api/*`, e o WebView2 roda na origem `http://tauri.localhost`. O app chama a
  API pelo `tauri-plugin-http` (lado Rust); `src/lib/api.ts` já faz isso. Nunca `fetch` solto. Se o site um dia
  mandar CORS, o fetch comum passa a servir, mas o plugin continua correto.
- **"Permission denied" ao chamar `fetch` do plugin-http** → a URL não está no escopo `http:default` da capability
  da janela (só `https://guarita.pages.dev/*`).
- **Comando Rust negado numa janela** → comandos do app passam pelo ACL: precisam estar em `build.rs` (`COMMANDS`)
  e na capability da janela (`allow-<comando-com-hífen>`). A capability casa pelo **rótulo** da janela.
- **O app trava ao abrir um widget** → criar janela em comando Rust síncrono trava no Windows. Os comandos de janela
  são `async fn`.
- **Instalador ou `guarita.exe` não aparecem em `src-tauri/target/`** → nesta máquina `CARGO_TARGET_DIR=C:\pt`;
  o build sai em `C:\pt\debug\` e `C:\pt\release\bundle\`.
- **Conteúdo do painel colado na borda** → no CSS do site, `.page` (padding vertical) vem depois de `.wrap` e zera o
  padding lateral se as duas classes estiverem no mesmo elemento. Aninhar: `<div class="wrap"><div class="page">`.
- **Widget com fundo opaco mesmo com opacidade baixa** → a janela precisa nascer com `transparent: true` e o
  `<html>`/`<body>` do widget com fundo transparente (classe `widget` posta em `main.ts`); quem pinta o fundo é a
  moldura (`WidgetChrome`) com `--janela-alpha`.
- **Mudança de config numa janela não chega às outras** → todas precisam usar o mesmo arquivo do store
  (`config.json`) e a mesma chave (`config`), via `src/lib/config.ts`. O store é único por caminho no lado Rust e o
  evento de mudança vai para todas as janelas.
- **Log aparece duplicado no terminal** → `tauri_plugin_log::Builder::new()` já vem com saída no terminal e arquivo;
  acrescentar `.target(Stdout)` de novo duplica.

## Telas (painel e widgets)

- **Checkbox em cima do texto, ou elemento virando grade sem motivo** → o CSS do site (`../src/app.css`) é global e
  tem classes genéricas: `.mini` é a janela PiP do site (`display: grid; padding`). Nome de classe novo no app:
  conferir antes com `grep "\.<nome>" ../src/app.css` (já mordeu: `.check.mini` virou `.check.chk`).
- **Widget mais largo que a janela, tabela cortada à direita** → a coluna implícita do grid da moldura cresce até o
  min-content da tabela (`white-space: nowrap`). `WidgetChrome` usa `grid-template-columns: minmax(0, 1fr)`; a
  tabela rola dentro do `.table-wrap` e o preço rápido esconde colunas por container query.
- **Dossiê preso em "Buscando…" depois de "Nova busca"** → com nome exato a busca abre o dossiê direto, e `abrir()`
  troca o `seq`, então o `finally` da busca não zera `buscando`. Zerar antes de `abrir()` e em `voltar()`.
- **Aviso da SBI num widget pequeno esconde o botão "Fixar por cima"** → o widget tem ~120 a 170 px de corpo.
  `AvisoSbi compacto` prende a confirmação e os botões no rodapé da área visível (`position: sticky`).
- **Tema não muda nas outras janelas** → o tema não mora na config: é `localStorage` (`guarita-app-tema`) e as outras
  janelas pegam pelo evento `storage` (`acompanharTema` em `ui-janelas.ts`, chamado no `App.svelte`).
- **Testar layout no navegador mostra "Sem conexão com a Guarita"** → sem CORS na API (primeira armadilha). Para
  ver com dado real no Playwright, interceptar `https://guarita.pages.dev/api/**` com `page.route` e devolver a resposta
  com `access-control-allow-origin: *`. O índice de itens (`/data/items-index.json`) carrega sem isso.
- **Janela do Playwright não fica com 280 px** → no modo extensão a viewport não desce de ~370 px; para simular widget
  estreito, fixar `document.body.style.width`.
- **Widget fechado reabre no próximo início, ou todos somem ao sair** → quem desmarca `janelas[l].aberta` em qualquer
  fechamento (barra, Alt+F4, painel) é o Rust, no `CloseRequested` do widget (`marcar_widget_fechado` em
  `src-tauri/src/lib.rs`). Sair do app (`app.exit`) destrói as janelas sem esse evento, e é isso que mantém marcado
  o que estava aberto. A gravação do Rust chega às janelas pelo `store://change` (um `resourceId` por arquivo).

## Línguas (português e espanhol)

- **Componente do site (Patient, AgeDot) em português com o app em espanhol** → eles leem o estado de
  `src/lib/i18n/index.svelte.ts`, que no site vem do caminho (`/es`) e no app é sempre `/`. `aplicarLingua` (em
  `src/lib/i18n.svelte.ts`) chama `syncLocale('/es')` para mexer nesse estado sem navegar. Não usar `setLocale` do
  site aqui: ele faz `pushState('/es')`, e recarregar a janela pediria `/es` ao Tauri.
- **Texto de função pura sai em português com o app em espanhol** → o padrão do `loc` é o espelho de
  `src/lib/i18n/core.ts` (`currentLocale()`), que só muda por `aplicarLingua`. Teste que chama sem `loc` depende da
  língua aplicada por outro teste: passar `loc` explícito ou voltar para `pt` no `afterEach`.
- **Rótulo calculado no `<script>` não troca de língua** → só troca porque a tela remonta (`{#key getLocale()}` em
  `App.svelte`). Constante em módulo `.ts` (fora de componente) roda uma vez: vira função com `loc`.
- **Trocar de língua joga o painel para a aba Início ou reabre os widgets** → efeito da remontagem. A aba e o "já
  reabriu" moram no `<script module>` do `Painel.svelte`; o que só pode rodar uma vez por execução vai para lá.
- **Bandeja em português com o app em espanhol** → com "Automático", o Rust só sabe a língua quando o painel chama
  `definir_lingua` (logo ao abrir); até lá vale português. Espanhol escolhido explicitamente já vem da config no
  `setup`. Comando novo de língua precisa de `build.rs` e da capability do painel.
- **Fala em espanhol com sotaque português (ou o contrário)** → a voz guardada nos ajustes é um nome só. Em espanhol
  ela só vale se for espanhola (`escolherVozEs`), e em português só se não for espanhola (escolhida com o app em
  espanhol e o app voltou ao português: cai na Francisca/Maria); sem voz espanhola instalada, o Windows lê com a voz
  padrão e a tela avisa. Cada fala guarda a língua em que entrou na fila: trocar de língua no meio não troca a voz da fila.
- **Nome de item em português na regra ou no lembrete com o app em espanhol** → o nome é guardado na criação. A busca
  e o loot usam o índice da língua atual (`items-index-es.json`), mas o que já está na config não é traduzido.
- **Mensagem da captura em português com o app em espanhol** → o Rust da captura manda texto em português; a tela
  traduz pelo texto exato (`mensagemCaptura`). Mudou a frase em `src-tauri/src/capture`, mude a tabela em
  `capture/sessao.ts` (o teste `tests/i18n.test.ts` acusa).
- **Cidade aparece "Black Market" em espanhol** → usar `cityName(c)` de `format.ts` na tela (em espanhol, "Mercado
  Negro"); o valor da API e da config continua o nome em inglês.

## Lente de mercado (websocket do cliente AODP)

Conferido no código de `ao-data/albiondata-client` (`client/dispatcher.go`, `client/ws_client.go`) em 30/10/2026.

- **Lente fica em "Cliente não encontrado" com o cliente aberto** → (1) a URL precisa do caminho `/ws`
  (`http.HandleFunc("/ws")`; `ws://localhost:8099` sozinho dá 404); `normalizarUrlLente` acrescenta. (2) O cliente só
  aceita o handshake se o hostname do `Origin` estiver em `AllowedWebsocketHosts` do `config.yaml` (lista vazia
  recusa tudo): no app instalado é `tauri.localhost`, no `tauri dev` é `localhost`. (3) `config.yaml` é lido da pasta
  de trabalho do cliente e só ao iniciar: reiniciar o cliente. Recusa e cliente fechado dão o mesmo erro 1006 no
  navegador, por isso a tela explica as duas causas.
- **Preço da lente 10 mil vezes maior** → o jogo manda `UnitPriceSilver` multiplicado por 10000 (o servidor do AODP
  divide). `parseMensagemAodp` divide.
- **Mensagem do websocket não é JSON válido** → o cliente junta mensagens enfileiradas no mesmo quadro separadas por
  `\n`. Separar por linha antes do `JSON.parse`.
- **Dado pessoal no websocket** → tópicos privados (`marketnotifications`, `skills`) passam pelo mesmo websocket com
  nome e id do personagem. A lente descarta tudo que não é `marketorders.ingest`, sem guardar nem registrar em log.
- **Conexão cai sozinha** → o servidor do cliente lê no máximo 512 bytes do navegador e fecha com qualquer coisa
  diferente. A lente nunca chama `send()`.
- **Ofertas de vários itens não mostram nada** → de propósito: lista de categoria traz itens diferentes; a lente só
  reage quando todas as ordens do quadro são do mesmo item (o item aberto no mercado).
- **Black Market e Caerleon trocados** → `3003` é o Black Market e `3005` Caerleon, mas `3003-HellDen` é o mercado de
  Caerleon. A tabela de `cidadeDoLocal` segue a do servidor do AODP (`lib/location.rb`).

## Motor local (alertas, despertador, relógio, voz, atalhos)

- **Despertador avisa até ~1 min atrasado com o painel minimizado ou na bandeja** → depois de ~5 min escondido, o
  WebView2 segura timers encadeados a cerca de 1 por minuto, e o `backgroundThrottling` do Tauri não vale no Windows.
  O motor tolera: confere todos os vencidos a cada acordada, diz "venceu há N min" quando chega atrasado, confere de
  novo ao voltar a janela e segura uma trava da Web Locks API (paliativo da issue do Tauri). Não trocar por Rust.
- **Timer de mais de 24,8 dias dispara na hora** → `setTimeout` acima de 2^31−1 ms estoura no Chromium. O motor
  nunca espera mais que 60 s seguidos (`VARREDURA_MS` em `engine/timers.ts`).
- **No `tauri dev` o motor reinicia uns segundos depois de abrir** → o Vite otimiza um plugin novo e recarrega a
  página (`optimized dependencies changed. reloading`); o `beforeunload` para tudo e o painel liga de novo. Normal
  no dev; no instalador não acontece.
- **Notificação aparece como se fosse de outro programa no `tauri dev`** → o app não está instalado, então o Windows
  não conhece o `com.guarita.app`. Por isso o título leva "Guarita · ".
- **Notificação chega muda** → sem `sound` o plugin grava `<audio silent="true"/>` no toast. `notify.ts` manda
  `sound: 'Default'` quando o som está ligado; o som curto do app (Web Audio) só toca quando a notificação está
  desligada, porque o `AudioContext` pode nascer suspenso numa janela que ainda não recebeu clique.
- **Atalho global não funciona e a tela mostra "o Windows não liberou"** → outro programa já registrou a combinação
  (`RegisterHotKey` recusa). Escolher outra; `aplicarAtalhos` segue com as demais.
- **Voz para no meio da fila** → `onend` do Chromium falha se a utterance for recolhida ou cancelada; `voice.ts`
  guarda a atual, tem vigia por tempo e numera as falas. Não chamar `speechSynthesis.cancel()` fora de `voice.ts`.
- **Mudança feita numa janela some quando o motor grava um disparo (e o aviso toca de novo)** → a config é um objeto
  só; gravar a partir do retrato da janela apagava `lastFiredAt`/`firedAt` gravados por outra. `updateConfig` relê o
  store (`backend.read()`, valor do lado Rust) dentro da gravação e enfileira as gravações da janela. Sobra só a
  janela entre ler e gravar (milissegundos, duas idas ao Rust sem trava); se virar problema, disparos em chave própria do store.
- **Requisição trava para sempre e o motor para de checar em silêncio** → o plugin-http resolve o `fetch` com os
  cabeçalhos; o corpo vem por stream, sem prazo. O timeout em `api.ts` vale até o fim de `r.json()` (`lerCorpo`
  desiste no abort), senão a promessa presa fica no `inflight` da URL.
- **Aviso de temporada ou de bônus acabando a cada abertura do app** → a leitura anterior do relógio só existe em
  memória. A memória do que já foi avisado mora em `config.avisosRelogio` (`filtrarJaAvisados` em `engine/clock.ts`).
- **Queda do servidor sem aviso** → uma checagem "desconhecido" no meio zerava a transição. O motor compara com o
  último status conhecido (`statusAnterior` de `compararRelogio`).
- **"Retirar o aceite" não solta widget escondido pelo atalho** → `visible` da lista de widgets é falso para janela
  escondida. Para "por cima", usar `open` (a janela existe); `retirarAceite` chama `setOnTop(false)` em todas.
- **App abre com o Windows e a tela diz "desligado"** → a config se perdeu com a chave Run ainda no registro. O
  registro é a verdade: `reconciliarIniciarComWindows()` no painel desliga quando diverge (nunca liga).

## Captura do próprio jogador (Npcap, Photon)

Conferido em 30/10/2026 no `ao-data/albiondata-client` (MIT) e no `AlbionOnline-StatisticsAnalysis` (GPL, só os
números). **Validação ao vivo ainda pendente**: nada abaixo foi visto com o jogo aberto nesta máquina.

- **"Npcap não encontrado" com o Npcap instalado** → a carga procura `C:\Windows\System32\Npcap\wpcap.dll` (caminho
  fixo). Instalado no "modo compatível com WinPcap" antigo ou em outra pasta, não acha. Reinstalar a versão atual de
  https://npcap.com com as opções padrão.
- **`wpcap.dll` existe, mas "Npcap com problema" (não carregou)** → o `wpcap.dll` depende do `Packet.dll` da mesma
  pasta, que não está no caminho de busca do Windows. `npcap.rs` carrega o `Packet.dll` pelo caminho completo antes;
  se mexer na carga, manter a ordem.
- **"Sem acesso à rede" (nenhuma interface abriu)** → Npcap instalado com "Restrict Npcap driver's access to
  Administrators only". Reinstalar sem a opção (rodar o app como administrador funciona, mas não é o caminho).
  Interfaces de VPN (Wintun) e adaptadores virtuais recusam abrir: normal, a captura segue com as outras.
- **Fica em "Troque de mapa uma vez" para sempre** → a identidade (objeto e nome) vem da resposta do `Join`, mandada
  a cada troca de mapa. Ligar com o jogo já num mapa exige uma troca. Se nem trocando passa, o código do `Join` (2)
  ou os campos (0, 2, 8) mudaram no patch: conferir no diagnóstico (`respostas` com contagem e nome).
- **Números zerados depois de um patch do Albion** → os códigos de evento e operação mudam a cada patch (o enum do
  jogo ganha itens no meio). Modo de diagnóstico ligado, jogar alguns minutos, comparar `captura-diagnostico.json`
  com o enum atual do StatisticsAnalysis/albiondata-client, corrigir `app/capture-codes.json`, **subir `versao`** e
  publicar no `main` (o app só troca para tabela de versão maior).
- **Código de evento "errado" (o byte do evento é 1, 3...)** → o Albion põe o código real em `params[252]` (evento)
  e `params[253]` (operação) como short; o byte do Photon é truncado. O albiondata-client também desinverte bytes
  (`0xDA00` → `0x00DA`) quando o código lido é desconhecido; aqui não: se aparecer no diagnóstico código com o byte
  baixo zerado, é esse caso.
- **Mercado e outras mensagens não aparecem** → desde jan/2024 a SBI criptografa parte do tráfego de algumas contas
  (tipo de mensagem com bit `0x80` ou pacote com flag 1). O parser descarta e conta em "criptografados". Se fama e
  prata também vierem criptografadas, a captura não tem o que mostrar: não há contorno (e não deve haver).
- **Mensagem grande nunca chega (fragmento)** → o Windows junta datagramas antes do Npcap (URO, ligado por padrão no
  Windows 11): pacotes de até ~14 KB. Snaplen baixo corta e a remontagem nunca fecha. `SNAPLEN` é 262144; não baixar.
- **Dois pacotes Photon num datagrama só** → também o URO. `photon.rs` segue lendo enquanto o próximo cabeçalho tiver
  o mesmo `peerId` e `challenge`.
- **Prata do corpo contada duas vezes** → pegar prata de um corpo gera `TakeSilver` e também `OtherGrabbedLoot` com
  "é prata". A sessão soma só o `TakeSilver` (líquido de taxas); o loot ignora a linha de prata.
- **Fama da primeira morte de mob menor que a do jogo** → a fama vem da diferença do total (`UpdateFame` campo 1)
  entre dois eventos; no primeiro evento depois de ligar não há total anterior e vale o campo 2 (sem bônus de
  Premium nem da bolsa de fama).
- **Fama/h absurda depois de religar a captura** → a base do total sobrevivia ao desligar e a fama ganha com a
  captura parada entrava de uma vez. `Interpretador::pausou()` zera a base em desligar, queda e sessão nova.
- **Prata/h, fama/h e loot/h divididos por horas com o jogo fechado** → o tempo contava desde ligar (o app liga a
  captura sozinho ao abrir). Agora conta do primeiro pacote do jogo e para no último quando passam 15 s sem tráfego
  (`Nucleo::processar` e `conferir_silencio`).
- **Widget parado em "Aguardando o tráfego" depois de suspender o PC** → as threads das interfaces saíam e a
  captura seguia "ligada" sem ler nada. `captura_caiu` marca `sem-interface` com o motivo e "Tentar de novo" liga de
  novo; `ligar()` também trata execução de threads mortas como desligada. Reabrir sozinho: pendência.
- **Loot, prata e mapa de outra pessoa na sessão (Hotspot Móvel/ICS)** → tráfego do jogo de outro PC roteado por
  este passa pelo Npcap. A identidade fica presa ao fluxo do `Join`: Join de outro personagem noutro fluxo só vale
  depois de 10 s sem pacote no fluxo atual; Join do mesmo nome troca na hora (troca de mapa). Limite: se só o
  outro estiver jogando, o primeiro Join é o dele (pendência: filtrar pelo endereço da interface).
- **App aborta por falta de memória com pacote forjado na porta 5056** → `vec![0; total]` pelo total declarado no
  fragmento e tipos "zero" de 0 byte multiplicando `Valor`. Remontagem guarda só os pedaços que chegaram (2 MB por
  fluxo, 1 MB por mensagem) e o Protocol18 tem orçamento de valores por mensagem (`Leitor::gastar`).
- **Tabela remota apontando outra porta ou campo** → `de_json` aceita só 5055/5056 e `de_json_remota` limita o
  salto de `versao` (+1000); id de mapa só com formato de id e, com o `world.txt` carregado, só se existir nele. Desde
  a 0.2.1 a remota só vale com `capture-codes.json.sig` válido (próximo item).
- **Tabela nova publicada no `main` e o app segue com a antiga ("tabela remota recusada (assinatura)" no log e no
  diagnóstico)** → mudou `capture-codes.json` sem assinar, ou o `.sig` foi para outro commit. Mudou
  `capture-codes.json` → rode `npm run codes:sign` (em `app/`) e commite os dois juntos; a versão 0.2.0 ignora o
  `.sig`. O `cargo test` pega o esquecimento (`assinatura_commitada_vale_para_a_tabela_atual`). Logo depois do push
  o CDN do `raw.githubusercontent.com` pode servir por alguns minutos a tabela nova com a assinatura velha: o app
  recusa, não guarda a cópia e tenta de novo na próxima abertura. A assinatura vale para os bytes exatos: salvar o
  JSON com CRLF quebra (o script recusa; `app/.gitattributes` impede o Git de converter).
- **`npm run codes:sign` diz que a chave do Doppler não é a embutida** → `GUARITA_CODES_SIGN_KEY` foi trocada sem
  atualizar `CHAVE_PUBLICA_B64` em `src-tauri/src/capture/codigos.rs` (ou o contrário). `node ../scripts/sign-codes.mjs
  --publica` (com `doppler run`) mostra a pública da chave atual. `--gerar` nunca sobrescreve o segredo.
- **Loot "sem preço" mesmo depois de a lista de itens chegar** → a marca que decide buscar preço só olhava
  quantidades; agora inclui o id (`marcaDoLoot`).
- **Loot como "Item nº 1234" e sem preço** → falta a lista `items.txt` do ao-bin-dumps (sem rede na primeira vez).
  O índice numérico também muda entre patches: lista velha dá o item errado. A cópia local vale 24 h.
- **Loot de coleta, refino ou mercado não aparece** → de propósito na v1: o "loot" é só o `OtherGrabbedLoot` do
  próprio jogador (corpos, baús, chão). Itens que entram por outros caminhos não passam por esse evento.
- **Nome do mapa em inglês** → o `world.txt` do ao-bin-dumps só tem inglês. Pendência: nomes PT-BR.
- **Nome de outro jogador no diagnóstico ou na tela** → não pode acontecer (fronteira dos Termos): o interpretador
  só olha a lista fechada e o diagnóstico guarda só código → contagem. Teste em `capture/albion.rs`
  (`outros_jogadores_sao_descartados_e_nunca_expostos`) e em `capture/mod.rs` (do quadro ao retrato).
- **Contador ao vivo de "outros jogadores descartados"** → subia quando alguém agia por perto: indicador de
  presença. Saiu do `Estado` (tela); a contagem fica só no arquivo de diagnóstico.
