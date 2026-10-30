<script lang="ts">
  // Livro de ofertas por cidade + calculadora "preço médio para N unidades" (api.bookFill).
  // side é o lado do livro consumido (como na API): 'sell' = você compra N das ofertas de venda;
  // 'buy' = você vende N para as ofertas de compra.
  import type { BookFillResponse, City, CityBook, Quality } from '../../../shared/types';
  import { api } from '../api';
  import { fmtInt } from '../format';
  import Money from './Money.svelte';

  let { id, quality, books, initialCity = null }: { id: string; quality: Quality; books: CityBook[]; initialCity?: City | null } = $props();

  const withLevels = $derived(books.filter((b) => b.sell.length || b.buy.length));
  let city = $state<City | ''>('');
  $effect(() => {
    if (!city || !withLevels.some((b) => b.city === city)) {
      city = (initialCity && withLevels.some((b) => b.city === initialCity) ? initialCity : withLevels[0]?.city) ?? '';
    }
  });
  const book = $derived(withLevels.find((b) => b.city === city) ?? null);
  const parts = $derived(
    book
      ? [
          { key: 'sell', title: 'Ofertas de venda (você compra)', levels: book.sell },
          { key: 'buy', title: 'Ofertas de compra (você vende)', levels: book.buy },
        ]
      : [],
  );

  let n = $state(10);
  let side = $state<'buy' | 'sell'>('sell');
  let result = $state<BookFillResponse | null>(null);
  let busy = $state(false);
  let err = $state('');
  const uid = 'bk-' + Math.random().toString(36).slice(2, 9);

  // Resultado antigo some quando os parâmetros mudam.
  $effect(() => {
    void [city, n, side, quality];
    result = null;
    err = '';
  });

  async function calc(e: SubmitEvent) {
    e.preventDefault();
    if (!city) return;
    const units = Math.floor(Number(n));
    if (!(units >= 1 && units <= 100000)) {
      err = 'Informe uma quantidade entre 1 e 100.000.';
      return;
    }
    busy = true;
    err = '';
    try {
      const r = await api.bookFill(id, city, side, units, quality);
      result = r;
    } catch (x) {
      err = x instanceof Error ? x.message : 'Não deu para calcular agora.';
    } finally {
      busy = false;
    }
  }
</script>

{#if !withLevels.length}
  <p class="empty">Ninguém escaneou o livro de ofertas deste item recentemente.</p>
{:else}
  <div class="stack">
    <div class="row">
      <label for="{uid}-city" class="small muted">Cidade</label>
      <select id="{uid}-city" class="input" style="width:auto" bind:value={city}>
        {#each withLevels as b}<option value={b.city}>{b.city}</option>{/each}
      </select>
    </div>

    <div class="grid">
      {#each parts as part (part.key)}
        <div>
          <h3 class="small" style="margin:0 0 6px">{part.title}</h3>
          {#if part.levels.length}
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th scope="col" class="num">Preço</th><th scope="col" class="num">Quantidade</th></tr></thead>
                <tbody>
                  {#each part.levels.slice(0, 8) as l}
                    <tr><td class="num"><Money value={l.price} /></td><td class="num">{fmtInt(l.amount)}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if part.levels.length > 8}<p class="small muted" style="margin:4px 0 0">+ {part.levels.length - 8} níveis de preço</p>{/if}
          {:else}
            <p class="small muted">Nenhuma oferta vista.</p>
          {/if}
        </div>
      {/each}
    </div>

    <form class="card stack" onsubmit={calc}>
      <h3 style="margin:0">Quanto custa de verdade?</h3>
      <p class="small muted" style="margin:0">O preço mais baixo do livro costuma ter poucas unidades. Veja o preço médio para a quantidade que você precisa.</p>
      <div class="row">
        <label class="small" for="{uid}-n">Unidades</label>
        <input id="{uid}-n" class="input num" style="width:110px" type="number" min="1" max="100000" step="1" inputmode="numeric" bind:value={n} />
        <div class="seg" role="radiogroup" aria-label="O que você quer fazer">
          <label><input type="radio" name="{uid}-side" value="sell" bind:group={side} />Quero comprar</label>
          <label><input type="radio" name="{uid}-side" value="buy" bind:group={side} />Quero vender</label>
        </div>
        <button class="btn primary" type="submit" disabled={busy || !city}>{busy ? 'Calculando…' : 'Calcular'}</button>
      </div>
      <div aria-live="polite">
        {#if err}
          <p class="bad-text small" style="margin:0">{err}</p>
        {:else if result}
          {#if result.avgPrice === null || result.filled === 0}
            <p style="margin:0">Não há ofertas suficientes em {result.city} para calcular.</p>
          {:else}
            <p style="margin:0">
              Preço médio em {result.city}: <strong><Money value={result.avgPrice} /></strong> por unidade
              · total <strong><Money value={result.avgPrice * result.filled} /></strong> por {fmtInt(result.filled)} unidades.
            </p>
            {#if result.filled < result.n}
              <p class="warn-text small" style="margin:4px 0 0">O livro visto só tem {fmtInt(result.filled)} de {fmtInt(result.n)} unidades; o restante você teria que esperar ou {result.side === 'sell' ? 'pagar mais caro' : 'vender mais barato'}.</p>
            {/if}
            <p class="small muted" style="margin:4px 0 0">
              Baseado no último livro visto pelo AODP; confira no jogo antes de fechar.
              {#if result.side === 'buy'}Vendendo direto para a ordem de compra, ainda sai o imposto de venda (4% com Premium, 8% sem).{/if}
            </p>
          {/if}
        {/if}
      </div>
    </form>
  </div>
{/if}
