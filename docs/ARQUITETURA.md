# Arquitetura da Guarita

Dois repositórios, tudo no plano grátis da Cloudflare (conta pessoal):

- **`guarita`** (este, público, MIT): site e PWA, API de leitura, bot do Discord.
- **`guarita-core`** (privado): Worker com dois crons de 5 em 5 minutos, cada um na sua invocação (motor de
  alertas nos minutos 0, 5, 10…; coletor experimental do killboard 2 min depois) e os Durable Objects com SQLite
  `Hub` e `KillLog`.

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
 │                player, alerts)                               │
 │     /discord → worker/discord/interactions.ts                │
 └──────┬──────────────┬───────────────┬──────────────┬─────────┘
        │ binding DO   │ service       │ fetch +      │ fetch +
        │ HUB          │ binding CORE  │ Cache API    │ Cache API
        ▼              ▼               ▼              ▼
 ┌──────────────────────────┐   AODP (Americas)   gameinfo + serverstatus
 │ guarita-core (privado)   │   preços, histórico, jogadores, kills,
 │  Durable Object Hub      │   livro, ouro,       mortes, status
 │  (SQLite: alertas,       │   festividades
 │   inscrições push,       │        ▲                   ▲
 │   registro do cron)      │        │                   │
 │  Durable Object KillLog  │        │                   │
 │  (SQLite: kills)         │        │                   │
 │                          │        │                   │
 │  cron 0,5,10… ───────────┼────────┘ runAlerts         │
 │     │                    │   (lê regras no Hub,       │
 │     │                    │    preço em lote no AODP)  │
 │     ├─ dispara push (VAPID) e DM no Discord           │
 │  cron 2,7,12… pollKillboard ──────────────────────────┘
 │        (se KILLBOARD_ENABLED = "1") → KillLog         │
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
