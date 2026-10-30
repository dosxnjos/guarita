<script lang="ts">
  // Ouro e Premium: gráfico de 7/30/90 dias com faixa p10–p90, veredito por quartil e a calculadora
  // "Premium compensa?". Nenhum preço em reais é inventado: o usuário informa quanto paga.
  import type { GoldResponse } from '../../shared/types';
  import { PREMIUM_30D_GOLD } from '../../shared/market';
  import { api } from '../lib/api';
  import { fmtInt, fmtPct, fmtSilver, verdictTone } from '../lib/format';
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
      error = e instanceof Error ? e.message : 'Erro desconhecido.';
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

<svelte:head><title>Ouro e Premium · Guarita</title></svelte:head>

<section class="page">
  <h1>Ouro e Premium</h1>
  <p class="muted" style="margin-top:0">Cotação do ouro no servidor Americas, em prata, pelo Albion Online Data Project.</p>

  <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
    <span class="small muted" id="gold-win">Período:</span>
    <div class="seg" role="group" aria-labelledby="gold-win">
      {#each WINDOWS as w}
        <button type="button" aria-pressed={days === w} onclick={() => pick(w)} disabled={loading && days === w}>{w} dias</button>
      {/each}
    </div>
    {#if loading && gold}<span class="small muted" role="status">Atualizando…</span>{/if}
  </div>

  {#if error && !gold}
    <div style="margin-top:16px"><ErrorBox message={error} onretry={() => load()} /></div>
  {:else if error}
    <p class="callout warn small" style="margin-top:12px">Não deu para atualizar agora ({error}); mostrando a última leitura.
      <button type="button" class="linkbtn" onclick={() => load()} disabled={loading}>Tentar de novo</button></p>
  {/if}

  {#if gold}
    {#if !gold.points.length}
      <p class="empty" style="margin-top:16px">O AODP não tem cotação do ouro para este período agora. Tente mais tarde.</p>
    {:else}
      <div class="grid" style="margin-top:16px">
        <div class="card stack">
          <div class="kpi-label">Ouro agora</div>
          <div class="kpi">{fmtSilver(gold.current)} <span class="small muted">prata</span></div>
          <p class="small" style="margin:0">
            <span class="tag {verdictTone(gold.verdict)}">{gold.verdict}</span>
            <span class="muted">{goldVerdictText(gold.verdict, shownDays)}</span>
          </p>
          {#if share !== null}
            <p class="small muted" style="margin:0">Mais caro que {fmtPct(share)} das horas dos últimos {shownDays} dias.</p>
          {/if}
        </div>
        <div class="card stack">
          <div class="kpi-label">Últimos {shownDays} dias</div>
          <dl class="gold-stats">
            <dt>Faixa de 80% das horas</dt><dd class="num">{fmtSilver(gold.p10)} a {fmtSilver(gold.p90)}</dd>
            <dt>Mediana</dt><dd class="num">{fmtSilver(gold.p50)}</dd>
          </dl>
          <p class="small muted" style="margin:0">Consultado <TimeAgo iso={gold.fetchedAt} />. Atualiza a cada 10 minutos.</p>
        </div>
      </div>

      <h2>Gráfico</h2>
      {#if short}
        <p class="callout info small">Você pediu {days} dias, mas o AODP devolveu só os últimos {covered} dias de cotação. Os números acima valem para esse período.</p>
      {/if}
      <GoldChart {gold} days={shownDays} />
      <p class="small muted">Horas com cotação absurda (menos de um terço ou mais do triplo da mediana do período) ficam fora do gráfico e da conta.</p>
    {/if}
  {:else if !error}
    <div style="margin-top:16px"><Loading lines={4} label="Carregando a cotação do ouro" /></div>
  {/if}

  <h2>Premium compensa?</h2>
  <p class="small muted" style="margin-top:0">Preencha com os seus números. Os campos ficam salvos só neste aparelho.</p>
  <div class="grid">
    <form class="card stack" onsubmit={(e) => e.preventDefault()} aria-describedby="calc-help">
      <p id="calc-help" class="small muted" style="margin:0">Use vírgula ou ponto como no seu teclado: 29,90 e 1.000 funcionam.</p>
      <label class="stack gold-field">
        <span>Quanto você paga pelo pacote de ouro (R$)</span>
        <input class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: o valor do pacote na loja" bind:value={form.packBrl} aria-invalid={invalid.packBrl} />
        {#if invalid.packBrl}<span class="small bad-text">Digite um valor maior que zero.</span>{/if}
      </label>
      <label class="stack gold-field">
        <span>Quanto ouro vem nesse pacote</span>
        <input class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="ex.: 1.000" bind:value={form.packGold} aria-invalid={invalid.packGold} />
        {#if invalid.packGold}<span class="small bad-text">Digite uma quantidade maior que zero.</span>{/if}
      </label>
      <label class="stack gold-field">
        <span>Quanto de prata você ganha por hora de jogo</span>
        <input class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="ex.: 1.500.000" bind:value={form.silverPerHour} aria-invalid={invalid.silverPerHour} />
        {#if invalid.silverPerHour}<span class="small bad-text">Digite um valor maior que zero.</span>{/if}
      </label>
      <label class="stack gold-field">
        <span>Quanto você vende no mercado por mês, em prata <span class="muted">(opcional)</span></span>
        <input class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="ex.: 50.000.000" bind:value={form.monthlySales} aria-invalid={invalid.monthlySales} />
        {#if invalid.monthlySales}<span class="small bad-text">Digite um valor maior que zero.</span>{/if}
      </label>
    </form>

    <div class="card stack" aria-live="polite">
      <div class="kpi-label">Premium de 30 dias = {fmtInt(PREMIUM_30D_GOLD)} de ouro</div>
      <dl class="gold-stats">
        <dt>Em prata (cotação atual)</dt>
        <dd class="num">{calc.silver !== null ? `${fmtSilver(calc.silver)} prata` : gold ? 'sem cotação' : 'carregando…'}</dd>
        <dt>Em reais (pelo seu pacote)</dt>
        <dd class="num">{calc.brl !== null ? fmtBrl(calc.brl) : 'preencha o pacote'}</dd>
        <dt>Horas de jogo que pagam o Premium</dt>
        <dd class="num">{calc.hours !== null ? fmtHours(calc.hours) : 'preencha a prata por hora'}</dd>
        {#if calc.taxSaving !== null}
          <dt>Imposto que você deixa de pagar por mês</dt>
          <dd class="num">{fmtSilver(calc.taxSaving)} prata</dd>
        {/if}
      </dl>
      {#if calc.brlPerGold !== null}
        <p class="small muted" style="margin:0">
          Seu pacote sai a {fmtBrl(calc.brlPerGold, true)} por ouro{#if calc.silverPerBrl !== null}; pela cotação de agora, cada R$ 1 vale {fmtSilver(calc.silverPerBrl)} de prata{/if}.
        </p>
      {/if}
      {#if calc.hours !== null}
        <p class="small" style="margin:0">
          Jogando para comprar o Premium com prata, você gasta {fmtHours(calc.hours)} do mês.
          {#if calc.brl !== null}Pagando em reais, o custo é {fmtBrl(calc.brl)} e essas horas ficam livres.{/if}
        </p>
      {/if}
      {#if calc.taxPays !== null}
        <p class="callout {calc.taxPays ? 'good' : 'info'} small" style="margin:0">
          {calc.taxPays
            ? 'Só a economia de imposto nas suas vendas já paga o Premium em prata.'
            : 'A economia de imposto sozinha não paga o Premium; os outros benefícios contam na decisão.'}
        </p>
      {/if}
    </div>
  </div>

  <h2>O que o Premium dá</h2>
  <ul class="small">
    <li><strong>Imposto de venda menor no mercado:</strong> 4% com Premium contra 8% sem. A Guarita usa esses valores nos flips; a metade com Premium vem de fonte secundária, então confira no jogo antes de uma venda grande.</li>
    <li><strong>Outros benefícios</strong> (pontos de foco para refinar e criar, bônus de fama, produção da ilha, entre outros) também entram no Premium. Os valores mudam com as atualizações do jogo e a Guarita ainda não conferiu cada número numa fonte oficial, por isso eles não aparecem aqui; veja a descrição do Premium dentro do jogo.</li>
    <li><strong>Preço:</strong> {fmtInt(PREMIUM_30D_GOLD)} de ouro por 30 dias, tirado dos dados do próprio jogo (gamedata.xml, pacotes de Premium).</li>
  </ul>
  <p class="callout info small">Compre ouro e Premium só pela loja oficial ou pelo mercado de ouro dentro do jogo. Vender ou comprar prata e itens por dinheiro fora do jogo é contra as regras e é onde acontecem os golpes.</p>
</section>

<style>
  .gold-stats { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 0; }
  .gold-stats dt { color: var(--muted); font-size: 14px; }
  .gold-stats dd { margin: 0; text-align: right; font-weight: 600; }
  .gold-field > span { font-size: 14px; }
  .gold-field .input { width: 100%; box-sizing: border-box; }
  .gold-field .input[aria-invalid='true'] { border-color: var(--bad); }
</style>
