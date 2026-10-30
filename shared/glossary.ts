// Glossário do novato (módulo (c) da Fase 2): gírias e termos do Albion que o jogador brasileiro ouve em chat,
// Discord e vídeo, com as variações em inglês e português e uma definição curta.
// Conferido em 30/10/2026 contra o que a própria Guarita usa (shared/market.ts: taxa de 8% / 4% com Premium,
// taxa de anúncio de 2,5%) e contra as fontes das regras de zona citadas em shared/zones.ts.
// Terras Antigas (Ancient Lands): atualização "Dragonfire", lançada em 31/08/2026 (MassivelyOP, 14/08/2026:
// https://massivelyop.com/2026/08/14/albion-online-takes-a-closer-look-at-the-ancient-lands-area-arriving-with-august-31s-dragonfire-update/;
// iTechPost, 10/09/2026: guia de portais, PvP e PvE).

export type GlossaryCategory = 'combate' | 'guilda' | 'mundo' | 'itens' | 'mercado' | 'ferramentas';

export const GLOSSARY_CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  combate: 'Combate',
  guilda: 'Guilda e território',
  mundo: 'Mundo e zonas',
  itens: 'Itens e progressão',
  mercado: 'Mercado e economia',
  ferramentas: 'Ferramentas e sites',
};

export interface GlossaryTerm {
  /** Âncora estável (sem acento, minúsculas). */
  id: string;
  /** Nome como o brasileiro mais fala. */
  term: string;
  /** Outras formas: inglês, sigla, tradução do jogo, gíria. */
  aka: string[];
  def: string;
  cat: GlossaryCategory;
}

export const GLOSSARY: GlossaryTerm[] = [
  // ---------- combate ----------
  { id: 'gank', term: 'Gank', aka: ['ganking', 'gankar', 'emboscada'], cat: 'combate',
    def: 'Emboscada contra quem está coletando, fazendo masmorra ou transportando, quase sempre em zona vermelha ou preta. O grupo espera num ponto de passagem e mata quem passa para ficar com o saque.' },
  { id: 'ganker', term: 'Ganker', aka: ['grupo de gank'], cat: 'combate',
    def: 'Jogador ou grupo que vive de gank. Costuma usar armas com controle (atordoar, enraizar) e montaria rápida.' },
  { id: 'zvz', term: 'ZvZ', aka: ['zerg vs zerg', 'zerg'], cat: 'combate',
    def: 'Batalha grande entre dois ou mais grupos numerosos (de 20 a centenas de jogadores), em geral por território, castelo ou posto avançado.' },
  { id: 'gg', term: 'GG', aka: ['good game', 'bom jogo'], cat: 'combate',
    def: 'Abreviação de “good game” (bom jogo): cumprimento no chat depois de uma luta, de quem ganhou ou de quem perdeu.' },
  { id: 'cta', term: 'CTA', aka: ['call to arms', 'chamado às armas'], cat: 'combate',
    def: 'Convocação da guilda ou aliança para uma luta marcada. Muitas guildas exigem presença mínima em CTA e pagam o regear de quem morre nela.' },
  { id: 'scout', term: 'Scout', aka: ['batedor', 'olheiro'], cat: 'combate',
    def: 'Quem vai à frente, sem nada de valor, para ver se a área está livre e avisar o grupo do que tem pela frente.' },
  { id: 'kite', term: 'Kite', aka: ['kitar', 'kiting'], cat: 'combate',
    def: 'Lutar mantendo distância: bater e se afastar para o inimigo nunca alcançar você. Comum com arco, besta e cajados.' },
  { id: 'cc', term: 'CC', aka: ['crowd control', 'controle de grupo'], cat: 'combate',
    def: 'Efeito que tira o controle do alvo: atordoar, silenciar, enraizar, derrubar, puxar. Quem tem mais CC na hora certa costuma ganhar a luta.' },
  { id: 'purge', term: 'Purge', aka: ['purgar', 'remover buff'], cat: 'combate',
    def: 'Habilidade que remove efeitos positivos (buffs) do inimigo, como escudo ou aumento de velocidade.' },
  { id: 'escape', term: 'Escape', aka: ['fuga', 'habilidade de fuga'], cat: 'combate',
    def: 'Habilidade ou item que ajuda a sair de uma luta perdida: avanço, invisibilidade, imunidade a CC, montaria rápida. Em zona de saque total, sem escape você vira presa fácil.' },
  { id: 'dps', term: 'DPS', aka: ['dano por segundo', 'damage per second', 'dano'], cat: 'combate',
    def: 'Dano por segundo. Também é o nome da função de quem existe para causar dano no grupo.' },
  { id: 'healer', term: 'Healer', aka: ['curandeiro', 'cura', 'heal'], cat: 'combate',
    def: 'Quem cura o grupo, em geral com cajado sagrado ou cajado da natureza.' },
  { id: 'tank', term: 'Tank', aka: ['tanque'], cat: 'combate',
    def: 'Quem aguenta o dano e segura a atenção dos monstros ou inicia a luta, em geral de armadura de placa.' },
  { id: 'support', term: 'Support', aka: ['suporte'], cat: 'combate',
    def: 'Quem dá vantagem ao grupo sem ser o principal em dano ou cura: escudos, velocidade, limpeza de efeitos, CC extra.' },
  { id: 'full-loot', term: 'Full loot', aka: ['saque total', 'perde tudo'], cat: 'combate',
    def: 'Regra das zonas vermelha e preta, das Estradas de Avalon e das Brumas letais: quem morre larga tudo o que veste e carrega para quem passar.' },
  { id: 'nocaute', term: 'Nocaute', aka: ['knockdown', 'derrubado', 'knocked down'], cat: 'combate',
    def: 'Derrota sem morte: você cai no chão por alguns segundos, perde durabilidade e não larga o equipamento. Acontece nas zonas azul e amarela e nas Brumas não letais.' },
  { id: 'bandeira', term: 'Bandeira de PvP', aka: ['flag', 'flagado', 'hostil', 'hostile flag'], cat: 'combate',
    def: 'Marca que você ativa para poder atacar outros jogadores nas zonas amarela e vermelha. Ela decide se você pode atacar, não se pode ser atacado: quem está com bandeira ataca também quem está sem. Na zona preta todo mundo já é hostil, sem bandeira.' },
  { id: 'reputacao', term: 'Reputação', aka: ['reputation', 'rep', 'fora da lei', 'outlaw'], cat: 'combate',
    def: 'Pontuação que cai quando você ataca quem está sem bandeira no Continente Real. Com reputação muito baixa você vira fora da lei e perde acesso a zonas e cidades.' },
  { id: 'dive', term: 'Dive', aka: ['mergulho', 'dar dive'], cat: 'combate',
    def: 'Entrar no meio do grupo inimigo para pegar um alvo específico, como o curandeiro, de preferência com CC e escape prontos.' },
  { id: 'comp', term: 'Comp', aka: ['composição', 'composition', 'build do grupo'], cat: 'combate',
    def: 'A combinação de armas e funções do grupo (quantos tanks, curandeiros, DPS e suportes). Guilda séria costuma ter comp fixa para cada tipo de conteúdo.' },
  { id: 'build', term: 'Build', aka: ['set', 'montagem'], cat: 'combate',
    def: 'Conjunto escolhido de arma, armaduras, capa, comida, poção e habilidades de cada peça.' },

  // ---------- guilda e território ----------
  { id: 'regear', term: 'Regear', aka: ['reequipar', 'reposição de equipamento'], cat: 'guilda',
    def: 'Quando a guilda devolve (em item ou prata) o set de quem morreu numa luta dela, como um CTA. Cada guilda tem regras próprias: costuma pedir print da morte ou link do killboard.' },
  { id: 'ho', term: 'HO', aka: ['hideout', 'esconderijo', 'base'], cat: 'guilda',
    def: 'Esconderijo da guilda nas Terras Exteriores ou nas Estradas de Avalon: base com banco, mercado e oficinas, ponto de partida para o conteúdo da região.' },
  { id: 'guilda', term: 'Guilda', aka: ['guild'], cat: 'guilda',
    def: 'Grupo permanente de jogadores, com banco, hierarquia e, às vezes, território e esconderijo próprios.' },
  { id: 'alianca', term: 'Aliança', aka: ['alliance', 'ally'], cat: 'guilda',
    def: 'Grupo de guildas que lutam do mesmo lado. Membros da mesma aliança não se atacam nas zonas pretas.' },
  { id: 'taxa-da-guilda', term: 'Taxa da guilda', aka: ['guild tax', 'imposto da guilda'], cat: 'guilda',
    def: 'Porcentagem da prata que os membros ganham com monstros e masmorras que vai direto para a guilda. Cada guilda decide o valor.' },
  { id: 'castelo', term: 'Castelo', aka: ['castle'], cat: 'guilda',
    def: 'Fortaleza das Terras Exteriores disputada pelas guildas em horário marcado. Quem domina ganha recompensas e acesso a baús de castelo.' },
  { id: 'outpost', term: 'Outpost', aka: ['posto avançado', 'castle outpost'], cat: 'guilda',
    def: 'Posto menor ligado a um castelo, disputado com mais frequência e por grupos menores.' },
  { id: 'territorio', term: 'Território', aka: ['territory', 'terra'], cat: 'guilda',
    def: 'Área das Terras Exteriores que uma guilda conquista e mantém, com recursos e vantagens para os membros.' },
  { id: 'temporada', term: 'Temporada', aka: ['season', 'temporada de guilda'], cat: 'guilda',
    def: 'Período de alguns meses em que as guildas acumulam pontos de conquista com território, castelos e lutas. O fim da temporada redistribui o mapa e as recompensas.' },
  { id: 'smart-cluster-queue', term: 'Smart cluster queue', aka: ['fila inteligente', 'fila de cluster', 'scq'], cat: 'guilda',
    def: 'Fila que o jogo cria quando muita gente tenta entrar num mapa cheio durante uma luta grande: os lugares são divididos entre os lados para ninguém lotar o mapa sozinho.' },

  // ---------- mundo e zonas ----------
  { id: 'cluster', term: 'Cluster', aka: ['mapa', 'zona', 'map'], cat: 'mundo',
    def: 'Cada mapa do mundo do Albion. Você muda de cluster ao atravessar uma das saídas no canto do mapa.' },
  { id: 'zona-azul', term: 'Zona azul', aka: ['blue zone', 'zona segura'], cat: 'mundo',
    def: 'Mapa sem combate entre jogadores. Morrer para monstro só derruba e custa durabilidade.' },
  { id: 'zona-amarela', term: 'Zona amarela', aka: ['yellow zone'], cat: 'mundo',
    def: 'Quem ativou a bandeira pode atacar, mas a derrota só derruba: ninguém saqueia o seu set.' },
  { id: 'zona-vermelha', term: 'Zona vermelha', aka: ['red zone', 'rz'], cat: 'mundo',
    def: 'Zona de saque total no Continente Real. Quem tem bandeira pode atacar qualquer um; atacar quem está sem bandeira custa reputação.' },
  { id: 'zona-preta', term: 'Zona preta', aka: ['black zone', 'bz', 'terras exteriores', 'outlands'], cat: 'mundo',
    def: 'Zonas das Terras Exteriores: todo mundo fora da sua guilda, aliança e grupo é inimigo, sem bandeira e sem reputação. Saque total.' },
  { id: 'continente-real', term: 'Continente Real', aka: ['royal continent', 'royals', 'reais'], cat: 'mundo',
    def: 'A parte do mapa com as cidades reais (Bridgewatch, Fort Sterling, Lymhurst, Martlock e Thetford) e as zonas azul, amarela e vermelha.' },
  { id: 'caerleon', term: 'Caerleon', aka: ['caer'], cat: 'mundo',
    def: 'Cidade no centro do Continente Real cercada por zonas vermelhas. Tem o Black Market e um mercado grande, mas ir e vir é arriscado.' },
  { id: 'brecilien', term: 'Brecilien', aka: ['breci'], cat: 'mundo',
    def: 'Cidade escondida dentro das Brumas, com mercado próprio.' },
  { id: 'ilha', term: 'Ilha', aka: ['island', 'ilha pessoal', 'ilha da guilda'], cat: 'mundo',
    def: 'Terreno particular (pessoal ou da guilda) para plantar, criar animais, montar oficinas e manter trabalhadores. Não tem combate.' },
  { id: 'brumas', term: 'Brumas', aka: ['mists', 'névoa'], cat: 'mundo',
    def: 'Mapas instanciados para jogar sozinho ou em dupla, com baús, chefes e recursos. Há Brumas letais (saque total) e não letais (só derruba), conforme a entrada.' },
  { id: 'roads', term: 'Estradas de Avalon', aka: ['roads', 'roads of avalon', 'avalon', 'roa'], cat: 'mundo',
    def: 'Rede de mapas ligados por portais que abrem e fecham sozinhos. Regra de zona preta (saque total), com baús, chefes e esconderijos.' },
  { id: 'ancient-lands', term: 'Terras Antigas', aka: ['ancient lands', 'dragonfire'], cat: 'mundo',
    def: 'Região de ilhas flutuantes (PvP e PvE) que chegou na atualização Dragonfire, em 31/08/2026. Os portais levam a variantes diferentes conforme a zona de entrada, para solo, grupo pequeno ou grupo grande, e o objetivo é sair com o saque.' },
  { id: 'dungeon-solo', term: 'Masmorra solo', aka: ['solo dungeon', 'dg solo', 'dungeon solo'], cat: 'mundo',
    def: 'Masmorra aleatória para uma pessoa, aberta por um mapa ou encontrada no mundo. Boa para fama e prata; na zona vermelha ou preta, alguém pode entrar atrás de você.' },
  { id: 'dungeon-grupo', term: 'Masmorra em grupo', aka: ['group dungeon', 'dg em grupo', 'dungeon em grupo', 'dg'], cat: 'mundo',
    def: 'Masmorra pensada para grupo de cinco ou mais, com monstros mais fortes e baús melhores.' },
  { id: 'corrompida', term: 'Masmorra corrompida', aka: ['corrupted dungeon', 'corrompida', 'cd'], cat: 'mundo',
    def: 'Masmorra solo de PvP: você caça um demônio e pode ser invadido por outro jogador (ou invadir). Nos níveis letais, quem morre perde o que leva.' },
  { id: 'hellgate', term: 'Hellgate', aka: ['portão do inferno', 'hg', '2v2', '5v5'], cat: 'mundo',
    def: 'Arena instanciada em que dois grupos pequenos (2v2, 5v5, 10v10) lutam entre si e contra monstros. Nas versões letais, o perdedor larga o set.' },
  { id: 'chest', term: 'Baú', aka: ['chest', 'baú de tesouro', 'bau'], cat: 'mundo',
    def: 'Baú de tesouro no mundo, nas Brumas, em Avalon e nas masmorras. Abrir leva alguns segundos e avisa quem está perto, por isso é ponto clássico de gank.' },
  { id: 'black-market', term: 'Black Market', aka: ['bm', 'mercado negro'], cat: 'mercado',
    def: 'Mercado de Caerleon que só compra: o jogo usa os itens vendidos lá para abastecer o saque dos monstros. Muito usado por quem fabrica e por quem faz flip.' },

  // ---------- itens e progressão ----------
  { id: 'tier', term: 'Tier', aka: ['t4.1', 't6', 'nível do item'], cat: 'itens',
    def: 'Nível do item, de T1 a T8. "T4.1" quer dizer tier 4 com encantamento 1. No PT-BR do jogo: T1 Calouro, T2 Novato, T3 Iniciante, T4 Adepto, T5 Perito, T6 Mestre, T7 Grão-mestre, T8 Ancião.' },
  { id: 'encantar', term: 'Encantamento', aka: ['enchant', 'encantar', '.1 .2 .3 .4'], cat: 'itens',
    def: 'Melhoria de .1 a .4 sobre o tier, feita com runas, almas e relíquias (e .4 com fragmentos de Avalon). Aumenta o IP do item.' },
  { id: 'runa-alma-reliquia', term: 'Runa, alma e relíquia', aka: ['rune', 'soul', 'relic'], cat: 'itens',
    def: 'Materiais de encantamento: runa leva o item a .1, alma a .2 e relíquia a .3.' },
  { id: 'qualidade', term: 'Qualidade', aka: ['quality', 'obra-prima', 'masterpiece'], cat: 'itens',
    def: 'Sorte na fabricação: Normal, Bom, Excepcional, Excelente e Obra-prima. Quanto melhor, mais IP e mais caro no mercado.' },
  { id: 'ip', term: 'IP', aka: ['item power', 'poder do item', 'poder de item'], cat: 'itens',
    def: 'Poder do item: soma de tier, encantamento, qualidade e maestria. Quanto maior, mais forte a peça. Algumas atividades limitam o IP máximo.' },
  { id: 'artefato', term: 'Artefato', aka: ['artifact', 'arma de artefato'], cat: 'itens',
    def: 'Material raro que entra na receita de armas e armaduras especiais (de Morgana, Avalon, Keeper...). Itens de artefato costumam ser bem mais caros.' },
  { id: 'fama', term: 'Fama', aka: ['fame', 'xp'], cat: 'itens',
    def: 'A experiência do Albion: você ganha matando, coletando e fabricando, e ela preenche o Tabuleiro do Destino.' },
  { id: 'destiny-board', term: 'Tabuleiro do Destino', aka: ['destiny board', 'árvore de habilidades'], cat: 'itens',
    def: 'O quadro onde fica todo o seu progresso: cada arma, armadura, coleta e fabricação tem a sua linha, liberada com fama.' },
  { id: 'maestria', term: 'Maestria', aka: ['mastery', 'masteria'], cat: 'itens',
    def: 'Progresso numa família de itens (por exemplo, espadas). Libera tiers mais altos e dá IP extra a todas as peças da família.' },
  { id: 'especializacao', term: 'Especialização', aka: ['specialization', 'spec'], cat: 'itens',
    def: 'Progresso numa peça específica (por exemplo, a Espada Larga). Dá mais IP naquela peça e um pouco nas outras da família.' },
  { id: 'foco', term: 'Foco', aka: ['focus', 'pontos de foco'], cat: 'itens',
    def: 'Recurso de quem tem Premium (acumula até 30 mil) gasto para fabricar, refinar e cuidar da ilha com retorno muito maior de material.' },
  { id: 'rrr', term: 'RRR', aka: ['taxa de retorno de recursos', 'resource return rate', 'retorno'], cat: 'itens',
    def: 'Porcentagem do material que volta para você ao fabricar ou refinar. Sobe com foco, com o bônus da cidade e com a ilha.' },
  { id: 'refinar', term: 'Refinar', aka: ['refine', 'refino'], cat: 'itens',
    def: 'Transformar recurso bruto em material: minério em barra, fibra em tecido, couro cru em couro, madeira em tábua, pedra em bloco.' },
  { id: 'craft', term: 'Fabricar', aka: ['craft', 'craftar', 'crafting'], cat: 'itens',
    def: 'Produzir equipamento, comida ou poção a partir de materiais, numa oficina.' },
  { id: 'transmutar', term: 'Transmutar', aka: ['transmute', 'transmutação'], cat: 'itens',
    def: 'Converter um recurso em outro tier ou encantamento pagando prata, numa construção da cidade. Às vezes sai mais barato do que comprar pronto.' },
  { id: 'laborer', term: 'Trabalhador', aka: ['laborer', 'labor'], cat: 'itens',
    def: 'Personagem da ilha que você contrata. Ele recebe um diário cheio e devolve recursos ou itens no dia seguinte.' },
  { id: 'journal', term: 'Diário', aka: ['journal', 'diário de trabalho'], cat: 'itens',
    def: 'Livro que enche com fama da atividade dele (coleta, fabricação, combate). O diário cheio vai para um trabalhador ou é vendido no mercado.' },
  { id: 'montaria', term: 'Montaria', aka: ['mount', 'cavalo', 'boi', 'mamute'], cat: 'itens',
    def: 'Animal para andar mais rápido ou carregar mais peso. Montarias de transporte (boi, mamute) carregam muito; as de combate fogem ou lutam melhor.' },
  { id: 'prata', term: 'Prata', aka: ['silver', 'pratas'], cat: 'mercado',
    def: 'A moeda do jogo, ganha jogando. Tudo no mercado é cotado em prata.' },
  { id: 'ouro', term: 'Ouro', aka: ['gold'], cat: 'mercado',
    def: 'Moeda premium: comprada com dinheiro real na loja oficial ou trocada por prata no próprio jogo. Paga Premium e itens da loja.' },
  { id: 'premium', term: 'Premium', aka: ['vip'], cat: 'mercado',
    def: 'Assinatura (paga com ouro ou dinheiro real) que dá foco diário, metade da taxa de venda, mais fama e outras vantagens.' },

  // ---------- mercado e economia ----------
  { id: 'flip', term: 'Flip', aka: ['flipar', 'flipping', 'revenda'], cat: 'mercado',
    def: 'Comprar barato numa cidade (ou por ordem de compra) e vender mais caro em outra, ou no Black Market. O risco é o transporte e o preço mudar no caminho.' },
  { id: 'buy-order', term: 'Ordem de compra', aka: ['buy order', 'bo'], cat: 'mercado',
    def: 'Pedido que você deixa no mercado dizendo quanto paga por um item. Quem quiser vender na hora vende para você.' },
  { id: 'sell-order', term: 'Ordem de venda', aka: ['sell order', 'anúncio', 'so'], cat: 'mercado',
    def: 'Anúncio do seu item no mercado pelo preço que você escolher. Fica lá até alguém comprar ou vencer.' },
  { id: 'setup-fee', term: 'Taxa de anúncio', aka: ['setup fee', 'taxa de criação'], cat: 'mercado',
    def: 'Taxa de 2,5% paga ao criar uma ordem de compra ou de venda, mesmo que ela não seja aceita.' },
  { id: 'taxa', term: 'Taxa de venda', aka: ['sales tax', 'taxa', 'imposto'], cat: 'mercado',
    def: 'Desconto sobre cada venda no mercado: 8% sem Premium e 4% com Premium.' },
  { id: 'emv', term: 'EMV', aka: ['estimated market value', 'valor estimado de mercado', 'valor estimado'], cat: 'mercado',
    def: 'Valor estimado de um item ou de um set pelo preço de mercado. Killboards e sites usam para dizer quanto uma morte custou.' },
  { id: 'rmt', term: 'RMT', aka: ['real money trading', 'venda de prata', 'compra de prata'], cat: 'mercado',
    def: 'Comprar ou vender prata, itens ou contas por dinheiro real fora da loja oficial. É proibido pelos Termos, rende banimento e é terreno fértil de golpe.' },
  { id: 'transporte', term: 'Transporte', aka: ['haul', 'hauling', 'transportar'], cat: 'mercado',
    def: 'Levar mercadoria de uma cidade para outra, em geral de boi ou mamute. Passar por zona vermelha é mais rápido e mais arriscado.' },

  // ---------- ferramentas e sites ----------
  { id: 'killboard', term: 'Killboard', aka: ['quadro de mortes', 'kb'], cat: 'ferramentas',
    def: 'Registro público de kills e mortes do servidor, com equipamento e fama. A Guarita usa o killboard oficial, com atraso de minutos.' },
  { id: 'aodp', term: 'AODP', aka: ['albion online data project', 'albion data'], cat: 'ferramentas',
    def: 'Projeto comunitário que junta preços do mercado enviados por jogadores. É a fonte dos preços da Guarita; por isso um preço pode estar velho onde ninguém olhou o mercado.' },
  { id: 'loot-logger', term: 'Loot logger', aka: ['registro de saque'], cat: 'ferramentas',
    def: 'Ferramenta de terceiros que lê o tráfego do jogo para registrar quem pegou o quê. A Guarita não faz captura de rede nem indica loot logger; a única ferramenta desse tipo que ela menciona é o cliente do Albion Online Data Project, que alimenta os preços (veja a página Isso é permitido?).' },
];

/** Minúsculas, sem acento, só letras, números e espaço (para busca). */
export function glossNorm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
}

/** Letra do índice (A–Z) de um termo; número ou símbolo vai para "#". */
export function glossLetter(t: GlossaryTerm): string {
  const c = glossNorm(t.term).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Termos em ordem alfabética do português (sem acento). */
export function sortedGlossary(list: GlossaryTerm[] = GLOSSARY): GlossaryTerm[] {
  return [...list].sort((a, b) => a.term.localeCompare(b.term, 'pt-BR', { sensitivity: 'base' }));
}

/**
 * Busca instantânea: casa termo, variações e definição. Ordem: termo ou variação igual à busca, depois começando
 * com a busca, depois contendo, depois só na definição.
 */
export function searchGlossary(q: string, list: GlossaryTerm[] = GLOSSARY): GlossaryTerm[] {
  const nq = glossNorm(q);
  if (!nq) return sortedGlossary(list);
  const scored: { t: GlossaryTerm; s: number }[] = [];
  for (const t of list) {
    const names = [t.term, ...t.aka].map(glossNorm);
    let s = 9;
    if (names.some((n) => n === nq)) s = 0;
    else if (names.some((n) => n.startsWith(nq))) s = 1;
    else if (names.some((n) => n.split(' ').some((w) => w.startsWith(nq)))) s = 2;
    else if (names.some((n) => n.includes(nq))) s = 3;
    else if (glossNorm(t.def).includes(nq)) s = 4;
    if (s < 9) scored.push({ t, s });
  }
  scored.sort((a, b) => a.s - b.s || a.t.term.localeCompare(b.t.term, 'pt-BR', { sensitivity: 'base' }));
  return scored.map((x) => x.t);
}
