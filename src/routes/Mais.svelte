<script lang="ts">
  import { go } from '../lib/router';

  $effect(() => {
    document.title = 'Tudo o que a Guarita faz · Guarita';
  });

  const GROUPS: { title: string; items: [href: string, label: string, desc: string][] }[] = [
    {
      title: 'Mercado e economia',
      items: [
        ['/', 'Preço de item', 'Preço por cidade com idade, selo de confiança, veredito e flip para o Black Market.'],
        ['/perdas', 'Perdas PvP', 'O que a guerra consome: os itens mais perdidos nas mortes e quanto valem.'],
        ['/hoje', 'O que fazer hoje', 'Com a sua prata e o seu tempo: flip, refino e transporte com a conta aberta e o risco.'],
        ['/previsao', 'Previsão de preço', 'Preço dos próximos dias com faixa de incerteza e o acerto do modelo publicado.'],
        ['/ouro', 'Ouro e Premium', 'Cotação do ouro, se está barato agora e se o Premium compensa.'],
        ['/saude', 'Saúde do dado', 'Quão frescos estão os preços de cada cidade agora.'],
      ],
    },
    {
      title: 'Jogadores e guildas',
      items: [
        ['/jogador', 'Dossiê', 'Histórico público de um jogador pelo nome: perigo, armas, kills e mortes.'],
        ['/guilda', 'Guilda', 'Resumo de uma guilda: kills, mortes, quem mais mata e em que horário.'],
      ],
    },
    {
      title: 'Para quem está começando',
      items: [
        ['/arriscar', 'Quanto vale arriscar', 'Monte o set e veja quanto perde em cada tipo de zona.'],
        ['/golpes', 'Golpes comuns', 'Os golpes mais usados no jogo e como não cair neles.'],
        ['/glossario', 'Glossário', 'Gírias e termos do Albion em português e inglês.'],
      ],
    },
    {
      title: 'Avisos e ferramentas',
      items: [
        ['/alertas', 'Alertas de preço', 'Aviso no celular ou no Discord quando o preço chegar onde você quer.'],
        ['/despertador', 'Despertador da ilha', 'Lembrete de colheita, animais e foco cheio.'],
        ['/relogio', 'Relógio do Americas', 'Servidor, bônus do dia, festividades e temporada em horário de Brasília.'],
        ['/app', 'App para PC', 'A Guarita no Windows: janelas ao lado do jogo, voz, atalhos e avisos, só com o app aberto.'],
        ['/extensao', 'Extensão de navegador', 'Nome em português e preço ao passar o mouse nos itens da wiki, do killboard e de outros sites.'],
        ['/janela', 'Janela flutuante', 'Painel pequeno que fica por cima do jogo (desligado por padrão).'],
        ['/live', 'Painel de live', 'Relógio, preços e histórico da guilda por cima da transmissão no OBS.'],
        ['/mcp', 'Guarita no Claude (MCP)', 'Pergunte preço e dossiê em linguagem natural pelo seu assistente de IA.'],
      ],
    },
  ];
</script>

<section class="page">
  <h1>Tudo o que a Guarita faz</h1>
  {#each GROUPS as g (g.title)}
    <h2>{g.title}</h2>
    <div class="grid">
      {#each g.items as [href, label, desc] (href)}
        <a class="card tool" {href} onclick={go}>
          <strong>{label}</strong>
          <span class="muted small">{desc}</span>
        </a>
      {/each}
    </div>
  {/each}
</section>

<style>
  .tool { display: grid; gap: 4px; text-decoration: none; color: var(--ink); }
  .tool:hover { border-color: var(--accent); }
</style>
