import { describe, expect, it } from 'vitest';
import { buscarInstalador, escolherInstalador, fmtTamanho, rotuloBaixar } from '../src/lib/appRelease';

const asset = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  size: 2_516_582,
  browser_download_url: `https://github.com/dosxnjos/guarita/releases/download/v0.1.0/${name}`,
  ...extra,
});
const release = (assets: unknown[], extra: Record<string, unknown> = {}) => ({
  tag_name: 'v0.1.0',
  html_url: 'https://github.com/dosxnjos/guarita/releases/tag/v0.1.0',
  draft: false,
  prerelease: false,
  assets,
  ...extra,
});
const H = 'a'.repeat(64);

describe('escolherInstalador', () => {
  it('pega só o -setup.exe, com versão, tamanho e SHA-256 do GitHub', () => {
    const i = escolherInstalador(release([asset('Guarita_0.1.0_x64_pt-BR.msi'), asset('Guarita_0.1.0_x64-setup.exe', { digest: `sha256:${H}` })]));
    expect(i).toMatchObject({ versao: '0.1.0', nome: 'Guarita_0.1.0_x64-setup.exe', sha256: H, tamanhoBytes: 2_516_582 });
    expect(rotuloBaixar(i!)).toBe('Baixar para Windows (versão 0.1.0, 2,4 MB)');
  });
  it('sem instalador, rascunho ou link de fora do repositório: nada', () => {
    expect(escolherInstalador(release([asset('Guarita_0.1.0_x64_pt-BR.msi')]))).toBeNull();
    expect(escolherInstalador(release([asset('Guarita_0.1.0_x64-setup.exe')], { draft: true }))).toBeNull();
    expect(escolherInstalador(release([asset('Guarita-setup.exe', { browser_download_url: 'https://exemplo.com/Guarita-setup.exe' })]))).toBeNull();
    expect(escolherInstalador(null)).toBeNull();
  });
  it('sem digest, SHA-256 fica nulo', () => {
    expect(escolherInstalador(release([asset('Guarita_0.1.0_x64-setup.exe')]))?.sha256).toBeNull();
    expect(fmtTamanho(0)).toBe('');
  });
});

describe('buscarInstalador', () => {
  const resp = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status });
  it('nenhuma release publicada (404) = em breve; release sem instalador também', async () => {
    expect(await buscarInstalador(resp(404) as typeof fetch)).toEqual({ tipo: 'em-breve' });
    expect(await buscarInstalador(resp(200, release([])) as typeof fetch)).toEqual({ tipo: 'em-breve' });
  });
  it('limite do GitHub ou rede fora = botão leva à página de releases', async () => {
    expect(await buscarInstalador(resp(403) as typeof fetch)).toEqual({ tipo: 'pagina' });
    expect(await buscarInstalador((async () => Promise.reject(new Error('x'))) as typeof fetch)).toEqual({ tipo: 'pagina' });
  });
  it('release com instalador = pronto', async () => {
    const e = await buscarInstalador(resp(200, release([asset('Guarita_0.1.0_x64-setup.exe')])) as typeof fetch);
    expect(e.tipo).toBe('pronto');
  });
});
