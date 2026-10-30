// Rodada 3 (integração): ligações entre módulos do espanhol que não cabiam em nenhum módulo sozinho.
import { describe, expect, it } from 'vitest';
import { cacheKey } from '../src/lib/player/cache';

describe('cache do front por língua (dossiê, autópsia, guilda)', () => {
  it('em português a chave é a de antes; em espanhol é outra (a API monta os motivos na língua pedida)', () => {
    expect(cacheKey('dossie:abc', 'pt')).toBe('dossie:abc');
    expect(cacheKey('dossie:abc', 'es')).toBe('es:dossie:abc');
    expect(cacheKey('dossie:abc', 'es')).not.toBe(cacheKey('dossie:abc', 'pt'));
  });
});
