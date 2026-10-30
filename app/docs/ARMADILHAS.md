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
