<script lang="ts">
  // /status: transparência de custos e saúde. Quanto custa manter a Guarita (R$ 0/mês no plano grátis da Cloudflare),
  // os limites que importam e o que acontece se estourar, de onde vem cada dado, o que custaria evoluir ("planos") e a
  // saúde ao vivo, de /api/health (Worker e motor de alertas) e /api/data-health (preços, o mesmo dado da /saude).
  // Dados fixos e leitura do health em src/lib/institucional/status.ts (testados em tests/institucional.test.ts).
  import type { DataHealthResponse } from '../../shared/types';
  import { go } from '../lib/router';
  import { api } from '../lib/api';
  import { cityName, fmtAge } from '../lib/format';
  import { cityTone, cityToneLabel, sortHealth } from '../lib/gold/view';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  import { scrollFocus } from '../lib/ui/scrollFocus';
  import { fetchHealth, fontes, limites, planos, tomMotor, type SaudeView, type Tom } from '../lib/institucional/status';
  import Loading from '../lib/ui/Loading.svelte';
  import TimeAgo from '../lib/ui/TimeAgo.svelte';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  // Título no <svelte:head> abaixo; o worker/seo.ts precisa ganhar /status em FIXED_ROUTES e FIXED_ES com o mesmo texto.

  const LIMITES = $derived(limites(getLocale()));
  const FONTES = $derived(fontes(getLocale()));
  const PLANOS = $derived(planos(getLocale()));
  // Real escrito como o jogador brasileiro e o hispano leem (o Intl em es-419 mostraria "BRL 0").
  const zero = 'R$ 0';

  // ---------- saúde ao vivo ----------
  let saude = $state<SaudeView | null>(null);
  let dados = $state<DataHealthResponse | null>(null);
  let dadosErro = $state(false);
  let conferidoEm = $state<string | null>(null);
  let now = $state(Date.now());

  async function carregar() {
    const [s, d] = await Promise.allSettled([fetchHealth(), api.dataHealth()]);
    saude = s.status === 'fulfilled' ? s.value : { api: false, motor: false, ultimoCron: null, trabalho: null, erroNoCron: false };
    if (d.status === 'fulfilled') {
      dados = d.value;
      dadosErro = false;
    } else {
      dadosErro = true;
    }
    now = Date.now();
    conferidoEm = new Date(now).toISOString();
  }
  $effect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
  });

  const tomApi = $derived<Tom>(saude?.api ? 'good' : 'bad');
  const tomCron = $derived<Tom>(saude ? tomMotor(saude, now) : 'warn');
  const cidades = $derived(dados ? sortHealth(dados.cities) : []);
  const boas = $derived(dados ? cidades.filter((c) => cityTone(c, dados!.basket) === 'good').length : 0);
  const tomPrecos = $derived<Tom>(!dados ? (dadosErro ? 'bad' : 'warn') : boas >= Math.ceil(cidades.length / 2) ? 'good' : boas > 0 ? 'warn' : 'bad');

  function trabalhoTexto(t: SaudeView['trabalho']): string {
    if (t === 'alerts') return tx('alertas', 'alertas');
    if (t === 'killboard') return tx('killboard', 'killboard');
    if (t === 'both') return tx('alertas e killboard', 'alertas y killboard');
    return '';
  }
</script>

<svelte:head><title>{tx('Status e custos · Guarita', 'Estado y costos · Guarita')}</title></svelte:head>

<section class="page stack" style="max-width:860px">
  <header>
    <h1>{tx('Status e custos', 'Estado y costos')}</h1>
    <p class="lead">{tx(
      'Quanto custa manter a Guarita no ar, os limites do plano grátis em que ela roda, de onde vem cada dado e se tudo está funcionando agora.',
      'Cuánto cuesta mantener la Guarita en línea, los límites del plan gratuito en el que funciona, de dónde viene cada dato y si todo funciona ahora.',
    )}</p>
  </header>

  <section class="card stack" aria-labelledby="st-agora">
    <div class="section-head" style="margin:0">
      <h2 class="first" id="st-agora">{tx('Agora', 'Ahora')}</h2>
      {#if conferidoEm}<span class="small muted"><TimeAgo iso={conferidoEm} prefix={tx('conferido ', 'revisado ')} /></span>{/if}
    </div>
    {#if saude}
      <ul class="saude" aria-live="polite">
        <li>
          <span class="dot {tomApi}" aria-hidden="true"></span>
          <div>
            <strong>{tx('Site, API e bot', 'Sitio, API y bot')}</strong>
            <span class="small muted">{saude.api ? tx('Respondendo.', 'Respondiendo.') : tx('Sem resposta agora. Pode ser o limite diário do plano grátis ou uma falha passageira.', 'Sin respuesta ahora. Puede ser el límite diario del plan gratuito o una falla pasajera.')}</span>
          </div>
        </li>
        <li>
          <span class="dot {tomCron}" aria-hidden="true"></span>
          <div>
            <strong>{tx('Motor de alertas e killboard', 'Motor de alertas y killboard')}</strong>
            <span class="small muted">
              {#if !saude.motor}
                {tx('Sem resposta agora: alertas e coleta do killboard podem atrasar.', 'Sin respuesta ahora: las alertas y la recopilación del killboard pueden retrasarse.')}
              {:else if saude.ultimoCron}
                {tx('Última rodada', 'Última ejecución')} <TimeAgo iso={saude.ultimoCron} />{#if saude.trabalho} ({trabalhoTexto(saude.trabalho)}){/if}.
                {tx('Roda a cada 5 minutos.', 'Se ejecuta cada 5 minutos.')}
                {#if saude.erroNoCron}{tx('A última rodada teve um erro; a próxima tenta de novo.', 'La última ejecución tuvo un error; la próxima lo intenta de nuevo.')}{/if}
              {:else}
                {tx('Ainda sem registro de rodada.', 'Todavía sin registro de ejecución.')}
              {/if}
            </span>
          </div>
        </li>
        <li>
          <span class="dot {tomPrecos}" aria-hidden="true"></span>
          <div>
            <strong>{tx('Preços (AODP)', 'Precios (AODP)')}</strong>
            <span class="small muted">
              {#if dados}
                {tx(`${boas} de ${cidades.length} cidades com preços frescos.`, `${boas} de ${cidades.length} ciudades con precios recientes.`)}
                <a href={href('/saude')} onclick={go}>{tx('Ver cidade por cidade', 'Ver ciudad por ciudad')}</a>
              {:else if dadosErro}
                {tx('Não deu para medir agora.', 'No se pudo medir ahora.')}
              {:else}
                {tx('Medindo…', 'Midiendo…')}
              {/if}
            </span>
          </div>
        </li>
      </ul>
      {#if dados}
        <ul class="cidades small" aria-label={tx('Idade típica dos preços por cidade', 'Antigüedad típica de los precios por ciudad')}>
          {#each cidades as c (c.city)}
            {@const tom = cityTone(c, dados.basket)}
            <li><span class="dot {tom}" aria-hidden="true"></span><span>{cityName(c.city)}</span>
              <span class="muted num">{c.medianAgeMin === null ? '—' : fmtAge(c.medianAgeMin)}</span><span class="sr-only">: {cityToneLabel(tom)}</span></li>
          {/each}
        </ul>
      {/if}
    {:else}
      <Loading lines={3} label={tx('Conferindo se está tudo no ar', 'Revisando si todo está en línea')} />
    {/if}
  </section>

  <section class="stack" aria-labelledby="st-custo">
    <h2 class="first" id="st-custo">{tx('Quanto custa', 'Cuánto cuesta')}</h2>
    <div class="card custo">
      <div>
        <div class="kpi-label">{tx('Custo atual', 'Costo actual')}</div>
        <div class="kpi num">{zero}<span class="small muted"> / {tx('mês', 'mes')}</span></div>
      </div>
      <p>{tx(
        'A Guarita roda inteira no plano grátis da Cloudflare: o site (Pages), a API e o bot do Discord (Workers) e o banco dos alertas e do killboard (Durable Objects). Não há servidor alugado nem domínio pago.',
        'La Guarita funciona entera en el plan gratuito de Cloudflare: el sitio (Pages), la API y el bot de Discord (Workers) y la base de las alertas y del killboard (Durable Objects). No hay servidor alquilado ni dominio de pago.',
      )}</p>
    </div>

    <h3>{tx('Os limites do plano grátis que importam', 'Los límites del plan gratuito que importan')}</h3>
    <div class="table-wrap" use:scrollFocus>
      <table class="data">
        <caption class="sr-only">{tx('Limites do plano grátis da Cloudflare usados pela Guarita', 'Límites del plan gratuito de Cloudflare que usa la Guarita')}</caption>
        <thead>
          <tr>
            <th scope="col">{tx('Limite', 'Límite')}</th>
            <th scope="col">{tx('Valor', 'Valor')}</th>
            <th scope="col">{tx('O que significa', 'Qué significa')}</th>
          </tr>
        </thead>
        <tbody>
          {#each LIMITES as l (l.nome)}
            <tr>
              <th scope="row">{l.nome}</th>
              <td class="num nowrap">{l.valor}</td>
              <td class="small">{l.nota}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="callout warn stack">
      <strong>{tx('E se estourar?', '¿Y si se supera?')}</strong>
      <p>{tx(
        'A parte que passou do limite para até o contador zerar, à meia-noite UTC (21h de Brasília): a API, o bot e os alertas podem ficar fora por algumas horas, e o site pode não abrir nesse intervalo. No plano grátis nada é cobrado: passar para um plano pago só acontece por decisão do mantenedor, e esta página avisa antes.',
        'La parte que superó el límite se detiene hasta que el contador vuelva a cero, a la medianoche UTC (21 h de Brasilia): la API, el bot y las alertas pueden quedar fuera de servicio algunas horas, y el sitio puede no abrir en ese intervalo. En el plan gratuito no se cobra nada: pasar a un plan de pago solo ocurre por decisión de quien mantiene el proyecto, y esta página lo avisa antes.',
      )}</p>
    </div>
  </section>

  <section class="stack" aria-labelledby="st-fontes">
    <h2 class="first" id="st-fontes">{tx('De onde vem cada dado', 'De dónde viene cada dato')}</h2>
    <div class="grid">
      {#each FONTES as f (f.url)}
        <div class="card fonte">
          <strong>{f.dado}</strong>
          <a href={f.url} target="_blank" rel="noopener noreferrer">{f.fonte}</a>
          <span class="small muted">{f.nota}</span>
        </div>
      {/each}
    </div>
    <p class="small muted">
      {tx(
        'Tudo vem de fontes públicas, fora do jogo. Nada lê o cliente do Albion nem envia nada ao servidor do jogo.',
        'Todo viene de fuentes públicas, fuera del juego. Nada lee el cliente de Albion ni envía nada al servidor del juego.',
      )}
      <a href={href('/permitido')} onclick={go}>{tx('Isso é permitido?', '¿Esto está permitido?')}</a>
    </p>
  </section>

  <section class="stack" aria-labelledby="st-planos">
    <h2 class="first" id="st-planos">{tx('Planos: o que custaria evoluir', 'Planes: lo que costaría crecer')}</h2>
    <p class="muted">{tx(
      'Nenhum destes está contratado. São as opções, com o preço, caso a Guarita precise de mais do que o plano grátis dá.',
      'Ninguno de estos está contratado. Son las opciones, con su precio, por si la Guarita necesita más de lo que da el plan gratuito.',
    )}</p>
    <div class="grid">
      {#each PLANOS as p (p.titulo)}
        <div class="card plano">
          <strong>{p.titulo}</strong>
          <span class="tag info">{p.custo}</span>
          <span class="small muted">{p.ganho}</span>
        </div>
      {/each}
    </div>
    <p class="small">
      {tx('Quer ajudar a pagar quando for a hora?', '¿Quieres ayudar a pagar cuando llegue el momento?')}
      <a href={href('/apoie')} onclick={go}>{tx('Veja como apoiar', 'Mira cómo apoyar')}</a>
    </p>
  </section>
</section>

<style>
  header p { margin: 0; }
  .lead { font-size: 18px; }
  h2.first { margin: 0; }
  h3 { margin: 8px 0 0; font-size: 17px; }
  .stack > p { margin: 0; }
  .callout p { margin: 0; }
  .saude { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .saude li { display: flex; gap: 10px; align-items: flex-start; }
  .saude li > div { display: grid; gap: 2px; }
  .saude .dot { margin-top: 6px; flex: none; }
  .cidades { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .cidades li { display: inline-flex; gap: 6px; align-items: center; }
  .custo { display: grid; gap: 12px; }
  .custo p { margin: 0; }
  .kpi { font-size: 32px; font-weight: 800; line-height: 1.1; }
  .nowrap { white-space: nowrap; }
  .fonte, .plano { display: grid; gap: 6px; align-content: start; justify-items: start; }
  .fonte a { overflow-wrap: anywhere; }
</style>
