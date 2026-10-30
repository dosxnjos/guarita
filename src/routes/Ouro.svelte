<script lang="ts">
  // Ouro e Premium: gráfico de 7/30/90 dias com faixa p10–p90, veredito por quartil e a calculadora
  // "Premium compensa?". Nenhum preço em reais é inventado: o usuário informa quanto paga.
  import type { GoldResponse } from '../../shared/types';
  import { PREMIUM_30D_GOLD } from '../../shared/market';
  import { api } from '../lib/api';
  import { fmtInt, fmtPct, fmtSilver, verdictText, verdictTone } from '../lib/format';
  import { getLocale, tx } from '../lib/i18n/index.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';
  import TimeAgo from '../lib/ui/TimeAgo.svelte';
  import GoldChart from '../lib/gold/GoldChart.svelte';
  import { cheaperThanShare, coveredDays, goldVerdictText } from '../lib/gold/view';
  import { fmtBrl, fmtHours, parseDecimalBr, premiumCalc } from '../lib/gold/premium';

  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const WINDOWS = [7, 30, 90] as const;
  let days = $state<number>(30);
  let gold = $state<GoldResponse | null>(null);
  let error = $state('');
  let loading = $state(false);
  let seq = 0;

  async function load(d = days) {
    const my = ++seq;
    loading = true;
    try {
      const g = await api.gold(d);
      if (my !== seq) return;
      gold = g;
      error = '';
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : tx('Erro desconhecido.', 'Error desconocido.');
    } finally {
      if (my === seq) loading = false;
    }
  }

  function pick(d: number) {
    if (d === days && gold) return;
    days = d;
    load(d);
  }

  $effect(() => {
    load(30);
  });

  // ---------- calculadora (campos guardados neste aparelho) ----------
  const KEY = 'guarita.premiumCalc';
  type Form = { packBrl: string; packGold: string; silverPerHour: string; monthlySales: string };
  function readForm(): Form {
    const empty: Form = { packBrl: '', packGold: '', silverPerHour: '', monthlySales: '' };
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Form> | null;
      return v ? { ...empty, ...Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) } : empty;
    } catch {
      return empty;
    }
  }
  let form = $state<Form>(readForm());
  $effect(() => {
    const snapshot = JSON.stringify(form);
    try {
      localStorage.setItem(KEY, snapshot);
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  });

  const parsed = $derived({
    packBrl: parseDecimalBr(form.packBrl),
    packGold: parseDecimalBr(form.packGold),
    silverPerHour: parseDecimalBr(form.silverPerHour),
    monthlySales: parseDecimalBr(form.monthlySales),
  });
  const invalid = $derived({
    packBrl: form.packBrl.trim() !== '' && !(parsed.packBrl! > 0),
    packGold: form.packGold.trim() !== '' && !(parsed.packGold! > 0),
    silverPerHour: form.silverPerHour.trim() !== '' && !(parsed.silverPerHour! > 0),
    monthlySales: form.monthlySales.trim() !== '' && !(parsed.monthlySales! > 0),
  });
  const calc = $derived(premiumCalc({ goldPrice: gold?.current ?? null, ...parsed }));
  const share = $derived(gold ? cheaperThanShare(gold.points, gold.current) : null);
  // dias que a série cobre de fato (o AODP pode devolver menos que o pedido); os textos usam este número
  const covered = $derived(gold ? coveredDays(gold.points) : 0);
  const shownDays = $derived(covered > 0 ? Math.min(days, covered) : days);
  const short = $derived(!!gold && gold.points.length > 1 && covered < days - 1);
</script>

<!-- Mesmo título de worker/seo.ts (FIXED_ROUTES e FIXED_ES). -->
<svelte:head><title>{tx('Ouro e Premium · Guarita', 'Oro y Premium · Guarita')}</title></svelte:head>

<section class="page">
  <h1>{tx('Ouro e Premium', 'Oro y Premium')}</h1>
  <p class="muted" style="margin-top:0">{tx(
    'Cotação do ouro no servidor Americas, em prata, pelo Albion Online Data Project.',
    'Cotización del oro en el servidor Americas, en plata, según el Albion Online Data Project.',
  )}</p>

  <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
    <span class="small muted" id="gold-win">{tx('Período:', 'Período:')}</span>
    <div class="seg" role="group" aria-labelledby="gold-win">
      {#each WINDOWS as w}
        <button type="button" aria-pressed={days === w} onclick={() => pick(w)} disabled={loading && days === w}>{tx(`${w} dias`, `${w} días`)}</button>
      {/each}
    </div>
    {#if loading && gold}<span class="small muted" role="status">{tx('Atualizando…', 'Actualizando…')}</span>{/if}
  </div>

  {#if error && !gold}
    <div style="margin-top:16px"><ErrorBox message={error} onretry={() => load()} /></div>
  {:else if error}
    <p class="callout warn small" style="margin-top:12px">{tx(
      `Não deu para atualizar agora (${error}); mostrando a última leitura.`,
      `No se pudo actualizar ahora (${error}); se muestra la última lectura.`,
    )}
      <button type="button" class="linkbtn" onclick={() => load()} disabled={loading}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></p>
  {/if}

  {#if gold}
    {#if !gold.points.length}
      <p class="empty" style="margin-top:16px">{tx(
        'O AODP não tem cotação do ouro para este período agora. Tente mais tarde.',
        'El AODP no tiene cotización del oro para este período ahora. Inténtalo más tarde.',
      )}</p>
    {:else}
      <div class="grid" style="margin-top:16px">
        <div class="card stack">
          <div class="kpi-label">{tx('Ouro agora', 'Oro ahora')}</div>
          <div class="kpi">{fmtSilver(gold.current)} <span class="small muted">{tx('prata', 'plata')}</span></div>
          <p class="small" style="margin:0">
            <span class="tag {verdictTone(gold.verdict)}">{verdictText(gold.verdict, getLocale())}</span>
            <span class="muted">{goldVerdictText(gold.verdict, shownDays)}</span>
          </p>
          {#if share !== null}
            <p class="small muted" style="margin:0">{tx(
              `Mais caro que ${fmtPct(share)} das horas dos últimos ${shownDays} dias.`,
              `Más caro que el ${fmtPct(share)} de las horas de los últimos ${shownDays} días.`,
            )}</p>
          {/if}
        </div>
        <div class="card stack">
          <div class="kpi-label">{tx(`Últimos ${shownDays} dias`, `Últimos ${shownDays} días`)}</div>
          <dl class="gold-stats">
            <dt>{tx('Faixa de 80% das horas', 'Rango del 80% de las horas')}</dt><dd class="num">{fmtSilver(gold.p10)} a {fmtSilver(gold.p90)}</dd>
            <dt>{tx('Mediana', 'Mediana')}</dt><dd class="num">{fmtSilver(gold.p50)}</dd>
          </dl>
          <p class="small muted" style="margin:0">{tx('Consultado', 'Consultado')} <TimeAgo iso={gold.fetchedAt} />. {tx('Atualiza a cada 10 minutos.', 'Se actualiza cada 10 minutos.')}</p>
        </div>
      </div>

      <h2>{tx('Gráfico', 'Gráfico')}</h2>
      {#if short}
        <p class="callout info small">{tx(
          `Você pediu ${days} dias, mas o AODP devolveu só os últimos ${covered} dias de cotação. Os números acima valem para esse período.`,
          `Pediste ${days} días, pero el AODP devolvió solo los últimos ${covered} días de cotización. Los números de arriba valen para ese período.`,
        )}</p>
      {/if}
      <GoldChart {gold} days={shownDays} />
      <p class="small muted">{tx(
        'Horas com cotação absurda (menos de um terço ou mais do triplo da mediana do período) ficam fora do gráfico e da conta.',
        'Las horas con cotización absurda (menos de un tercio o más del triple de la mediana del período) quedan fuera del gráfico y del cálculo.',
      )}</p>
    {/if}
  {:else if !error}
    <div style="margin-top:16px"><Loading lines={4} label={tx('Carregando a cotação do ouro', 'Cargando la cotización del oro')} /></div>
  {/if}

  <h2>{tx('Premium compensa?', '¿Vale la pena el Premium?')}</h2>
  <p class="small muted" style="margin-top:0">{tx(
    'Preencha com os seus números. Os campos ficam salvos só neste aparelho.',
    'Completa con tus números. Los campos se guardan solo en este dispositivo.',
  )}</p>
  <div class="grid">
    <form class="card stack" onsubmit={(e) => e.preventDefault()} aria-describedby="calc-help">
      <p id="calc-help" class="small muted" style="margin:0">{tx(
        'Use vírgula ou ponto como no seu teclado: 29,90 e 1.000 funcionam.',
        'Usa coma o punto como en tu teclado: 29.90 y 1,000 funcionan.',
      )}</p>
      <label class="stack gold-field">
        <span>{tx('Quanto você paga pelo pacote de ouro (R$)', 'Cuánto pagas por el paquete de oro (en tu moneda)')}</span>
        <input class="input" type="text" inputmode="decimal" autocomplete="off" placeholder={tx('ex.: o valor do pacote na loja', 'ej.: el valor del paquete en la tienda')} bind:value={form.packBrl} aria-invalid={invalid.packBrl} />
        {#if invalid.packBrl}<span class="small bad-text">{tx('Digite um valor maior que zero.', 'Escribe un valor mayor que cero.')}</span>{/if}
      </label>
      <label class="stack gold-field">
        <span>{tx('Quanto ouro vem nesse pacote', 'Cuánto oro trae ese paquete')}</span>
        <input class="input" type="text" inputmode="numeric" autocomplete="off" placeholder={tx('ex.: 1.000', 'ej.: 1,000')} bind:value={form.packGold} aria-invalid={invalid.packGold} />
        {#if invalid.packGold}<span class="small bad-text">{tx('Digite uma quantidade maior que zero.', 'Escribe una cantidad mayor que cero.')}</span>{/if}
      </label>
      <label class="stack gold-field">
        <span>{tx('Quanto de prata você ganha por hora de jogo', 'Cuánta plata ganas por hora de juego')}</span>
        <input class="input" type="text" inputmode="numeric" autocomplete="off" placeholder={tx('ex.: 1.500.000', 'ej.: 1,500,000')} bind:value={form.silverPerHour} aria-invalid={invalid.silverPerHour} />
        {#if invalid.silverPerHour}<span class="small bad-text">{tx('Digite um valor maior que zero.', 'Escribe un valor mayor que cero.')}</span>{/if}
      </label>
      <label class="stack gold-field">
        <span>{tx('Quanto você vende no mercado por mês, em prata', 'Cuánto vendes en el mercado por mes, en plata')} <span class="muted">{tx('(opcional)', '(opcional)')}</span></span>
        <input class="input" type="text" inputmode="numeric" autocomplete="off" placeholder={tx('ex.: 50.000.000', 'ej.: 50,000,000')} bind:value={form.monthlySales} aria-invalid={invalid.monthlySales} />
        {#if invalid.monthlySales}<span class="small bad-text">{tx('Digite um valor maior que zero.', 'Escribe un valor mayor que cero.')}</span>{/if}
      </label>
    </form>

    <div class="card stack" aria-live="polite">
      <div class="kpi-label">{tx(`Premium de 30 dias = ${fmtInt(PREMIUM_30D_GOLD)} de ouro`, `Premium de 30 días = ${fmtInt(PREMIUM_30D_GOLD)} de oro`)}</div>
      <dl class="gold-stats">
        <dt>{tx('Em prata (cotação atual)', 'En plata (cotización actual)')}</dt>
        <dd class="num">{calc.silver !== null
          ? tx(`${fmtSilver(calc.silver)} prata`, `${fmtSilver(calc.silver)} de plata`)
          : gold ? tx('sem cotação', 'sin cotización') : tx('carregando…', 'cargando…')}</dd>
        <dt>{tx('Em reais (pelo seu pacote)', 'En tu moneda (según tu paquete)')}</dt>
        <dd class="num">{calc.brl !== null ? fmtBrl(calc.brl) : tx('preencha o pacote', 'completa el paquete')}</dd>
        <dt>{tx('Horas de jogo que pagam o Premium', 'Horas de juego que pagan el Premium')}</dt>
        <dd class="num">{calc.hours !== null ? fmtHours(calc.hours) : tx('preencha a prata por hora', 'completa la plata por hora')}</dd>
        {#if calc.taxSaving !== null}
          <dt>{tx('Imposto que você deixa de pagar por mês', 'Impuesto que dejas de pagar por mes')}</dt>
          <dd class="num">{tx(`${fmtSilver(calc.taxSaving)} prata`, `${fmtSilver(calc.taxSaving)} de plata`)}</dd>
        {/if}
      </dl>
      {#if calc.brlPerGold !== null}
        <p class="small muted" style="margin:0">
          {#if getLocale() === 'es'}
            Tu paquete sale a {fmtBrl(calc.brlPerGold, true)} por oro{#if calc.silverPerBrl !== null}; con la cotización de ahora, cada 1 de tu moneda vale {fmtSilver(calc.silverPerBrl)} de plata{/if}.
          {:else}
            Seu pacote sai a {fmtBrl(calc.brlPerGold, true)} por ouro{#if calc.silverPerBrl !== null}; pela cotação de agora, cada R$ 1 vale {fmtSilver(calc.silverPerBrl)} de prata{/if}.
          {/if}
        </p>
      {/if}
      {#if calc.hours !== null}
        <p class="small" style="margin:0">
          {#if getLocale() === 'es'}
            Jugando para comprar el Premium con plata, gastas {fmtHours(calc.hours)} del mes.
            {#if calc.brl !== null}Pagando con dinero, el costo es {fmtBrl(calc.brl)} y esas horas quedan libres.{/if}
          {:else}
            Jogando para comprar o Premium com prata, você gasta {fmtHours(calc.hours)} do mês.
            {#if calc.brl !== null}Pagando em reais, o custo é {fmtBrl(calc.brl)} e essas horas ficam livres.{/if}
          {/if}
        </p>
      {/if}
      {#if calc.taxPays !== null}
        <p class="callout {calc.taxPays ? 'good' : 'info'} small" style="margin:0">
          {calc.taxPays
            ? tx('Só a economia de imposto nas suas vendas já paga o Premium em prata.', 'Solo el ahorro de impuestos en tus ventas ya paga el Premium en plata.')
            : tx(
              'A economia de imposto sozinha não paga o Premium; os outros benefícios contam na decisão.',
              'El ahorro de impuestos por sí solo no paga el Premium; los demás beneficios cuentan en la decisión.',
            )}
        </p>
      {/if}
    </div>
  </div>

  <h2>{tx('O que o Premium dá', 'Qué te da el Premium')}</h2>
  {#if getLocale() === 'es'}
    <ul class="small">
      <li><strong>Impuesto de venta más bajo en el mercado:</strong> 4% con Premium contra 8% sin él. La Guarita usa esos valores en las reventas; la mitad con Premium viene de una fuente secundaria, así que compruébalo en el juego antes de una venta grande.</li>
      <li><strong>Otros beneficios</strong> (puntos de foco para refinar y fabricar, bonificación de fama, producción de la isla, entre otros) también vienen con el Premium. Los valores cambian con las actualizaciones del juego y la Guarita todavía no comprobó cada número en una fuente oficial, por eso no aparecen aquí; mira la descripción del Premium dentro del juego.</li>
      <li><strong>Precio:</strong> {fmtInt(PREMIUM_30D_GOLD)} de oro por 30 días, tomado de los datos del propio juego (gamedata.xml, paquetes de Premium).</li>
    </ul>
    <p class="callout info small">Compra oro y Premium solo en la tienda oficial o en el mercado de oro dentro del juego. Vender o comprar plata y objetos por dinero fuera del juego va contra las reglas y es donde ocurren las estafas.</p>
  {:else}
    <ul class="small">
      <li><strong>Imposto de venda menor no mercado:</strong> 4% com Premium contra 8% sem. A Guarita usa esses valores nos flips; a metade com Premium vem de fonte secundária, então confira no jogo antes de uma venda grande.</li>
      <li><strong>Outros benefícios</strong> (pontos de foco para refinar e criar, bônus de fama, produção da ilha, entre outros) também entram no Premium. Os valores mudam com as atualizações do jogo e a Guarita ainda não conferiu cada número numa fonte oficial, por isso eles não aparecem aqui; veja a descrição do Premium dentro do jogo.</li>
      <li><strong>Preço:</strong> {fmtInt(PREMIUM_30D_GOLD)} de ouro por 30 dias, tirado dos dados do próprio jogo (gamedata.xml, pacotes de Premium).</li>
    </ul>
    <p class="callout info small">Compre ouro e Premium só pela loja oficial ou pelo mercado de ouro dentro do jogo. Vender ou comprar prata e itens por dinheiro fora do jogo é contra as regras e é onde acontecem os golpes.</p>
  {/if}
</section>

<style>
  .gold-stats { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 0; }
  .gold-stats dt { color: var(--muted); font-size: 14px; }
  .gold-stats dd { margin: 0; text-align: right; font-weight: 600; }
  .gold-field > span { font-size: 14px; }
  .gold-field .input { width: 100%; box-sizing: border-box; }
  .gold-field .input[aria-invalid='true'] { border-color: var(--bad); }
</style>
