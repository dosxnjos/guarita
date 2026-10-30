<script lang="ts">
  // Um bundle, várias janelas: o rótulo da janela escolhe a tela (lib/windows.ts → currentLabel).
  import type { Component } from 'svelte';
  import { PAINEL, WIDGET_TITLES, type WidgetLabel, type WindowLabel } from './lib/windows';
  import WidgetChrome from './lib/ui/WidgetChrome.svelte';
  import Painel from './painel/Painel.svelte';
  import Preco from './widgets/Preco.svelte';
  import Dossie from './widgets/Dossie.svelte';
  import Relogio from './widgets/Relogio.svelte';
  import Alertas from './widgets/Alertas.svelte';
  import Despertador from './widgets/Despertador.svelte';
  import Lente from './widgets/Lente.svelte';
  import { acompanharTema } from './lib/ui-janelas';

  let { label }: { label: WindowLabel } = $props();

  // Tema escolhido no painel (localStorage compartilhado pelas janelas; a troca chega às outras pelo evento storage).
  $effect(() => acompanharTema());

  const WIDGETS: Record<WidgetLabel, Component> = { preco: Preco, dossie: Dossie, relogio: Relogio, alertas: Alertas, despertador: Despertador, lente: Lente };
</script>

{#if label === PAINEL}
  <Painel />
{:else}
  {@const W = WIDGETS[label]}
  <WidgetChrome {label} titulo={WIDGET_TITLES[label]}>
    <W />
  </WidgetChrome>
{/if}
