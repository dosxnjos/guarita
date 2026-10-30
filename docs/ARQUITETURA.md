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
 │                player, alerts; Fase 2: routesF2.ts)          │
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
  Guarita não captura rede nem envia nada ao cliente.
- **Página `/app`** do site: o botão de download consulta `api.github.com/.../releases/latest` no navegador
  (`src/lib/appRelease.ts`) e oferece só o `*-setup.exe`; sem release, "Em breve"; GitHub fora ou limite de 60/h,
  link para a página de releases.
- **Distribuição:** instalador NSIS/MSI no GitHub Releases, sem assinatura (aviso do SmartScreen) e sem
  atualização automática na v0.1.

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

Nenhuma parte do sistema lê a rede ou a memória do cliente, olha a tela, avisa sobre jogador avistado ou fala com
o servidor do jogo. As únicas fontes são as APIs web públicas acima. Ver a página `/permitido`.
