<script lang="ts">
  // Widget "Sessão": prata, fama e loot por hora do PRÓPRIO jogador, a partir da captura passiva (src/lib/capture).
  // Só agregados; a captura é ligada e desligada no painel (Ajustes), com aviso.
  import { onMount } from 'svelte';
  import type { PriceRow } from '../../../shared/types';
  import { fmtSilver, fmtInt, fmtTime } from '../lib/format';
  import { acompanharCaptura, estadoCaptura, novaSessao, sessaoCaptura } from '../lib/capture/captura';
  import { precosDoLoot } from '../lib/capture/precos';
  import { ROTULO_FASE, duracaoAgora, fmtDuracao, marcaDoLoot, porHora, valorLoot } from '../lib/capture/sessao';
  import type { EstadoCaptura, RetratoSessao } from '../lib/capture/tipos';
  import { isTauri } from '../lib/windows';
  import Carregando from '../lib/ui/Carregando.svelte';
  import ErroCaixa from '../lib/ui/ErroCaixa.svelte';

  let estado = $state.raw<EstadoCaptura | null>(null);
  let retrato = $state.raw<RetratoSessao | null>(null);
  let rows = $state.raw<PriceRow[]>([]);
  let erro = $state<string | null>(null);
  let erroPreco = $state<string | null>(null);
  let agora = $state(Date.now());
  let zerando = $state(false);
  let confirmarZerar = $state(false);

  const duracao = $derived(retrato ? duracaoAgora(retrato, agora) : 0);
  const loot = $derived(retrato ? valorLoot(retrato.loot, rows, agora) : null);
  const ritmo = $derived({
    prata: retrato ? porHora(retrato.prata, duracao) : null,
    fama: retrato ? porHora(retrato.fama, duracao) : null,
    loot: loot ? porHora(loot.total, duracao) : null,
  });
  const fase = $derived(estado?.fase ?? 'desligada');

  let seqPreco = 0;
  async function atualizarPrecos(r: RetratoSessao) {
    const meu = ++seqPreco;
    try {
      const p = await precosDoLoot(r.loot);
      if (meu !== seqPreco) return;
      rows = p?.rows ?? [];
      erroPreco = null;
    } catch (e) {
      if (meu === seqPreco) erroPreco = e instanceof Error ? e.message : String(e);
    }
  }

  let ultimoLoot: string | null = null;
  function aoRetrato(r: RetratoSessao) {
    retrato = r;
    // Preço só quando o loot muda ou ganha id (a API tem cache de 60 s, mas não precisa nem pedir).
    const marca = marcaDoLoot(r.loot);
    if (marca !== ultimoLoot) {
      ultimoLoot = marca;
      void atualizarPrecos(r);
    }
  }

  onMount(() => {
    let off = () => {};
    let parar = false;
    if (isTauri()) {
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
    } else {
      erro = 'A sessão só funciona dentro do app da Guarita.';
    }
    const t = setInterval(() => (agora = Date.now()), 1000);
    return () => {
      parar = true;
      off();
      clearInterval(t);
    };
  });

  async function zerar() {
    zerando = true;
    try {
      aoRetrato(await novaSessao());
      rows = [];
      confirmarZerar = false;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    } finally {
      zerando = false;
    }
  }

  const fmtRitmo = (v: number | null, fmt: (n: number) => string) => (v === null ? '—' : `${fmt(v)}/h`);
</script>

<div class="sessao stack">
  <div class="topo">
    <span class="tag {ROTULO_FASE[fase][1]}" role="status" aria-live="polite">{ROTULO_FASE[fase][0]}</span>
    {#if retrato?.zona}<span class="small muted zona" title={retrato.zona.id}>{retrato.zona.nome ?? retrato.zona.id}</span>{/if}
  </div>

  {#if erro}
    <ErroCaixa mensagem={erro} />
  {:else if !estado || !retrato}
    <Carregando texto="Lendo a sessão…" />
  {:else}
    {#if fase === 'desligada' && retrato.fatos === 0}
      <p class="small m0">A captura está desligada. Para ver prata, fama e loot por hora, ligue em <strong>Ajustes › Captura do próprio jogador</strong>, no painel.</p>
    {:else if fase === 'sem-npcap' || fase === 'npcap-invalido' || fase === 'sem-interface' || fase === 'sem-permissao'}
      <p class="small m0">A captura não conseguiu ler a rede. Veja o que falta em <strong>Ajustes › Captura do próprio jogador</strong>, no painel.</p>
    {:else if fase === 'aguardando-jogo'}
      <p class="small muted m0">Aguardando o tráfego do Albion. Abra o jogo e entre num mapa.</p>
    {:else if fase === 'aguardando-mapa'}
      <p class="small muted m0">Troque de mapa uma vez (entre por um portal) para a Guarita reconhecer o seu personagem.</p>
    {/if}

    <dl class="numeros">
      <div><dt>Tempo</dt><dd>{fmtDuracao(duracao)}</dd></div>
      <div><dt>Mortes</dt><dd>{fmtInt(retrato.mortes)}</dd></div>
      <div>
        <dt>Prata recolhida</dt>
        <dd>{fmtSilver(retrato.prata)}<span class="ritmo">{fmtRitmo(ritmo.prata, (n) => fmtSilver(n, true))}</span></dd>
      </div>
      <div>
        <dt>Fama</dt>
        <dd>{fmtInt(Math.round(retrato.fama))}<span class="ritmo">{fmtRitmo(ritmo.fama, (n) => fmtInt(Math.round(n)))}</span></dd>
      </div>
      <div class="largo">
        <dt>Loot (valor estimado)</dt>
        <dd>
          {loot && loot.linhas.length ? fmtSilver(loot.total) : '—'}<span class="ritmo">{fmtRitmo(ritmo.loot, (n) => fmtSilver(n, true))}</span>
        </dd>
      </div>
    </dl>
    {#if loot && loot.semPreco > 0}
      <p class="small muted m0">{loot.semPreco} {loot.semPreco === 1 ? 'item sem preço ficou' : 'itens sem preço ficaram'} fora do valor.</p>
    {/if}
    {#if erroPreco}<p class="small warn-text m0">Sem preço agora: {erroPreco}</p>{/if}
    {#if retrato.saldoVariacao !== null}
      <p class="small muted m0">Saldo de prata {retrato.saldoVariacao >= 0 ? 'subiu' : 'caiu'} {fmtSilver(Math.abs(retrato.saldoVariacao))} na sessão (inclui compras e vendas).</p>
    {/if}

    <div class="rodape">
      <span class="small muted">Desde {fmtTime(retrato.iniciadaEm, undefined, false)}</span>
      {#if confirmarZerar}
        <span class="row">
          <button type="button" class="btn mini-btn" onclick={zerar} disabled={zerando}>Zerar</button>
          <button type="button" class="btn mini-btn" onclick={() => (confirmarZerar = false)}>Cancelar</button>
        </span>
      {:else}
        <button type="button" class="btn mini-btn" onclick={() => (confirmarZerar = true)}>Nova sessão</button>
      {/if}
    </div>
    <p class="small muted m0 nota">Valor do loot: mediana da venda mais barata nas cidades (qualidade normal), pela Guarita. É estimativa, não preço garantido.</p>
  {/if}
</div>

<style>
  .sessao { gap: 8px; }
  .m0 { margin: 0; }
  .topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .zona { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .numeros { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 0; }
  .numeros div { display: grid; gap: 1px; min-width: 0; }
  .numeros .largo { grid-column: 1 / -1; }
  .numeros dt { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .numeros dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; }
  .ritmo { font-size: 12px; font-weight: 400; color: var(--muted); }
  .rodape { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .mini-btn { padding: 4px 10px; font-size: 13px; }
  .nota { font-size: 11px; }
</style>
