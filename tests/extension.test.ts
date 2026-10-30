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
    // Com default_locale, o navegador recusa a extensão sem o messages.json dessa língua.
    expect(FILES).toContain(`_locales/${manifest.default_locale}/messages.json`);
  });
  it('versão 0.2.0 no manifest e no package.json da extensão', () => {
    expect(manifest.version).toBe('0.2.0');
    expect(JSON.parse(readFileSync(extUrl('package.json'), 'utf8')).version).toBe('0.2.0');
  });
  it('nome, descrição e dica do botão vêm do _locales (pt_BR padrão, es), com as mesmas chaves', () => {
    expect(manifest.default_locale).toBe('pt_BR');
    const pt = JSON.parse(readFileSync(extUrl('_locales/pt_BR/messages.json'), 'utf8'));
    const es = JSON.parse(readFileSync(extUrl('_locales/es/messages.json'), 'utf8'));
    expect(Object.keys(es).sort()).toEqual(Object.keys(pt).sort());
    const refs = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]);
    expect(refs.sort()).toEqual(['actionTitle', 'extDescription', 'extName', 'extShortName']);
    for (const k of refs) {
      expect(pt[k].message, k).toBeTruthy();
      expect(es[k].message, k).toBeTruthy();
    }
    // Português idêntico ao da 0.1.0 (quando os textos estavam direto no manifest).
    expect(pt.extName.message).toBe('Guarita para Albion Online');
    expect(pt.extDescription.message).toBe('Nome em português e preço do mercado ao passar o mouse nos itens de Albion Online em sites como a wiki e o killboard.');
    expect(pt.actionTitle.message).toBe('Guarita: preço de item e relógio');
    expect(es.extDescription.message).toMatch(/^Nombre en español/);
    // Limites das lojas: descrição até 132 caracteres, nome curto até 12.
    for (const m of [pt, es]) {
      expect(m.extDescription.message.length).toBeLessThanOrEqual(132);
      expect(m.extShortName.message.length).toBeLessThanOrEqual(12);
    }
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

describe('línguas: português idêntico, espanhol em espanhol', () => {
  const item = { id: 'T4_BAG@1', quality: 2, cities: [quote('Thetford', 4120, 'alta', 85, 8)] };
  const clock = {
    now: '2026-10-30T15:00:00Z',
    server: { status: 'manutenção', message: '', checkedAt: '' },
    festivities: [{ kind: 1, category: 'ACTIVITIES', name: 'FAME', labelPt: 'Bônus de fama', label: 'Bonificación de fama', start: '2026-10-30T10:00:00Z', end: '2026-10-31T10:00:00Z' }],
    gold: { price: 4321, at: null, p30: null, trend: 'estável' },
  };
  const now = new Date('2026-10-30T15:00:00Z');

  it('língua efetiva: opção forçada vence; "auto" segue o navegador (es-* → espanhol, o resto → português)', () => {
    expect(C.resolveLocale('auto', 'es-MX')).toBe('es');
    expect(C.resolveLocale('auto', 'es')).toBe('es');
    expect(C.resolveLocale('auto', 'pt-BR')).toBe('pt');
    expect(C.resolveLocale('auto', 'en-US')).toBe('pt');
    expect(C.resolveLocale('auto', '')).toBe('pt');
    expect(C.resolveLocale(undefined, undefined)).toBe('pt');
    expect(C.resolveLocale('pt', 'es-AR')).toBe('pt');
    expect(C.resolveLocale('es', 'pt-BR')).toBe('es');
  });

  it('opção de língua: padrão auto, valor estranho vira auto', () => {
    expect(C.defaultOptions().lang).toBe('auto');
    expect(C.normalizeOptions({ lang: 'es' }).lang).toBe('es');
    expect(C.normalizeOptions({ lang: 'pt' }).lang).toBe('pt');
    expect(C.normalizeOptions({ lang: 'fr' }).lang).toBe('auto');
    expect(C.normalizeOptions({ lang: 1 }).lang).toBe('auto');
    expect(C.normalizeOptions({ quality: 3 })).toMatchObject({ quality: 3, lang: 'auto' });
  });

  it('PT idêntico: sem língua ou com "pt", o resultado é o mesmo de antes', () => {
    const names = { pt: 'Bolsa do Adepto', en: "Adept's Bag" };
    expect(C.buildCard('T4_BAG@1', 2, item, names, 'pt')).toEqual(C.buildCard('T4_BAG@1', 2, item, names));
    expect(C.buildCard('T4_BAG', 1, { cities: [] }, null, 'pt')).toEqual(C.buildCard('T4_BAG', 1, { cities: [] }, null));
    expect(C.clockModel(clock, now, 'pt')).toEqual(C.clockModel(clock, now));
    expect(C.clockModel(clock, now)).toEqual({ serverLabel: 'Em manutenção', serverTone: 'warn', festivities: [{ label: 'Bônus de fama', endsAt: '07:00' }], goldText: '4.321 prata' });
    expect(C.itemPageUrl('T4_BAG', 1, 'pt')).toBe('https://guarita.pages.dev/item/T4_BAG');
    expect(C.httpErrorMessage(502, 'O Albion Data Project não respondeu.', 'pt')).toBe('O Albion Data Project não respondeu.');
    expect(C.fmtAge(12, 'pt')).toBe('há 12 min');
    expect(C.fmtSilver(12345.4, 'pt')).toBe('12.345');
  });

  it('cartão em espanhol: nome do índice ES, qualidade do cliente ES, número es-419, idade, selo e link /es/item', () => {
    const card = C.buildCard('T4_BAG@1', 2, item, { pt: 'Bolsa del iniciado', en: "Adept's Bag" }, 'es');
    expect(card).toMatchObject({
      name: 'Bolsa del iniciado',
      nameEn: "Adept's Bag",
      tags: ['T4.1', 'Bueno'],
      url: 'https://guarita.pages.dev/es/item/T4_BAG%401?q=2',
      note: '',
      best: { city: 'Thetford', priceText: '4,120 plata', ageText: 'hace 8 min', badge: 'confianza alta', badgeTone: 'good', reliable: true },
    });
    expect(C.buildCard('T4_BAG', 3, null, null, 'es').tags).toEqual(['T4', 'Notable']);
    expect(C.buildCard('T4_BAG', 4, null, null, 'es').tags).toEqual(['T4', 'Sobresaliente']);
    expect(C.buildCard('T4_BAG', 5, null, null, 'es').tags).toEqual(['T4', 'Obra maestra']);
    const empty = C.buildCard('T4_BAG', 1, { cities: [] }, null, 'es');
    expect(empty.note).toMatch(/^No hay precios recientes/);
    expect(empty.url).toBe('https://guarita.pages.dev/es/item/T4_BAG');
    const weak = C.buildCard('T4_BAG', 1, { cities: [quote('Martlock', 10, 'baixa', 5, 3000)] }, null, 'es');
    expect(weak.best).toMatchObject({ badge: 'confianza baja', ageText: 'hace 2 días' });
    expect(weak.note).toMatch(/^Ninguna ciudad tiene un precio confiable/);
    expect(C.buildCard('T4_BAG', 1, { cities: [quote('Martlock', 10, 'média')] }, null, 'es').best.badge).toBe('confianza media');
  });

  it('formatação em espanhol', () => {
    expect(C.fmtAge(0.2, 'es')).toBe('ahora');
    expect(C.fmtAge(125, 'es')).toBe('hace 2 h 5 min');
    expect(C.fmtAge(null, 'es')).toBe('sin datos');
    expect(C.fmtSilver(12345.4, 'es')).toBe('12,345');
    expect(C.fmtTime(new Date('2026-10-30T15:04:05Z'), 'America/Sao_Paulo', true, 'es')).toBe('12:04:05');
    expect(C.intlLocale('es')).toBe('es-419');
    expect(C.sitePageUrl('/relogio', 'es')).toBe('https://guarita.pages.dev/es/relogio');
    expect(C.sitePageUrl('/relogio', 'pt')).toBe('https://guarita.pages.dev/relogio');
  });

  it('relógio em espanhol: status, festividade pelo `label` de /api/clock?lang=es e ouro em plata', () => {
    expect(C.clockModel(clock, now, 'es')).toEqual({
      serverLabel: 'En mantenimiento',
      serverTone: 'warn',
      festivities: [{ label: 'Bonificación de fama', endsAt: '07:00' }],
      goldText: '4,321 plata',
    });
    expect(C.clockModel({ server: { status: 'online' } }, now, 'es').serverLabel).toBe('Servidor en línea');
    expect(C.clockModel(null, now, 'es')).toMatchObject({ serverLabel: 'Estado desconocido', goldText: '—' });
  });

  it('erros em espanhol não repassam a mensagem em português da API', () => {
    expect(C.httpErrorMessage(502, 'O Albion Data Project não respondeu.', 'es')).toMatch(/^La Guarita no pudo/);
    expect(C.httpErrorMessage(404, undefined, 'es')).toBe('Objeto no encontrado en la Guarita.');
    expect(C.httpErrorMessage(429, undefined, 'es')).toMatch(/muchas consultas/);
    expect(C.httpErrorMessage(400, 'x', 'es')).toBe('No se pudo consultar la Guarita.');
    expect(C.t('es', 'errLimited', { s: 12 })).toBe('Demasiadas consultas en poco tiempo. Espera 12 s o abre el objeto en la Guarita.');
    expect(C.t('pt', 'errLimited', { s: 12 })).toBe('Muitas consultas em pouco tempo. Espere 12 s ou abra o item na Guarita.');
    // Mesmo termo da API e do site ("no válido"); o português não muda.
    expect(C.t('es', 'errInvalidItem')).toBe('Id de objeto no válido.');
    expect(C.t('es', 'errBadMessage')).toBe('Mensaje no válido.');
    expect(C.t('pt', 'errInvalidItem')).toBe('Item inválido.');
    expect(C.t('pt', 'errBadMessage')).toBe('Mensagem inválida.');
  });

  it('nomes dos sites e das qualidades', () => {
    const wiki = C.siteFor('wiki.albiononline.com');
    expect(C.siteLabel(wiki, 'pt')).toBe('Wiki oficial do Albion');
    expect(C.siteLabel(wiki, 'es')).toBe('Wiki oficial de Albion');
    expect(C.siteLabel(C.siteFor('murderledger.com'), 'es')).toBe('Murder Ledger');
    expect([1, 2, 3, 4, 5].map((q) => C.qualityLabel(q, 'pt'))).toEqual(['Normal', 'Bom', 'Excepcional', 'Excelente', 'Obra-prima']);
    expect([1, 2, 3, 4, 5].map((q) => C.qualityLabel(q, 'es'))).toEqual(['Normal', 'Bueno', 'Notable', 'Sobresaliente', 'Obra maestra']);
  });

  it('a tabela de textos tem as mesmas chaves nas duas línguas e nenhum texto vazio', () => {
    expect(Object.keys(C.STR.es).sort()).toEqual(Object.keys(C.STR.pt).sort());
    for (const l of ['pt', 'es']) for (const [k, v] of Object.entries(C.STR[l])) expect(v, `${l}.${k}`).toBeTruthy();
    // Espanhol sem resto de português nem falso cognato óbvio.
    const es = Object.values(C.STR.es).join(' ');
    expect(es).not.toMatch(/\b(você|não|preço|cidade|item|selo|conta|ouro|prata)\b/i);
  });

  it('toda chave usada pelos scripts e pelo HTML existe na tabela', () => {
    const used = new Set<string>();
    for (const f of ['content.js', 'popup.js', 'options.js', 'background.js']) {
      const src = readFileSync(extUrl(f), 'utf8');
      for (const call of src.matchAll(/C\.t\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) for (const k of call[1].matchAll(/'(\w+)'/g)) if (k[1] !== 'pt' && k[1] !== 'es') used.add(k[1]);
      for (const m of src.matchAll(/new ApiError\('(\w+)'/g)) if (m[1] !== 'http') used.add(m[1]);
    }
    for (const f of ['popup.html', 'options.html']) {
      const html = readFileSync(extUrl(f), 'utf8');
      for (const m of html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="(\w+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(30);
    for (const k of used) {
      expect(C.STR.pt, k).toHaveProperty(k);
      expect(C.STR.es, k).toHaveProperty(k);
    }
  });

  it('PT idêntico no HTML: o texto de cada data-i18n é o mesmo da tabela em português', () => {
    const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
    let checked = 0;
    for (const f of ['popup.html', 'options.html']) {
      const html = readFileSync(extUrl(f), 'utf8');
      for (const m of html.matchAll(/<(\w+)\b[^>]*?\sdata-i18n="(\w+)"[^>]*>([^<]*)<\/\1>/g)) {
        expect(squash(m[3]), `${f} ${m[2]}`).toBe(C.STR.pt[m[2]]);
        checked++;
      }
      for (const m of html.matchAll(/placeholder="([^"]*)"[^>]*data-i18n-placeholder="(\w+)"/g)) {
        expect(m[1]).toBe(C.STR.pt[m[2]]);
        checked++;
      }
      for (const m of html.matchAll(/aria-label="([^"]*)"[^>]*data-i18n-aria-label="(\w+)"/g)) {
        expect(m[1]).toBe(C.STR.pt[m[2]]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(25);
  });

  it('applyI18n troca texto, placeholder e aria-label pela língua', () => {
    const mk = (attrs: Record<string, string>) => {
      const el = { textContent: 'pt', attrs: { ...attrs } as Record<string, string>, getAttribute: (n: string) => el.attrs[n], setAttribute: (n: string, v: string) => (el.attrs[n] = v) };
      return el;
    };
    const a = mk({ 'data-i18n': 'opts' });
    const b = mk({ 'data-i18n-placeholder': 'searchPlaceholder' });
    const c = mk({ 'data-i18n-aria-label': 'results' });
    const root = { querySelectorAll: (sel: string) => ({ '[data-i18n]': [a], '[data-i18n-placeholder]': [b], '[data-i18n-aria-label]': [c] })[sel] ?? [] };
    C.applyI18n(root, 'es');
    expect(a.textContent).toBe('Opciones');
    expect(b.attrs.placeholder).toBe('Ej.: bolsa iniciado, capa de thetford 4.1');
    expect(c.attrs['aria-label']).toBe('Resultados');
  });

  it('busca em espanhol: palavras de tier do cliente ES, sem mudar a busca em português', () => {
    const es = C.prepareIndex([
      ['T3_BAG', 'Bolsa del obrero', "Journeyman's Bag", 3, 0],
      ['T4_BAG', 'Bolsa del iniciado', "Adept's Bag", 4, 0],
      ['T7_BAG', 'Bolsa del gran maestro', "Grandmaster's Bag", 7, 0],
      ['T4_CAPEITEM_FW_THETFORD@1', 'Capa de Thetford del iniciado', "Adept's Thetford Cape", 4, 1],
    ]);
    const ids = (r: { id: string }[]) => r.map((h) => h.id);
    expect(ids(C.searchIndex(es, 'bolsa iniciado', 8, 'es'))).toEqual(['T4_BAG']);
    expect(ids(C.searchIndex(es, 'bolsa obrero', 8, 'es'))).toEqual(['T3_BAG']);
    expect(ids(C.searchIndex(es, 'bolsa gran maestro', 8, 'es'))).toEqual(['T7_BAG']);
    expect(ids(C.searchIndex(es, 'capa de thetford 4.1', 8, 'es'))).toEqual(['T4_CAPEITEM_FW_THETFORD@1']);
    expect(ids(C.searchIndex(es, 'adept bag', 8, 'es'))).toEqual(['T4_BAG']);
    // Em português, "iniciado" continua sendo texto comum (não vira tier).
    expect(C.searchIndex(es, 'iniciado', 8, 'pt').every((h: { tier: number }) => h.tier === 4)).toBe(true);
    expect(ids(C.searchIndex(es, 'bolsa iniciado', 8))).toEqual(['T4_BAG']);
  });

  it('o índice real em espanhol acha a bolsa do iniciado (T4)', () => {
    const real = JSON.parse(readFileSync(new URL('../public/data/items-index-es.json', import.meta.url), 'utf8'));
    const p = C.prepareIndex(real.items);
    expect(C.searchIndex(p, 'bolsa iniciado', 8, 'es')[0]).toMatchObject({ id: 'T4_BAG', pt: 'Bolsa del iniciado' });
    expect(C.searchIndex(p, 'bolsa obrero', 8, 'es')[0].id).toBe('T3_BAG');
  });
});
