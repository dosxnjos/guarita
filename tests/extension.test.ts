// Extensão de navegador (extension/): lógica pura de lib/core.js, manifest e empacotamento.
import { describe, it, expect } from 'vitest';
import '../extension/lib/core.js';
// @ts-expect-error módulo JS do build da extensão, sem tipos
import { makeZip, crc32, FILES } from '../extension/build.mjs';

// O tsconfig não carrega @types/node (o código roda em Workers); fs e zlib entram tipados à mão, como em items.test.ts.
type Bytes = Uint8Array & { readUInt32LE(o: number): number; readUInt16LE(o: number): number; toString(enc: string, a?: number, b?: number): string; subarray(a: number, b?: number): Bytes; equals(o: Uint8Array): boolean; length: number };
const NODE_FS = 'node:fs';
const NODE_ZLIB = 'node:zlib';
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ NODE_FS)) as {
  readFileSync(p: URL, enc: 'utf8'): string;
  existsSync(p: URL): boolean;
};
const { inflateRawSync } = (await import(/* @vite-ignore */ NODE_ZLIB)) as { inflateRawSync(b: Uint8Array): Bytes };
const BufferCtor = (globalThis as unknown as { Buffer: { from(s: string): Bytes } }).Buffer;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C = (globalThis as any).GuaritaCore;
const extUrl = (f: string) => new URL(`../extension/${f}`, import.meta.url);

const quote = (city: string, sellMin: number | null, label: string, score = 50, ageMin: number | null = 10) => ({
  city,
  sellMin,
  sellMinAt: null,
  buyMax: null,
  buyMaxAt: null,
  ageMin,
  confidence: { score, label, reasons: [] },
  verdict: 'normal',
});

describe('parseItemSrc: id e qualidade a partir da imagem do render', () => {
  it('lê id, encantamento codificado e qualidade', () => {
    expect(C.parseItemSrc('https://render.albiononline.com/v1/item/T4_BAG%401.png?quality=2&size=64')).toEqual({ id: 'T4_BAG@1', quality: 2 });
    expect(C.parseItemSrc('https://render.albiononline.com/v1/item/T8_2H_HOLYSTAFF_HELL@3.png')).toEqual({ id: 'T8_2H_HOLYSTAFF_HELL@3', quality: null });
  });
  it('aceita sem .png, minúsculas, protocolo relativo e url() de CSS', () => {
    expect(C.parseItemSrc('https://render.albiononline.com/v1/item/t5_cape?size=217')).toEqual({ id: 'T5_CAPE', quality: null });
    expect(C.parseItemSrc('//render.albiononline.com/v1/item/T6_MAIN_SWORD.png?count=1&quality=5')).toEqual({ id: 'T6_MAIN_SWORD', quality: 5 });
    expect(C.parseItemSrc('url("https://render.albiononline.com/v1/item/T4_OFF_SHIELD.png")')).toEqual({ id: 'T4_OFF_SHIELD', quality: null });
  });
  it('ignora qualidade fora de 1–5', () => {
    expect(C.parseItemSrc('https://render.albiononline.com/v1/item/T4_BAG.png?quality=0')).toEqual({ id: 'T4_BAG', quality: null });
    expect(C.parseItemSrc('https://render.albiononline.com/v1/item/T4_BAG.png?quality=7')).toEqual({ id: 'T4_BAG', quality: null });
  });
  it('recusa o que não é ícone de item do render', () => {
    expect(C.parseItemSrc('https://render.albiononline.com/v1/spell/FIREBALL.png')).toBeNull();
    expect(C.parseItemSrc('https://exemplo.com/v1/item/T4_BAG.png')).toBeNull();
    expect(C.parseItemSrc('https://render.albiononline.com.evil.com/v1/item/T4_BAG.png')).toBeNull();
    expect(C.parseItemSrc('https://render.albiononline.com/v1/item/T4%3Cscript%3E.png')).toBeNull();
    expect(C.parseItemSrc('https://render.albiononline.com/v1/item/%E0%A4%A.png')).toBeNull();
    expect(C.parseItemSrc('')).toBeNull();
    expect(C.parseItemSrc(undefined)).toBeNull();
  });
});

describe('tier e formatação', () => {
  it('tier e encantamento pelo id', () => {
    expect(C.tierFromId('T4_BAG@2')).toEqual({ tier: 4, ench: 2 });
    expect(C.tierLabel(4, 2)).toBe('T4.2');
    expect(C.tierLabel(6, 0)).toBe('T6');
    expect(C.tierLabel(0, 0)).toBe('');
  });
  it('idade e prata no padrão do site', () => {
    expect(C.fmtAge(0.4)).toBe('agora');
    expect(C.fmtAge(12)).toBe('há 12 min');
    expect(C.fmtAge(125)).toBe('há 2 h 5 min');
    expect(C.fmtAge(600)).toBe('há 10 h');
    expect(C.fmtAge(3000)).toBe('há 2 dias');
    expect(C.fmtAge(null)).toBe('sem dado');
    expect(C.fmtSilver(12345.4)).toBe('12.345');
  });
  it('hora em Brasília e em UTC', () => {
    const d = new Date('2026-10-30T15:04:05Z');
    expect(C.fmtTime(d, 'America/Sao_Paulo', true)).toBe('12:04:05');
    expect(C.fmtTime(d, 'UTC', false)).toBe('15:04');
  });
});

describe('cheapestReliable e cartão', () => {
  it('prefere selo alta/média ao mais barato de selo baixo e ignora o Black Market', () => {
    const r = C.cheapestReliable([
      quote('Black Market', 100, 'alta', 90),
      quote('Martlock', 3000, 'baixa', 10),
      quote('Lymhurst', 4200, 'média', 55),
      quote('Thetford', 4100, 'alta', 80),
      quote('Caerleon', null, 'sem dado', 0),
    ]);
    expect(r.reliable).toBe(true);
    expect(r.quote.city).toBe('Thetford');
  });
  it('sem cidade confiável, devolve a mais barata marcada como não confiável', () => {
    const r = C.cheapestReliable([quote('Martlock', 3000, 'baixa'), quote('Lymhurst', 2900, 'baixa')]);
    expect(r).toMatchObject({ reliable: false, quote: { city: 'Lymhurst' } });
    expect(C.cheapestReliable([quote('Black Market', 5000, 'alta')])).toBeNull();
    expect(C.cheapestReliable(undefined)).toBeNull();
  });
  it('monta o cartão com nome PT-BR, tier, qualidade, preço, idade, selo e link', () => {
    const item = { id: 'T4_BAG@1', quality: 2, cities: [quote('Thetford', 4120, 'alta', 85, 8)] };
    const card = C.buildCard('T4_BAG@1', 2, item, { pt: 'Bolsa do Adepto', en: "Adept's Bag" });
    expect(card).toMatchObject({
      name: 'Bolsa do Adepto',
      nameEn: "Adept's Bag",
      tags: ['T4.1', 'Bom'],
      url: 'https://guarita.pages.dev/item/T4_BAG%401?q=2',
      note: '',
      best: { city: 'Thetford', priceText: '4.120 prata', ageText: 'há 8 min', ageTone: 'fresh', badge: 'selo alta', badgeTone: 'good', reliable: true },
    });
  });
  it('cartão sem preço explica e sem nome usa o id', () => {
    const card = C.buildCard('T4_BAG', 1, { cities: [] }, null);
    expect(card.name).toBe('T4_BAG');
    expect(card.best).toBeNull();
    expect(card.note).toMatch(/Nenhum preço recente/);
    expect(card.url).toBe('https://guarita.pages.dev/item/T4_BAG');
    const weak = C.buildCard('T4_BAG', 1, { cities: [quote('Martlock', 10, 'baixa', 5, 900)] }, null);
    expect(weak.best).toMatchObject({ reliable: false, badgeTone: 'bad', ageTone: 'old' });
    expect(weak.note).toMatch(/Nenhuma cidade com preço confiável/);
  });
  it('endereços da API omitem q=1', () => {
    expect(C.apiItemUrl('T4_BAG', 1)).toBe('https://guarita.pages.dev/api/item/T4_BAG');
    expect(C.apiItemUrl('T4_BAG@2', 3)).toBe('https://guarita.pages.dev/api/item/T4_BAG%402?q=3');
  });
});

describe('relógio', () => {
  it('status do servidor, festividade ativa e ouro', () => {
    const m = C.clockModel(
      {
        now: '2026-10-30T15:00:00Z',
        server: { status: 'online', message: '', checkedAt: '' },
        festivities: [
          { kind: 1, category: 'x', name: 'Fish', labelPt: 'Pesca +10%', start: '2026-10-30T10:00:00Z', end: '2026-10-31T10:00:00Z' },
          { kind: 2, category: 'x', name: 'Old', labelPt: 'Antiga', start: '2026-10-28T10:00:00Z', end: '2026-10-29T10:00:00Z' },
        ],
        gold: { price: 4321, at: null, p30: null, trend: 'estável' },
      },
      new Date('2026-10-30T15:00:00Z'),
    );
    expect(m).toEqual({ serverLabel: 'Servidor online', serverTone: 'good', festivities: [{ label: 'Pesca +10%', endsAt: '07:00' }], goldText: '4.321 prata' });
    expect(C.clockModel(null, new Date())).toMatchObject({ serverLabel: 'Status desconhecido', goldText: '—', festivities: [] });
  });
});

describe('busca no índice', () => {
  const idx = C.prepareIndex([
    ['T4_BAG', 'Bolsa do Adepto', "Adept's Bag", 4, 0],
    ['T4_BAG@1', 'Bolsa do Adepto', "Adept's Bag", 4, 1],
    ['T5_BAG', 'Bolsa do Perito', "Expert's Bag", 5, 0],
    ['T4_CAPEITEM_FW_THETFORD', 'Capa de Thetford do Adepto', "Adept's Thetford Cape", 4, 0],
    ['T4_CAPEITEM_FW_THETFORD@1', 'Capa de Thetford do Adepto', "Adept's Thetford Cape", 4, 1],
    ['T4_WOOD', 'Troncos de Pinho', 'Pine Logs', 4, 0],
  ]);
  it('acha por nome PT-BR sem acento, com tier por palavra ou por T4', () => {
    expect(C.searchIndex(idx, 'bolsa adepto').map((h: { id: string }) => h.id)).toEqual(['T4_BAG']);
    expect(C.searchIndex(idx, 'bolsa t5').map((h: { id: string }) => h.id)).toEqual(['T5_BAG']);
    expect(C.searchIndex(idx, 'BOLSA').map((h: { id: string }) => h.id)).toEqual(['T4_BAG', 'T5_BAG']);
  });
  it('encantamento por 4.1 e busca por nome EN ou id', () => {
    expect(C.searchIndex(idx, 'capa de thetford 4.1').map((h: { id: string }) => h.id)).toEqual(['T4_CAPEITEM_FW_THETFORD@1']);
    expect(C.searchIndex(idx, 'pine')[0]).toMatchObject({ id: 'T4_WOOD', tag: 'T4' });
    expect(C.searchIndex(idx, 'wood')[0].id).toBe('T4_WOOD');
  });
  it('consulta vazia ou sem casamento devolve lista vazia', () => {
    expect(C.searchIndex(idx, '')).toEqual([]);
    expect(C.searchIndex(idx, 'de')).toEqual([]);
    expect(C.searchIndex(idx, 'zzzz')).toEqual([]);
  });
  it('o índice real da Guarita acha a bolsa do iniciante', () => {
    const real = JSON.parse(readFileSync(new URL('../public/data/items-index.json', import.meta.url), 'utf8'));
    const p = C.prepareIndex(real.items);
    expect(C.searchIndex(p, 'bolsa iniciante')[0].id).toBe('T3_BAG');
    expect(p.byId.get('T4_BAG@1').pt).toBeTruthy();
  });
});

describe('freios', () => {
  it('limite por minuto com janela deslizante', () => {
    const l = C.createLimiter(3, 60_000);
    expect(l.take(0).ok).toBe(true);
    expect(l.take(1000).ok).toBe(true);
    expect(l.take(2000).ok).toBe(true);
    expect(l.take(3000)).toEqual({ ok: false, retryInS: 57 });
    expect(l.take(60_000).ok).toBe(true);
  });
  it('cache com validade e teto de entradas', () => {
    const c = C.createTtlCache(1000, 2);
    c.set('a', 1, 0);
    expect(c.get('a', 999)).toBe(1);
    expect(c.get('a', 1000)).toBeUndefined();
    c.set('a', 1, 0);
    c.set('b', 2, 0);
    c.set('c', 3, 0);
    expect(c.size).toBe(2);
    expect(c.get('a', 1)).toBeUndefined();
  });
  it('validade do índice guardado', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    expect(C.indexFresh({ fetchedAt: now - 3600_000, items: [['A']] }, now)).toBe(true);
    expect(C.indexFresh({ fetchedAt: now - 25 * 3600_000, items: [['A']] }, now)).toBe(false);
    expect(C.indexFresh({ fetchedAt: now + 3600_000, items: [['A']] }, now)).toBe(false);
    expect(C.indexFresh({ fetchedAt: now, items: [] }, now)).toBe(false);
    expect(C.indexFresh(null, now)).toBe(false);
  });
  it('mensagens de erro HTTP em PT-BR', () => {
    expect(C.httpErrorMessage(429)).toMatch(/muitas consultas/);
    expect(C.httpErrorMessage(502, 'O Albion Data Project não respondeu.')).toBe('O Albion Data Project não respondeu.');
    expect(C.httpErrorMessage(500)).toMatch(/não conseguiu/);
  });
});

describe('opções e sites', () => {
  it('normaliza opções vindas do storage', () => {
    expect(C.normalizeOptions(undefined)).toEqual(C.defaultOptions());
    const o = C.normalizeOptions({ sites: { wiki: false, inventado: false }, quality: 9 });
    expect(o.sites.wiki).toBe(false);
    expect(o.sites.killboard).toBe(true);
    expect('inventado' in o.sites).toBe(false);
    expect(o.quality).toBe(1);
    expect(C.normalizeOptions({ quality: '3' }).quality).toBe(3);
  });
  it('reconhece só os hosts da lista', () => {
    expect(C.siteFor('wiki.albiononline.com').key).toBe('wiki');
    expect(C.siteFor('WWW.MURDERLEDGER.COM').key).toBe('murderledger');
    expect(C.siteFor('albiononline.com').key).toBe('killboard');
    expect(C.siteFor('forum.albiononline.com')).toBeNull();
    expect(C.siteFor('evil-albionfreemarket.com')).toBeNull();
    // Permissão pedida com os mesmos padrões do manifest (o killboard guarda o caminho).
    expect(C.siteOrigins(C.siteFor('albiononline.com'))).toEqual(['https://albiononline.com/killboard*', 'https://albiononline.com/*/killboard*']);
  });
});

describe('opções: permissão por site', () => {
  // Tira ensureSitePermission de options.js e roda com um `ext` falso que imita o Firefox: `request` só vale
  // dentro da parte síncrona do clique (qualquer await antes perde o gesto do usuário).
  const src = readFileSync(extUrl('options.js'), 'utf8');
  const fn = /async function ensureSitePermission\(site\) \{[\s\S]*?\n {2}\}\n/.exec(src)?.[0];
  const build = (permissions: Record<string, unknown>) =>
    new Function('ext', 'C', `${fn}; return ensureSitePermission;`)({ permissions }, C) as (s: unknown) => Promise<boolean>;
  const site = C.siteFor('murderledger.com');

  it('pede a permissão como primeira chamada do clique', async () => {
    expect(fn).toBeTruthy();
    let gesto = true;
    const chamadas: string[] = [];
    const ensure = build({
      contains: async () => (chamadas.push('contains'), false),
      request: (o: { origins: string[] }) => {
        chamadas.push(gesto ? 'request-no-gesto' : 'request-fora');
        return gesto ? Promise.resolve(o.origins.length > 0) : Promise.reject(new Error('may only be called from a user input handler'));
      },
    });
    const p = ensure(site);
    gesto = false; // o handler terminou a parte síncrona
    await expect(p).resolves.toBe(true);
    expect(chamadas[0]).toBe('request-no-gesto');
  });

  it('pedido recusado ou com erro não liga o site sem permissão', async () => {
    const recusa = build({ contains: async () => false, request: async () => false });
    await expect(recusa(site)).resolves.toBe(false);
    const erro = build({ contains: async () => false, request: async () => { throw new Error('x'); } });
    await expect(erro(site)).resolves.toBe(false);
    const jaTinha = build({ contains: async () => true, request: async () => { throw new Error('x'); } });
    await expect(jaTinha(site)).resolves.toBe(true);
  });
});

describe('manifest e pacote', () => {
  const manifest = JSON.parse(readFileSync(extUrl('manifest.json'), 'utf8'));
  it('MV3 com permissões mínimas e casando com a lista de sites do core', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toEqual(['https://guarita.pages.dev/*']);
    const matches: string[] = manifest.content_scripts.flatMap((c: { matches: string[] }) => c.matches);
    const fromCore = C.SITES.flatMap((s: { matches: string[] }) => s.matches);
    expect([...matches].sort()).toEqual([...fromCore].sort());
    expect(manifest.content_scripts[0].js).toEqual(['lib/core.js', 'content.js']);
    expect(manifest.background.scripts).toEqual(['lib/core.js', 'background.js']);
    expect(manifest.browser_specific_settings.gecko.id).toMatch(/@/);
  });
  it('todo arquivo citado pelo manifest entra no pacote', () => {
    const cited = new Set<string>([
      manifest.background.service_worker,
      ...manifest.background.scripts,
      manifest.action.default_popup,
      manifest.options_ui.page,
      ...Object.values(manifest.icons as Record<string, string>),
      ...Object.values(manifest.action.default_icon as Record<string, string>),
      ...manifest.content_scripts.flatMap((c: { js: string[] }) => c.js),
    ]);
    for (const f of cited) expect(FILES).toContain(f);
    for (const f of FILES) expect(existsSync(extUrl(f)), f).toBe(true);
  });
  it('zip gerado à mão: assinaturas, CRC e deflate legíveis', () => {
    const data = BufferCtor.from('{"a":1}'.repeat(50));
    const zip: Bytes = makeZip([{ name: 'manifest.json', data }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(8)).toBe(8); // deflate
    expect(zip.readUInt32LE(14)).toBe(crc32(data));
    const csize = zip.readUInt32LE(18);
    const nameLen = zip.readUInt16LE(26);
    expect(zip.toString('utf8', 30, 30 + nameLen)).toBe('manifest.json');
    expect(inflateRawSync(zip.subarray(30 + nameLen, 30 + nameLen + csize)).equals(data)).toBe(true);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(crc32(BufferCtor.from('123456789'))).toBe(0xcbf43926);
  });
});
