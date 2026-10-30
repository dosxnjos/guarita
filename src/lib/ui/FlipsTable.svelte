<script lang="ts">
  // Flips para o Black Market: comprar na cidade (sell order) e vender na hora para a ordem de compra do BM.
  import type { Flip } from '../../../shared/types';
  import { cityName, citySlug, flipIsStale, flipView, fmtPct, sortFlips } from '../format';
  import { getLocale, tx } from '../i18n/index.svelte';
  import Money from './Money.svelte';
  import AgeDot from './AgeDot.svelte';
  import { scrollFocus } from './scrollFocus';

  let { flips }: { flips: Flip[] } = $props();

  const KEY = 'guarita.premium';
  let premium = $state(readPremium());
  function readPremium(): boolean {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch {
      return true;
    }
  }
  function setPremium(v: boolean) {
    premium = v;
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }
  const rows = $derived(sortFlips(flips, premium));
  const anyStale = $derived(rows.some(flipIsStale));
  const uid = 'fl-' + Math.random().toString(36).slice(2, 9);
</script>

<div class="stack">
  <div class="row">
    <span class="small muted" id="{uid}-p">{tx('Você tem Premium?', '¿Tienes Premium?')}</span>
    <div class="seg" role="group" aria-labelledby="{uid}-p">
      <button type="button" aria-pressed={premium} onclick={() => setPremium(true)}>{tx('Sim (imposto 4%)', 'Sí (impuesto 4%)')}</button>
      <button type="button" aria-pressed={!premium} onclick={() => setPremium(false)}>{tx('Não (imposto 8%)', 'No (impuesto 8%)')}</button>
    </div>
  </div>

  {#if !rows.length}
    <p class="empty">{tx(
      'Nenhum flip para o Black Market agora: ou o Black Market não compra este item, ou falta preço recente.',
      'No hay reventa al Mercado Negro ahora: o el Mercado Negro no compra este objeto, o falta un precio reciente.',
    )}</p>
  {:else}
    {#if anyStale}
      <p class="callout warn small" style="margin:0">{tx(
        'Algum preço tem mais de 30 minutos. O Black Market muda rápido; confira no jogo antes de comprar.',
        'Algún precio tiene más de 30 minutos. El Mercado Negro cambia rápido; compruébalo en el juego antes de comprar.',
      )}</p>
    {/if}
    <div class="table-wrap" use:scrollFocus={tx('Tabela de flips para o Black Market', 'Tabla de reventa al Mercado Negro')}>
      <table class="data">
        <thead>
          <tr>
            <th scope="col">{tx('Comprar em', 'Comprar en')}</th>
            <th scope="col" class="num">{tx('Custo', 'Costo')}</th>
            <th scope="col" class="num">{tx('BM paga', 'Mercado Negro paga')}</th>
            <th scope="col" class="num">{tx('Lucro', 'Ganancia')}</th>
            <th scope="col" class="num">ROI</th>
            <th scope="col">{tx('Idade', 'Antigüedad')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as f (f.from)}
            {@const v = flipView(f, premium)}
            <tr>
              <th scope="row"><span class="city-name city-{citySlug(f.from)}">{cityName(f.from, getLocale())}</span></th>
              <td class="num"><Money value={f.buyAt} /></td>
              <td class="num"><Money value={f.sellAt} /></td>
              <td class="num" class:good-text={v.profit > 0} class:bad-text={v.profit < 0}><strong><Money value={v.profit} /></strong></td>
              <td class="num">{fmtPct(v.roi, false, getLocale())}</td>
              <td>
                <AgeDot min={f.ageMin} />
                {#if flipIsStale(f)}<span class="warn-text small" title={tx('O Black Market muda rápido; confira no jogo', 'El Mercado Negro cambia rápido; compruébalo en el juego')}>{tx(' · confira no jogo', ' · compruébalo en el juego')}</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="small muted" style="margin:0">{tx(
      'O lucro já desconta o imposto de venda. Vender direto para a ordem de compra não paga a taxa de anúncio (2,5%). Não conta transporte nem o risco da viagem até Caerleon.',
      'La ganancia ya descuenta el impuesto de venta. Vender directo a la orden de compra no paga la cuota de preparación (2.5%). No incluye el transporte ni el riesgo del viaje hasta Caerleon.',
    )}</p>
  {/if}
</div>
