# Glossário PT → ES (termos do jogo na interface)

Para quem escreve o lado espanhol do `tx('pt', 'es')`: use o termo que o **cliente oficial em espanhol** mostra, para o
jogador reconhecer o que vê no jogo. Espanhol neutro latino (es-419, "tú"), tom de produto, sem gíria.

**Fontes** (só arquivos estáticos públicos; o cliente instalado não foi lido):

- **[L]** localização oficial do jogo no ao-bin-dumps:
  `https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/localization.json` (TMX com PT-BR, ES-ES, EN-US;
  baixado em 30/10/2026). A coluna "chave" é o `@tuid` de lá, para conferir.
- **[I]** nomes de item no ao-bin-dumps: `formatted/items.json`, campo `LocalizedNames["ES-ES"]` (o mesmo dump que
  gera `public/data/items-index-es.json`, `ac-es/` e `names-es/`).
- **[P]** proposta nossa: o jogo não tem texto oficial para o termo (gíria da comunidade ou conceito do site).

O jogo só tem uma variante de espanhol (**ES-ES**, de tom neutro e já com "tú": "Entra en una Zona roja"). Ela vale
para es-419 sem adaptação nos termos abaixo. Maiúsculas: o cliente é irregular (`@BLACK_MARKET` = "Mercado negro",
`@BUILDINGS_BLACKMARKET` = "Mercado Negro"); na Guarita, **nome próprio de lugar ou construção com inicial maiúscula**
(Mercado Negro, Caminos de Avalon, Tierras Lejanas) e o resto em minúscula no meio da frase (plata, fama, gremio).

## Pegadinhas (não "corrigir" para o termo intuitivo)

| PT na interface | ES do jogo | por quê |
| --- | --- | --- |
| Brumas | **Nieblas** | `@GENERIC_MISTS_CLUSTER`. "Brumas" não aparece no cliente em espanhol. |
| Excepcional (qualidade 3) | **Notable** | `@ITEMDETAILS_STATS_QUALITY_3`. Ordem do jogo: Normal < Bom < Excepcional < Excelente < Obra-prima. |
| Excelente (qualidade 4) | **Sobresaliente** | `@ITEMDETAILS_STATS_QUALITY_4`. Não traduzir por "Excelente". |
| Tier / grau | **Nivel** (no jogo) · "tier" (proposto no site) | `@MARKETPLACEGUI_ROLLOUT_DEFAULT_TIER` = "Nivel". No site, "nivel" já é usado para nível de jogador/especialização; manter "tier" (T4, T4.1) como no PT, que também usa "tier" e não o "Grau" do jogo. [P] |
| Item | **objeto** | `@MARKETPLACEGUI_CATEGORY_COLUMN_ITEM` = "Objeto"; "Poder de objeto" (`@ARMORY_GUI_BUILD_ITEM_POWER_HEADER`). |
| Guilda | **gremio** | `@CHAT_CHANNELNAME_GUILD`. Nunca "guild" nem "clan". |
| Taxa de anúncio / taxa de setup | **cuota de preparación** | `@GOLD_MARKET_CONFIRMATION_GUI_SETUP_FEE`. O mercado de itens mostra "Ajustar cuota" (`@MARKETPLACE_SETUPFEE`), tradução literal errada de "Setup Fee"; não copiar. |
| Imposto / taxa de venda | **impuesto** | `@GENERIC_TAX` ("Impuestos"), `@OVERHEADMESSAGE_SILVER_TAX` ("Impuesto: {0}"). |
| Abate(s) | **asesinato(s)** | `@STATS_GUI_HEADER_KILLS`. Fama de abate = "fama por asesinatos" (`@GUILD_APPLICATION_STAT_CATEGORY_KILLFAME`). |
| Saque (loot) | **botín** | `@CHAT_CHANNELNAME_LOOT`. |

## Cidades e lugares [L]

| PT | ES | chave |
| --- | --- | --- |
| Caerleon | Caerleon | `@JOURNAL_CITIES_CAERLEON` |
| Bridgewatch | Bridgewatch | `@JOURNAL_CITIES_BRIDGEWATCH` |
| Fort Sterling | Fort Sterling | `@JOURNAL_CITIES_FORT_STERLING` |
| Lymhurst | Lymhurst | `@JOURNAL_CITIES_LYMHURST` |
| Martlock | Martlock | `@JOURNAL_CITIES_MARTLOCK` |
| Thetford | Thetford | `@JOURNAL_CITIES_THETFORD` |
| Brecilien | Brecilien | `@JOURNAL_CITIES_BRECILIEN` |
| Black Market / Mercado Negro | Mercado Negro | `@BUILDINGS_BLACKMARKET` |
| Mercado | Mercado | `@GENERIC_MARKETPLACE` |
| Mercado dos Contrabandistas | Mercado de Contrabandistas | `@BUILDINGS_SMUGGLERS_MARKET` |
| Toca de Contrabandistas | Antro de Contrabandistas | `@ASSET_OVERVIEW_NAVIGATION_ENTRY_SMUGGLERS_DEN` |
| Continente Real | Continente Real | `@ASSET_OVERVIEW_NAVIGATION_ENTRY_ROYAL_CONTINENT` |
| Terras Distantes | Tierras Lejanas | `@ASSET_OVERVIEW_NAVIGATION_ENTRY_OUTLANDS` |
| Estradas de Avalon | Caminos de Avalon | `@ROADS_OF_AVALON_INFO_TITLE` |
| Brumas | Nieblas | `@GENERIC_MISTS_CLUSTER` |
| Esconderijo | Escondite | `@HIDEOUT_SUR_NAME` |
| Ilha | Isla | `@MARKETPLACEGUI_ROLLOUT_SHOPSUBCATEGORY_ISLAND` |
| Território | Territorio | `@CONQUERORS_CHALLENGE_DAILY_MIGHT_CATEGORY_TERRITORY` |
| Banco | Banco | `@BUILDINGS_T1_BANK` |
| Baú | Cofre | `@MARKETPLACEGUI_ROLLOUT_SHOPSUBCATEGORY_CHEST` |
| Portal | Portal | `@GENERIC_PORTAL` |

## Zonas [L]

| PT | ES | chave |
| --- | --- | --- |
| zona azul | zona azul [P] | sem texto oficial (o mapa chama de "Región segura", `@PROXIMITY_TOOLTIP_EXIT_ZONE_SAFE`) |
| zona segura | zona segura / región segura | `@PVP_ZONETYPE_SAFE` ("segura") |
| zona amarela | zona amarilla | `@JOURNAL_EXPLORATION_ENTER_YELLOW_DESCRIPTION` |
| zona vermelha | zona roja | `@JOURNAL_EXPLORATION_ZONE_TYPES_ENTER_RED_DESCRIPTION` |
| zona preta | zona negra | `@JOURNAL_EXPLORATION_ZONE_TYPES_BLACK_FAME_DESCRIPTION` |
| saque total (full loot) | botín completo | `@PVP_ZONETYPE_RED` ("Rojo - botín completo") |

## Economia e mercado [L]

| PT | ES | chave |
| --- | --- | --- |
| prata | plata | `@GENERIC_SILVER` |
| ouro | oro | `@GENERIC_GOLD` |
| ordem / pedido de compra | orden de compra (pl. órdenes de compra) | `@MARKETPLACE_ENTRY_TITLE_BUY_ORDERS` |
| ordem / pedido de venda | orden de venta (pl. órdenes de venta) | `@MARKETPLACE_ENTRY_TITLE_SELL_ORDERS` |
| comprar / vender | comprar / vender | `@MARKETPLACE_ENTRY_BUTTON_BUY` / `_SELL` |
| taxa de anúncio (setup) | cuota de preparación | `@GOLD_MARKET_CONFIRMATION_GUI_SETUP_FEE` |
| imposto | impuesto | `@OVERHEADMESSAGE_SILVER_TAX` |
| taxa de mercado (Premium paga metade) | impuestos de mercado | `@PREMIUM_STORE_BENEFIT_REDUCED_MARKET_TAX` |
| taxa de uso (estação) | tasa de uso | `@BUILDING_USAGE_FEE` |
| nutrição | nutrición | `@ITEMDETAILS_STATS_NUTRITION` |
| preço médio | precio medio | `@MARKETPLACEPOPUPDETAILS_AVERAGEPRICE` |
| Premium / status Premium | Premium / estado Premium | `@GENERIC_PREMIUM`, `@HUD_TOOLTIP_BUTTON_PREMIUMSTORE` |
| fama | fama | `@GENERIC_FAME` |
| fama PvE | fama PvE | `@ARMORY_RAW_METRIC_PVE_FAME_GAINED` |
| fama de abate | fama por asesinatos | `@GUILD_APPLICATION_STAT_CATEGORY_KILLFAME` |

## Produção [L]

| PT | ES | chave |
| --- | --- | --- |
| refino / refinar | refinado / refinar | `@RESPEC_TYPE_REFINING`, `@CRAFTBUILDING_ITEM_DETAILS_BUTTON_REFINE` |
| fabricação | fabricación | `@DESTINYBOARD_CATEGORY_CRAFTING` |
| coleta | recolección | `@ARMORY_ACTIVITY_GATHERING_NAME` |
| foco | foco | `@CRAFTING_FOCUS` |
| taxa de retorno de recursos | devolución de recursos | `@CRAFTBUILDING_RESOURCE_RETURN_RATE` |
| recursos | recursos | `@GENERIC_RESOURCES` |
| trabalhadores | trabajadores | `@MARKETPLACEGUI_ROLLOUT_SHOPCATEGORY_LABOURERS` |
| diário(s) | diario(s) | `@GENERIC_LABEL_JOURNAL` |
| festividade(s) | festividad(es) | `@BUILDING_ITEMS_CATEGORY_FESTIVITIES` |
| pontos de aprendizagem | puntos de aprendizaje | `@GENERIC_LEARNINGPOINTS` |
| Tomo da Visão | tomo de conocimiento | `@MARKETPLACEGUI_ROLLOUT_SHOPSUBCATEGORY_SKILLBOOK` |
| artefato | artefacto | `@BUILDING_ITEMS_CATEGORY_ARTIFACTS` |
| runa / alma / relíquia / fragmento avaloniano | runa / alma / reliquia / fragmento avaloniano | `@MELD_LABEL_POWERLEVEL_1` a `_4` |

## Item: qualidade, tier, encantamento, partes [L] [I]

| PT | ES | chave |
| --- | --- | --- |
| qualidade | calidad | `@CRAFTBUILDING_QUALITY_TITLE` |
| Normal | Normal | `@ITEMDETAILS_STATS_QUALITY_1` |
| Bom (boa) | Bueno | `@ITEMDETAILS_STATS_QUALITY_2` |
| Excepcional | Notable | `@ITEMDETAILS_STATS_QUALITY_3` |
| Excelente | Sobresaliente | `@ITEMDETAILS_STATS_QUALITY_4` |
| Obra-prima | Obra maestra | `@ITEMDETAILS_STATS_QUALITY_5` |
| encantamento | encantamiento | `@CRAFTBUILDING_TITLE_ENCHANTMENT` |
| tier | tier (jogo: "Nivel") | `@MARKETPLACEGUI_ROLLOUT_DEFAULT_TIER`; ver pegadinhas |
| poder de item (IP) | poder de objeto | `@ARMORY_GUI_BUILD_ITEM_POWER_HEADER` |
| equipamento | equipo | `@CHARACTER_INSPECT_EQUIPMENT_TITLE` |
| montaria | montura | `@EQUIPMENT_SLOT_MOUNT` |
| bolsa | bolsa | `@EQUIPMENT_SLOT_BAG` |
| capa | capa | `@EQUIPMENT_SLOT_CAPE` |
| peitoral | pecho | `@EQUIPMENT_SLOT_ARMOR` |
| durabilidade | durabilidad | `@ITEMDETAILS_STATS_DURABILITY` |
| peso | peso | `@INVENTORY_WEIGHT` |

Nome de tier dentro do nome do item [I] (ex.: `T4_BAG` = "Bolsa del iniciado"; o espanhol do jogo usa minúscula):

| tier | PT | ES | EN |
| --- | --- | --- | --- |
| T1 | Calouro | principiante | Beginner's |
| T2 | Novato | novato | Novice's |
| T3 | Iniciante | obrero | Journeyman's |
| T4 | Adepto | iniciado | Adept's |
| T5 | Perito | experto | Expert's |
| T6 | Mestre | maestro | Master's |
| T7 | Grão-mestre | gran maestro | Grandmaster's |
| T8 | Ancião | anciano | Elder's |

Cuidado: "iniciante" (T3 em PT) e "iniciado" (T4 em ES) são tiers diferentes.

## Social e PvP [L]

| PT | ES | chave |
| --- | --- | --- |
| guilda | gremio | `@CHAT_CHANNELNAME_GUILD` |
| aliança | alianza | `@CHAT_CHANNELNAME_ALLIANCE` |
| facção | facción | `@CHAT_CHANNELNAME_FACTION` |
| Guerra de Facções | Guerra de facciones | `@ARMORY_ACTIVITY_FACTIONWARFARE_NAME` |
| pontos de facção | puntos de facción | `@FACTIONPOINTSUI_TOKEN_SUBTITLE` |
| abates / mortes | asesinatos / muertes | `@STATS_GUI_HEADER_KILLS` / `@STATS_GUI_HEADER_DEATHS` |
| killboard (placar de abates) | tabla de asesinatos | `@STATS_GUI_HEADER_KILLBOARD`; "killboard" como nome do site oficial pode ficar |
| saque | botín | `@CHAT_CHANNELNAME_LOOT` |
| masmorra | mazmorra | `@GENERIC_DUNGEON` |
| Masmorra Corrompida | mazmorra corrupta | `@CORRUPTED_DUNGEON_GUI_TITLE` |
| Masmorras Avalonianas | Mazmorras avalonianas | `@AVALONIAN_DUNGEONS_INFO_TITLE` |
| Hellgate | Hellgate | `@GENERIC_HELLGATE` |
| Arena de Cristal | Arena de Cristal | `@ARENA_QUEUE_RANKED` |
| expedição | expedición | `@PARTYFINDER_ACTIVITY_EXPEDITION` |
| regear | regear [P] | sem texto oficial; a comunidade hispana usa "regear" |

## Termos do site e do bot [P]

Iguais no site e no Discord (revisão de 30/10/2026):

| PT | ES | por quê |
| --- | --- | --- |
| flip (para o Black Market) | reventa (al Mercado Negro) | "flip" não é termo do cliente; o site e o bot usam o mesmo rótulo. |
| dossiê | dosier | grafia da RAE; o comando no Discord é `/dosier`. |
| conta (o cálculo) | cálculo | "cuenta" em espanhol lê como conta de usuário ou conta bancária. |
| IP (poder de item) | IP | sigla que a comunidade usa; "PO" não existe. "Poder de objeto" só por extenso. |
| selo de confiança: alta/média/baixa | confianza alta/media/baja | "sello" é masculino e o rótulo vem de "confianza". |
| tábuas | tablas | nome do item no cliente ("Tablas de pino"); "tablones" não acha nada na busca. |
| adicionar | agregar | padrão es-419. |
| em segundo plano | en segundo plano | "por detrás" lê como "pelas costas". |

## Como regerar a consulta

O `localization.json` tem ~94 MB: não vai para o repo. Para conferir um termo novo, baixe o arquivo da URL acima numa
pasta temporária e procure o texto PT-BR (ou EN-US) e a chave; a linha ES-ES da mesma `tu` é o termo oficial.
