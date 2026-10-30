// Catálogo de golpes comuns no Albion (módulo (c) da Fase 2), em PT-BR para o novato.
//
// Fontes consultadas em 30/10/2026:
// - Fórum oficial, "Mammoth scam" (2025) e relato de 2023 no mesmo tópico: impostor com nome parecido pede para
//   "pegar emprestado" o mamute num posto avançado: https://forum.albiononline.com/index.php/Thread/207464-Mammoth-scam/
// - Fórum oficial, "I got scammed at my own island": impostor com nome do líder da guilda pede o equipamento para
//   "retocar" no reparo: https://forum.albiononline.com/index.php/Thread/199896-I-got-scammed-at-my-own-island/
// - Fórum oficial, "Is it true scamming is not against the rules?" e "IS scamming allowed in this game?": a moderação
//   diz que golpe em troca voluntária não é punido; fingir ser outro jogador real é tratado à parte:
//   https://forum.albiononline.com/index.php/Thread/200721-Is-it-true-scamming-is-not-against-the-rules-Also-is-referring-to-in-game-silver/
//   https://forum.albiononline.com/index.php/Thread/200011-IS-scamming-allowed-in-this-game/
// - Fórum oficial, "Naked Duel Scam" e "Duel scam for million of silver" (duelo apostado que não é pago):
//   https://forum.albiononline.com/index.php/Thread/113911-Naked-Duel-Scam/
// - Fórum oficial, "Scammed hard. How to report to SBI?":
//   https://forum.albiononline.com/index.php/Thread/205852-Scammed-hard-How-to-report-to-SBI/
// - Aviso dos desenvolvedores sobre golpe de "criptomoeda do Albion": https://devtrackers.gg/albion/p/b4c3ab46-crypto-scam-warning
// - Phishing com falso aviso de banimento enviado a usuários do fórum: https://candid.technology/albion-online-forum-users-targeted-in-eff-themed-phishing-scan
// - Roubo do banco da guilda por um oficial que ganhou confiança (guilda Fricks, mais de 1 bilhão de prata):
//   https://www.mmobomb.com/news/albion-online-player-loots-guild-proper-gameplay-bannable-offense
// - Troca de item na última hora: padrão documentado em outros MMOs (Diablo, EVE) e que se aplica a qualquer janela
//   de troca; não achamos relato público do Albion com data para citar.

export interface Scam {
  id: string;
  title: string;
  /** Resumo de uma linha para a lista. */
  summary: string;
  how: string;
  signs: string[];
  protect: string[];
}

export const SCAMS: Scam[] = [
  {
    id: 'troca-ultima-hora',
    title: 'Troca de item na última hora',
    summary: 'O item da troca é trocado por um parecido (tier, encantamento ou qualidade menor) logo antes de você confirmar.',
    how: 'Vocês combinam uma troca, a outra pessoa coloca o item certo, conversa, enrola, e um instante antes de você confirmar troca por um que parece igual: T5.0 no lugar de T5.1, qualidade Normal no lugar de Excelente, ou uma quantidade menor de prata.',
    signs: [
      'Pressa para você aceitar logo ("rápido, tenho que sair").',
      'Itens tirados e colocados de novo na janela de troca.',
      'Muita conversa no chat enquanto a troca está aberta.',
    ],
    protect: [
      'Antes de confirmar, passe o mouse em cada item e confira tier, encantamento, qualidade e quantidade.',
      'Confira o valor de prata dígito por dígito.',
      'Se algo mudou na janela, cancele e recomece com calma.',
      'Para itens caros, prefira o mercado (ordem de venda ou de compra) a trocas diretas com desconhecidos.',
    ],
  },
  {
    id: 'empresta-montaria',
    title: '"Me empresta a montaria?"',
    summary: 'Alguém, às vezes com o nome parecido com o de um conhecido, pede emprestado o mamute, o boi ou um item e some.',
    how: 'O golpista diz que está pesado demais, que perdeu a montaria ou que vai "só levar umas coisas" e devolve já. Às vezes usa um nome quase igual ao de alguém da sua guilda (um "I" no lugar de "l", um "0" no lugar de "O"). Depois que a montaria sai do seu inventário, não tem volta.',
    signs: [
      'Pedido de empréstimo de algo caro, com urgência.',
      'Encontro marcado num posto avançado ou fora da cidade.',
      'Nome muito parecido com o de um amigo, mas o perfil não bate.',
    ],
    protect: [
      'Não empreste montaria nem equipamento: no jogo não existe empréstimo com garantia.',
      'Confirme pelo Discord da guilda ou pelo chat da guilda se a pessoa é quem diz ser.',
      'Use a checagem de nick parecido aqui na página antes de confiar num nome.',
    ],
  },
  {
    id: 'falso-lider',
    title: 'Falso líder ou oficial da guilda',
    summary: 'Alguém se passa por um oficial e pede o seu equipamento para "retocar", "conferir" ou "guardar".',
    how: 'Com nome parecido e jeito de falar parecido com o de um oficial de verdade, o golpista pede para você ir até o reparo, à ilha ou ao banco e entregar o set. Às vezes usa uma segunda conta para parecer que outra pessoa confirma o pedido.',
    signs: [
      'Pedido de item fora dos canais da guilda.',
      'Nome com uma letra trocada em relação ao oficial real.',
      'Ninguém mais da liderança sabe do pedido.',
    ],
    protect: [
      'Oficial de verdade não pede o seu equipamento em mensagem privada.',
      'Confirme no canal da guilda, com o oficial pelo nome exato.',
      'Funcionário da SBI nunca pede item, senha ou login.',
    ],
  },
  {
    id: 'recrutamento-taxa',
    title: 'Falso recrutamento com taxa de entrada',
    summary: 'Uma "guilda grande" promete regear, território e proteção, mas cobra uma entrada em prata ou itens.',
    how: 'O recrutador anuncia no chat ou no Discord vagas numa guilda famosa e pede prata adiantada para "garantir a vaga", "pagar o primeiro regear" ou "liberar o esconderijo". Depois de receber, some, ou a guilda nem é a que ele disse.',
    signs: [
      'Pagamento antes de entrar.',
      'Promessas grandes demais para um novato.',
      'Recrutador que não está na guilda que anuncia (confira no killboard ou no dossiê).',
    ],
    protect: [
      'Guilda séria pode cobrar taxa sobre o que você ganha, nunca uma entrada para garantir vaga.',
      'Procure o recrutador no dossiê da Guarita e veja se a guilda dele é a anunciada.',
      'Entre no Discord oficial da guilda e confirme com a liderança.',
    ],
  },
  {
    id: 'pede-regear-some',
    title: 'Guilda que pede item para "regear" e some',
    summary: 'Pedem que os membros depositem itens ou prata no banco "para o regear" e depois esvaziam o banco.',
    how: 'Um líder ou oficial junta itens e prata dos membros com a promessa de redistribuir em regear ou montar uma reserva. Quando o banco está cheio, ele leva tudo e sai da guilda. Há casos famosos de bancos com mais de 1 bilhão de prata esvaziados por alguém que passou meses ganhando confiança.',
    signs: [
      'Pedido para depositar itens no banco sem regra escrita de regear.',
      'Poucas pessoas com acesso total ao banco.',
      'Liderança nova que cobra depósitos logo de início.',
    ],
    protect: [
      'Regear sério tem regra pública (o que cobre, como provar a morte) e quem paga é a guilda, não você.',
      'Não deposite mais do que aceita perder.',
      'Se você lidera, limite o acesso ao banco por cargo.',
    ],
  },
  {
    id: 'escolta-emboscada',
    title: 'Escolta paga que leva para emboscada',
    summary: 'Alguém oferece escoltar o seu transporte por uma taxa e guia você direto para o grupo que vai matar você.',
    how: 'Você precisa atravessar zona vermelha ou preta com carga cara. Um "escolta" se oferece, cobra adiantado e escolhe a rota. No meio do caminho o grupo de gank aparece exatamente onde ele levou você, e o escolta "não consegue ajudar".',
    signs: [
      'Insistência em escolher a rota e o horário.',
      'Pagamento adiantado.',
      'Escolta que não é da sua guilda nem de alguém que você conhece.',
    ],
    protect: [
      'Transporte caro: divida em viagens menores ou vá com a sua guilda.',
      'Nunca conte a ninguém de fora o que está levando.',
      'Use a página "Quanto vale arriscar" para saber o que você pode perder antes de sair.',
    ],
  },
  {
    id: 'duplicacao',
    title: '"Duplicação de item" ou "bug de prata"',
    summary: 'Prometem duplicar o seu item ou prata se você entregar o original primeiro.',
    how: 'O golpista diz que conhece um bug: você entrega o item (ou deposita a prata), ele faz "o truque" e devolve em dobro. Não existe truque; ele fica com o que você entregou. Mesmo se existisse, usar bug rende banimento.',
    signs: [
      '"Me dá que eu devolvo em dobro."',
      'Pedido de segredo ("não conta para ninguém senão corrigem").',
      'Prova em vídeo ou print que você não consegue conferir.',
    ],
    protect: [
      'Ninguém duplica item no Albion. Ignore e siga.',
      'Explorar bug viola os Termos e pode banir a sua conta.',
    ],
  },
  {
    id: 'rmt',
    title: 'Venda de prata ou ouro fora do jogo',
    summary: 'Site ou pessoa vende prata, ouro ou itens por dinheiro real: é proibido e, muitas vezes, golpe duplo.',
    how: 'Oferecem prata barata por Pix ou cartão. Ou você paga e não recebe, ou recebe prata que veio de conta roubada e a SBI tira de volta e bane a sua conta. Alguns pedem login e senha para "entregar mais rápido". Também circulam golpes de "criptomoeda do Albion".',
    signs: [
      'Preço muito abaixo do ouro oficial.',
      'Pedido de login, senha ou código de verificação.',
      'Contato por mensagem privada, site desconhecido ou "moeda" que promete valer no jogo.',
    ],
    protect: [
      'Ouro só na loja oficial do jogo ou trocado por prata dentro do próprio jogo.',
      'Comprar prata fora do jogo (RMT) viola os Termos e pode banir a conta.',
      'Não existe criptomoeda oficial do Albion.',
    ],
  },
  {
    id: 'link-falso',
    title: 'Link falso de sorteio, Discord ou "aviso de banimento"',
    summary: 'Mensagem com link para "ganhar ouro", "entrar no sorteio" ou "evitar banimento" que rouba a sua conta.',
    how: 'Chega uma mensagem no jogo, no Discord ou no fórum: "você ganhou um sorteio", "sua conta será banida, confirme aqui", "novo servidor do Discord da guilda". O link leva a uma página igual à de login do Albion ou do Discord, ou baixa um arquivo que instala um programa malicioso.',
    signs: [
      'Urgência e medo ("sua conta será banida em 24 horas").',
      'Endereço do site com letras trocadas ou domínio estranho.',
      'Arquivo para baixar (PDF, .exe, .zip) "com as instruções".',
    ],
    protect: [
      'Entre no site oficial digitando o endereço você mesmo, nunca pelo link.',
      'Ative a verificação em duas etapas no Albion e no Discord.',
      'Desconfie de sorteio que você não lembra de ter entrado.',
    ],
  },
  {
    id: 'conta-compartilhada',
    title: 'Conta compartilhada',
    summary: 'Você empresta a conta para alguém "upar" ou "farmar" e perde os itens, a prata ou a própria conta.',
    how: 'Um amigo ou um "booster" pede o login para fazer fama, coletar ou lutar por você. Com o acesso, ele vende os seus itens, transfere a prata ou troca o e-mail e a senha. Compartilhar conta também é contra os Termos.',
    signs: [
      'Oferta de "upar" a sua conta, de graça ou paga.',
      'Pedido de login, senha ou código de verificação.',
    ],
    protect: [
      'Nunca passe login, senha ou código de verificação, nem para amigo.',
      'Se já passou, troque a senha e ative a verificação em duas etapas agora.',
    ],
  },
  {
    id: 'duelo-apostado',
    title: 'Duelo apostado que não é pago',
    summary: 'Desafiam você para um duelo valendo prata ou itens e, se você ganha, não pagam; se perde, cobram.',
    how: 'A aposta é só de palavra: o jogo não guarda o prêmio. Se o golpista perde, some. Variante: pedem para você duelar "pelado" (sem equipamento) e o amigo dele aparece para pegar o que você deixou no chão ou no inventário.',
    signs: [
      'Aposta sem garantia.',
      'Pedido para tirar o equipamento ou ir a um lugar isolado.',
    ],
    protect: [
      'Considere que a aposta não existe: duele só pela diversão.',
      'Nunca deixe itens no chão ou numa bolsa à vista durante um desafio.',
    ],
  },
];

/** O que a página diz sobre denúncia: honesto sobre o que a SBI faz e não faz. */
export const SCAM_REPORT_NOTE =
  'A moderação do jogo já disse no fórum oficial que não pune golpe em troca voluntária. Fingir ser outro jogador ' +
  'é tratado à parte: se alguém se passou por você ou por um amigo, junte prints com data e o nome exato e abra um ' +
  'chamado no suporte oficial. A melhor defesa continua sendo não entregar nada antes de receber.';
