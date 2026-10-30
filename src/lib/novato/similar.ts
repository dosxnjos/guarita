// Checagem de nick parecido (página /golpes): compara o nome digitado com os nomes que a busca do killboard devolve
// e aponta os parecidos por distância de edição e por letras que se confundem na tela (l/I/1, 0/O, rn/m, vv/w).
// Nunca rotula ninguém: só diz "parecido" e por quê. O motivo sai na língua de `loc` (padrão: a atual do site).
import type { PlayerHit } from '../../../shared/types';
import { currentLocale, type Locale } from '../i18n/core';

/** Forma "esqueleto": letras que se confundem viram a mesma, sem caixa e sem acento. */
export function nickSkeleton(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[Il1|]/g, 'l')
    .replace(/[0Oo]/g, 'o')
    .replace(/[5Ss$]/g, 's')
    .toLowerCase()
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/cl/g, 'd');
}

/** Distância de Levenshtein (inserir, apagar, trocar uma letra). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type NickKind = 'exato' | 'caixa' | 'homoglifo' | 'edicao';

export interface NickMatch {
  hit: PlayerHit;
  kind: NickKind;
  /** Distância de edição sem caixa (0 para exato, caixa e homóglifo). */
  distance: number;
  /** Explicação curta para a tela. */
  reason: string;
}

/** Posições em que os dois nomes diferem (mesmo tamanho), para mostrar "l → I". */
function diffPairs(a: string, b: string, es = false): string[] {
  if (a.length !== b.length) return [];
  const out: string[] = [];
  for (let i = 0; i < a.length && out.length < 3; i++) {
    if (a[i] !== b[i]) out.push(es ? `“${a[i]}” pasó a ser “${b[i]}”` : `“${a[i]}” virou “${b[i]}”`);
  }
  return out;
}

/** Classifica um nome encontrado em relação ao digitado, ou null se não é parecido. */
export function classifyNick(typed: string, hit: PlayerHit, maxDistance = 2, loc: Locale = currentLocale()): NickMatch | null {
  const es = loc === 'es';
  const a = typed.trim();
  const b = hit.name.trim();
  if (!a || !b) return null;
  if (a === b) return { hit, kind: 'exato', distance: 0, reason: es ? 'El nombre exacto que escribiste.' : 'Nome exato que você digitou.' };
  if (a.toLowerCase() === b.toLowerCase()) {
    return { hit, kind: 'caixa', distance: 0, reason: es ? 'El mismo nombre, solo cambian mayúsculas y minúsculas.' : 'Mesmo nome, só muda maiúscula e minúscula.' };
  }
  if (nickSkeleton(a) === nickSkeleton(b)) {
    const pairs = diffPairs(a, b, es);
    const tail = pairs.length ? `: ${pairs.join(', ')}` : '';
    return { hit, kind: 'homoglifo', distance: 0,
      reason: es ? `Igual en pantalla, con letras que se confunden${tail}.` : `Igual na tela, com letras que se confundem${tail}.` };
  }
  const d = editDistance(a.toLowerCase(), b.toLowerCase());
  const ds = editDistance(nickSkeleton(a), nickSkeleton(b));
  const dist = Math.min(d, ds);
  if (dist <= maxDistance && dist < Math.max(a.length, b.length) / 2) {
    const reason = es
      ? (dist === 1 ? 'Cambia una letra.' : `Cambian ${dist} letras.`)
      : (dist === 1 ? 'Muda uma letra.' : `Mudam ${dist} letras.`);
    return { hit, kind: 'edicao', distance: dist, reason };
  }
  return null;
}

const ORDER: Record<NickKind, number> = { exato: 0, caixa: 1, homoglifo: 2, edicao: 3 };

/** Nomes parecidos com o digitado, sem repetir id, do mais parecido para o menos. */
export function similarNicks(typed: string, hits: PlayerHit[], maxDistance = 2, loc: Locale = currentLocale()): NickMatch[] {
  const seen = new Set<string>();
  const out: NickMatch[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const m = classifyNick(typed, h, maxDistance, loc);
    if (m) out.push(m);
  }
  return out.sort((x, y) => ORDER[x.kind] - ORDER[y.kind] || x.distance - y.distance || x.hit.name.localeCompare(y.hit.name));
}

/**
 * Consultas a mandar para a busca do killboard: o nome inteiro e a primeira metade (mínimo 3 letras), para achar
 * também quem troca letras no fim do nome. A busca oficial devolve poucos nomes, então nunca é uma lista completa.
 */
export function nickQueries(typed: string): string[] {
  const q = typed.trim().replace(/\s+/g, ' ');
  if (q.length < 3) return [];
  const half = q.slice(0, Math.max(3, Math.ceil(q.length / 2)));
  return half.length < q.length ? [q, half] : [q];
}
