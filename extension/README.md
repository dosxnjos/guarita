# Extensão de navegador da Guarita

Manifest V3, JS puro, sem build e sem dependência. Chrome, Edge e Firefox (140+; Android 142+). Página pública:
<https://guarita.pages.dev/extensao> (`src/routes/Extensao.svelte`).

## O que faz

- **Cartão ao passar o mouse** (`content.js`): nos sites da lista, parar o mouse 300 ms sobre um `<img>` (ou elemento
  com `background-image` inline) do `render.albiononline.com/v1/item/<ID>.png` mostra nome na língua (PT-BR ou ES),
  tier, qualidade (do `?quality=` da imagem ou a padrão das opções), melhor preço confiável para comprar com idade e
  selo, e o link para `/item/<ID>` da Guarita (`/es/item/<ID>` em espanhol). Também abre com o foco do teclado num
  link que contém o ícone; Esc e rolar fecham. Shadow DOM fechado: o CSS da página não entra e o do cartão não sai.
- **Popup** (`popup.html/js`): busca no índice de itens (nome na língua, EN ou id; `t4`, `4.1`, `adepto` ou, em
  espanhol, `iniciado`/`gran maestro` filtram tier) com o preço do item escolhido, e mini relógio (`/api/clock`:
  Brasília, UTC, status, bônus ativos, ouro).
- **Opções** (`options.html/js`): língua, cartão ligado ou desligado por site, qualidade padrão. Ficam em
  `storage.local.options`; as abas abertas obedecem na hora (`storage.onChanged`), inclusive a troca de língua.

## Línguas (desde a 0.2.0)

- **Opção "Idioma/Língua"**: Automático (padrão; `chrome.i18n.getUILanguage()` começando com `es` → espanhol, o resto
  → português), Português ou Español. `resolveLocale` no `core.js`; valor estranho no storage vira `auto`.
- **Textos da interface** (cartão, popup, opções, erros do fundo): tabela `STR.pt`/`STR.es` em `lib/core.js`, lida
  por `t(loc, chave)`. Não usam `chrome.i18n.getMessage` de propósito: ele segue sempre a língua do navegador e não
  obedeceria à opção. O HTML do popup e das opções já vem em português; `data-i18n`, `data-i18n-placeholder` e
  `data-i18n-aria-label` marcam o que `applyI18n` troca em espanhol (o teste confere que o português do HTML é igual
  ao da tabela, e que toda chave usada existe nas duas línguas).
- **`_locales/pt_BR` e `_locales/es`** (`default_locale: pt_BR`): só o que o manifest precisa (`__MSG_extName__`,
  `extShortName`, `extDescription`, `actionTitle`), que a loja e a lista de extensões mostram na língua do navegador.
  Descrição até 132 caracteres (limite da Chrome Web Store; o teste confere).
- **Espanhol**: es-419, "tú", termos do cliente oficial ([glossário](../docs/glossario-es.md)): objeto, Bueno/Notable/
  Sobresaliente/Obra maestra, plata, "confianza alta/media/baja" no selo, "la Guarita". Números com `es-419`
  (`4,120 plata`); horas sempre de Brasília, como no site.
- **Nome do item**: índice por língua, mesmo formato (`[id, nome, en, tier, ench]`), mesma validade de 24 h e chave
  própria no storage: `itemsIndex` (`/data/items-index.json`, a de sempre) e `itemsIndexEs`
  (`/data/items-index-es.json`). Só baixa o da língua em uso. O cache de preço (5 min) é um só para as duas línguas:
  o preço é igual, muda só o nome e o texto.
- **Mensagens ao fundo** levam `lang` ('pt' | 'es'); sem ela, o fundo usa a opção salva.
- **Relógio em espanhol**: pede `/api/clock?lang=es` e mostra o `label` (espanhol) de cada festividade; enquanto a API
  publicada não manda `label`, cai no `labelPt`.
- **Erro da API em espanhol**: a mensagem curta que a API manda (em português) não é repassada; vale a genérica em
  espanhol.

## Como funciona

- `lib/core.js` é a lógica pura (detecção do id, cartão, busca, freios, opções). Script clássico que publica
  `globalThis.GuaritaCore`, carregado antes de `content.js`, de `background.js` (via `importScripts` no Chrome e
  pela lista `background.scripts` no Firefox), do popup e das opções. Testes: `tests/extension.test.ts` (vitest da
  raiz, sem mudar a config).
- `background.js` é o único que faz requisição, e só para `https://guarita.pages.dev` (a API não manda CORS; o
  content script não conseguiria). Freios: 300 ms de espera no cartão, cache de 5 min por item e qualidade, pedidos
  iguais em voo viram um, no máximo **20 consultas de item por minuto** (acima disso o cartão pede para esperar e
  oferece o link). O relógio fica 30 s em cache.
- Índice de nomes: `/data/items-index.json` (1 MB; em espanhol `/data/items-index-es.json`) baixado na instalação
  (o da língua em uso) e guardado em `storage.local.itemsIndex` (`itemsIndexEs`) por 24 h; sem rede, o vencido
  continua servindo. Sem índice, o cartão mostra o id.
- Melhor preço: a mesma régua do site (`cheapestReliable` de `src/lib/format.ts`): fora o Black Market, a ordem de
  venda mais barata com selo alta ou média; sem nenhuma, a mais barata marcada como "mais barato visto".

## Permissões

`storage`; `host_permissions` só `https://guarita.pages.dev/*`; o content script roda só nos padrões de
`content_scripts.matches` (wiki oficial, `albiononline.com/killboard*` e `/*/killboard*`, albionfreemarket,
albiononline2d, murderledger, www.albion-online-data.com). A lista do manifest e `SITES` do `core.js` têm de ser
iguais (o teste confere). Nada é coletado: só o id do item, a qualidade e, no relógio em espanhol, `lang=es` vão para
a Guarita.

## Comandos

```bash
node extension/scripts/make-icons.mjs   # icons/icon-16/32/48/128.png a partir de public/icons/icon-512.png
node extension/build.mjs                # dist/guarita-extensao-<versão do manifest>.zip (manifest na raiz do zip)
npx vitest run tests/extension.test.ts  # da raiz do repo
```

Prova num Chromium real: `extension/scripts/prova-chromium.mjs` (instruções no cabeçalho; precisa de
`playwright-core` fora do repo; para ver em espanhol, `--lang=es-419` nos `args` do Chromium ou a opção de idioma).
Firefox: `npx web-ext lint --source-dir <zip extraído>` dá 0 erros e 1 aviso esperado (`background.service_worker`
não suportado: o Firefox usa `background.scripts`); conferido na 0.2.0 com o `_locales/`.

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
- **Opção "Español" não muda o texto** → texto novo escrito com `chrome.i18n.getMessage` segue a língua do navegador,
  não a opção. Texto de interface vai na tabela `STR` do `core.js` (`t(loc, chave)`); o `_locales/` é só do manifest.
- **Extensão não carrega ("Default locale was specified, but _locales subtree is missing")** → com `default_locale`
  no manifest, `_locales/pt_BR/messages.json` tem de ir no zip (`FILES` do `build.mjs`; o teste confere).
- **Busca em espanhol não acha "bolsa adepto"** → no cliente ES o T4 é "iniciado" (e o T3 é "obrero"); as palavras de
  tier dependem da língua (`searchIndex(..., loc)`), e em português nada mudou.
