<script lang="ts">
  // Saúde do dado: quão frescos estão os preços do AODP em cada cidade, numa cesta fixa de itens populares.
  import type { DataHealthResponse } from '../../shared/types';
  import { go } from '../lib/router';
  import { api } from '../lib/api';
  import { cityName, citySlug, fmtAge, fmtInt } from '../lib/format';
  import { getLocale, href, tx } from '../lib/i18n/index.svelte';
  import { scrollFocus } from '../lib/ui/scrollFocus';
  import Loading from '../lib/ui/Loading.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';
  import TimeAgo from '../lib/ui/TimeAgo.svelte';
  import { barPct, cityTone, cityToneLabel, joinPt, needsScan, sortHealth } from '../lib/gold/view';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  let health = $state<DataHealthResponse | null>(null);
  let error = $state('');
  let loading = $state(false);

  async function load() {
    loading = true;
    try {
      health = await api.dataHealth();
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : tx('Erro desconhecido.', 'Error desconocido.');
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  const rows = $derived(health ? sortHealth(health.cities) : []);
  const lacking = $derived(health ? needsScan(health.cities, health.basket) : []);
  const allEmpty = $derived(!!health && health.cities.every((c) => c.medianAgeMin === null));
</script>

<!-- Mesmo título de worker/seo.ts (FIXED_ROUTES e FIXED_ES). -->
<svelte:head><title>{tx('Saúde do dado · Guarita', 'Salud de los datos · Guarita')}</title></svelte:head>

<section class="page">
  <h1>{tx('Saúde do dado', 'Salud de los datos')}</h1>
  <p class="muted" style="margin-top:0">{tx(
    'Quão recentes estão os preços de cada cidade agora, para saber quando confiar no que a Guarita mostra.',
    'Qué tan recientes son ahora los precios de cada ciudad, para saber cuándo confiar en lo que muestra la Guarita.',
  )}</p>

  {#if error && !health}
    <ErrorBox message={error} onretry={load} />
  {:else if error}
    <p class="callout warn small">{tx(
      `Não deu para atualizar agora (${error}); mostrando a última leitura.`,
      `No se pudo actualizar ahora (${error}); se muestra la última lectura.`,
    )}
      <button type="button" class="linkbtn" onclick={load} disabled={loading}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
  {/if}

  {#if health}
    {#if allEmpty}
      <p class="empty">{tx(
        'O AODP não devolveu preço para nenhum item da cesta agora. Tente de novo em alguns minutos.',
        'El AODP no devolvió precio para ningún objeto de la canasta ahora. Inténtalo de nuevo en unos minutos.',
      )}</p>
    {:else}
      <div class="callout {lacking.length ? 'warn' : 'good'}">
        <strong>{tx('Onde falta scan agora', 'Dónde faltan escaneos ahora')}</strong>
        <p class="small">
          {#if lacking.length}
            {tx(
              `${joinPt(lacking)}: os preços dessas cidades estão mais velhos ou faltando. Desconfie do valor mostrado e confira no jogo.`,
              `${joinPt(lacking.map((c) => cityName(c)))}: los precios de esas ciudades son más antiguos o faltan. Desconfía del valor mostrado y compruébalo en el juego.`,
            )}
          {:else}
            {tx(
              'Todas as cidades têm preços recentes na cesta. Bom momento para confiar nos números.',
              'Todas las ciudades tienen precios recientes en la canasta. Buen momento para confiar en los números.',
            )}
          {/if}
        </p>
      </div>

      <div class="table-wrap" style="margin-top:16px" use:scrollFocus>
        <table class="data health">
          <caption class="sr-only">{tx(
            `Idade dos preços por cidade, cesta de ${health.basket} itens populares, qualidade normal`,
            `Antigüedad de los precios por ciudad, canasta de ${health.basket} objetos populares, calidad normal`,
          )}</caption>
          <thead>
            <tr>
              <th scope="col">{tx('Cidade', 'Ciudad')}</th>
              <th scope="col">{tx('Idade típica', 'Antigüedad típica')}</th>
              <th scope="col">{tx('Frescos (até 1 h)', 'Recientes (hasta 1 h)')}</th>
              <th scope="col">{tx('Velhos (mais de 24 h)', 'Antiguos (más de 24 h)')}</th>
              <th scope="col">{tx('Sem preço', 'Sin precio')}</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as c (c.city)}
              {@const tone = cityTone(c, health.basket)}
              <tr>
                <th scope="row">
                  <span class="row" style="gap:8px;flex-wrap:nowrap">
                    <span class="dot {tone}" aria-hidden="true"></span>
                    <span class="city-name city-{citySlug(c.city)}">{cityName(c.city)}{#if c.city === 'Black Market'}<sup>*</sup>{/if}</span>
                  </span>
                  <span class="sr-only">: {cityToneLabel(tone)}</span>
                </th>
                <td class="num">{c.medianAgeMin === null ? '—' : fmtAge(c.medianAgeMin)}</td>
                <td>
                  <span class="hbar-cell"><span class="num">{fmtInt(c.fresh1h)}</span><span class="hbar" aria-hidden="true"><span class="hbar-fill good" style="width:{barPct(c.fresh1h, health.basket)}%"></span></span></span>
                </td>
                <td>
                  <span class="hbar-cell"><span class="num">{fmtInt(c.stale24h)}</span><span class="hbar" aria-hidden="true"><span class="hbar-fill warn" style="width:{barPct(c.stale24h, health.basket)}%"></span></span></span>
                </td>
                <td>
                  <span class="hbar-cell"><span class="num">{fmtInt(c.missing)}</span><span class="hbar" aria-hidden="true"><span class="hbar-fill bad" style="width:{barPct(c.missing, health.basket)}%"></span></span></span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if getLocale() === 'es'}
        <p class="small muted">
          Canasta de {health.basket} objetos populares (bolsas, capas, recursos refinados T4 a T6, armas y armaduras comunes), calidad normal.
          "Antigüedad típica" es la mediana de la antigüedad del precio de venta más bajo. Medido <TimeAgo iso={health.fetchedAt} />; se actualiza cada 30 minutos.
        </p>
        <p class="small muted"><sup>*</sup> El Mercado Negro solo compra: ahí vale la fecha de la mejor orden de compra y solo el equipo de la canasta, porque no compra recursos refinados.</p>
      {:else}
        <p class="small muted">
          Cesta de {health.basket} itens populares (bolsas, capas, recursos refinados T4 a T6, armas e armaduras comuns), qualidade normal.
          "Idade típica" é a mediana da idade do menor preço de venda. Medido <TimeAgo iso={health.fetchedAt} />; atualiza a cada 30 minutos.
        </p>
        <p class="small muted"><sup>*</sup> O Black Market só compra: lá vale a data da melhor ordem de compra e só os equipamentos da cesta, porque ele não compra recursos refinados.</p>
      {/if}
      <p class="small">
        <span class="row" style="gap:6px;display:inline-flex"><span class="dot good" aria-hidden="true"></span>{tx('frescos', 'recientes')}</span> ·
        <span class="row" style="gap:6px;display:inline-flex"><span class="dot warn" aria-hidden="true"></span>{tx('algumas horas', 'unas horas')}</span> ·
        <span class="row" style="gap:6px;display:inline-flex"><span class="dot bad" aria-hidden="true"></span>{tx('faltam scans', 'faltan escaneos')}</span>
      </p>
    {/if}
  {:else if !error}
    <Loading lines={6} label={tx('Medindo a idade dos preços', 'Midiendo la antigüedad de los precios')} />
  {/if}

  {#if getLocale() === 'es'}
    <h2>De dónde viene el precio</h2>
    <p>
      Los precios de la Guarita vienen del <strong>Albion Online Data Project</strong>, un proyecto comunitario: los jugadores usan
      el cliente del proyecto mientras juegan y, cuando abren el mercado de una ciudad, los precios que aparecen van a una base
      de datos pública. Cuando nadie abre el mercado de una ciudad durante unas horas, el precio de esa ciudad envejece. La Guarita
      no lee tu juego y no instala nada: solo consulta esa base de datos pública.
    </p>
    <h2>Cómo ayudar</h2>
    <p>
      Si juegas en Americas, puedes usar el cliente del proyecto, que es gratuito y de código abierto. Cada vez que abres
      el mercado, los precios de esa ciudad quedan recientes para todos, también aquí.
    </p>
    <p>
      <strong>Conoce lo que hace antes de instalarlo:</strong> el cliente lee el tráfico de red del juego en tu computadora
      para tomar los precios que aparecen en el mercado. Sandbox
      Interactive dijo en 2017 que las herramientas que solo leen el tráfico para análisis se aceptan ("mientras solo mires y
      analices"); la cita y la fuente están en <a href={href('/permitido')} onclick={go}>¿Esto está permitido?</a>. La decisión de
      instalarlo es tuya. El sitio de la Guarita no lee el tráfico del juego y sigue funcionando sin el cliente.
    </p>
    <p><a class="btn" href="https://www.albion-online-data.com/" target="_blank" rel="noopener noreferrer">Sitio del Albion Online Data Project</a></p>
    <p class="small muted">Descárgalo solo desde el sitio oficial del proyecto y lee ahí cómo funciona el cliente. El cliente es del proyecto, no de la Guarita.</p>
  {:else}
    <h2>De onde vem o preço</h2>
    <p>
      Os preços da Guarita vêm do <strong>Albion Online Data Project</strong>, um projeto comunitário: jogadores rodam o
      cliente do projeto enquanto jogam e, quando abrem o mercado de uma cidade, os preços que aparecem vão para um banco
      público. Quando ninguém abre o mercado de uma cidade por algumas horas, o preço daquela cidade envelhece. A Guarita
      não lê o seu jogo e não instala nada: ela só consulta esse banco público.
    </p>
    <h2>Como ajudar</h2>
    <p>
      Se você joga no Americas, pode rodar o cliente do projeto, que é gratuito e de código aberto. Cada vez que você abre
      o mercado, os preços daquela cidade ficam frescos para todo mundo, inclusive aqui.
    </p>
    <p>
      <strong>Saiba o que ele faz antes de instalar:</strong> o cliente lê o tráfego de rede do jogo no seu computador
      para pegar os preços que aparecem no mercado. A Sandbox
      Interactive disse em 2017 que ferramentas que só leem o tráfego para análise são aceitas ("enquanto você só olha e
      analisa"); a citação e a fonte estão em <a href={href('/permitido')} onclick={go}>Isso é permitido?</a>. A decisão de
      instalar é sua. O site da Guarita não lê o tráfego do jogo e continua funcionando sem o cliente.
    </p>
    <p><a class="btn" href="https://www.albion-online-data.com/" target="_blank" rel="noopener noreferrer">Site do Albion Online Data Project</a></p>
    <p class="small muted">Baixe só pelo site oficial do projeto e leia lá como o cliente funciona. O cliente é do projeto, não da Guarita.</p>
  {/if}
</section>

<style>
  .hbar-cell { display: flex; align-items: center; gap: 8px; min-width: 88px; }
  .hbar-cell .num { min-width: 2ch; text-align: right; }
  .hbar { flex: 1; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; min-width: 40px; }
  .hbar-fill { display: block; height: 100%; border-radius: 4px; }
  .hbar-fill.good { background: var(--good); }
  .hbar-fill.warn { background: var(--warn); }
  .hbar-fill.bad { background: var(--bad); }
</style>
