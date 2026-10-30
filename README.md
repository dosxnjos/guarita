# Guarita

Companheiro em português para quem joga **Albion Online no servidor Americas**. A Guarita avisa em vez de te fazer
apertar F5: mostra o preço de cada cidade com a idade do dado e um selo de confiança, acompanha o relógio do
servidor e conta a história da tua última morte. Ela **nunca toca no jogo**: só usa dados públicos da web.

Site: <https://guarita.pages.dev> · Isso é permitido? <https://guarita.pages.dev/permitido>

> Não afiliado à Sandbox Interactive GmbH. Albion Online é marca registrada deles. A Guarita é um projeto
> independente e gratuito.

## Para quem joga

| Recurso | O que faz |
| --- | --- |
| **Mercado** | Busca de item em português (aceita "t4.1 bolsa", nome em inglês ou id). Preço por cidade e qualidade, com a idade de cada preço. |
| **Selo de confiança** | Nota de 0 a 100 que diz quanto dá para confiar no preço: idade, profundidade do livro de ofertas, desvio da mediana de 7 dias, volume. |
| **Veredito** | "barato", "normal" ou "caro" comparado com a faixa dos últimos dias (abaixo do 1º quartil, acima do 3º). |
| **Livro de ofertas** | Quanto custa de verdade comprar ou vender N unidades, nível por nível. |
| **Flip no Black Market** | Comprar numa cidade e vender na hora para o Black Market: lucro com e sem Premium. |
| **Relógio do Americas** | Servidor online ou em manutenção, festividades e bônus do dia, preço do ouro, Premium em prata, fim aproximado da temporada. |
| **Dossiê** | Busca um jogador pelo nome: fama, guilda, armas mais usadas, se costuma matar sozinho ou em grupo. |
| **Autópsia da morte** | Tua última morte explicada: quem te matou, o que dá para aprender e quanto custa recomprar o equipamento. |
| **Alertas** | Avisa quando um item passar do preço que você escolheu. Chega por notificação no navegador ou por mensagem no Discord. Checagem a cada 5 minutos. |
| **Perdas PvP** | Os itens mais perdidos no PvP hoje e nos últimos 7 dias, com preço atual e o valor perdido nas mortes: dica do que vale craftar. |
| **Guilda** | Resumo de uma guilda: kills e mortes por dia, quem mais mata, armas, horários de pico (Brasília), membros e fama. |
| **Quanto vale arriscar** | Monte o set e veja quanto custa e o que você perde ao morrer em cada tipo de zona. |
| **Golpes e glossário** | Golpes comuns explicados, checagem de nick parecido e as gírias do jogo (gank, regear, CTA, ZvZ…). |
| **Ouro e Premium** | Gráfico do ouro (7, 30 e 90 dias), se está barato agora e uma calculadora de "o Premium compensa?". |
| **Saúde do dado** | Quão frescos estão os preços em cada cidade, para saber quando confiar e onde falta scan. |
| **Despertador** | Avisa no celular quando a plantação, os animais ou o foco ficam prontos. |
| **Oráculo MCP** | Ligue a Guarita no Claude, no Cursor ou no VS Code e pergunte preço, relógio, dossiê e perdas. Só dado público. |
| **Bot do Discord** | Os mesmos dados com comandos no teu servidor (preço, relógio, alertas, perdas) e o killfeed da tua guilda num canal, com botão de pedir regear. |
| **Janela flutuante** | Uma janelinha que fica por cima das outras (Chrome). Vem **desligada**: leia o aviso antes de ligar. |
| **Instalável** | Dá para instalar como aplicativo no celular ou no computador. |

Sem login e sem cadastro. Para alertas, a Guarita guarda só o identificador da notificação do teu aparelho ou o
teu id do Discord.

### O que a Guarita não faz (e nunca vai fazer)

A Guarita respeita os Termos da Sandbox Interactive. Por isso:

- não lê a rede nem a memória do jogo, não olha a tela e não manda nada para o servidor do jogo;
- não avisa quando um jogador aparece perto de você (isso é "auto-scouting", proibido pela SBI);
- não compra, não vende e não intermedeia prata ou itens por dinheiro real.

A explicação completa, com as fontes, está em [Isso é permitido?](https://guarita.pages.dev/permitido).

## De onde vêm os dados

- **Preços, histórico, livro de ofertas, ouro e festividades:** [Albion Online Data Project](https://www.albion-online-data.com/)
  (servidor Americas). É um projeto comunitário: os preços são enviados por jogadores que rodam o cliente do
  projeto. Por isso todo preço mostra a idade, e preço velho perde confiança.
- **Nomes dos itens em português e taxas do mercado:** [ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)
  (`formatted/items.json` e `gamedata.xml`).
- **Jogadores, kills e mortes:** API pública do killboard do jogo (`gameinfo.albiononline.com`).
- **Situação do servidor:** `serverstatus.albiononline.com`.
- **Ícones dos itens:** `render.albiononline.com`.

Obrigado a quem mantém o Albion Data Project e o ao-bin-dumps. Sem eles a Guarita não existiria.

## Para quem desenvolve

### Stack

- Front: Svelte 5 (runes) + Vite 6 + TypeScript, PWA.
- API e bot: `dist/_worker.js` do Cloudflare Pages (modo avançado), gerado de `worker/index.ts` por esbuild.
- Estado (alertas, inscrições push) e cron de 5 minutos: Worker privado `guarita-core` com Durable Objects em
  SQLite. O Pages fala com ele por binding de Durable Object e service binding. Detalhes em
  [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
- Tudo roda no plano grátis da Cloudflare.

### Rodar local

Precisa de Node 20 ou mais novo.

```sh
npm i
npm run dev      # front em http://localhost:5173
npm run build    # gera dist/ (front + dist/_worker.js)
npm run check    # svelte-check (tipos)
npm test         # vitest
```

O `npm run dev` serve só o front. As rotas `/api/*` e `/discord` rodam no `_worker.js` publicado no Pages, que
depende das ligações com o `guarita-core`; localmente as telas que chamam a API mostram o estado de erro.

Teste de fumaça das rotas contra as APIs reais (fora do `npm test`, depende de rede):
`SMOKE=1 npx vitest run tests/smoke.worker.test.ts`.

Outros scripts:

- `npm run data:items`: gera o índice compacto de itens em `public/data/items-index.json` a partir do ao-bin-dumps.
- `npm run discord:register`: registra os comandos do bot (precisa das chaves do Doppler do mantenedor). Comando
  novo: publique o core, depois o Pages, depois `npm run discord:register -- --global` (até 1 h para aparecer).
- `npm run deploy`: publica no Pages da conta do mantenedor. Não use `wrangler` direto.

### Estrutura

```
guarita/
├── index.html            página base do Vite
├── public/               arquivos estáticos (ícones, manifest, service worker, data/)
├── src/                  front (Svelte)
│   ├── App.svelte        casca: topo, rotas, rodapé
│   ├── lib/              api.ts (cliente tipado), router.ts e utilitários do front
│   └── routes/           uma tela por arquivo (Inicio, Item, Relogio, Dossie, Autopsia, Alertas, Janela…)
├── worker/               _worker.js do Pages
│   ├── index.ts          entrada: /api/*, /discord, /mcp e estáticos com fallback para index.html
│   ├── env.ts            ligações e segredos
│   ├── api/              router.ts e um arquivo por grupo de rotas (market, clock, player, alerts; Fase 2 em
│   │                     routesF2.ts → insightsA, risk, goldHealth, timers)
│   ├── discord/          interactions.ts (entrada), verificação Ed25519, comandos e guild.ts (killfeed, regear)
│   ├── mcp/              server.ts (JSON-RPC), tools.ts e catalog.ts (ferramentas do Oráculo MCP)
│   └── lib/              aodp.ts (cliente do AODP) e apoio (itens, cache…)
├── shared/               código usado pelo front, pela API e pelo bot
│   ├── types.ts          contrato da API
│   ├── market.ts         taxas, cidades, conversões de data
│   ├── items.ts          índice e busca de itens
│   └── zones.ts, scams.ts, glossary.ts   conteúdo do novato (zonas, golpes, glossário)
├── scripts/              build-worker.mjs, build-items.mjs, deploy.mjs…
├── tests/                testes vitest (*.test.ts)
└── docs/                 ARQUITETURA.md, CONTRATO-API.md, ARMADILHAS.md
```

`dist/` e `data-cache/` não vão para o git.

### Contrato da API (resumo)

Tudo em `GET` com JSON, salvo onde indicado. Erro: `{ "error": "mensagem" }` com status 4xx ou 5xx. Os tipos
ficam em [shared/types.ts](shared/types.ts); a versão completa e legível está em
[docs/CONTRATO-API.md](docs/CONTRATO-API.md).

| Rota | Devolve |
| --- | --- |
| `/api/health` | `{ ok, hub, at }` |
| `/api/prices?ids=A,B&cities=…&q=1,2` | `PricesResponse` |
| `/api/item/:id?q=1` | `ItemResponse` (preço por cidade, histórico, livro, flips) |
| `/api/book/:id?city=&side=&n=&q=` | `BookFillResponse` (preço médio para N unidades) |
| `/api/clock` | `ClockResponse` (servidor, festividades, ouro, temporada) |
| `/api/player/search?q=` | `PlayerSearchResponse` |
| `/api/player/:id` | `PlayerDossier` |
| `/api/player/:id/autopsy` | `AutopsyResponse` |
| `GET/POST /api/alerts`, `DELETE /api/alerts/:id` | alertas do dono (`owner`) |
| `/api/losses?days=1..7&limit=` | `LossesResponse` (itens mais perdidos no PvP) |
| `/api/guild/:nome` · `/api/guilds?q=` | `GuildSummary` · `GuildSearchResponse` |
| `POST /api/risk` | `RiskQuote` (custo do set e perda por zona) |
| `/api/gold?days=7\|30\|90` · `/api/data-health` | `GoldResponse` · `DataHealthResponse` |
| `GET/POST /api/timers`, `DELETE /api/timers/:id` | timers do despertador do dono (`owner`) |
| `POST /mcp` | servidor MCP (JSON-RPC 2.0, 5 ferramentas, só dado público) |
| `POST /discord` | interações do Discord |

A busca de itens acontece no navegador, sobre `/data/items-index.json`.

### Como contribuir

- Achou um erro ou tem uma ideia? Abra uma issue: há modelos para [erro](.github/ISSUE_TEMPLATE/bug.md) e
  [sugestão](.github/ISSUE_TEMPLATE/sugestao.md).
- Pull request é bem-vindo. Antes de abrir: `npm run check`, `npm test` e `npm run build` precisam passar.
- Texto de interface em português do Brasil correto, com acento, direto e sem gíria.
- Mudou um tipo em `shared/types.ts`? Então mudou o contrato: front, API e bot precisam acompanhar.
- Contribuição que cruze a fronteira dos Termos (captura de rede, leitura do cliente, alerta de jogador avistado,
  RMT) não entra, por melhor que seja.

### Licença

[MIT](LICENSE). Copyright (c) 2026 dosxnjos.

Albion Online e os ícones dos itens pertencem à Sandbox Interactive GmbH. A Guarita não é afiliada, endossada nem
patrocinada por ela.
