<script lang="ts">
  // Saúde do dado: quão frescos estão os preços do AODP em cada cidade, numa cesta fixa de itens populares.
  import type { DataHealthResponse } from '../../shared/types';
  import { go } from '../lib/router';
  import { api } from '../lib/api';
  import { citySlug, fmtAge, fmtInt } from '../lib/format';
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
      error = e instanceof Error ? e.message : 'Erro desconhecido.';
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

<svelte:head><title>Saúde do dado · Guarita</title></svelte:head>

<section class="page">
  <h1>Saúde do dado</h1>
  <p class="muted" style="margin-top:0">Quão recentes estão os preços de cada cidade agora, para saber quando confiar no que a Guarita mostra.</p>

  {#if error && !health}
    <ErrorBox message={error} onretry={load} />
  {:else if error}
    <p class="callout warn small">Não deu para atualizar agora ({error}); mostrando a última leitura.
      <button type="button" class="linkbtn" onclick={load} disabled={loading}>Tentar de novo</button></p>
  {/if}

  {#if health}
    {#if allEmpty}
      <p class="empty">O AODP não devolveu preço para nenhum item da cesta agora. Tente de novo em alguns minutos.</p>
    {:else}
      <div class="callout {lacking.length ? 'warn' : 'good'}">
        <strong>Onde falta scan agora</strong>
        <p class="small">
          {#if lacking.length}
            {joinPt(lacking)}: os preços dessas cidades estão mais velhos ou faltando. Desconfie do valor mostrado e confira no jogo.
          {:else}
            Todas as cidades têm preços recentes na cesta. Bom momento para confiar nos números.
          {/if}
        </p>
      </div>

      <div class="table-wrap" style="margin-top:16px">
        <table class="data health">
          <caption class="sr-only">Idade dos preços por cidade, cesta de {health.basket} itens populares, qualidade normal</caption>
          <thead>
            <tr>
              <th scope="col">Cidade</th>
              <th scope="col">Idade típica</th>
              <th scope="col">Frescos (até 1 h)</th>
              <th scope="col">Velhos (mais de 24 h)</th>
              <th scope="col">Sem preço</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as c (c.city)}
              {@const tone = cityTone(c, health.basket)}
              <tr>
                <th scope="row">
                  <span class="row" style="gap:8px;flex-wrap:nowrap">
                    <span class="dot {tone}" aria-hidden="true"></span>
                    <span class="city-name city-{citySlug(c.city)}">{c.city}{#if c.city === 'Black Market'}<sup>*</sup>{/if}</span>
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
      <p class="small muted">
        Cesta de {health.basket} itens populares (bolsas, capas, recursos refinados T4 a T6, armas e armaduras comuns), qualidade normal.
        "Idade típica" é a mediana da idade do menor preço de venda. Medido <TimeAgo iso={health.fetchedAt} />; atualiza a cada 30 minutos.
      </p>
      <p class="small muted"><sup>*</sup> O Black Market só compra: lá vale a data da melhor ordem de compra e só os equipamentos da cesta, porque ele não compra recursos refinados.</p>
      <p class="small">
        <span class="row" style="gap:6px;display:inline-flex"><span class="dot good" aria-hidden="true"></span>frescos</span> ·
        <span class="row" style="gap:6px;display:inline-flex"><span class="dot warn" aria-hidden="true"></span>algumas horas</span> ·
        <span class="row" style="gap:6px;display:inline-flex"><span class="dot bad" aria-hidden="true"></span>faltam scans</span>
      </p>
    {/if}
  {:else if !error}
    <Loading lines={6} label="Medindo a idade dos preços" />
  {/if}

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
    para pegar os preços que aparecem no mercado. É a única coisa desse tipo que a Guarita menciona. A Sandbox
    Interactive disse em 2017 que ferramentas que só leem o tráfego para análise são aceitas ("enquanto você só olha e
    analisa"); a citação e a fonte estão em <a href="/permitido" onclick={go}>Isso é permitido?</a>. A decisão de
    instalar é sua. A Guarita em si não lê o tráfego do jogo e continua funcionando sem o cliente.
  </p>
  <p><a class="btn" href="https://www.albion-online-data.com/" target="_blank" rel="noopener noreferrer">Site do Albion Online Data Project</a></p>
  <p class="small muted">Baixe só pelo site oficial do projeto e leia lá como o cliente funciona. O cliente é do projeto, não da Guarita.</p>
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
