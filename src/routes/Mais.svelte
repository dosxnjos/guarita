<script lang="ts">
  import { go } from '../lib/router';
  import { href, tx } from '../lib/i18n/index.svelte';

  // Mesmo título que o _worker.js injeta (worker/seo.ts, FIXED_ROUTES e FIXED_ES).
  $effect(() => {
    document.title = tx('Tudo o que a Guarita faz · Guarita', 'Todo lo que hace la Guarita · Guarita');
  });

  // Caminho base (sem /es); o link sai com href() na língua atual.
  const GROUPS = $derived<{ title: string; items: [path: string, label: string, desc: string][] }[]>([
    {
      title: tx('Mercado e economia', 'Mercado y economía'),
      items: [
        ['/', tx('Preço de item', 'Precio de objeto'), tx('Preço por cidade com idade, selo de confiança, veredito e flip para o Black Market.', 'Precio por ciudad con antigüedad, sello de confianza, veredicto y reventa al Mercado Negro.')],
        ['/perdas', tx('Perdas PvP', 'Pérdidas PvP'), tx('O que a guerra consome: os itens mais perdidos nas mortes e quanto valem.', 'Lo que consume la guerra: los objetos que más se pierden en las muertes y cuánto valen.')],
        ['/hoje', tx('O que fazer hoje', 'Qué hacer hoy'), tx('Com a sua prata e o seu tempo: flip, refino e transporte com a conta aberta e o risco.', 'Con tu plata y tu tiempo: reventa, refinado y transporte con el cálculo a la vista y el riesgo.')],
        ['/previsao', tx('Previsão de preço', 'Previsión de precios'), tx('Preço dos próximos dias com faixa de incerteza e o acerto do modelo publicado.', 'Precio de los próximos días con rango de incertidumbre y el acierto del modelo publicado.')],
        ['/ouro', tx('Ouro e Premium', 'Oro y Premium'), tx('Cotação do ouro, se está barato agora e se o Premium compensa.', 'Cotización del oro, si está barato ahora y si el Premium vale la pena.')],
        ['/saude', tx('Saúde do dado', 'Salud de los datos'), tx('Quão frescos estão os preços de cada cidade agora.', 'Qué tan frescos están los precios de cada ciudad ahora.')],
        ['/status', tx('Status e custos', 'Estado y costos'), tx('Quanto custa manter a Guarita no ar, os limites do plano grátis e se tudo está funcionando agora.', 'Cuánto cuesta mantener la Guarita en línea, los límites del plan gratuito y si todo funciona ahora.')],
      ],
    },
    {
      title: tx('Jogadores e guildas', 'Jugadores y gremios'),
      items: [
        ['/jogador', tx('Dossiê', 'Dosier'), tx('Histórico público de um jogador pelo nome: perigo, armas, kills e mortes.', 'Historial público de un jugador por su nombre: peligro, armas, asesinatos y muertes.')],
        ['/guilda', tx('Guilda', 'Gremio'), tx('Resumo de uma guilda: kills, mortes, quem mais mata e em que horário.', 'Resumen de un gremio: asesinatos, muertes, quién mata más y a qué hora.')],
      ],
    },
    {
      title: tx('Para quem está começando', 'Para quien está empezando'),
      items: [
        ['/arriscar', tx('Quanto vale arriscar', 'Cuánto vale arriesgar'), tx('Monte o set e veja quanto perde em cada tipo de zona.', 'Arma tu set y mira cuánto pierdes en cada tipo de zona.')],
        ['/golpes', tx('Golpes comuns', 'Estafas comunes'), tx('Os golpes mais usados no jogo e como não cair neles.', 'Las estafas más usadas en el juego y cómo no caer en ellas.')],
        ['/glossario', tx('Glossário', 'Glosario'), tx('Gírias e termos do Albion em português e inglês.', 'Jerga y términos de Albion en español e inglés.')],
      ],
    },
    {
      title: tx('Avisos e ferramentas', 'Avisos y herramientas'),
      items: [
        ['/alertas', tx('Alertas de preço', 'Alertas de precio'), tx('Aviso no celular ou no Discord quando o preço chegar onde você quer.', 'Aviso en el celular o en Discord cuando el precio llegue a donde quieres.')],
        ['/despertador', tx('Despertador da ilha', 'Despertador de la isla'), tx('Lembrete de colheita, animais e foco cheio.', 'Recordatorio de cosecha, animales y foco lleno.')],
        ['/relogio', tx('Relógio do Americas', 'Reloj de Americas'), tx('Servidor, bônus do dia, festividades e temporada em horário de Brasília.', 'Servidor, bonificaciones del día, festividades y temporada en horario de Brasilia.')],
        ['/app', tx('App para PC', 'App para PC'), tx('A Guarita no Windows: janelas ao lado do jogo, voz, atalhos e avisos, só com o app aberto.', 'La Guarita en Windows: ventanas junto al juego, voz, atajos y avisos, solo con la app abierta.')],
        ['/extensao', tx('Extensão de navegador', 'Extensión de navegador'), tx('Nome em português e preço ao passar o mouse nos itens da wiki, do killboard e de outros sites.', 'Nombre en español y precio al pasar el mouse sobre los objetos en la wiki, el killboard y otros sitios.')],
        ['/janela', tx('Janela flutuante', 'Ventana flotante'), tx('Painel pequeno que fica por cima do jogo (desligado por padrão).', 'Panel pequeño que queda encima del juego (desactivado por defecto).')],
        ['/live', tx('Painel de live', 'Panel para directos'), tx('Relógio, preços e histórico da guilda por cima da transmissão no OBS.', 'Reloj, precios e historial del gremio encima de la transmisión en OBS.')],
        ['/mcp', tx('Guarita no Claude (MCP)', 'La Guarita en Claude (MCP)'), tx('Pergunte preço e dossiê em linguagem natural pelo seu assistente de IA.', 'Pregunta precios y dosieres en lenguaje natural desde tu asistente de IA.')],
      ],
    },
  ]);
</script>

<section class="page">
  <h1>{tx('Tudo o que a Guarita faz', 'Todo lo que hace la Guarita')}</h1>
  {#each GROUPS as g (g.title)}
    <h2>{g.title}</h2>
    <div class="grid">
      {#each g.items as [path, label, desc] (path)}
        <a class="card tool" href={href(path)} onclick={go}>
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
