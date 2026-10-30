# Guarita no PC

App de Windows da Guarita: o companheiro que fica aberto enquanto você joga Albion Online (Americas). Janelas
pequenas (widgets) ao lado do jogo ou noutra tela, voz em português, atalhos globais e avisos do Windows. Usa a
mesma API pública do site (`https://guarita.pages.dev/api/*`); não tem servidor próprio.

**Só trabalha com o app aberto.** Nenhuma tarefa agendada, nenhum serviço do Windows. "Iniciar com o Windows" é
uma opção desligada por padrão (quando o usuário liga, o plugin usa a chave `Run` do registro do usuário, visível em
Configurações > Aplicativos > Inicialização). O app não lê o processo do jogo, não captura rede e não manda tecla
nem clique ao jogo. Plano e decisões: [../../roadmap/2026-10-30-guarita-app-pc.md](../../roadmap/2026-10-30-guarita-app-pc.md).

## Rodar

Pré-requisitos: Node 20+, Rust estável com MSVC, WebView2 (já vem no Windows 11).

```bash
cd app
npm install
npm run dev      # tauri dev: sobe o Vite na porta 1420 e abre o app (recarrega ao salvar)
npm run check    # svelte-check + cargo check
npm test         # vitest (tests/)
npm run vite:dev # só o front no navegador; ?w=preco mostra um widget. Sem Tauri, comandos de janela falham.
```

## Gerar o instalador

```bash
npm run build    # tauri build: instalador NSIS (.exe, pt-BR, por usuário) e MSI
```

Saída em `<pasta de build do cargo>/release/bundle/{nsis,msi}/`. Nesta máquina a variável `CARGO_TARGET_DIR`
aponta para `C:\pt`, então o instalador sai em `C:\pt\release\bundle\`; sem a variável, em
`app/src-tauri/target/release/bundle/`. Sem certificado de assinatura, o Windows mostra o aviso do SmartScreen
("Mais informações" > "Executar assim mesmo"). v1 sem atualização automática: instalador novo no GitHub Releases.

Arquivos gerados (v0.1.0): `nsis/Guarita_0.1.0_x64-setup.exe` (~2,4 MB, instala por usuário, sem pedir
administrador) e `msi/Guarita_0.1.0_x64_pt-BR.msi` (~3,3 MB). Se faltar o WebView2 (Windows 10 antigo), o
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
  `despertador`, `lente`. Sem moldura do Windows (`decorations: false`), janela transparente, moldura fina própria
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
  iniciar com o Windows, store, http) e `widgets.json` (arrastar, minimizar, fechar, fixar, store, http). Nada de
  shell, nada de sistema de arquivos. Comandos do app também passam por permissão (`build.rs` + capability).
- **Rede**: dentro do app, a API sai pelo `tauri-plugin-http` com escopo só em `https://guarita.pages.dev/*` (a API
  do site não manda CORS para a origem do app). Links externos abrem no navegador (`tauri-plugin-opener`, escopo
  fechado).
- **CSP** (`tauri.conf.json`): `connect-src` só `guarita.pages.dev`, `render.albiononline.com` (imagens),
  `ws://localhost:8099` (lente opcional) e o IPC interno do Tauri; `img-src` só o próprio app, `data:` e o render.
- **Lente de mercado** (desligada por padrão): o usuário instala o cliente do Albion Data Project (projeto
  comunitário, sem ligação com a SBI, que lê o tráfego de rede do jogo no PC dele; a tela e a página `/app` dizem
  isso) e põe no `config.yaml` da pasta do cliente `EnableWebsockets: true` e `AllowedWebsocketHosts: [tauri.localhost]`
  (no `tauri dev`, `localhost`). A Guarita só escuta: nunca envia nada ao cliente nem captura rede.
- **Iniciar com o Windows**: o registro (chave Run) é a verdade. Ao abrir, o painel chama
  `reconciliarIniciarComWindows()` (`src/lib/autostart.ts`): registro ligado com a config desligada → desliga; nunca liga.

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
| `painel/Painel.svelte` | abas Início (status da API e do servidor, widgets), Ajustes (atalhos, voz, avisos, opacidade, "por cima" com aviso SBI, tema, iniciar com o Windows, bandeja) e Sobre | (a) janelas e widgets (pronto) |
| `widgets/{Preco,Dossie,Relogio,Alertas,Despertador}.svelte` | telas dos widgets; layout compacto até 280×200 (container queries no preço) | (a) janelas e widgets (pronto) |
| `ui/ItemBusca.svelte`, `ui/CampoAtalho.svelte` | autocomplete de item (combobox) e captura de atalho | (a) janelas e widgets (pronto) |
| `lib/ui-itens.ts` | índice de itens: memória → Cache Storage do WebView2 (compartilhado pelas janelas) → API; atualiza em 2º plano depois de 24 h | (a) (pronto) |
| `lib/ui-atalhos.ts`, `ui-preco.ts`, `ui-alertas.ts`, `ui-timers.ts`, `ui-janelas.ts` | regras puras das telas (testes em `tests/ui.test.ts`); regras e timers saem já no formato que `normalizeConfig` aceita | (a) (pronto) |

Código de `../shared` (contrato e regras puras) é importado direto; os tokens visuais vêm de `../src/app.css`.
O `package.json` da raiz não é usado nem alterado pelo app.

Armadilhas: [docs/ARMADILHAS.md](docs/ARMADILHAS.md).
