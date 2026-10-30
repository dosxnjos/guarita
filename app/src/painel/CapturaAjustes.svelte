<script lang="ts">
  // Bloco de Ajustes: liga e desliga a captura passiva do PRÓPRIO jogador (src/lib/capture, Rust em
  // src-tauri/src/capture). Desligada por padrão; só liga depois do aviso aceito (o Rust confere no store).
  import { onMount } from 'svelte';
  import { fmtDateTime, fmtInt } from '../lib/format';
  import { abrirLink } from '../lib/links';
  import {
    acompanharCaptura,
    definirDiagnostico,
    desligarCaptura,
    entregarDados,
    estadoCaptura,
    gravarPref,
    lerPref,
    ligarCaptura,
  } from '../lib/capture/captura';
  import { faseLigada, mensagemCaptura, prefPadrao, rotuloFase } from '../lib/capture/sessao';
  import type { EstadoCaptura, PrefCaptura } from '../lib/capture/tipos';
  import { getLocale, linkSite, tx } from '../lib/i18n.svelte';
  import { isTauri } from '../lib/windows';

  const NPCAP = 'https://npcap.com/#download';
  const PERMITIDO = linkSite('/permitido');
  const NPCAP_RESTRICT = 'Restrict Npcap driver\'s access to Administrators only';

  let pref = $state<PrefCaptura>(prefPadrao());
  let estado = $state.raw<EstadoCaptura | null>(null);
  let entendi = $state(false);
  let lendoAviso = $state(false);
  let ocupado = $state(false);
  let erro = $state<string | null>(null);

  const fase = $derived(estado?.fase ?? 'desligada');
  const ligada = $derived(faseLigada(fase));
  const rotulo = $derived(rotuloFase(fase));
  const txt = (e: unknown) => (e instanceof Error ? e.message : String(e));

  onMount(() => {
    if (!isTauri()) return;
    let off = () => {};
    let parar = false;
    void (async () => {
      try {
        pref = await lerPref();
        estado = await estadoCaptura();
        const o = await acompanharCaptura((e) => (estado = e), null);
        if (parar) o();
        else off = o;
      } catch (e) {
        erro = txt(e);
      }
    })();
    return () => {
      parar = true;
      off();
    };
  });

  async function executar(f: () => Promise<void>) {
    ocupado = true;
    erro = null;
    try {
      await f();
    } catch (e) {
      erro = txt(e);
    } finally {
      ocupado = false;
    }
  }

  const aceitarELigar = () =>
    executar(async () => {
      pref = await gravarPref((p) => {
        p.avisoAceitoEm = new Date().toISOString();
        p.ligada = true;
      });
      lendoAviso = false;
      estado = await ligarCaptura();
    });

  const alternar = () =>
    executar(async () => {
      if (ligada) {
        pref = await gravarPref((p) => void (p.ligada = false));
        estado = await desligarCaptura();
      } else {
        pref = await gravarPref((p) => void (p.ligada = true));
        estado = await ligarCaptura();
      }
    });

  const tentarDeNovo = () =>
    executar(async () => {
      await entregarDados();
      estado = await ligarCaptura();
    });

  const retirarAceite = () =>
    executar(async () => {
      estado = await desligarCaptura();
      pref = await gravarPref((p) => {
        p.ligada = false;
        p.avisoAceitoEm = null;
      });
      entendi = false;
    });

  const alternarDiagnostico = () =>
    executar(async () => {
      pref = await gravarPref((p) => void (p.diagnostico = !p.diagnostico));
      estado = await definirDiagnostico(pref.diagnostico);
    });
</script>

<section class="card stack" aria-labelledby="captura-h">
  <div class="sec-cab">
    <h2 id="captura-h">{tx('Captura do próprio jogador', 'Captura de tu propio personaje')} <span class="tag">experimental</span></h2>
    <span class="tag {rotulo[1]}" role="status" aria-live="polite">{rotulo[0]}</span>
  </div>
  {#if getLocale() === 'es'}
    <p class="small muted m0">
      Con Albion abierto, la Guarita lee el tráfico que el juego recibe en tu PC y muestra solo tus números: plata y fama
      por hora, objetos que recogiste con su valor estimado, muertes y el mapa. Alimenta los widgets Sesión y Botín. No se
      muestra nada de otros jugadores, no se envía nada al juego y nada lee el proceso del juego.
    </p>
  {:else}
    <p class="small muted m0">
      Com o Albion aberto, a Guarita lê o tráfego que o jogo recebe no seu PC e mostra só os seus números: prata e fama
      por hora, itens que você pegou com valor estimado, mortes e o mapa. Alimenta os widgets Sessão e Loot. Nada de
      outros jogadores é exibido, nada é enviado ao jogo e nada lê o processo do jogo.
    </p>
  {/if}

  {#if erro}<div class="callout bad small" role="alert">{erro}</div>{/if}

  {#if !isTauri()}
    <p class="small muted m0">{tx('Disponível só dentro do app da Guarita.', 'Disponible solo dentro de la app de la Guarita.')}</p>
  {:else if !pref.avisoAceitoEm}
    {#if lendoAviso}
      <div class="callout warn stack aviso" role="region" aria-label={tx('Aviso antes de ligar a captura', 'Aviso antes de activar la captura')}>
        <strong>{tx('Antes de ligar, leia', 'Antes de activarla, lee esto')}</strong>
        {#if getLocale() === 'es'}
          <p>Sandbox Interactive tolera desde 2017 leer el tráfico de red solo para análisis; <strong>no está permitido oficialmente</strong>. El riesgo es tuyo: lo que está en juego es tu cuenta de Albion.</p>
          <p>La Guarita solo escucha, sin modo promiscuo, lo que el servidor del juego envía a tu PC (puerto UDP 5056). No altera ni envía paquetes, no lee la memoria del juego y descarta, ya en la lectura, todo lo que es de otros jugadores (nombres, equipo, posición).</p>
        {:else}
          <p>Ler o tráfego de rede só para análise é tolerado pela Sandbox Interactive desde 2017; <strong>não é permitido oficialmente</strong>. O risco é da sua conta.</p>
          <p>A Guarita só escuta, sem modo promíscuo, o que o servidor do jogo manda ao seu PC (porta UDP 5056). Não altera nem envia pacote, não lê a memória do jogo e descarta, ainda na leitura, tudo o que é de outros jogadores (nomes, equipamento, posição).</p>
        {/if}
        <p class="small"><a href={PERMITIDO} onclick={(e) => abrirLink(e, PERMITIDO)}>{tx('Entenda o que é e o que não é permitido', 'Entiende qué está permitido y qué no')}</a></p>
        <label class="check">
          <input type="checkbox" bind:checked={entendi} />
          <span>{tx('Entendi o risco e quero ligar a captura mesmo assim.', 'Entiendo el riesgo y quiero activar la captura de todos modos.')}</span>
        </label>
        <div class="row">
          <button type="button" class="btn primary" onclick={aceitarELigar} disabled={!entendi || ocupado}>{tx('Ligar a captura', 'Activar la captura')}</button>
          <button type="button" class="btn" onclick={() => (lendoAviso = false)}>{tx('Cancelar', 'Cancelar')}</button>
        </div>
      </div>
    {:else}
      <p class="small m0">{tx('Desligada por padrão. Para ligar, leia o aviso sobre a regra da Sandbox Interactive.', 'Desactivada por defecto. Para activarla, lee el aviso sobre la regla de Sandbox Interactive.')}</p>
      <div><button type="button" class="btn" onclick={() => (lendoAviso = true)}>{tx('Ler o aviso', 'Leer el aviso')}</button></div>
    {/if}
  {:else}
    <button type="button" class="switch" role="switch" aria-checked={ligada} disabled={ocupado} onclick={alternar}>
      <span class="switch-track" aria-hidden="true"></span>
      <span><strong>{tx('Captura ligada', 'Captura activada')}</strong><br /><span class="small muted">{tx('Só funciona com este app aberto. Desligar para tudo na hora.', 'Solo funciona con esta app abierta. Al desactivarla, todo se detiene al instante.')}</span></span>
    </button>

    {#if fase === 'sem-npcap'}
      <div class="callout warn stack">
        <strong>{tx('Npcap não encontrado', 'Npcap no encontrado')}</strong>
        <p class="small m0">{tx('O Windows não deixa um programa ler o tráfego de rede sem um driver de captura. O Npcap é esse driver (o mesmo usado pelo Wireshark e pelo cliente do Albion Data Project). A Guarita não o instala junto: instalar é escolha sua.', 'Windows no deja que un programa lea el tráfico de red sin un controlador de captura. Npcap es ese controlador (el mismo que usan Wireshark y el cliente del Albion Data Project). La Guarita no lo instala: instalarlo es tu decisión.')}</p>
        <ol class="small passos">
          <li>{tx('Baixe o instalador na página oficial:', 'Descarga el instalador desde la página oficial:')} <a href={NPCAP} onclick={(e) => abrirLink(e, NPCAP)}>npcap.com</a> {tx('(o Npcap tem licença própria; leia na página).', '(Npcap tiene su propia licencia; léela en la página).')}</li>
          {#if getLocale() === 'es'}
            <li>Instálalo con las opciones predeterminadas. <strong>No marques</strong> “{NPCAP_RESTRICT}”, porque si no la Guarita no puede leer sin ejecutarse como administrador.</li>
            <li>Vuelve aquí y haz clic en “Intentar de nuevo”. No hace falta reiniciar la app.</li>
          {:else}
            <li>Instale com as opções padrão. <strong>Não marque</strong> “Restrict Npcap driver's access to Administrators only”, senão a Guarita não consegue ler sem rodar como administrador.</li>
            <li>Volte aqui e clique em “Tentar de novo”. Não precisa reiniciar o app.</li>
          {/if}
        </ol>
        <div><button type="button" class="btn" onclick={tentarDeNovo} disabled={ocupado}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></div>
      </div>
    {:else if fase === 'npcap-invalido' || fase === 'sem-permissao' || fase === 'sem-interface'}
      <div class="callout warn stack">
        {#if fase === 'npcap-invalido'}
          <strong>{tx('O Npcap está instalado, mas não carregou', 'Npcap está instalado, pero no se cargó')}</strong>
          <p class="small m0">{tx('Reinstale a versão atual a partir de', 'Reinstala la versión actual desde')} <a href={NPCAP} onclick={(e) => abrirLink(e, NPCAP)}>npcap.com</a>.</p>
        {:else if fase === 'sem-permissao'}
          <strong>{tx('Nenhuma rede pôde ser aberta', 'No se pudo abrir ninguna red')}</strong>
          <p class="small m0">{tx('O mais comum é o Npcap instalado só para administradores. Reinstale a partir de', 'Lo más común es que Npcap esté instalado solo para administradores. Reinstálalo desde')} <a href={NPCAP} onclick={(e) => abrirLink(e, NPCAP)}>npcap.com</a> {tx('sem a opção', 'sin la opción')} “{NPCAP_RESTRICT}”.</p>
        {:else}
          <strong>{tx('Nenhuma placa de rede encontrada', 'No se encontró ninguna tarjeta de red')}</strong>
          <p class="small m0">{tx('Confira se o computador está conectado e se o Npcap foi instalado com as opções padrão.', 'Revisa que la computadora esté conectada y que Npcap se haya instalado con las opciones predeterminadas.')}</p>
        {/if}
        {#if estado?.mensagem}<p class="small muted m0 mono">{tx('Detalhe', 'Detalle')}: {mensagemCaptura(estado.mensagem)}</p>{/if}
        <div><button type="button" class="btn" onclick={tentarDeNovo} disabled={ocupado}>{tx('Tentar de novo', 'Intentar de nuevo')}</button></div>
      </div>
    {:else if fase === 'aguardando-jogo'}
      <p class="small m0">{tx(`Lendo ${estado?.interfaces} ${estado?.interfaces === 1 ? 'rede' : 'redes'}. Abra o Albion e entre num mapa.`, `Leyendo ${estado?.interfaces} ${estado?.interfaces === 1 ? 'red' : 'redes'}. Abre Albion y entra en un mapa.`)}</p>
    {:else if fase === 'aguardando-mapa'}
      <p class="small m0">{tx('O tráfego do jogo está chegando. Troque de mapa uma vez (entre por um portal) para a Guarita reconhecer o seu personagem.', 'El tráfico del juego está llegando. Cambia de mapa una vez (entra por un portal) para que la Guarita reconozca a tu personaje.')}</p>
    {:else if fase === 'capturando'}
      <p class="small m0">{tx('Lendo o seu personagem. Abra os widgets Sessão e Loot na aba Início.', 'Leyendo a tu personaje. Abre los widgets Sesión y Botín en la pestaña Inicio.')}</p>
    {/if}

    {#if estado && ligada}
      {#if getLocale() === 'es'}
        <p class="small muted m0">
          {fmtInt(estado.numeros.datagramas)} paquetes del juego leídos · {fmtInt(estado.numeros.fatosProprios)} registros tuyos{#if estado.numeros.criptografados} · {fmtInt(estado.numeros.criptografados)} cifrados (ignorados){/if}.
          Los eventos de otros jugadores se descartan.
        </p>
      {:else}
        <p class="small muted m0">
          {fmtInt(estado.numeros.datagramas)} pacotes do jogo lidos · {fmtInt(estado.numeros.fatosProprios)} registros seus{#if estado.numeros.criptografados} · {fmtInt(estado.numeros.criptografados)} criptografados (ignorados){/if}.
          Eventos de outros jogadores são descartados.
        </p>
      {/if}
    {/if}

    <details class="small">
      <summary>{tx('Detalhes técnicos', 'Detalles técnicos')}</summary>
      <div class="stack detalhes">
        {#if estado}
          {#if getLocale() === 'es'}
            <p class="m0">Tabla de códigos v{estado.tabela.versao} del {estado.tabela.atualizadoEm} ({estado.tabela.origem === 'remota' ? 'actualizada desde GitHub' : 'la que vino con la app'}). Los códigos cambian con cada actualización de Albion; la tabla nueva llega sin instalar otra versión.</p>
          {:else}
            <p class="m0">Tabela de códigos v{estado.tabela.versao} de {estado.tabela.atualizadoEm} ({estado.tabela.origem === 'remota' ? 'atualizada pelo GitHub' : 'a que veio com o app'}). Os códigos mudam a cada atualização do Albion; a tabela nova chega sem instalar outra versão.</p>
          {/if}
          {#if estado.npcapVersao}<p class="m0 mono">{estado.npcapVersao}</p>{/if}
        {/if}
        <button type="button" class="switch" role="switch" aria-checked={pref.diagnostico} disabled={ocupado} onclick={alternarDiagnostico}>
          <span class="switch-track" aria-hidden="true"></span>
          <span>{tx('Modo de diagnóstico', 'Modo de diagnóstico')}<br /><span class="muted">{tx('Grava a cada 30 s quantas vezes cada código de evento apareceu (só números, sem conteúdo), para conferir a tabela depois de um patch.', 'Guarda cada 30 s cuántas veces apareció cada código de evento (solo números, sin contenido), para revisar la tabla después de un parche.')}</span></span>
        </button>
        {#if estado?.arquivoDiagnostico}<p class="m0 muted">{tx('Arquivo', 'Archivo')}: <span class="mono">{estado.arquivoDiagnostico}</span></p>{/if}
      </div>
    </details>

    <p class="small muted m0">{tx('Aviso aceito em', 'Aviso aceptado el')} {fmtDateTime(pref.avisoAceitoEm)} ({tx('Brasília', 'hora de Brasilia')}). <button type="button" class="linkbtn" onclick={retirarAceite} disabled={ocupado}>{tx('Retirar o aceite e desligar', 'Retirar la aceptación y desactivar')}</button></p>
  {/if}
</section>

<style>
  .m0 { margin: 0; }
  section h2 { margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sec-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .aviso p { margin: 0; }
  .passos { margin: 4px 0; padding-left: 18px; display: grid; gap: 4px; }
  .detalhes { gap: 8px; padding-top: 6px; }
  summary { cursor: pointer; }
  .mono { word-break: break-all; }
</style>
