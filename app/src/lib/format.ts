// Formatação pt-BR e horário de Brasília: a mesma do site (fonte única em ../src/lib/format.ts, só regras puras).
export * from '../../../src/lib/format';

/**
 * Artigo da hora em espanhol (24 h, como sai do fmtTime): "la" na 1 da manhã ("a la 01:20", "desde la 01:05") e
 * "las" nas outras ("a las 13:05", "a las 00:30"). Pura.
 */
export function articuloHora(hora: string): 'la' | 'las' {
  return /^0?1:/.test(hora.trim()) ? 'la' : 'las';
}
