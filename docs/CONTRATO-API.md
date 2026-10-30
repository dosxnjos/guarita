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
