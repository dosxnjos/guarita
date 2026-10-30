<script lang="ts">
  // Widget "Preço rápido": digita o item, Enter, e vê o mais barato confiável, a tabela por cidade (idade e selo)
  // e o melhor flip para o Black Market. Dado da API pública da Guarita (/api/item/:id).
  import type { ItemHit } from '../../../shared/items';
  import { tierLabel } from '../../../shared/items';
  import type { ItemResponse, Quality } from '../../../shared/types';
  import AgeDot from '../../../src/lib/ui/AgeDot.svelte';
  import ItemIcon from '../../../src/lib/ui/ItemIcon.svelte';
  import { api } from '../lib/api';
  import { QUALITIES, articuloHora, cityName, citySlug, confidenceText, confidenceTone, fmtAge, fmtPct, fmtSilver, fmtTime, qualityName } from '../lib/format';
  import { brasilia, getLocale, tx } from '../lib/i18n.svelte';
  import { abrirUrl } from '../lib/links';
  import { lembrarRecente, lerRecentes, resumoPreco, urlItemNoSite, type Recente } from '../lib/ui-preco';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';
  import ItemBusca from '../ui/ItemBusca.svelte';

  // Recentes por língua: o nome guardado é o da língua em que o item foi buscado.
  const CHAVE_RECENTES = getLocale() === 'es' ? 'guarita-app-preco-recentes-es' : 'guarita-app-preco-recentes';
  const CHAVE_PREMIUM = 'guarita-app-premium';

  const ler = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const gravar = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sem armazenamento: vale até fechar */
    }
  };

  let campo = $state<HTMLInputElement | null>(null);
  let alvo = $state<Recente | null>(null);
  let tier = $state('');
  let qualidade = $state<Quality>(1);
  let premium = $state(ler(CHAVE_PREMIUM) !== '0');
  let dado = $state<ItemResponse | null>(null);
  let buscadoEm = $state<number | null>(null);
  let erro = $state('');
  let carregando = $state(false);
  let recentes = $state<Recente[]>(lerRecentes(ler(CHAVE_RECENTES)));
  let seq = 0;

  async function carregar(fresco = false) {
    if (!alvo) return;
    const meu = ++seq;
    carregando = true;
    erro = '';
    if (fresco) api.clearCache(`/api/item/${encodeURIComponent(alvo.id)}`);
    try {
      const r = await api.item(alvo.id, qualidade);
      if (meu !== seq) return;
      dado = r.data;
      buscadoEm = r.at;
    } catch (e) {
      if (meu === seq) erro = e instanceof Error ? e.message : String(e);
    } finally {
      if (meu === seq) carregando = false;
    }
  }

  function escolher(hit: ItemHit | Recente) {
    const nome = 'pt' in hit ? hit.pt : hit.nome;
    tier = 'tier' in hit ? tierLabel(hit.tier, hit.ench) : '';
    alvo = { id: hit.id, nome };
    dado = null;
    recentes = lembrarRecente(recentes, alvo);
    gravar(CHAVE_RECENTES, JSON.stringify(recentes));
    void carregar();
  }

  function mudarQualidade(q: Quality) {
    qualidade = q;
    void carregar();
  }

  function mudarPremium(on: boolean) {
    premium = on;
    gravar(CHAVE_PREMIUM, on ? '1' : '0');
  }

  // Atalho global "abrir o preço rápido" foca a janela: o campo já fica pronto para digitar.
  $effect(() => {
    // Só quando nada tem foco (a janela veio pelo atalho/bandeja), para não roubar o foco de um clique no seletor.
    const focar = () => setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) campo?.focus({ preventScroll: true });
    }, 0);
    window.addEventListener('focus', focar);
    return () => window.removeEventListener('focus', focar);
  });

  const resumo = $derived(dado ? resumoPreco(dado, premium) : null);
</script>

<div class="preco stack">
  <ItemBusca bind:input={campo} onselect={escolher} autofocus label={tx('Item para ver o preço', 'Objeto para ver el precio')} placeholder={tx('Item (ex.: bolsa T4.1)', 'Objeto (ej.: bolsa T4.1)')} />

  {#if !alvo}
    {#if recentes.length}
      <div class="stack recentes">
        <span class="kpi-label">{tx('Vistos há pouco', 'Vistos hace poco')}</span>
        <div class="row">
          {#each recentes as r (r.id)}
            <button type="button" class="chip-btn" onclick={() => escolher(r)} title={r.id}>{r.nome}</button>
          {/each}
        </div>
      </div>
    {:else}
      <p class="muted small m0">{tx('Digite o nome do item e aperte Enter. Aceita nome em português ou inglês, tier e encantamento (ex.: “capa T6.2”).', 'Escribe el nombre del objeto y presiona Enter. Acepta el nombre en español o en inglés, tier y encantamiento (ej.: “capa T6.2”).')}</p>
    {/if}
  {:else}
    <div class="cab">
      <ItemIcon id={alvo.id} quality={qualidade} size={36} eager />
      <div class="cab-nome">
        <strong title={alvo.id}>{alvo.nome}</strong>
        {#if tier}<span class="tag">{tier}</span>{/if}
      </div>
      <label class="sr-only" for="preco-q">{tx('Qualidade', 'Calidad')}</label>
      <select id="preco-q" class="input sel" value={qualidade} onchange={(e) => mudarQualidade(Number(e.currentTarget.value) as Quality)}>
        {#each QUALITIES as q (q)}<option value={q}>{qualityName(q)}</option>{/each}
      </select>
    </div>

    {#if erro}
      <ErroCaixa mensagem={erro} ontentar={() => carregar(true)} />
    {:else if carregando && !dado}
      <p class="muted small m0" role="status">{tx('Buscando preços…', 'Buscando precios…')}</p>
    {:else if resumo}
      {#if resumo.semDado}
        <p class="callout small m0">{tx('Ninguém registrou preço deste item nas últimas horas. Confira no jogo.', 'Nadie registró el precio de este objeto en las últimas horas. Revísalo en el juego.')}</p>
      {:else}
        {#if resumo.melhor}
          {@const m = resumo.melhor.quote}
          <div class="melhor callout {resumo.melhor.reliable ? 'good' : 'warn'}">
            <span class="kpi-label">{resumo.melhor.reliable ? tx('Mais barato confiável', 'Más barato confiable') : tx('Mais barato visto (pouco confiável)', 'Más barato visto (poco confiable)')}</span>
            <div class="melhor-linha">
              <span class="kpi num">{fmtSilver(m.sellMin)}</span>
              <span class="small">{tx('em', 'en')} <strong class="city-name city-{citySlug(m.city)}">{cityName(m.city)}</strong></span>
            </div>
            <span class="small muted"><AgeDot min={m.ageMin} /> · {tx(`selo ${m.confidence.label}`, `confianza ${confidenceText(m.confidence.label)}`)}</span>
          </div>
        {:else}
          <p class="callout small m0">{tx('Sem ordem de venda nas cidades. Veja as ordens de compra abaixo.', 'No hay órdenes de venta en las ciudades. Mira las órdenes de compra abajo.')}</p>
        {/if}

        <div class="table-wrap">
          <table class="data compacta">
            <caption class="sr-only">{tx('Preço por cidade', 'Precio por ciudad')}</caption>
            <thead>
              <tr><th scope="col">{tx('Cidade', 'Ciudad')}</th><th scope="col" class="num">{tx('Venda', 'Venta')}</th><th scope="col" class="col-compra num">{tx('Compra', 'Compra')}</th><th scope="col">{tx('Idade', 'Antigüedad')}</th><th scope="col" class="col-selo">{tx('Selo', 'Confianza')}</th></tr>
            </thead>
            <tbody>
              {#each resumo.linhas as c (c.city)}
                <tr class:highlight={resumo.melhor?.quote.city === c.city}>
                  <th scope="row"><span class="city-name city-{citySlug(c.city)}">{cityName(c.city)}</span></th>
                  <td class="num">{fmtSilver(c.sellMin, true)}</td>
                  <td class="num col-compra">{fmtSilver(c.buyMax, true)}</td>
                  <td><AgeDot min={c.ageMin} text={false} /><span class="idade">{fmtAge(c.ageMin).replace(/^(há|hace) /, '')}</span></td>
                  <td class="col-selo"><span class="tag {confidenceTone(c.confidence.label)}" title={c.confidence.reasons.join(' · ')}>{confidenceText(c.confidence.label)}</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="flip stack">
          <div class="row flip-cab">
            <span class="kpi-label">{tx('Flip para o Black Market', 'Reventa al Mercado Negro')}</span>
            <label class="check chk"><input type="checkbox" checked={premium} onchange={(e) => mudarPremium(e.currentTarget.checked)} /><span class="small">Premium</span></label>
          </div>
          {#if resumo.flip}
            {@const f = resumo.flip}
            {#if getLocale() === 'es'}
              <p class="small m0">
                Compra en <strong>{cityName(f.flip.from)}</strong> por <span class="num">{fmtSilver(f.flip.buyAt)}</span> y vende en el Mercado Negro por
                <span class="num">{fmtSilver(f.flip.sellAt)}</span>: ganancia de <strong class="good-text num">{fmtSilver(f.lucro)}</strong>
                {#if f.roi !== null}({fmtPct(f.roi)}){/if}.
              </p>
              {#if f.velho}<p class="small warn-text m0">El Mercado Negro cambia rápido y este precio tiene {f.flip.ageMin === null ? 'antigüedad desconocida' : `${f.flip.ageMin} min`}. Revísalo en el juego antes de comprar.</p>{/if}
            {:else}
              <p class="small m0">
                Compre em <strong>{f.flip.from}</strong> por <span class="num">{fmtSilver(f.flip.buyAt)}</span> e venda no Black Market por
                <span class="num">{fmtSilver(f.flip.sellAt)}</span>: lucro de <strong class="good-text num">{fmtSilver(f.lucro)}</strong>
                {#if f.roi !== null}({fmtPct(f.roi)}){/if}.
              </p>
              {#if f.velho}<p class="small warn-text m0">O Black Market muda rápido e este preço tem {f.flip.ageMin === null ? 'idade desconhecida' : `${f.flip.ageMin} min`}. Confira no jogo antes de comprar.</p>{/if}
            {/if}
          {:else}
            <p class="small muted m0">{tx(`Nenhum flip com lucro agora${premium ? '' : ' sem Premium'}.`, `Ninguna reventa con ganancia ahora${premium ? '' : ' sin Premium'}.`)}</p>
          {/if}
        </div>
      {/if}

      <div class="row rodape">
        <span class="small muted">{buscadoEm ? tx(`Preços de ${fmtTime(buscadoEm, undefined, false)} (${brasilia()})`, `Precios de ${articuloHora(fmtTime(buscadoEm, undefined, false))} ${fmtTime(buscadoEm, undefined, false)} (${brasilia()})`) : ''}</span>
        <span class="row">
          <button type="button" class="btn mini-btn" onclick={() => carregar(true)} disabled={carregando}>{carregando ? tx('Atualizando…', 'Actualizando…') : tx('Atualizar', 'Actualizar')}</button>
          <button type="button" class="btn mini-btn" onclick={() => alvo && abrirUrl(urlItemNoSite(alvo.id, qualidade))}>{tx('Abrir no site', 'Abrir en el sitio')}</button>
        </span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .preco { container-type: inline-size; gap: 10px; }
  .m0 { margin: 0; }
  .recentes { gap: 6px; }
  .chip-btn { font: inherit; font-size: 13px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 3px 10px; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-btn:hover { border-color: var(--accent); }
  .cab { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .cab-nome { flex: 1; min-width: 0; display: flex; gap: 6px; align-items: center; }
  .cab-nome strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sel { width: auto; padding: 5px 8px; font-size: 13px; }
  .melhor { display: grid; gap: 2px; padding: 8px 10px; }
  .melhor-linha { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .melhor .kpi { font-size: 22px; }
  table.compacta { font-size: 13px; }
  table.compacta th, table.compacta td { padding: 5px 6px; }
  table.compacta :global(.city-name) { gap: 5px; }
  .col-selo .tag { font-size: 11px; padding: 1px 6px; }
  @container (max-width: 300px) {
    table.compacta th, table.compacta td { padding: 4px 4px; }
  }
  .idade { margin-left: 5px; font-variant-numeric: tabular-nums; }
  .flip { gap: 4px; }
  .flip-cab { justify-content: space-between; }
  .check.chk { gap: 6px; align-items: center; }
  .check.chk input { width: 15px; height: 15px; margin: 0; }
  .rodape { justify-content: space-between; }
  .mini-btn { padding: 4px 10px; font-size: 13px; }
  .cab { flex-wrap: wrap; }
  .cab-nome { min-width: 110px; }
  /* Janela estreita: a idade vira só a bolinha (o texto fica no title), depois some a compra, por último o selo. */
  @container (max-width: 380px) {
    .idade { display: none; }
  }
  @container (max-width: 310px) {
    .col-compra { display: none; }
  }
  @container (max-width: 240px) {
    .col-selo { display: none; }
  }
</style>
