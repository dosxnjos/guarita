<script lang="ts">
  // Widget "Sessão": prata, fama e loot por hora do PRÓPRIO jogador, a partir da captura passiva (src/lib/capture).
  // Só agregados; a captura é ligada e desligada no painel (Ajustes), com aviso.
  import { onMount } from 'svelte';
  import type { PriceRow } from '../../../shared/types';
  import { articuloHora, fmtSilver, fmtInt, fmtTime } from '../lib/format';
  import { acompanharCaptura, estadoCaptura, novaSessao, sessaoCaptura } from '../lib/capture/captura';
  import { precosDoLoot } from '../lib/capture/precos';
  import { duracaoAgora, fmtDuracao, marcaDoLoot, porHora, rotuloFase, valorLoot } from '../lib/capture/sessao';
  import type { EstadoCaptura, RetratoSessao } from '../lib/capture/tipos';
  import { getLocale, tx } from '../lib/i18n.svelte';
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
      erro = tx('A sessão só funciona dentro do app da Guarita.', 'La sesión solo funciona dentro de la app de la Guarita.');
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
    <span class="tag {rotuloFase(fase)[1]}" role="status" aria-live="polite">{rotuloFase(fase)[0]}</span>
    <!-- O nome do mapa vem do world.txt do ao-bin-dumps, só em inglês (lang para o leitor de tela). -->
    {#if retrato?.zona}<span class="small muted zona" lang="en" title={retrato.zona.id}>{retrato.zona.nome ?? retrato.zona.id}</span>{/if}
  </div>

  {#if erro}
    <ErroCaixa mensagem={erro} />
  {:else if !estado || !retrato}
    <Carregando texto={tx('Lendo a sessão…', 'Leyendo la sesión…')} />
  {:else}
    {#if fase === 'desligada' && retrato.fatos === 0}
      {#if getLocale() === 'es'}
        <p class="small m0">La captura está desactivada. Para ver plata, fama y botín por hora, actívala en <strong>Ajustes › Captura de tu propio personaje</strong>, en el panel.</p>
      {:else}
        <p class="small m0">A captura está desligada. Para ver prata, fama e loot por hora, ligue em <strong>Ajustes › Captura do próprio jogador</strong>, no painel.</p>
      {/if}
    {:else if fase === 'sem-npcap' || fase === 'npcap-invalido' || fase === 'sem-interface' || fase === 'sem-permissao'}
      {#if getLocale() === 'es'}
        <p class="small m0">La captura no pudo leer la red. Mira qué falta en <strong>Ajustes › Captura de tu propio personaje</strong>, en el panel.</p>
      {:else}
        <p class="small m0">A captura não conseguiu ler a rede. Veja o que falta em <strong>Ajustes › Captura do próprio jogador</strong>, no painel.</p>
      {/if}
    {:else if fase === 'aguardando-jogo'}
      <p class="small muted m0">{tx('Aguardando o tráfego do Albion. Abra o jogo e entre num mapa.', 'Esperando el tráfico de Albion. Abre el juego y entra en un mapa.')}</p>
    {:else if fase === 'aguardando-mapa'}
      <p class="small muted m0">{tx('Troque de mapa uma vez (entre por um portal) para a Guarita reconhecer o seu personagem.', 'Cambia de mapa una vez (entra por un portal) para que la Guarita reconozca a tu personaje.')}</p>
    {/if}

    <dl class="numeros">
      <div><dt>{tx('Tempo', 'Tiempo')}</dt><dd>{fmtDuracao(duracao)}</dd></div>
      <div><dt>{tx('Mortes', 'Muertes')}</dt><dd>{fmtInt(retrato.mortes)}</dd></div>
      <div>
        <dt>{tx('Prata recolhida', 'Plata recogida')}</dt>
        <dd>{fmtSilver(retrato.prata)}<span class="ritmo">{fmtRitmo(ritmo.prata, (n) => fmtSilver(n, true))}</span></dd>
      </div>
      <div>
        <dt>{tx('Fama', 'Fama')}</dt>
        <dd>{fmtInt(Math.round(retrato.fama))}<span class="ritmo">{fmtRitmo(ritmo.fama, (n) => fmtInt(Math.round(n)))}</span></dd>
      </div>
      <div class="largo">
        <dt>{tx('Loot (valor estimado)', 'Botín (valor estimado)')}</dt>
        <dd>
          {loot && loot.linhas.length ? fmtSilver(loot.total) : '—'}<span class="ritmo">{fmtRitmo(ritmo.loot, (n) => fmtSilver(n, true))}</span>
        </dd>
      </div>
    </dl>
    {#if loot && loot.semPreco > 0}
      <p class="small muted m0">{loot.semPreco} {loot.semPreco === 1 ? tx('item sem preço ficou', 'objeto sin precio quedó') : tx('itens sem preço ficaram', 'objetos sin precio quedaron')} {tx('fora do valor.', 'fuera del valor.')}</p>
    {/if}
    {#if erroPreco}<p class="small warn-text m0">{tx('Sem preço agora', 'Sin precio ahora')}: {erroPreco}</p>{/if}
    {#if retrato.saldoVariacao !== null}
      {#if getLocale() === 'es'}
        <p class="small muted m0">El saldo de plata {retrato.saldoVariacao >= 0 ? 'subió' : 'bajó'} {fmtSilver(Math.abs(retrato.saldoVariacao))} en la sesión (incluye compras y ventas).</p>
      {:else}
        <p class="small muted m0">Saldo de prata {retrato.saldoVariacao >= 0 ? 'subiu' : 'caiu'} {fmtSilver(Math.abs(retrato.saldoVariacao))} na sessão (inclui compras e vendas).</p>
      {/if}
    {/if}

    <div class="rodape">
      <span class="small muted">{tx('Desde', `Desde ${articuloHora(fmtTime(retrato.iniciadaEm, undefined, false))}`)} {fmtTime(retrato.iniciadaEm, undefined, false)}</span>
      {#if confirmarZerar}
        <span class="row">
          <button type="button" class="btn mini-btn" onclick={zerar} disabled={zerando}>{tx('Zerar', 'Reiniciar')}</button>
          <button type="button" class="btn mini-btn" onclick={() => (confirmarZerar = false)}>{tx('Cancelar', 'Cancelar')}</button>
        </span>
      {:else}
        <button type="button" class="btn mini-btn" onclick={() => (confirmarZerar = true)}>{tx('Nova sessão', 'Nueva sesión')}</button>
      {/if}
    </div>
    <p class="small muted m0 nota">{tx('Valor do loot: mediana da venda mais barata nas cidades (qualidade normal), pela Guarita. É estimativa, não preço garantido.', 'Valor del botín: mediana de la venta más barata en las ciudades (calidad normal), según la Guarita. Es una estimación, no un precio garantizado.')}</p>
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
