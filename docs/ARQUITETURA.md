# Arquitetura da Guarita

Dois repositórios, tudo no plano grátis da Cloudflare (conta pessoal):

- **`guarita`** (este, público, MIT): site e PWA, API de leitura, bot do Discord e o app de PC (`app/`).
- **`guarita-core`** (privado): Worker com dois crons de 5 em 5 minutos, cada um na sua invocação (motor de
  alertas nos minutos 0, 5, 10…; coletor do killboard 2 min depois, que também posta o killfeed das guildas no
  Discord) e os Durable Objects com SQLite `Hub`, `KillLog` e `Timers`.

## Diagrama

```
 navegador / PWA                     Discord
 (telas Svelte, sw.js)               (comandos do bot)
        │  GET /api/*, POST /api/alerts      │  POST /discord (assinatura Ed25519)
        ▼                                    ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ Cloudflare Pages: guarita.pages.dev                          │
 │   arquivos estáticos (dist/) + /data/items-index.json        │
 │   dist/_worker.js  ← worker/index.ts                         │
 │     /api/*   → worker/api/router.ts (market, clock,          │
 │                player, alerts; F2: routesF2.ts; F3: hoje,    │
 │                forecast em routesF3.ts)                      │
 │     páginas  → worker/seo.ts (título/OG por rota),           │
 │                /sitemap.xml                                  │
 │     /discord → worker/discord/interactions.ts                │
 │     /mcp     → worker/mcp/server.ts (POST; GET de           │
 │                navegador = página)                           │
 └──────┬──────────────┬───────────────┬──────────────┬─────────┘
        │ binding DO   │ service       │ fetch +      │ fetch +
        │ HUB, TIMERS  │ binding CORE  │ Cache API    │ Cache API
        ▼              ▼               ▼              ▼
 ┌──────────────────────────┐   AODP (Americas)   gameinfo + serverstatus
 │ guarita-core (privado)   │   preços, histórico, jogadores, kills,
 │  Durable Object Hub      │   livro, ouro,       mortes, status
 │  (SQLite: alertas,       │   festividades
 │   inscrições push,       │        ▲                   ▲
 │   guild_feeds, cron)     │        │                   │
 │  Durable Object KillLog  │        │                   │
 │  (SQLite: kills,         │        │                   │
 │   losses_daily, guilda)  │        │                   │
 │  Durable Object Timers   │        │                   │
 │  (1 por dono; alarm()    │        │                   │
 │   → push do despertador) │        │                   │
 │  cron 0,5,10… ───────────┼────────┘ runAlerts         │
 │     │                    │   (lê regras no Hub,       │
 │     │                    │    preço em lote no AODP)  │
 │     ├─ dispara push (VAPID) e DM no Discord           │
 │  cron 2,7,12… pollKillboard ──────────────────────────┘
 │        (se KILLBOARD_ENABLED = "1") → KillLog         │
 │        → postGuildFeeds (killfeed no canal, ≤10 msgs) │
 │     resumo do cron → Hub /cron-mark                   │
 └───────────────────────────────────────────────────────┘
```

O navegador também carrega os ícones direto de `render.albiononline.com` (com `loading="lazy"`).

## Como as peças conversam

- **Pages → core:** sem HTTP público. O `wrangler.toml` deste repo declara o binding de Durable Object `HUB`
  (classe `Hub` do script `guarita-core`) e o service binding `CORE`. O core tem `workers_dev = false`.
  O plano inicial previa fetch HTTP autenticado com chave de admin; isso foi substituído pelos bindings.
- **Leitura de mercado e jogador:** o `_worker.js` chama o AODP e a gameinfo direto, com Cache API
  (`caches.default`). O AODP passa sempre por `worker/lib/aodp.ts` (gzip, lote, 429).
- **Alertas:** `/api/alerts` e o comando do bot gravam a regra no `Hub`. O cron do core lê as regras, consulta o
  AODP em lote, e dispara push no navegador (VAPID) ou DM no Discord, respeitando o intervalo mínimo da regra.
- **Busca de item:** no navegador, sobre o índice estático `/data/items-index.json` (gerado do ao-bin-dumps).
- **Sem login:** o dono de um alerta é o id da inscrição push do aparelho ou o id do usuário no Discord.

### Fase 2 (30/10/2026)

- **Perdas PvP e guilda** (`/api/losses`, `/api/guild/:nome`, `/api/guilds`; `worker/api/insightsA.ts`): leem o
  `KillLog` pelo `CORE` (`/losses?days=`, `/guild/:name/summary?detail=1`), precificam num lote do AODP e completam a
  guilda pela gameinfo. Nome do item recortado do texto de `names/t*.json` (sem `JSON.parse` do arquivo).
- **Killfeed da guilda** (core: `src/feed.ts`, `src/guildFeeds.ts`; Pages: `worker/discord/guild.ts`): `/guilda
  configurar` grava o feed no Hub (`guild_feeds`); o cron do killboard, depois de gravar no KillLog, pede ao Hub só
  os feeds das guildas do lote (`POST /guild-feeds/match`), casa os eventos novos com eles e posta no canal (até 10 mensagens por execução, 4 por feed; o resto vira "+N eventos").
  Histórico do killboard com atraso de minutos, nunca aviso de inimigo por perto.
- **Novato** (`/arriscar` + `POST /api/risk`, `/golpes`, `/glossario`): dados estáticos em `shared/zones.ts`,
  `shared/scams.ts`, `shared/glossary.ts`; a checagem de nick parecido roda no navegador sobre a busca de jogador.
- **Ouro e saúde do dado** (`/api/gold`, `/api/data-health`; `worker/api/goldHealth.ts`): `gold.json` com `date=` e
  um lote de `/prices` numa cesta fixa de 42 itens.
- **Oráculo MCP** (`POST /mcp`; `worker/mcp/`): JSON-RPC sem sessão, reaproveita `getItem`, `getClock`,
  `searchPlayers`/`getDossier`, `getLosses` e `acSearch`. Só dado público; limite por IP na memória do isolate.
- **Despertador** (`/api/timers`; core `src/timers.ts`): o Pages confere o dono no Hub e repassa ao DO `Timers` do
  dono (`idFromName(owner)`), que agenda o próprio `alarm()` no próximo vencimento, busca endpoint e chaves no Hub
  e manda o push. Sem cron extra.
- **Ordem de publicação:** core (migration v3 cria `Timers`; o Hub cria `guild_feeds` sozinho) → Pages →
  `npm run discord:register -- --global` (os comandos novos levam até 1 h para aparecer).

### App no PC (30/10/2026)

- **`app/`** (Tauri 2 + Svelte 5, `package.json` próprio): cliente da mesma API pública (`/api/*` e
  `/data/items-index.json`), sem servidor novo. Painel + widgets em janelas próprias; o motor local (regras de
  preço, despertador, avisos do relógio) roda só no painel, só com o app aberto. Nada de tarefa agendada ou serviço;
  "iniciar com o Windows" é opção desligada. Como funciona: [app/README.md](../app/README.md).
- **Lente de mercado** (opcional, desligada): só escuta o websocket local (`ws://localhost:8099/ws`) do cliente
  do Albion Data Project (comunitário; ele lê o tráfego de rede do jogo no PC do usuário), se o usuário o rodar; a
  lente não envia nada ao cliente.
- **Captura do próprio jogador** (v0.2, opcional, desligada por padrão): com o Npcap instalado, o Rust
  (`app/src-tauri/src/capture/`) lê passivamente o UDP 5056 (Photon/Protocol18) e mostra só a sessão do próprio
  jogador (prata, fama, loot com valor por `/api/prices`, mortes, mapa). Eventos de outros jogadores são descartados
  no parser; nada é enviado ao jogo, nada toca o processo; o Rust recusa ligar sem o aceite do aviso. Códigos em
  `app/capture-codes.json` (atualizável pelo GitHub sem versão nova). Detalhe: [app/README.md](../app/README.md).
- **Página `/app`** do site: o botão de download consulta `api.github.com/.../releases/latest` no navegador
  (`src/lib/appRelease.ts`) e oferece só o `*-setup.exe`; sem release, "Em breve"; GitHub fora ou limite de 60/h,
  link para a página de releases.
- **Distribuição:** instalador NSIS/MSI no GitHub Releases, sem assinatura (aviso do SmartScreen) e sem
  atualização automática na v0.1.

### Fase 3 (30/10/2026)

- **O que fazer hoje** (`/hoje`, `GET /api/hoje`, bot `/hoje`, MCP `o_que_fazer`; `worker/api/hoje.ts` + dado puro em
  `shared/hoje.ts`): um retrato do mercado único para todos (lote de `/prices` da cesta, festividades, histórico de 9
  itens) fica 5 min na Cache API; as três trilhas (flip para o Black Market, refino com bônus, transporte) são
  calculadas por pedido sobre ele, com a conta aberta e o selo de confiança.
- **Previsão** (`/previsao`, bloco na página de item, `GET /api/forecast/:id`; modelo puro em `shared/forecast.ts`):
  divide com a página de item o pedido e o cache de 1 h do histórico; backtest walk-forward contra o ingênuo e só
  publica o modelo quando ele erra menos.
- **Painel de live** (`/live`, `src/lib/live/`): fonte de navegador do OBS (fundo transparente via classe
  `live-obs` no `<html>`), configurada pela URL; `?config` monta o endereço. Só lê `/api/clock`, `/api/item`,
  `/api/guild`; cada bloco falha sozinho e mantém o último valor bom.
- **SEO e PWA** (`worker/seo.ts`): o `_worker.js` reescreve título, descrição, canonical e Open Graph de cada página
  (HTMLRewriter no Workers; no Node, `applyMetaToHtml`) e gera `/sitemap.xml`; `public/og.png` sai de
  `node scripts/make-og.mjs`. `public/sw.js` (registrado no `src/main.ts`) faz rede primeiro na navegação e cai na
  `offline.html` sem rede; `/api/` nunca vem do cache.
- **Extensão de navegador** (`extension/`, Manifest V3, JS puro): cartão com nome PT-BR e preço ao passar o mouse em
  ícones de item nos sites de Albion, popup com busca e relógio. Só o `background.js` faz requisição, e só para
  `guarita.pages.dev`. Pacote: `node extension/build.mjs`. Detalhe: [extension/README.md](../extension/README.md).
- **App de PC v0.2**: captura passiva do próprio jogador (acima, em "App no PC").
- Rodada 2: espanhol (`/es/...`, seção "Línguas" abaixo), `/status` e app 0.2.1 (abaixo).

### Rodada 2 (30/10/2026)

- **`/status`** (`src/routes/Status.svelte`, dados fixos em `src/lib/institucional/status.ts`): custo R$ 0/mês,
  limites do plano grátis da Cloudflare, o que acontece ao estourar, de onde vem cada dado e a saúde ao vivo (lê
  `/api/health` com tempo limite). Entra no menu "Mais" e no `worker/seo.ts` (PT e ES).
- **Telas sob demanda**: `App.svelte` carrega com `import()` (mapa `LAZY`) tudo menos Início, Item e NaoEncontrado,
  que ficam no pacote principal; `src/lib/lazyView.ts` recarrega a página uma vez se o arquivo da tela sumir depois
  de um deploy. O `{#key getLocale()}` remonta na hora a tela já carregada. Tela nova entra no `LAZY`.
- **Cache longo** de `/assets/*` (`immutable`) sai de `worker/lib/cacheHeaders.ts`, não do `public/_headers` (no modo
  avançado o `_headers` não vale para o que passa pelo `_worker.js`).
- **Acessibilidade**: tabela com rolagem usa `use:scrollFocus` (`src/lib/ui/scrollFocus.ts`); âmbar claro
  `--accent: #8a5810` (4,5:1).
- **App de PC 0.2.1**: tabela de códigos remota só com assinatura Ed25519 válida (`capture-codes.json.sig`; ver
  [app/README.md](../app/README.md)).

## Línguas

Português é o padrão e não tem prefixo (nenhuma URL em português muda); espanhol (es-419, "tú") mora em `/es` e
`/es/...`. A língua vem **só do caminho**: link compartilhado abre na língua do link, nada redireciona sozinho.

- **`src/lib/i18n/`**: `core.ts` puro (caminho ↔ língua, `localizePath`, locale do Intl; usado pelo roteador, por
  `format.ts`, pelo app de PC e pelo `_worker.js`) e `index.svelte.ts` reativo, com o contrato das telas:
  `tx('pt', 'es')` (texto inline, sem dicionário central: cada tela é dona do seu texto), `href('/x')` (link interno
  na língua atual, sempre com `onclick={go}`), `getLocale()`, `setLocale(l)`, `intlLocale()`.
- **Roteador** (`src/lib/router.ts`): `match()` tira o `/es` e devolve `locale`; `navigate()`/`go()` mantêm o prefixo
  da língua atual. Só `setLocale` troca de língua (navega por conta própria e grava `guarita.lingua`).
- **App.svelte**: seletor "PT | ES" (links reais com `hreflang`), `<html lang>`, aviso discreto "¿Prefieres español?"
  só para navegador em espanhol sem preferência salva (dispensar grava `pt`), e `{#key getLocale()}` em volta da tela:
  trocar de língua remonta a tela, então texto calculado fora do template e `format.ts` se atualizam.
- **`format.ts`**: funções com texto ou número aceitam `loc` no fim (padrão: a língua atual, por um espelho não reativo
  em `core.ts`; fora do navegador é sempre `pt`). Datas sempre no horário de Brasília nas duas línguas.
- **Nome de item**: `itemsClient.ts` carrega `items-index-es.json` em `/es` (mesmo formato), então `hit.pt`/`itemName`
  já saem em espanhol.
- **SEO** (`worker/seo.ts`): `/es/...` cai no mesmo fallback do `index.html`; título e descrição de `FIXED_ES` (iguais
  ao `document.title` de cada tela em espanhol), `<html lang="es">`, `og:locale es_LA`, canonical na própria língua,
  `<link rel="alternate" hreflang="pt-BR|es|x-default">` nas duas versões (só em página indexável) e sitemap com as
  URLs `/es`. Item em `/es/item/:id`: nome pela fatia `names-es/t<tier>.json` lida como texto.
- **Código puro com texto** (`format.ts`, `player/format.ts`, `insights/format.ts`, `alertForm.ts`, `timers/presets.ts`,
  `hoje/view.ts`…): não importa `tx` (tem runes; o app de PC, o vitest e o `_worker.js` importam esses arquivos), e
  sim `currentLocale()` de `core.ts`, com `loc?: Locale` opcional no fim.
- **API**: `/api/hoje` e `/api/forecast` aceitam `lang=es` (texto em espanhol, mesmos números); as demais devolvem
  texto em PT (motivos do perigo, lições da autópsia, festividades, nomes de arma e de item nas perdas) e a tela em
  espanhol traduz o que tem código ou troca o nome pelo índice ES.
- **Bot** (`worker/discord/i18n.ts`): a língua vem do `interaction.locale` (começa com `es` → espanhol) e é passada
  explícita até o fim (um isolate atende várias interações; língua global misturaria respostas). Comandos com
  `name_localizations`/`description_localizations` (es-ES, es-419); o nome localizado só aparece depois de
  `npm run discord:register -- --global`.
- **App de PC e extensão**: só português.
- **Termos do jogo em espanhol**: [glossario-es.md](glossario-es.md).

## Limites que moldam o desenho

- 10 ms de CPU e 50 subrequests por invocação (Pages e Worker): lotes, cache, listas cortadas.
- Sem D1 e sem R2 no token da conta: armazenamento em Durable Object com SQLite.
- AODP: 100 req/min e 300 req/5 min por IP, gzip obrigatório.
- gameinfo: lenta e instável; nada na interface espera por ela sem estado de carregando e de erro.

## Segredos e variáveis (só nomes)

Todos vêm do Doppler pessoal e são gravados pelo `npm run deploy` de cada repo.

| Onde | Nome no runtime | Origem no Doppler |
| --- | --- | --- |
| Pages | `DISCORD_PUBLIC_KEY` | `GUARITA_PUBLIC_KEY` |
| Pages | `DISCORD_APP_ID` | `GUARITA_APP_ID` |
| Pages | `DISCORD_BOT_TOKEN` | `GUARITA_BOT_TOKEN` |
| Pages | `VAPID_PUBLIC` | `GUARITA_VAPID_PUBLIC` |
| core | `DISCORD_BOT_TOKEN` | `GUARITA_BOT_TOKEN` |
| core | `VAPID_PUBLIC`, `VAPID_PRIVATE` | `GUARITA_VAPID_PUBLIC`, `GUARITA_VAPID_PRIVATE` |
| core | `VAPID_SUBJECT` | fixo no `deploy.mjs` do core |
| core | `KILLBOARD_ENABLED` (variável, não segredo) | `wrangler.toml` do core |
| deploy | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `GUARITA_CF_API_TOKEN`, `GUARITA_CF_ACCOUNT_ID` |

## Fronteira dos Termos

Nenhuma parte do sistema lê a memória do cliente, olha a tela, toca no processo do jogo, avisa sobre jogador avistado
ou fala com o servidor do jogo. O site, a API, o bot e a extensão só usam as APIs web públicas acima. A única exceção
de leitura de rede é a captura do app de PC: passiva, opcional (desligada por padrão, com aviso aceito), só do
próprio jogador, no PC do usuário, sem enviar nada ao jogo (para a Guarita só vão os ids dos itens, em `/api/prices`,
para dar o valor do loot; prática tolerada pela SBI desde 2017, não
permitida oficialmente). Ver a página `/permitido`.
