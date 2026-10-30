<script lang="ts">
  // Flips para o Black Market: comprar na cidade (sell order) e vender na hora para a ordem de compra do BM.
  import type { Flip } from '../../../shared/types';
  import { citySlug, flipIsStale, flipView, fmtPct, sortFlips } from '../format';
  import Money from './Money.svelte';
  import AgeDot from './AgeDot.svelte';

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
    <span class="small muted" id="{uid}-p">Você tem Premium?</span>
    <div class="seg" role="group" aria-labelledby="{uid}-p">
      <button type="button" aria-pressed={premium} onclick={() => setPremium(true)}>Sim (imposto 4%)</button>
      <button type="button" aria-pressed={!premium} onclick={() => setPremium(false)}>Não (imposto 8%)</button>
    </div>
  </div>

  {#if !rows.length}
    <p class="empty">Nenhum flip para o Black Market agora: ou o Black Market não compra este item, ou falta preço recente.</p>
  {:else}
    {#if anyStale}
      <p class="callout warn small" style="margin:0">Algum preço tem mais de 30 minutos. O Black Market muda rápido; confira no jogo antes de comprar.</p>
    {/if}
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th scope="col">Comprar em</th>
            <th scope="col" class="num">Custo</th>
            <th scope="col" class="num">BM paga</th>
            <th scope="col" class="num">Lucro</th>
            <th scope="col" class="num">ROI</th>
            <th scope="col">Idade</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as f (f.from)}
            {@const v = flipView(f, premium)}
            <tr>
              <th scope="row"><span class="city-name city-{citySlug(f.from)}">{f.from}</span></th>
              <td class="num"><Money value={f.buyAt} /></td>
              <td class="num"><Money value={f.sellAt} /></td>
              <td class="num" class:good-text={v.profit > 0} class:bad-text={v.profit < 0}><strong><Money value={v.profit} /></strong></td>
              <td class="num">{fmtPct(v.roi)}</td>
              <td>
                <AgeDot min={f.ageMin} />
                {#if flipIsStale(f)}<span class="warn-text small" title="O Black Market muda rápido; confira no jogo"> · confira no jogo</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="small muted" style="margin:0">O lucro já desconta o imposto de venda. Vender direto para a ordem de compra não paga a taxa de anúncio (2,5%). Não conta transporte nem o risco da viagem até Caerleon.</p>
  {/if}
</div>
