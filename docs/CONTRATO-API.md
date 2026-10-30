# Contrato da API da Guarita

Versão legível do contrato. A fonte da verdade é [`shared/types.ts`](../shared/types.ts): o front (`src/lib/api.ts`),
o bot (`worker/discord/`) e a API (`worker/api/`) importam de lá. Mudou um tipo, mude este documento junto.

## Regras gerais

- JSON em todas as respostas. Leitura em `GET` com `Cache-Control` público curto.
- Erro: `{ "error": "mensagem em PT-BR" }` com status 4xx ou 5xx. Rota inexistente: 404 `{ "error": "rota não encontrada" }`.
- Datas em ISO 8601 UTC (`2026-10-29T14:05:00Z`). Quem mostra ao usuário converte para horário de Brasília.
- Preço ausente é `null`, nunca `0`.
- Cidades (`City`): `Bridgewatch`, `Caerleon`, `Fort Sterling`, `Lymhurst`, `Martlock`, `Thetford`, `Brecilien`,
  `Black Market`. Nos parâmetros de URL, separadas por vírgula.
- Qualidade (`Quality`): `1` a `5` (normal, bom, excepcional, excelente, obra-prima).
- Veredito (`Verdict`): `barato`, `normal`, `caro`, `sem dado`.

## Saúde

### `GET /api/health`

```ts
{ ok: true, hub: unknown /* resposta do Hub ou { error } */, at: string }
```

## Itens

### `/data/items-index.json` (estático)

A busca acontece no navegador. Formato (`shared/items.ts`):

```ts
{ v: 1, generatedAt: string, source: string, items: [id, nomePtBr, nomeEn, tier, encantamento][] }
```

`tier` é 0 quando não se aplica. `/api/items/search?q=` existe só como reserva.

## Mercado

### `GET /api/prices?ids=A,B&cities=…&q=1,2`

```ts
PricesResponse = { fetchedAt: string, rows: PriceRow[] }
PriceRow = { id, city: City, quality: Quality,
             sellMin: number|null, sellMinAt: string|null,
             buyMax: number|null,  buyMaxAt: string|null }
```

### `GET /api/item/:id?q=1`

Página de item agregada.

```ts
ItemResponse = {
  id, quality, fetchedAt,
  cities: CityQuote[],
  history: { city, days: { date /* AAAA-MM-DD */, avg, count }[] }[],
  median7d: number|null, p25: number|null, p75: number|null,
  book: { city, sell: BookLevel[], buy: BookLevel[] }[],
  flips: Flip[],
}
CityQuote = { city, sellMin, sellMinAt, buyMax, buyMaxAt,
              ageMin: number|null /* idade do sellMin, ou do buyMax se não houver venda */,
              confidence: Confidence, verdict: Verdict }
Confidence = { score /* 0–100 */, label: 'alta'|'média'|'baixa'|'sem dado', reasons: string[] }
BookLevel = { price, amount, updatedAt?: string }
Flip = { from: City, buyAt /* sell order mais barata na origem */, sellAt /* buy order do Black Market */,
         profitPremium, profitNoPremium, roi /* fração, com Premium */, ageMin: number|null }
```

Selo de confiança: idade do preço (peso maior), profundidade do livro até +5% do melhor preço, desvio contra a
mediana de 7 dias, compra acima da venda (suspeito) e volume diário. Veredito: `barato` abaixo de `p25`, `caro`
acima de `p75`, senão `normal`.

Taxas (`shared/market.ts`): setup 2,5%; imposto de venda 8% sem Premium, 4% com Premium.
Lucro do flip = `sellAt × (1 − imposto) − buyAt`.

### `GET /api/book/:id?city=&side=buy|sell&n=&q=1`

Preço efetivo para comprar ou vender N unidades, nível por nível. `side` é o lado do livro **consumido**:
`sell` = o usuário compra das ofertas de venda ("quero comprar"); `buy` = vende para as ofertas de compra
("quero vender").

```ts
BookFillResponse = { city, side: 'buy'|'sell', n, avgPrice: number|null, filled, levels: BookLevel[] }
```

## Relógio

### `GET /api/clock`

```ts
ClockResponse = {
  now: string,
  server: { status: 'online'|'offline'|'manutenção'|'desconhecido', message, checkedAt },
  festivities: { kind: number, category, name, labelPt, start, end }[],
  gold: { price: number|null, at: string|null, p30: number|null,
          trend: 'subindo'|'caindo'|'estável'|'sem dado' },
  premiumSilver: number|null, // Premium de 30 dias (3750 gold) em prata pelo ouro atual
  season: { name, end, approx: true },
}
```

## Jogadores

### `GET /api/player/search?q=`

```ts
PlayerSearchResponse = { players: { id, name, guild, alliance, killFame, deathFame }[] }
```

### `GET /api/player/:id`

```ts
PlayerDossier = {
  id, name, guild, alliance, killFame, deathFame, ratio,
  pve: Record<string, number>, gathering: Record<string, number>,
  recentKills: KillEvent[], recentDeaths: KillEvent[],
  weapons: { type, labelPt, count }[],
  soloRate: number|null, // fração das kills recentes feitas sozinho (um só causou dano e grupo ≤ 1)
  avgGroup: number|null, avgIp: number|null,
  danger: { score /* 0–100 */, label: 'tranquilo'|'atenção'|'perigoso'|'sem dado', reasons: string[] },
  fetchedAt: string,
}
KillEvent = { id: number, time, killer: EventSide, victim: EventSide,
              participants, // tamanho do grupo: max(numberOfParticipants, groupMemberCount)
              totalFame, estValue: number|null /* equipamento da vítima em prata */ }
EventSide = { id, name, guild, alliance, ip, gear: { slot, id, quality }[] }
```

### `GET /api/player/:id/autopsy`

```ts
AutopsyResponse = {
  death: KillEvent|null,          // última morte
  killerDossier: PlayerDossier|null,
  lessons: string[],
  rebuy: { id, slot, quality, cheapestCity: City|null,
           price: number|null, // custo do espaço inteiro (unitário × count)
           ageMin: number|null, count?: number /* ausente = 1 */ }[],
  rebuyTotal: number|null,
}
```

## Alertas

O dono (`owner`) é o id da inscrição push do aparelho ou o id do usuário no Discord.

Pela web só existem alertas `push`; alerta `discord` nasce só pelo comando `/alerta` do bot (POST com
`channel: 'discord'` dá 403). `?sub=` é aceito como sinônimo de `?owner=`.

- `GET /api/alerts?owner=` → `{ alerts: AlertRule[] }` (só os push desse dono); **404** com
  "inscrição de notificação não encontrada" se a inscrição sumiu no servidor (o aparelho deve ativar de novo)
- `POST /api/alerts` com corpo `Omit<AlertRule, 'id'|'createdAt'|'lastFiredAt'>` → `201 AlertRule`
  (o Hub confere se o dono é inscrição existente; até 20 regras por dono). Regras: `itemId` precisa existir no
  catálogo (`/data/items-index.json`; senão 400) e `itemName` é trocado pelo nome do catálogo; `pct` de 1 a 90
  (arredondado); **`Black Market` só com `side: 'buy'`** (ele só compra). 404 = inscrição sumiu; 429 = muitas
  regras criadas da mesma origem em 1 h; 503 = teto global de regras cheio. Limites em `shared/alertLimits.ts`.
- `DELETE /api/alerts/:id?owner=` → `{ ok: true }` ou 404
- `GET /api/push/vapid` → `{ key }` (chave pública VAPID; 503 se não configurada)
- `POST /api/push/subscribe` com `PushSubscription.toJSON()` + `subId?` (`{ endpoint, keys: { p256dh, auth }, subId? }`)
  → `201 { subId }` (inscrição nova) ou `200 { subId }` (mesmo endpoint **e** `subId` atual: atualiza as chaves).
  Mesmo endpoint sem o `subId` certo → **409** (saber a URL do endpoint não dá acesso aos alertas); 429 = muitas
  ativações da mesma origem em 1 h. Só endpoints de servidores de push conhecidos.
- `POST /api/push/unsubscribe` com `{ subId, endpoint? }` → resposta do Hub

`fetchedAt` de `/api/item` e `/api/prices` é quando o dado saiu do AODP (carimbo do cache), não a hora da resposta:
com o AODP fora, a reserva de até 24 h volta com o carimbo antigo e a tela mostra "pode estar desatualizado".

Qualidades na interface (site, bot, notificação) usam os nomes do cliente em PT-BR: Normal, Bom, Excepcional,
Excelente, Obra-prima (`shared/quality.ts`).

```ts
AlertRule = {
  id, itemId, itemName?, // nome legível enviado por quem criou; o core usa na mensagem do alerta
  quality, cities: City[], side: 'sell'|'buy',
  condition: { kind: 'below', price } | { kind: 'above', price } | { kind: 'belowMedianPct', pct },
  cooldownMin, // minutos entre dois disparos da mesma regra
  channel: 'push'|'discord', owner, createdAt, lastFiredAt?,
}
AlertFire = { ruleId, itemId, city, price, seenAt: string|null, message }
```

## Discord

### `POST /discord`

Interações do Discord. Verifica a assinatura Ed25519 (`X-Signature-Ed25519` e `X-Signature-Timestamp`) com a chave
pública da aplicação; assinatura inválida recebe 401. PING recebe `{ "type": 1 }`.

Comandos: `preco`, `relogio`, `dossie`, `morte`, `alerta`, `perdas`, `guilda`, `ajuda`
(`scripts/register-commands.mjs`). Fase 2:

- `/perdas dias:1|7`: os 10 itens mais perdidos, preço unitário, valor perdido e o tamanho da amostra.
- `/guilda configurar nome canal` (Gerenciar Servidor ou administrador; só em servidor), `/guilda feed ligar|desligar`,
  `/guilda resumo [nome]`. Um feed por servidor do Discord: configurar de novo substitui.
- Botão "Pedir regear" no killfeed: `custom_id = regear:<eventId>:<victimId>` (formato combinado entre core e Pages).
  Busca o evento em `/events/{id}` da gameinfo, precifica num lote do AODP e posta o pedido no canal. Pagamento e
  aprovação ficam com a guilda; a Guarita não mexe em prata.

## Fase 2

Tipos em `shared/types.ts` (seção "Fase 2"). Cliente do front em `src/lib/api.ts`.

### `GET /api/losses?days=1..7&limit=1..50`

Itens mais perdidos no PvP do Americas, do KillLog próprio (amostra coletada desde 30/10/2026). `days` (padrão 1 =
hoje UTC) e `limit` (padrão 50) fora da faixa ou tortos caem no padrão/limite. Preço atual: menor venda entre as
cidades reais e Caerleon, qualidade 1, um lote só ao AODP; AODP fora → lista sem preço (não é erro). KillLog fora →
502. `Cache-Control: max-age=300`.

```ts
LossesResponse = { days, since: string|null /* AAAA-MM-DD do 1º dia coletado */, sampleKills, items: LossItem[], fetchedAt }
LossItem = { id, name /* rótulo PT-BR; o próprio id quando não acha o nome */, count,
             price: number|null, value: number|null /* count × price */, ageMin: number|null }
```

### `GET /api/guild/:nome`

Resumo da guilda pelo nome exato (sem diferença de maiúsculas). Junta o KillLog (`?detail=1`, 7 dias) e a gameinfo
(busca + `/guilds/{id}`). 404 só se nenhuma das duas fontes achar a guilda; KillLog fora → 502; gameinfo fora com
o KillLog de pé → 200 com `id`, `members`, `killFame`, `deathFame` e `alliance` nulos.

```ts
GuildSummary = { name, id: string|null, alliance: string|null, members: number|null,
                 killFame: number|null, deathFame: number|null,
                 days: { date /* AAAA-MM-DD */, kills, deaths }[],
                 topKillers: { name, id, kills }[] /* até 10 */,
                 weapons: { type /* arma mais usada da família: serve de ícone */, labelPt /* nome da família */, count }[],
                 hoursBrt: number[] /* 24 posições, kills por hora de Brasília */,
                 coverageSince: string|null, fetchedAt }
```

### `GET /api/guilds?q=`

Busca de guilda na gameinfo (aproximada: "bagre" devolve Bagres, Bagreros…). Cache próprio (chave
`gameinfo-guild/…`, separada da busca de jogador).

```ts
GuildSearchResponse = { guilds: GuildHit[] /* até 20 */, fetchedAt }
GuildHit = { id, name, alliance: string|null, deathFame: number|null }
```

### `POST /api/risk`

Corpo `{ items: { id, quality }[] }` (1 a 12 peças; id precisa existir no catálogo; qualidade 1–5). JSON torto,
lista vazia ou grande demais, id mal formado ou inexistente → 400; outro método → 405. Um lote ao AODP (cidades reais
+ Caerleon), menor venda, mesma regra da recompra da autópsia. `Cache-Control: no-store`.

```ts
RiskQuote = { items: { id, quality, price: number|null, city: City|null, ageMin: number|null }[],
              total, missing /* peças sem preço */, zones: RiskZone[], fetchedAt }
RiskZone = { zone: 'azul'|'amarela'|'vermelha'|'preta'|'avalon'|'brumas', labelPt,
             lose: 'nada'|'durabilidade'|'tudo', amount /* prata em risco; 0 quando só perde durabilidade */, note }
```

Regras das zonas em `shared/zones.ts` (fontes secundárias datadas no comentário; a tela pede para conferir no jogo).

### `GET /api/gold?days=7|30|90`

Série do ouro (AODP `gold.json`, pedido com `date=` para passar de 720 pontos). Sem `days` = 30; outro valor → 400;
método ≠ GET/HEAD → 405; AODP fora → 502. Pontos fora de 1/3 a 3× a mediana são descartados. Veredito por quartil
(`barato` < p25, `caro` > p75; menos de 24 pontos limpos = `sem dado`); a faixa desenhada é p10–p90. Cache 10 min.

```ts
GoldResponse = { points: { at, price }[] /* do mais antigo para o mais recente */,
                 current: number|null, p10, p50, p90: number|null,
                 verdict: 'barato'|'normal'|'caro'|'sem dado', fetchedAt }
```

### `GET /api/data-health`

Idade dos preços por cidade numa cesta fixa de 42 itens (`HEALTH_BASKET` em `worker/api/goldHealth.ts`), um lote
de `/prices`. Linhas cruas em cache 30 min; idades recalculadas a cada pedido. No Black Market vale a data da melhor
ordem de compra e só os 27 equipamentos da cesta (ele não compra recurso refinado), mas o denominador ainda é `basket`.

```ts
DataHealthResponse = { basket, cities: DataHealthCity[], fetchedAt }
DataHealthCity = { city, medianAgeMin: number|null, fresh1h /* < 1 h */, stale24h /* > 24 h */, missing }
```

### Despertador: `/api/timers`

O dono é o id da inscrição push do aparelho, conferido no Hub antes de tudo (inscrição sumida → 404 com
"inscrição" na mensagem). Corpo até 2 KB; `no-store`; 5xx do DO vira 502.

- `POST /api/timers` `{ owner, kind, label, endsAt }` → `201 Timer`. `endsAt` entre 1 min e 30 dias no futuro
  (folga de 30 s); rótulo até 60 caracteres (vazio = nome padrão do tipo); até 30 pendentes por dono (409).
- `GET /api/timers?owner=` → `{ timers: Timer[] }` (pendentes primeiro; os já tocados ficam 7 dias, no máximo 30).
- `DELETE /api/timers/:id?owner=` → `{ ok: true }` ou 404.

```ts
Timer = { id, owner, kind: 'plantacao'|'animal'|'foco'|'outro', label, endsAt, createdAt, firedAt?, delivery?: 'ok'|'falhou' }
```

`delivery` só vem nos já tocados: `'ok'` = o serviço de push aceitou o aviso; `'falhou'` = não deu para avisar
(3 falhas passageiras, falha definitiva ou inscrição sem chaves no Hub) e `firedAt` é a hora da desistência. A tela
mostra "não foi possível avisar em …" nesse caso.

O DO `Timers` (guarita-core) toca pelo `alarm()`: busca endpoint e chaves no Hub (`GET /push/sub/:id`), manda o push
(`url: '/despertador'`, `tag: 'timer-<id>'`) e relata ao Hub em `/engine/report`. Ao criar um timer, marca no Hub até
quando a inscrição tem despertador (`POST /push/sub/:id/keep {until}`): a poda de inscrição ociosa (48 h sem alerta e
sem entrega) não apaga a inscrição antes disso.

### Oráculo MCP: `POST /mcp`

Servidor MCP público e sem login, só dado público (nunca alertas, ids do Discord ou segredos; não lê o `env`).
JSON-RPC 2.0 no transporte HTTP "streamable" só com respostas JSON: sem SSE, sem sessão (`Mcp-Session-Id` aceito e
ignorado).

- `POST /mcp`: `initialize` (devolve a versão pedida se for uma de `2025-11-25`, `2025-06-18`, `2025-03-26`,
  `2024-11-05`; senão a primeira da lista), `ping`, `tools/list`, `tools/call`. Notificação → 202 sem corpo.
- `OPTIONS /mcp` → 204 com CORS `*`. `GET` sem `text/html` no `Accept` (cliente MCP tentando SSE) e `DELETE` → 405
  com `Allow: POST, OPTIONS`. `GET /mcp` de navegador é a página que explica como ligar.
- Erros: -32700 JSON inválido; -32600 mensagem malformada/lote vazio; -32601 método desconhecido; -32602 ferramenta
  inexistente ou `params` torto. Argumento inválido ou fonte fora → `result.isError: true` com texto em PT-BR.
- `MCP-Protocol-Version` desconhecido → 400; corpo > 64 KB → 413; `Cache-Control: no-store`.
- Limites: até 10 mensagens por lote e 2 `tools/call` por requisição (50 subrequests do plano grátis); 60
  `tools/call` por minuto por IP (contado na memória do isolate pelo hash do IP; aproximado). Passou do limite →
  `isError`, não HTTP 429.

Ferramentas (`worker/mcp/catalog.ts`): `buscar_item {consulta}`, `preco_item {item, qualidade?}`, `relogio {}`,
`dossie_jogador {nome}`, `perdas_pvp {dias?}`, `o_que_fazer {prata, minutos?, premium?}` (Fase 3). Cada resposta
traz resumo em texto PT-BR e `structuredContent`.

## Fase 3

Roadmap: [`../../roadmap/2026-10-30-guarita-fase3.md`](../../roadmap/2026-10-30-guarita-fase3.md).

### `GET /api/hoje?prata=&minutos=&premium=0|1`

"O que fazer hoje" (`worker/api/hoje.ts`; cesta, receitas, bônus e fontes em `shared/hoje.ts`). Até 3 opções por
trilha (`flip` para o Black Market, `refino` com bônus de cidade e do dia, `transporte` entre cidades reais), cada
uma com a conta aberta. É estimativa: a tela, o bot e o MCP dizem que não é promessa de lucro.

- `prata`: 1.000 a 100.000.000.000 (aceita `1.000.000`, `1 000 000`); ausente ou fora → 400.
- `minutos`: inteiro de 15 a 480, padrão 60; fora → 400. `premium`: `1`, `true` ou `sim` = Premium (imposto de
  venda 4% em vez de 8%; anúncio 2,5% sempre).
- Método ≠ GET/HEAD → 405. Um "retrato" do mercado único para todos (lote de `/prices` da cesta + festividades +
  histórico de 9 itens) fica 5 min na Cache API; a conta por prata/tempo/Premium roda a cada pedido. Sem retrato e
  com o AODP fora → 502; com retrato vencido e o AODP fora, responde com ele e `stale: true`. `Cache-Control` 300 s.
- Orçamento: no pior caso (cache frio) 38 de 50 subrequests; com o retrato em cache, nenhum.

```ts
HojeResponse = { prata, minutos, premium, opcoes: HojeOpcao[], notas?: string[], stale?: boolean, fetchedAt }
HojeOpcao = { trilha: 'flip'|'refino'|'transporte', titulo, passos: string[], lucro /* pode ser negativo */,
              capital, minutos, confianca /* 0–100 */, riscos: string[], itens: HojeItem[],
              conta?: { compra, venda, taxas, lucro } /* venda − taxas − compra = lucro */,
              motivos?: string[] /* do selo */, deslocamentoMin?: number /* estimativa */ }
HojeItem = { id, nome, qtd, compra: number|null, venda: number|null, cidadeCompra: City|null, cidadeVenda: City|null,
             idadeCompraMin?: number|null, idadeVendaMin?: number|null }
```

Bot: `/hoje prata:<n> minutos:<30|60|120> premium:<sim/não>` (resposta adiada quando o retrato está frio). MCP:
`o_que_fazer`, com `minutos` só 30, 60 ou 120 (enum no schema; outro valor → erro), as mesmas opções do site e do
bot, para o link "conta completa" reproduzir a mesma conta. A API segue aceitando 15 a 480.

### `GET /api/forecast/:id?city=&q=1`

Previsão de 1 a 3 dias com acerto publicado (`shared/forecast.ts`, rota em `worker/api/forecast.ts`). Usa o
histórico diário do AODP (~30 dias, o mesmo pedido e o mesmo cache de 1 h da página de item; o dia UTC de hoje fica
de fora porque não fechou).

- `city` vazio ou ausente: a API escolhe a cidade com mais unidades vendidas nos últimos 14 dias, sem o Black
  Market (sem histórico em nenhuma: Caerleon) e devolve a escolhida em `city`. Cidade desconhecida → 400.
- Id inválido ou qualidade fora de 1–5 → 400; método ≠ GET/HEAD → 405; AODP fora → 502.
- `Cache-Control`: o que falta para o cache de 1 h do histórico vencer, mínimo 60 s. No máximo 3 subrequests.
- Modelo: com 21+ dias de venda e cada dia da semana visto 2+ vezes, média móvel exponencial do log do preço com
  ajuste por dia da semana; com menos, mediana dos últimos 7 dias com venda. Backtest walk-forward nos últimos 14
  dias (1 a 3 dias à frente, só com o passado). Só publica o modelo se o MAE dele for **menor** que o do ingênuo
  (repetir o último valor); empate ou derrota publica o ingênuo e `method` diz isso. Faixa P10–P90 das razões
  real/previsto do próprio backtest.
- Sem previsão (`forecast: []`): menos de 14 dias com venda, menos de 5 rodadas de backtest ou última venda há mais
  de 2 dias. A tela explica o motivo.

```ts
ForecastResponse = { id, quality, city, history: { date, avg, count }[],
                     forecast: { date /* hoje, amanhã, depois */, p10, p50, p90 }[],
                     backtest: { days /* rodadas do teste, não dias corridos */, maeModel: number|null,
                                 maeNaive: number|null, beatsNaive: boolean|null },
                     method /* texto: qual previsão saiu e por quê */, fetchedAt }
```

Telas: `/previsao` (`?item=&city=&q=`, ou `/previsao/:id`) e o bloco "Previsão dos próximos dias" em `/item/:id`.

### Páginas e arquivos públicos (sem JSON)

- **HTML de página**: o `_worker.js` reescreve título, descrição, canonical, Open Graph, Twitter e `robots` por rota
  (`worker/seo.ts`). `/item/:id` e `/previsao/:id` saem com o nome PT-BR do item (`Bolsa do Adepto (T4) · Guarita`),
  lido da fatia `names/t<tier>.json` como texto. `noindex`: guilda, jogador, autópsia, `/live`, item sem nome e
  caminho desconhecido. Resposta reescrita sai sem `etag` e sem `content-length`.
- `GET /sitemap.xml` (gerado: rotas fixas indexáveis + itens da cesta), `/robots.txt` (fecha `/api/` e `/discord`),
  `/offline.html` (o Pages também serve em `/offline`; tela do service worker sem rede), `/og.png` (1200×630).
- `/live?blocos=relogio,precos,guilda&itens=A,B&cidade=&guilda=&tema=&tamanho=`: painel para o OBS, só leitura das
  rotas acima (`/api/clock`, `/api/item`, `/api/guild`); `?config` abre o formulário que monta a URL.
- Extensão de navegador (`extension/`): só lê `/api/item/:id?q=`, `/api/clock` e `/data/items-index.json`.

## Rotas internas (guarita-core, só por binding)

O Pages fala com o core por binding: nada aqui é alcançável da internet.

- **KillLog** via service binding `CORE`, `GET /internal/killlog/<rota>` (só leitura; `/plan` e `/ingest` nunca
  passam): `/stats`; `/losses?day=AAAA-MM-DD&limit=` (um dia); `/losses?days=1..7&limit=` (últimos N dias UTC com
  o dia aberto, devolve `since`); `/player/:id/kills?limit=`; `/guild/:name/summary` (kills e mortes por dia) e
  `?detail=1` (mais quem mais mata, armas cruas e kills por hora de Brasília em 7 dias; cache de 5 min no DO).
- **Hub** (DO `HUB`): `GET /push/sub/:id` → `{ id, createdAt, lastOkAt, failCount, endpoint, p256dh, auth }` (endpoint e
  chaves para o DO Timers; o Pages descarta o corpo). Killfeed: `POST /guild-feeds` (upsert),
  `GET /guild-feeds?guild=<id do servidor>`, `PATCH /guild-feeds/:id {guild, enabled}`, `DELETE /guild-feeds/:id?guild=`,
  `GET /guild-feeds/active` e `POST /guild-feeds/report {updates, disabled}` (cron).
- **Timers** (DO `TIMERS`, um objeto por dono): `POST /timers`, `GET /timers?owner=`, `DELETE /timers/:id?owner=`.
