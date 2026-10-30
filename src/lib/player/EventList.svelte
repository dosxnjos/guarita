<script lang="ts">
  // Lista de kills ou mortes recentes: quando (Brasília), contra quem, IP, participantes e valor estimado.
  import type { KillEvent } from '../../../shared/types';
  import { go } from '../router';
  import { fmtAgo, fmtCompact, fmtDateBR, fmtNum, playerHref } from './format';
  let { events, mode, empty }: { events: KillEvent[]; mode: 'kill' | 'death'; empty: string } = $props();
</script>

{#if events.length}
  <ul class="events">
    {#each events as ev (ev.id)}
      {@const me = mode === 'kill' ? ev.killer : ev.victim}
      {@const other = mode === 'kill' ? ev.victim : ev.killer}
      <li class="ev {mode}">
        <div class="head">
          <span class="tag {mode === 'kill' ? 'good' : 'bad'}">{mode === 'kill' ? 'Kill' : 'Morte'}</span>
          <time datetime={ev.time} title={fmtDateBR(ev.time) + ' (Brasília)'}>{fmtAgo(ev.time)}</time>
          <span class="muted small">{fmtDateBR(ev.time)}</span>
        </div>
        <div class="who">
          {mode === 'kill' ? 'Matou' : 'Morto por'}
          {#if other.id}<a href={playerHref(other.id)} onclick={go}>{other.name || 'desconhecido'}</a>{:else}<strong>{other.name || 'desconhecido'}</strong>{/if}
          {#if other.guild}<span class="muted small">[{other.guild}]</span>{/if}
        </div>
        <dl class="facts small">
          <div><dt>IP</dt><dd class="num">{fmtNum(me.ip)} vs {fmtNum(other.ip)}</dd></div>
          <div><dt>Tamanho do grupo</dt><dd class="num">{fmtNum(ev.participants)}</dd></div>
          <div><dt>Fama</dt><dd class="num">{fmtCompact(ev.totalFame)}</dd></div>
          <div><dt>Valor estimado</dt><dd class="num">{ev.estValue === null ? 'sem preço' : fmtCompact(ev.estValue) + ' prata'}</dd></div>
        </dl>
      </li>
    {/each}
  </ul>
{:else}
  <p class="empty small">{empty}</p>
{/if}

<style>
  .events { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .ev { border: 1px solid var(--line); border-left: 4px solid var(--good); border-radius: 8px; padding: 10px 12px; background: var(--surface); min-width: 0; }
  .ev.death { border-left-color: var(--bad); }
  .head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .head time { font-weight: 600; }
  .who { margin: 4px 0; overflow-wrap: anywhere; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; }
  .facts div { display: flex; gap: 4px; }
  dt { color: var(--muted); }
  dt::after { content: ':'; }
  dd { margin: 0; }
</style>
