# Extensão de navegador da Guarita

Manifest V3, JS puro, sem build e sem dependência. Chrome, Edge e Firefox (140+; Android 142+). Página pública:
<https://guarita.pages.dev/extensao> (`src/routes/Extensao.svelte`).

## O que faz

- **Cartão ao passar o mouse** (`content.js`): nos sites da lista, parar o mouse 300 ms sobre um `<img>` (ou elemento
  com `background-image` inline) do `render.albiononline.com/v1/item/<ID>.png` mostra nome PT-BR, tier, qualidade
  (do `?quality=` da imagem ou a padrão das opções), melhor preço confiável para comprar com idade e selo, e o link
  para `/item/<ID>` da Guarita. Também abre com o foco do teclado num link que contém o ícone; Esc e rolar fecham.
  Shadow DOM fechado: o CSS da página não entra e o do cartão não sai.
- **Popup** (`popup.html/js`): busca no índice de itens (nome PT-BR, EN ou id; `t4`, `4.1`, `adepto` filtram tier)
  com o preço do item escolhido, e mini relógio (`/api/clock`: Brasília, UTC, status, bônus ativos, ouro).
- **Opções** (`options.html/js`): cartão ligado ou desligado por site, qualidade padrão. Ficam em
  `storage.local.options`; as abas abertas obedecem na hora (`storage.onChanged`).

## Como funciona

- `lib/core.js` é a lógica pura (detecção do id, cartão, busca, freios, opções). Script clássico que publica
  `globalThis.GuaritaCore`, carregado antes de `content.js`, de `background.js` (via `importScripts` no Chrome e
  pela lista `background.scripts` no Firefox), do popup e das opções. Testes: `tests/extension.test.ts` (vitest da
  raiz, sem mudar a config).
- `background.js` é o único que faz requisição, e só para `https://guarita.pages.dev` (a API não manda CORS; o
  content script não conseguiria). Freios: 300 ms de espera no cartão, cache de 5 min por item e qualidade, pedidos
  iguais em voo viram um, no máximo **20 consultas de item por minuto** (acima disso o cartão pede para esperar e
  oferece o link). O relógio fica 30 s em cache.
- Índice de nomes: `/data/items-index.json` (1 MB) baixado na instalação e guardado em `storage.local.itemsIndex`
  por 24 h; sem rede, o vencido continua servindo. Sem índice, o cartão mostra o id.
- Melhor preço: a mesma régua do site (`cheapestReliable` de `src/lib/format.ts`): fora o Black Market, a ordem de
  venda mais barata com selo alta ou média; sem nenhuma, a mais barata marcada como "mais barato visto".

## Permissões

`storage`; `host_permissions` só `https://guarita.pages.dev/*`; o content script roda só nos padrões de
`content_scripts.matches` (wiki oficial, `albiononline.com/killboard*` e `/*/killboard*`, albionfreemarket,
albiononline2d, murderledger, www.albion-online-data.com). A lista do manifest e `SITES` do `core.js` têm de ser
iguais (o teste confere). Nada é coletado: só o id do item e a qualidade vão para a Guarita.

## Comandos

```bash
node extension/scripts/make-icons.mjs   # icons/icon-16/32/48/128.png a partir de public/icons/icon-512.png
node extension/build.mjs                # dist/guarita-extensao-<versão do manifest>.zip (manifest na raiz do zip)
npx vitest run tests/extension.test.ts  # da raiz do repo
```

Prova num Chromium real: `extension/scripts/prova-chromium.mjs` (instruções no cabeçalho; precisa de
`playwright-core` fora do repo). Firefox: `npx web-ext lint --source-dir <zip extraído>` dá 0 erros e 1 aviso
esperado (`background.service_worker` não suportado: o Firefox usa `background.scripts`).

Os ícones gerados ficam versionados em `icons/`; o `dist/` não (está no `.gitignore` da raiz). A versão sai do
`manifest.json`: subir a versão é mudar ali (e no `package.json` desta pasta, só informativo).

## Publicar (com o Gabriel)

O `.zip` vai como anexo da release do GitHub (`dosxnjos/guarita`), que é o link da página `/extensao`. Lojas: Chrome
Web Store (conta de desenvolvedor, taxa única), Edge Add-ons e AMO do Firefox (id `extensao@guarita.pages.dev`,
`data_collection_permissions: none`). Na ficha da loja, a justificativa de cada permissão é a da página `/extensao`.

## Armadilhas

- **Elemento com `hidden` continua aparecendo no popup** → `.card`/`.stack` definem `display` e vencem o estilo do
  navegador para `[hidden]`. `ui.css` tem `[hidden] { display: none !important; }`; não remover.
- **Chrome recusa pedir permissão de `https://albiononline.com/*`** → só se pede o que o manifest declara, com o mesmo
  caminho (`albiononline.com/killboard*`). `siteOrigins` devolve os padrões do manifest.
- **Firefox: preço nunca carrega ("Sem conexão com a Guarita")** → o usuário pode negar o acesso a sites na
  instalação. O popup confere `permissions.contains` e mostra "Permitir acesso"; as opções pedem a permissão do site
  ao religar.
- **Cartão não aparece no killboard depois de navegar dentro do albiononline.com** → o content script só entra
  quando a página carrega numa URL `killboard`; quem chega por navegação interna (SPA) a partir de outra seção do
  site precisa recarregar. Abrir o killboard direto funciona.
- **Ferramenta de teste não acha o cartão** → o `<guarita-cartao>` tem tamanho zero (o filho é `position: fixed`) e
  o Shadow DOM é fechado: esperar o elemento como "attached" e conferir pelo print.
- **`web-ext lint` avisa `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION`** → `data_collection_permissions` (exigido pela
  AMO) só existe no Firefox 140 e no Android 142; o `strict_min_version` do `gecko` e do `gecko_android` acompanha.
- **Chrome mostra aviso por `background.scripts`** → é a chave do Firefox; o Chrome 121+ ignora quando há
  `service_worker` (conferido no Chromium do Playwright: o service worker sobe normal).
