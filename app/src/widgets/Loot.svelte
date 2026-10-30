<script lang="ts">
  // Widget "Loot": itens que o PRÓPRIO jogador pegou nesta sessão (corpos, baús, chão), com quantidade e valor
  // estimado pela API da Guarita. Vem da captura passiva (src/lib/capture), ligada no painel com aviso.
  import { onMount } from 'svelte';
  import type { PriceRow } from '../../../shared/types';
  import { findItem, tierLabel, type ItemsIndex } from '../../../shared/items';
  import { RENDER_BASE } from '../../../shared/market';
  import { ageTone, ageToneLabel, fmtAge, fmtInt, fmtSilver } from '../lib/format';
  import { acompanharCaptura, estadoCaptura, sessaoCaptura } from '../lib/capture/captura';
  import { precosDoLoot } from '../lib/capture/precos';
  import { marcaDoLoot, rotuloFase, valorLoot } from '../lib/capture/sessao';
  import type { EstadoCaptura, RetratoSessao } from '../lib/capture/tipos';
  import { getLocale, tx } from '../lib/i18n.svelte';
  // Índice da língua do app: em espanhol, o nome do item vem do items-index-es.json.
  import { carregarItens } from '../lib/ui-itens';
  import { isTauri } from '../lib/windows';
  import Carregando from '../lib/ui/Carregando.svelte';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';

  let estado = $state.raw<EstadoCaptura | null>(null);
  let retrato = $state.raw<RetratoSessao | null>(null);
  let rows = $state.raw<PriceRow[]>([]);
  let indice = $state.raw<ItemsIndex | null>(null);
  let erro = $state<string | null>(null);
  let erroPreco = $state<string | null>(null);
  let buscandoPreco = $state(false);

  const loot = $derived(retrato ? valorLoot(retrato.loot, rows) : null);
  const fase = $derived(estado?.fase ?? 'desligada');

  function nomeDe(id: string | null, idx: number): { nome: string; tier: string } {
    if (!id) return { nome: tx(`Item nº ${idx}`, `Objeto n.º ${idx}`), tier: '' };
    const t = indice ? findItem(indice, id) : undefined;
    return t ? { nome: t[1] || t[2] || id, tier: tierLabel(t[3], t[4]) } : { nome: id, tier: '' };
  }

  let seqPreco = 0;
  async function atualizarPrecos(r: RetratoSessao) {
    const meu = ++seqPreco;
    buscandoPreco = true;
    try {
      const p = await precosDoLoot(r.loot);
      if (meu !== seqPreco) return;
      rows = p?.rows ?? [];
      erroPreco = null;
    } catch (e) {
      if (meu === seqPreco) erroPreco = e instanceof Error ? e.message : String(e);
    } finally {
      if (meu === seqPreco) buscandoPreco = false;
    }
  }

  let ultimoLoot: string | null = null;
  function aoRetrato(r: RetratoSessao) {
    retrato = r;
    // Busca preço quando entra item, muda quantidade ou um item ganha id (lista de itens chegou depois).
    const marca = marcaDoLoot(r.loot);
    if (marca !== ultimoLoot) {
      ultimoLoot = marca;
      if (!r.loot.length) rows = [];
      else void atualizarPrecos(r);
    }
  }

  onMount(() => {
    let off = () => {};
    let parar = false;
    if (!isTauri()) {
      erro = tx('O loot só aparece dentro do app da Guarita.', 'El botín solo aparece dentro de la app de la Guarita.');
      return;
    }
    void (async () => {
      try {
        const [e, r] = await Promise.all([estadoCaptura(), sessaoCaptura()]);
        estado = e;
        aoRetrato(r);
        const o = await acompanharCaptura((x) => (estado = x), aoRetrato);
        if (parar) o();
        else off = o;
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
    })();
    // Nomes em PT-BR (mesma cópia local do preço rápido); sem índice, mostra o id.
    carregarItens().then((i) => (indice = i)).catch(() => {});
    return () => {
      parar = true;
      off();
    };
  });
</script>

<div class="loot stack">
  <div class="topo">
    <span class="tag {rotuloFase(fase)[1]}" role="status" aria-live="polite">{rotuloFase(fase)[0]}</span>
    {#if loot && loot.linhas.length}
      <strong class="total" aria-label={tx('Valor estimado do loot', 'Valor estimado del botín')}>{fmtSilver(loot.total)}</strong>
    {/if}
  </div>

  {#if erro}
    <ErroCaixa mensagem={erro} />
  {:else if !estado || !retrato || !loot}
    <Carregando texto={tx('Lendo o loot…', 'Leyendo el botín…')} />
  {:else if !loot.linhas.length}
    {#if fase === 'capturando'}
      <p class="small muted m0">{tx('Nenhum item pego nesta sessão ainda. O que você pegar de corpos, baús e do chão aparece aqui.', 'Todavía no recogiste ningún objeto en esta sesión. Lo que recojas de cuerpos, cofres y del suelo aparece aquí.')}</p>
    {:else if fase === 'aguardando-mapa'}
      <p class="small muted m0">{tx('Troque de mapa uma vez (entre por um portal) para a Guarita reconhecer o seu personagem.', 'Cambia de mapa una vez (entra por un portal) para que la Guarita reconozca a tu personaje.')}</p>
    {:else if fase === 'aguardando-jogo'}
      <p class="small muted m0">{tx('Aguardando o tráfego do Albion. Abra o jogo e entre num mapa.', 'Esperando el tráfico de Albion. Abre el juego y entra en un mapa.')}</p>
    {:else if getLocale() === 'es'}
      <p class="small m0">La captura está desactivada o sin acceso a la red. Revísala en <strong>Ajustes › Captura de tu propio personaje</strong>, en el panel.</p>
    {:else}
      <p class="small m0">A captura está desligada ou sem acesso à rede. Veja em <strong>Ajustes › Captura do próprio jogador</strong>, no painel.</p>
    {/if}
  {:else}
    <div class="table-wrap">
      <table class="data tabela">
        <caption class="sr-only">{tx('Itens pegos nesta sessão, com valor estimado', 'Objetos recogidos en esta sesión, con su valor estimado')}</caption>
        <thead>
          <tr><th>{tx('Item', 'Objeto')}</th><th class="num">{tx('Qtd.', 'Cant.')}</th><th class="num">{tx('Valor', 'Valor')}</th></tr>
        </thead>
        <tbody>
          {#each loot.linhas as l (l.indice)}
            {@const n = nomeDe(l.itemId, l.indice)}
            <tr>
              <td>
                <span class="item">
                  {#if l.itemId}
                    <img src="{RENDER_BASE}/{encodeURIComponent(l.itemId)}.png?size=48" alt="" width="28" height="28" loading="lazy" />
                  {/if}
                  <span class="nome">
                    <span class="nome-txt">{n.nome}</span>
                    {#if n.tier}<span class="small muted">{n.tier}</span>{/if}
                  </span>
                </span>
              </td>
              <td class="num">{fmtInt(l.quantidade)}</td>
              <td class="num">
                {#if l.total !== null}
                  {fmtSilver(l.total, true)}
                  <span class="sub muted" title={ageToneLabel(ageTone(l.idadeMin))}>
                    <span class="age {ageTone(l.idadeMin)}" aria-hidden="true"></span>{fmtAge(l.idadeMin)}
                  </span>
                {:else}
                  <span class="muted">{buscandoPreco ? '…' : tx('sem preço', 'sin precio')}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if erroPreco}<p class="small warn-text m0">{tx('Sem preço agora', 'Sin precio ahora')}: {erroPreco}</p>{/if}
    {#if getLocale() === 'es'}
      <p class="small muted m0 nota">
        Valor: mediana de la venta más barata en las ciudades (calidad normal), según la Guarita.{#if loot.semPreco} Los objetos sin precio quedan fuera del total.{/if}
        La plata recogida de los cuerpos entra en la sesión, no aquí.
      </p>
    {:else}
      <p class="small muted m0 nota">
        Valor: mediana da venda mais barata nas cidades (qualidade normal), pela Guarita.{#if loot.semPreco} Itens sem preço ficam fora do total.{/if}
        A prata pega dos corpos entra na sessão, não aqui.
      </p>
    {/if}
  {/if}
</div>

<style>
  .loot { gap: 8px; }
  .m0 { margin: 0; }
  .topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .total { font-variant-numeric: tabular-nums; }
  .tabela { font-size: 13px; }
  .tabela th, .tabela td { padding: 4px 6px; vertical-align: middle; }
  .item { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .nome { display: grid; min-width: 0; }
  .nome-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { display: block; font-size: 11px; }
  .nota { font-size: 11px; }
</style>
