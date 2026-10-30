<script lang="ts">
  // "O que fazer hoje": prata + tempo + Premium → até 3 opções por trilha (flip, refino, transporte) com dado ao vivo do
  // AODP (GET /api/hoje). Mostra a conta aberta, a idade de cada preço, o selo e os riscos; nunca promete lucro.
  // A consulta fica na URL (?prata=&minutos=&premium=) para dar para compartilhar.
  import { untrack } from 'svelte';
  import { api } from '../lib/api';
  import { go } from '../lib/router';
  import type { City, HojeTrilha } from '../../shared/types';
  import { SETUP_FEE, SALES_TAX, SALES_TAX_PREMIUM } from '../../shared/market';
  import { citySlug, fmtPct, fmtSilver } from '../lib/format';
  import { itemHref } from '../lib/player/format';
  import type { HojeOpcao as HojeOpcaoX, HojeResponse as HojeResponseX } from '../../shared/types';
  import {
    MINUTOS_OPCOES, PRATA_ATALHOS, PRATA_MIN, TRILHAS, anuncioHoje, confidenceOf, contaDe, hojeQuery, idadeMaxima, parseHojeQuery,
    parsePrata, trilhaLabel,
  } from '../lib/hoje/view';
  import Money from '../lib/ui/Money.svelte';
  import AgeDot from '../lib/ui/AgeDot.svelte';
  import ConfidenceBadge from '../lib/ui/ConfidenceBadge.svelte';
  import ErrorBox from '../lib/ui/ErrorBox.svelte';
  import Loading from '../lib/ui/Loading.svelte';
  import ItemIcon from '../lib/ui/ItemIcon.svelte';
  import TimeAgo from '../lib/ui/TimeAgo.svelte';

  // params não usado: a consulta vive em ?prata=&minutos=&premium=
  let { params: _params = {} }: { params?: Record<string, string> } = $props();

  const fromUrl = (() => {
    try { return parseHojeQuery(location.search); } catch { return parseHojeQuery(''); }
  })();

  let prataText = $state(fromUrl.prata ? fmtSilver(fromUrl.prata) : '');
  let minutos = $state<number>(fromUrl.minutos);
  let premium = $state(fromUrl.premium);
  let result = $state<HojeResponseX | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let touched = $state(false);
  let seq = 0;

  const prata = $derived(parsePrata(prataText));
  const prataInvalid = $derived(prata == null || prata < PRATA_MIN);
  const grupos = $derived(
    TRILHAS.map((t) => ({ trilha: t, opcoes: (result?.opcoes ?? []).filter((o) => o.trilha === t) })),
  );
  const anuncio = $derived(
    anuncioHoje({
      loading,
      error,
      contagem: result ? { flip: grupos[0].opcoes.length, refino: grupos[1].opcoes.length, transporte: grupos[2].opcoes.length } : null,
    }),
  );
  const outdated = $derived(
    result != null && !prataInvalid && (result.prata !== prata || result.minutos !== minutos || result.premium !== premium),
  );

  const TRILHA_HINT: Record<HojeTrilha, string> = {
    flip: 'Comprar numa cidade e vender na hora para a ordem de compra do Black Market, em Caerleon.',
    refino: 'Refinar na cidade com bônus daquele recurso, somando o bônus de refino do dia quando houver.',
    transporte: 'Comprar numa cidade e anunciar mais caro em outra, até o volume que ela vende por dia.',
  };

  function setAtalho(v: number) {
    prataText = fmtSilver(v);
    touched = true;
  }

  function saveUrl(q: string) {
    try { history.replaceState(history.state, '', location.pathname + q); } catch { /* sem history: segue */ }
  }

  async function calc() {
    touched = true;
    if (prata == null || prata < PRATA_MIN) return;
    const p = { prata, minutos, premium };
    const my = ++seq;
    loading = true;
    error = null;
    saveUrl(hojeQuery(p));
    try {
      const r = (await api.hoje(p.prata, p.minutos, p.premium)) as HojeResponseX;
      if (my !== seq) return;
      result = r;
    } catch (e) {
      if (my !== seq) return;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === seq) loading = false;
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    calc();
  }

  function taxaTexto(op: HojeOpcaoX, prem: boolean): string {
    const imposto = fmtPct(prem ? SALES_TAX_PREMIUM : SALES_TAX);
    return op.trilha === 'flip' ? `imposto de ${imposto}` : `anúncio de ${fmtPct(SETUP_FEE)} + imposto de ${imposto}`;
  }

  function cityClass(c: City | null): string {
    return c ? `city-${citySlug(c)}` : '';
  }

  $effect(() => {
    document.title = 'O que fazer hoje · Guarita';
    if (fromUrl.prata) untrack(() => calc());
  });
</script>

<section class="page stack">
  <header>
    <h1>O que fazer hoje</h1>
    <p class="muted">Diga quanta prata e quanto tempo você tem. A Guarita olha os preços de agora e mostra as melhores opções de flip, refino e transporte, com a conta aberta e os riscos.</p>
  </header>

  <form class="card stack" onsubmit={submit} aria-labelledby="hoje-form-titulo">
    <h2 class="h3" id="hoje-form-titulo">Seu capital e seu tempo</h2>

    <div class="field">
      <label for="hoje-prata">Prata disponível</label>
      <input id="hoje-prata" class="input" inputmode="decimal" autocomplete="off" placeholder="Ex.: 2.500.000 ou 2,5 mi"
        bind:value={prataText} onblur={() => (touched = true)}
        aria-invalid={touched && prataInvalid ? 'true' : undefined} aria-describedby="hoje-prata-ajuda" />
      <div class="row atalhos" role="group" aria-label="Atalhos de prata">
        {#each PRATA_ATALHOS as v (v)}
          <button type="button" class="btn small" aria-pressed={prata === v} onclick={() => setAtalho(v)}>{fmtSilver(v, true).replace(' mi', 'M')}</button>
        {/each}
      </div>
      <p id="hoje-prata-ajuda" class="small {touched && prataInvalid ? 'erro' : 'muted'}">
        {#if touched && prataInvalid}
          Informe pelo menos {fmtSilver(PRATA_MIN)} de prata. Aceita “1.500.000”, “1,5 mi” ou “300k”.
        {:else if prata}
          {fmtSilver(prata)} de prata.
        {:else}
          Aceita “1.500.000”, “1,5 mi” ou “300k”.
        {/if}
      </p>
    </div>

    <fieldset class="field">
      <legend>Tempo disponível</legend>
      <div class="seg" role="radiogroup" aria-label="Tempo disponível">
        {#each MINUTOS_OPCOES as m (m)}
          <label><input type="radio" name="hoje-minutos" value={m} bind:group={minutos} />{m} min</label>
        {/each}
      </div>
    </fieldset>

    <label class="check">
      <input type="checkbox" bind:checked={premium} />
      <span>Tenho Premium <span class="muted small">(imposto sobre a venda de {fmtPct(SALES_TAX_PREMIUM)} em vez de {fmtPct(SALES_TAX)})</span></span>
    </label>

    <div class="row">
      <button type="submit" class="btn primary" disabled={loading}>{loading ? 'Consultando…' : 'Ver opções'}</button>
    </div>
  </form>

  <p class="callout warn small" role="note">
    <strong>Preço muda rápido.</strong> Os preços vêm de jogadores que rodam o cliente do Albion Data Project e podem ter
    minutos ou horas de atraso: a idade de cada um aparece ao lado. Isto é estimativa, não promessa de lucro. Confira no
    jogo antes de comprar. Tempo de viagem é aproximado (montaria comum, sem contratempo).
  </p>

  <!-- Anúncio curto para leitor de tela; a lista de resultados fica fora de aria-live (seria lida inteira). -->
  <p class="sr-only" role="status" aria-live="polite">{anuncio}</p>

  <div class="stack">
    {#if loading && !result}
      <div class="card"><Loading lines={5} label="Consultando os preços de agora…" /></div>
    {:else if error}
      <ErrorBox title="Não deu para montar as opções" message={error} onretry={calc} />
    {:else if result}
      {#if outdated}
        <p class="callout warn small">Os valores mudaram depois da última consulta. Toque em <strong>Ver opções</strong> para atualizar.</p>
      {/if}

      <div class="meta small muted">
        <span>Para {fmtSilver(result.prata)} de prata · {result.minutos} min · {result.premium ? 'com Premium' : 'sem Premium'}</span>
        <span>Preços do mercado: <TimeAgo iso={result.fetchedAt} prefix="consultados " /></span>
      </div>

      {#if result.notas?.length}
        <ul class="notas small">
          {#each result.notas as n, k (k)}<li>{n}</li>{/each}
        </ul>
      {/if}

      {#each grupos as g (g.trilha)}
        <section class="stack" aria-labelledby="trilha-{g.trilha}">
          <div class="section-head">
            <h2 id="trilha-{g.trilha}">{trilhaLabel(g.trilha)}</h2>
          </div>
          <p class="muted small hint">{TRILHA_HINT[g.trilha]}</p>
          {#if !g.opcoes.length}
            <div class="card empty small">Nenhuma opção desta trilha dá lucro agora com esses valores.</div>
          {:else}
            <div class="opcoes">
              {#each g.opcoes as op, k (k)}
                {@const conta = contaDe(op)}
                {@const idade = idadeMaxima(op)}
                <article class="card opcao" aria-label={op.titulo}>
                  <header class="op-head">
                    <h3 class="h4">{op.titulo.replace(/^[^:]+:\s*/, '')}</h3>
                    <ConfidenceBadge confidence={confidenceOf(op.confianca, op.motivos ?? [])} />
                  </header>

                  <div class="lucro" class:neg={op.lucro < 0}>
                    <span class="kpi-label">Lucro estimado</span>
                    <span class="kpi"><Money value={op.lucro} /><span class="kpi-unit">prata</span></span>
                    <span class="muted small">
                      capital no ciclo <Money value={op.capital} compact /> · cerca de {op.minutos} min
                      {#if idade != null} · preço mais antigo <AgeDot min={idade} />{/if}
                    </span>
                  </div>

                  <dl class="conta" aria-label="Conta aberta">
                    <div><dt>Compra</dt><dd><Money value={conta.compra} /></dd></div>
                    <div><dt>Venda</dt><dd><Money value={conta.venda} /></dd></div>
                    <div><dt>Taxas <span class="muted">({taxaTexto(op, result.premium)})</span></dt><dd>− <Money value={conta.taxas} /></dd></div>
                    <div class="total"><dt>Lucro</dt><dd><Money value={conta.lucro} /></dd></div>
                  </dl>

                  <ul class="itens">
                    {#each op.itens as it (it.id + (it.venda ?? 'c'))}
                      <li class="it">
                        <ItemIcon id={it.id} size={40} alt="" />
                        <span class="it-name">
                          <a href={itemHref(it.id, 1)} onclick={go}>{it.nome}</a>
                          <span class="muted small">{fmtSilver(it.qtd)} unidade{it.qtd === 1 ? '' : 's'}</span>
                        </span>
                        <span class="it-prices small">
                          {#if it.compra != null}
                            <span>compra <Money value={it.compra} />{#if it.cidadeCompra}{' em '}<span class="city {cityClass(it.cidadeCompra)}">{it.cidadeCompra}</span>{/if}
                              <AgeDot min={it.idadeCompraMin} /></span>
                          {/if}
                          {#if it.venda != null}
                            <span>venda <Money value={it.venda} />{#if it.cidadeVenda}{' em '}<span class="city {cityClass(it.cidadeVenda)}">{it.cidadeVenda}</span>{/if}
                              <AgeDot min={it.idadeVendaMin} /></span>
                          {/if}
                        </span>
                      </li>
                    {/each}
                  </ul>

                  <details open={k === 0}>
                    <summary>Passo a passo</summary>
                    <ol class="passos small">
                      {#each op.passos as p, j (j)}<li>{p}</li>{/each}
                    </ol>
                  </details>

                  {#if op.riscos.length}
                    <div class="riscos small">
                      <strong>Riscos</strong>
                      <ul>{#each op.riscos as r, j (j)}<li>{r}</li>{/each}</ul>
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/each}

      <p class="muted small">
        Como a conta é feita: compra pela ordem de venda mais barata; venda direta no Black Market paga só o imposto; venda
        por ordem paga {fmtPct(SETUP_FEE)} de anúncio e o imposto. No refino, o retorno médio de material vem do bônus da
        cidade (e do bônus do dia, quando há) e a taxa da estação fica de fora. Quantidade limitada pelo que a cidade vende
        por dia. Veja também <a href="/permitido" onclick={go}>o que é permitido</a>.
      </p>
    {:else}
      <div class="card empty">
        Informe a prata e toque em <strong>Ver opções</strong>. Use os atalhos se preferir.
      </div>
    {/if}
  </div>
</section>

<style>
  header p { margin: 0; }
  .h3 { font-size: 18px; margin: 0; }
  .h4 { font-size: 16px; margin: 0; overflow-wrap: anywhere; }
  .field { display: grid; gap: 6px; border: 0; margin: 0; padding: 0; min-width: 0; }
  .field > label, legend { font-weight: 600; padding: 0; }
  .field p { margin: 0; }
  .erro { color: var(--bad); }
  .atalhos .btn[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
  .btn.small { padding: 6px 12px; font-size: 14px; }
  .seg { width: fit-content; }
  .seg label { padding: 8px 16px; min-width: 72px; text-align: center; }
  .check { display: flex; gap: 10px; align-items: flex-start; }
  .check input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--accent); }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 16px; justify-content: space-between; }
  .notas { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
  .hint { margin: -6px 0 0; }
  .section-head h2 { margin: 0; font-size: 20px; }
  .opcoes { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); align-items: start; }
  .opcao { display: grid; gap: 12px; }
  .op-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .lucro { display: grid; gap: 2px; }
  .lucro .kpi { color: var(--good); }
  .lucro.neg .kpi { color: var(--bad); }
  .kpi-unit { margin-left: 6px; font-size: 15px; font-weight: 500; color: var(--muted); }
  .conta { margin: 0; display: grid; gap: 4px; padding: 10px 12px; background: var(--surface-2); border-radius: 8px; font-variant-numeric: tabular-nums; }
  .conta div { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .conta dt { font-size: 14px; }
  .conta dd { margin: 0; font-weight: 600; }
  .conta .total { border-top: 1px solid var(--line); padding-top: 4px; }
  .itens { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .it { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px; align-items: center; }
  .it-name { display: grid; min-width: 0; }
  .it-name a { overflow-wrap: anywhere; }
  .it-prices { grid-column: 2; display: grid; gap: 2px; }
  .city { font-weight: 600; color: var(--city, inherit); }
  details summary { cursor: pointer; font-weight: 600; }
  .passos { margin: 8px 0 0; padding-left: 20px; display: grid; gap: 6px; }
  .riscos { border-left: 3px solid var(--warn); padding-left: 10px; }
  .riscos ul { margin: 4px 0 0; padding-left: 18px; display: grid; gap: 4px; }
  p a { color: var(--accent); }
</style>
