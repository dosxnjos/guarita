# Guarita no PC

App de Windows da Guarita: o companheiro que fica aberto enquanto você joga Albion Online (Americas). Janelas
pequenas (widgets) ao lado do jogo ou noutra tela, voz em português, atalhos globais e avisos do Windows. Usa a
mesma API pública do site (`https://guarita.pages.dev/api/*`); não tem servidor próprio.

**Só trabalha com o app aberto.** Nenhuma tarefa agendada, nenhum serviço do Windows. "Iniciar com o Windows" é
uma opção desligada por padrão (quando o usuário liga, o plugin usa a chave `Run` do registro do usuário, visível em
Configurações > Aplicativos > Inicialização). O app não lê o processo do jogo e não manda tecla nem clique ao jogo.
A única leitura de rede é a **captura do próprio jogador** (experimental, desligada por padrão, só com o Npcap
instalado e o aviso aceito; seção abaixo). Plano e decisões: [../../roadmap/2026-10-30-guarita-app-pc.md](../../roadmap/2026-10-30-guarita-app-pc.md)
e, para a captura, a entrega 0 de [../../roadmap/2026-10-30-guarita-fase3.md](../../roadmap/2026-10-30-guarita-fase3.md).

## Rodar

Pré-requisitos: Node 20+, Rust estável com MSVC, WebView2 (já vem no Windows 11).

```bash
cd app
npm install
npm run dev      # tauri dev: sobe o Vite na porta 1420 e abre o app (recarrega ao salvar)
npm run check    # svelte-check + cargo check
npm test         # vitest (tests/)
npm run vite:dev # só o front no navegador; ?w=preco mostra um widget. Sem Tauri, comandos de janela falham.
npm run codes:sign # assina capture-codes.json → capture-codes.json.sig (chave no Doppler pessoal; seção da captura)
```

## Gerar o instalador

```bash
npm run build    # tauri build: instalador NSIS (.exe, pt-BR, por usuário) e MSI
```

Saída em `<pasta de build do cargo>/release/bundle/{nsis,msi}/`. Nesta máquina a variável `CARGO_TARGET_DIR`
aponta para `C:\pt`, então o instalador sai em `C:\pt\release\bundle\`; sem a variável, em
`app/src-tauri/target/release/bundle/`. Sem certificado de assinatura, o Windows mostra o aviso do SmartScreen
("Mais informações" > "Executar assim mesmo"). v1 sem atualização automática: instalador novo no GitHub Releases.

Arquivos gerados (v0.2.1, 30/10/2026; tabela de códigos remota só com assinatura válida):
`nsis/Guarita_0.2.1_x64-setup.exe` (2.589.885 bytes, instala por usuário, sem pedir administrador; SHA-256
`fec5f91d706c35cdeaf4810399cfa541d6f41fa02412c91322778387c9ea6b42`) e `msi/Guarita_0.2.1_x64_pt-BR.msi`
(3.555.328 bytes; SHA-256 `4060bbba3fb60c84abcdd331a081c4d9aff2d92725decbd5455d25c20cf6098d`). A versão mora em
cinco lugares que andam juntos: `package.json`, `package-lock.json` (raiz do pacote), `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` e `src-tauri/Cargo.lock`. O app segue só em português (o site também tem `/es`). Se faltar o WebView2 (Windows 10 antigo), o
instalador NSIS baixa o instalador oficial da Microsoft (modo padrão `downloadBootstrapper`, precisa de internet).
Nenhum dos dois cria tarefa agendada, serviço ou entrada de inicialização.

**Publicar uma versão**: a página `/app` do site lê `releases/latest` pela API do GitHub e oferece só o arquivo
`*-setup.exe` (sem release, o botão mostra "Em breve"). Publicar como release normal: rascunho e pré-release
ficam fora de `releases/latest` e a página continua em "Em breve". Nas notas da release, pôr o SHA-256 de cada arquivo
(`sha256sum` ou `Get-FileHash`); o GitHub também informa o `digest` do arquivo, que a página mostra quando existe.

## Arquitetura de janelas

- **Um bundle só** (`index.html` + `src/main.ts`). Cada janela descobre o que desenhar pelo **próprio rótulo**
  (`getCurrentWindow().label`, em `src/lib/windows.ts` → `currentLabel()`). Fora do Tauri, o rótulo vem de `?w=`.
  Escolhido em vez de uma entrada HTML por widget: um build, CSS e código compartilhados, widget novo = um
  componente. Não usamos query na URL da janela porque o rótulo já é único e confiável.
- **Painel** (`painel`, declarado em `src-tauri/tauri.conf.json`): janela principal com moldura do Windows.
  Só nele rodam o motor local (alertas, despertador, relógio), os atalhos globais e a reabertura dos widgets.
- **Widgets** criados sob demanda pelo Rust (`widget_open`), rótulos fixos: `preco`, `dossie`, `relogio`, `alertas`,
  `despertador`, `lente`, `sessao`, `loot`. Sem moldura do Windows (`decorations: false`), janela transparente, moldura fina própria
  (`src/lib/ui/WidgetChrome.svelte`: barra de arrasto, opacidade rápida em degraus, fixar por cima, minimizar, fechar).
  Abrir um widget marca `janelas[l].aberta`; fechar por qualquer caminho (barra, Alt+F4, painel, atalho) desmarca
  (o Rust grava no `CloseRequested` do widget); sair do app mantém marcados os que estavam abertos, e o painel os
  reabre ao iniciar. Na primeira abertura os widgets nascem em cascata; depois vale a posição salva.
  Fixado por cima antes? Ao abrir, a moldura fixa de novo (o Rust cria toda janela sem "por cima").
- **Posição, tamanho e monitor** de cada janela: `tauri-plugin-window-state` (posição, tamanho, maximizado).
- **Sempre por cima**: nasce desligado. O botão "fixar" mostra o aviso da regra de 2020 da SBI (mesmo texto do site);
  aceitar grava `avisoSbiAceitoEm` na config, e o comando Rust `widget_set_on_top` recusa ligar sem esse campo.
- **Opacidade**: o Tauri 2 não tem opacidade de janela inteira no Windows. Os widgets são janelas transparentes e a
  opacidade é do fundo, via CSS (`--janela-alpha` no `<html>`, de 0,35 a 1; `applyOpacity` em `windows.ts`). O
  texto continua opaco.
- **Bandeja** (o ícone existe sempre que o app está aberto, com ou sem "fechar para a bandeja"): abrir painel, abrir cada widget, silenciar voz (marca e avisa todas as janelas pelo evento
  `guarita://voz-silenciada`), sair. Clique esquerdo no ícone abre o painel.
- **Fechar o painel encerra o app** (motor e voz param junto). Opção "fechar para a bandeja", desligada por padrão.
- **Instância única**: abrir o app de novo só traz o painel para a frente.

## Segurança

- **Capabilities por janela** (`src-tauri/capabilities/`): `painel.json` (criar widgets, atalhos globais, notificação,
  iniciar com o Windows, store, http, todos os comandos da captura) e `widgets.json` (arrastar, minimizar, fechar,
  fixar, store, http, ler estado e sessão da captura). Nada de shell, nada de sistema de arquivos. O `http` do painel
  também alcança quatro URLs exatas do `raw.githubusercontent.com` (tabela de códigos, a assinatura dela e listas do ao-bin-dumps). Comandos do app também passam por permissão (`build.rs` + capability).
- **Rede**: dentro do app, a API sai pelo `tauri-plugin-http` com escopo só em `https://guarita.pages.dev/*` (a API
  do site não manda CORS para a origem do app). Links externos abrem no navegador (`tauri-plugin-opener`, escopo
  fechado).
- **CSP** (`tauri.conf.json`): `connect-src` só `guarita.pages.dev`, `render.albiononline.com` (imagens),
  `ws://localhost:8099` (lente opcional) e o IPC interno do Tauri; `img-src` só o próprio app, `data:` e o render.
- **Lente de mercado** (desligada por padrão): o usuário instala o cliente do Albion Data Project (projeto
  comunitário, sem ligação com a SBI, que lê o tráfego de rede do jogo no PC dele; a tela e a página `/app` dizem
  isso) e põe no `config.yaml` da pasta do cliente `EnableWebsockets: true` e `AllowedWebsocketHosts: [tauri.localhost]`
  (no `tauri dev`, `localhost`). A Guarita só escuta: nunca envia nada ao cliente.
- **Iniciar com o Windows**: o registro (chave Run) é a verdade. Ao abrir, o painel chama
  `reconciliarIniciarComWindows()` (`src/lib/autostart.ts`): registro ligado com a config desligada → desliga; nunca liga.

## Captura do próprio jogador (experimental)

Liga em Ajustes › "Captura do próprio jogador". **Desligada por padrão**; ligar exige ler e aceitar o aviso ("ler o
tráfego de rede só para análise é tolerado pela SBI desde 2017; não é permitido oficialmente; risco da sua conta").
O aceite fica em `captura.json` (store, chave `captura`: `ligada`, `avisoAceitoEm`, `diagnostico`) e o Rust confere
`avisoAceitoEm` antes de ligar (`captura_ligar` recusa sem ele), como o "sempre por cima".

- **O que lê:** com o Npcap instalado, só os datagramas UDP que o servidor de jogo (porta **5056**) manda ao PC, sem
  modo promíscuo (filtro BPF `udp port 5056`, origem 5056). Nada é enviado ao servidor; nada lê o processo do jogo.
- **O que mostra:** só agregados do próprio personagem: prata recolhida (líquida de taxas), fama, itens pegos (corpos,
  baús, chão) com quantidade, mortes, mapa atual e variação do saldo. Widgets **Sessão** (prata/h, fama/h, valor do
  loot/h, duração, "Nova sessão") e **Loot** (lista com valor estimado: mediana do `sellMin` de qualidade normal nas
  cidades comuns, via `/api/prices` em lote).
- **O que descarta:** todo evento fora da lista fechada da tabela (personagem novo na área, movimento, equipamento,
  chat, mob...) e, dos eventos da lista, o que for de outro jogador (loot pego por outro, morte de outro, prata de
  outro membro do grupo). Descartado no interpretador Rust (`src-tauri/src/capture/albion.rs`), antes de chegar ao
  front; o próprio nome do personagem só serve para comparar e também não sai do Rust. Teste:
  `outros_jogadores_sao_descartados_e_nunca_expostos`.
- **Quem é "eu":** a resposta da operação `Join` (objeto, nome e mapa), que o jogo manda a cada troca de mapa. Ligou a
  captura com o jogo já num mapa → fase "Troque de mapa uma vez". `UpdateFame`/`UpdateMoney` só chegam para o próprio
  jogador e contam mesmo antes disso.

**Npcap em tempo de execução.** `src-tauri/src/capture/npcap.rs` carrega `C:\Windows\System32\Npcap\Packet.dll` e
`wpcap.dll` (caminho completo, `libloading`); sem SDK no build e sem função de envio carregada. Sem o Npcap, a tela
mostra "Npcap não encontrado", o porquê e o passo a passo (instalar de https://npcap.com sem a opção "só
administradores"). Fases (`Fase` em `capture/mod.rs`): `desligada`, `sem-npcap`, `npcap-invalido`, `sem-interface`,
`sem-permissao`, `aguardando-jogo` (sem tráfego há 15 s), `aguardando-mapa`, `capturando`.

**Threads.** Uma por interface de rede (`pcap_next_ex` com espera de 500 ms, conferindo o sinal de parar) → canal
limitado (4096) → uma de processamento (Photon → Protocol18 → interpretador → sessão), que emite
`guarita://captura-sessao` (retrato, no máximo 2 por segundo, só quando muda) e `guarita://captura-estado` (a cada
2 s). Desligar para tudo em até ~0,5 s; fechar o app encerra o processo. Comandos: `captura_estado`,
`captura_sessao`, `captura_nova_sessao` (painel e widgets) e `captura_ligar`, `captura_desligar`,
`captura_definir_codigos`, `captura_definir_dados`, `captura_diagnostico` (só painel). Tipos espelhados em
`src/lib/capture/tipos.ts`.

**Protocolo.** Photon com **Protocol18** (conferido em 30/10/2026 no `ao-data/albiondata-client`, MIT, e no
`AlbionOnline-StatisticsAnalysis`, GPL, do qual só os números foram usados; código próprio). Cabeçalho e comandos em
big-endian, valores do Protocol18 em little-endian com varint/zigzag; comandos 6 (confiável), 7 (não confiável) e 8
(fragmento, remontado por `seqInicial`); mensagens 2/3/7/4; bit `0x80` = criptografada (descartada). O código real
do evento vem em `params[252]` e o da operação em `params[253]`. Prata e fama em FixPoint (×10000).

**Tabela de códigos** (`app/capture-codes.json`, fonte única): vai embutida no binário (`include_str!`) e o painel
baixa a mesma de `https://raw.githubusercontent.com/dosxnjos/guarita/main/app/capture-codes.json`, junto com
`capture-codes.json.sig` (assinatura Ed25519 em base64 sobre os bytes exatos do arquivo). O Rust confere a
assinatura com a chave pública embutida (`CHAVE_PUBLICA_B64` em `src-tauri/src/capture/codigos.rs`) **antes** de ler
o JSON; sem assinatura válida fica a tabela atual e o motivo ("tabela remota recusada (assinatura)") vai para
`TabelaInfo.recusa`, para o log e para `tabela.recusaRemota` no arquivo de diagnóstico. Com a assinatura válida, se a
de lá tiver `versao` maior e passar na validação (porta 5055/5056, no máximo 1000 versões acima da embutida, todos
os eventos usados presentes), vale sem nova versão do app. O painel guarda o par (tabela + assinatura) junto, por
24 h, e só depois de o Rust aceitar. Cada código tem a fonte e a data no próprio JSON. A 0.2.0 ignora o `.sig`.
Depois de um patch do Albion: conferir os números (modo de diagnóstico), subir `versao`, rodar `npm run codes:sign` e
publicar no `main` **os dois arquivos no mesmo commit**.

**Chave de assinatura.** A privada mora só no Doppler pessoal (`GUARITA_CODES_SIGN_KEY`, PKCS8 em base64); nunca em
disco nem em log. `scripts/sign-codes.mjs` (raiz do repo): sem argumento assina (lê a chave do ambiente; o
`codes:sign` já roda com `doppler run`), confere que a pública da chave é a embutida no app e grava o `.sig`;
`--publica` mostra a pública da chave do Doppler; `--gerar` cria um par novo, grava a privada no Doppler pelo stdin
(recusa se o segredo já existir) e imprime a pública. Trocar a chave = `--gerar` depois de apagar o segredo,
embutir a pública nova, assinar e lançar versão nova do app (as versões antigas passam a recusar a tabela remota).
O teste `assinatura_commitada_vale_para_a_tabela_atual` (cargo) falha se o JSON mudar sem assinar de novo.

**Dados de apoio** (`src/lib/capture/dados.ts`): `formatted/items.txt` (índice numérico do item → id) e
`formatted/world.txt` (id do mapa → nome, em inglês) do `ao-data/ao-bin-dumps`, com cópia local de 24 h no Cache
Storage, entregues ao Rust por `captura_definir_dados`. Sem eles, o loot aparece como "Item nº N" e sem preço.

**Modo de diagnóstico** (Ajustes › Detalhes técnicos): grava a cada 30 s e ao desligar
`<pasta de logs do app>/captura-diagnostico.json` com a contagem de eventos, respostas e requisições **por código**
(com o nome que a tabela conhece), fatos próprios aceitos e descartes. Só números: nenhum conteúdo de mensagem.

**Validação ao vivo: pendente.** Os testes (`cargo test --lib capture`, 48 testes, inclusive pacote hostil, assinatura da tabela, dois fluxos e queda da rede) usam pacotes Photon montados
pelo próprio teste (codificador em `protocol18::enc` e `photon::montar`). Falta abrir o jogo com a captura e o
diagnóstico ligados e conferir: Join reconhecido, fama/prata batendo com o jogo, loot com os ids certos.

## Fronteira dos módulos (`src/lib/`)

| arquivo | o que faz | dono |
| --- | --- | --- |
| `windows.ts` | rótulos, comandos de janela, opacidade | esqueleto (pronto) |
| `api.ts` | cliente da API com cache, timeout e uma requisição em voo por URL | esqueleto (pronto) |
| `config.ts` | config persistente (store), padrões que são regra, sincroniza janelas | esqueleto (pronto) |
| `autostart.ts` | único lugar que liga/desliga "iniciar com o Windows" | esqueleto (pronto) |
| `links.ts` | abrir link no navegador | esqueleto (pronto) |
| `format.ts` | reexporta a formatação pt-BR/Brasília do site | esqueleto (pronto) |
| `voice.ts` | `falar(texto, prioridade)`: fila sem falar por cima, alta interrompe, silenciar cala; voz configurada → Francisca → Maria → qualquer pt-BR | (b) motor local (pronto) |
| `notify.ts` | `avisar(aviso)`: notificação do Windows ("Guarita · título", som padrão do Windows) + voz; som curto próprio (Web Audio) só com a notificação desligada | (b) motor local (pronto) |
| `fala.ts` | número por extenso em PT-BR para a voz ("três mil e quinhentos") | (b) motor local (pronto) |
| `shortcuts.ts` | atalhos globais: normaliza, valida (Ctrl/Alt/Win obrigatório, menos F13–F24; recusa Ctrl+C, Alt+F4...), acusa conflito, registra só no "apertou" | (b) motor local (pronto) |
| `engine/alerts.ts` | regras de preço locais: `/api/prices` em lote a cada `intervaloRegrasMin` (padrão 3 min), mesma régua do servidor (`guarita-core/src/rules.ts`) | (b) motor local (pronto) |
| `engine/timers.ts` | despertador local: `setTimeout` até o próximo vencimento; ao abrir, avisa os que venceram com o app fechado | (b) motor local (pronto) |
| `engine/clock.ts` | `/api/clock` a cada 2 min: servidor caiu/voltou, bônus começou, bônus acabando (30 min), temporada (7, 3 e 1 dia) | (b) motor local (pronto) |
| `engine/motor.ts` | `iniciarMotorLocal()` (main.ts, só no painel) liga os três motores e os atalhos; `motorLocal()` dá às telas `checarAgora`, estado e leituras do relógio | (b) motor local (pronto) |
| `lens/aodpWs.ts` | lente de mercado: escuta `ws://localhost:8099/ws` do cliente oficial do AODP, lê só `marketorders.ingest`, reconecta com espera crescente; widget em `widgets/Lente.svelte` | (c) lente (pronto) |
| `capture/tipos.ts` | tipos dos eventos e comandos da captura (espelho de `src-tauri/src/capture`) | (a) captura (pronto) |
| `capture/captura.ts` | comandos, eventos, escolha do usuário (`captura.json`) e `iniciarCapturaNoPainel` | (a) captura (pronto) |
| `capture/dados.ts` | baixa tabela de códigos com o `.sig`, `items.txt` e `world.txt` (cópia local de 24 h); parsers | (a) captura (pronto) |
| `capture/sessao.ts`, `capture/precos.ts` | regras puras: ritmo por hora, valor do loot (mediana), textos; preço em lote | (a) captura (pronto) |
| `painel/CapturaAjustes.svelte`, `widgets/{Sessao,Loot}.svelte` | bloco de ligar/desligar com aviso e Npcap; widgets da sessão | (a) captura (pronto) |
| `painel/Painel.svelte` | abas Início (status da API e do servidor, widgets), Ajustes (atalhos, voz, avisos, opacidade, "por cima" com aviso SBI, tema, iniciar com o Windows, bandeja) e Sobre | (a) janelas e widgets (pronto) |
| `widgets/{Preco,Dossie,Relogio,Alertas,Despertador}.svelte` | telas dos widgets; layout compacto até 280×200 (container queries no preço) | (a) janelas e widgets (pronto) |
| `ui/ItemBusca.svelte`, `ui/CampoAtalho.svelte` | autocomplete de item (combobox) e captura de atalho | (a) janelas e widgets (pronto) |
| `lib/ui-itens.ts` | índice de itens: memória → Cache Storage do WebView2 (compartilhado pelas janelas) → API; atualiza em 2º plano depois de 24 h | (a) (pronto) |
| `lib/ui-atalhos.ts`, `ui-preco.ts`, `ui-alertas.ts`, `ui-timers.ts`, `ui-janelas.ts` | regras puras das telas (testes em `tests/ui.test.ts`); regras e timers saem já no formato que `normalizeConfig` aceita | (a) (pronto) |

Código de `../shared` (contrato e regras puras) é importado direto; os tokens visuais vêm de `../src/app.css`.
O `package.json` da raiz não é usado nem alterado pelo app.

Armadilhas: [docs/ARMADILHAS.md](docs/ARMADILHAS.md).
