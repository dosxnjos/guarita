// Lógica pura da extensão da Guarita (sem DOM, sem chrome.*). Script clássico de propósito: o content script do
// Manifest V3 não carrega módulo ES, e o service worker usa importScripts. Expõe tudo em globalThis.GuaritaCore;
// os testes (tests/extension.test.ts) importam este arquivo pelo efeito colateral e leem o mesmo objeto.
(function (g) {
  'use strict';

  const BASE = 'https://guarita.pages.dev';
  const TZ_BR = 'America/Sao_Paulo';
  const DASH = '—';

  // ---------- sites onde o cartão aparece (espelho do content_scripts.matches do manifest) ----------

  /** key: chave nas opções; hosts: nomes exatos de host; matches: padrões do manifest. */
  const SITES = [
    { key: 'wiki', label: 'Wiki oficial do Albion', hosts: ['wiki.albiononline.com'], matches: ['https://wiki.albiononline.com/*'] },
    {
      key: 'killboard',
      label: 'Killboard oficial',
      hosts: ['albiononline.com'],
      matches: ['https://albiononline.com/killboard*', 'https://albiononline.com/*/killboard*'],
    },
    {
      key: 'freemarket',
      label: 'Albion Free Market',
      hosts: ['albionfreemarket.com', 'www.albionfreemarket.com'],
      matches: ['https://albionfreemarket.com/*', 'https://www.albionfreemarket.com/*'],
    },
    {
      key: 'ao2d',
      label: 'Albion Online 2D',
      hosts: ['albiononline2d.com', 'www.albiononline2d.com'],
      matches: ['https://albiononline2d.com/*', 'https://www.albiononline2d.com/*'],
    },
    {
      key: 'murderledger',
      label: 'Murder Ledger',
      hosts: ['murderledger.com', 'www.murderledger.com'],
      matches: ['https://murderledger.com/*', 'https://www.murderledger.com/*'],
    },
    {
      key: 'aodp',
      label: 'Albion Online Data Project',
      hosts: ['www.albion-online-data.com'],
      matches: ['https://www.albion-online-data.com/*'],
    },
  ];

  /** Site da lista pelo hostname da página; null fora da lista. */
  function siteFor(hostname) {
    const h = String(hostname || '').toLowerCase();
    return SITES.find((s) => s.hosts.includes(h)) || null;
  }

  /**
   * Padrões para permissions.contains/request: os mesmos do manifest (o Chrome guarda o caminho, ex.
   * albiononline.com/killboard*, e recusa pedir origem que o manifest não declarou).
   */
  function siteOrigins(site) {
    return site.matches.slice();
  }

  // ---------- opções ----------

  const QUALITY_LABEL = { 1: 'Normal', 2: 'Bom', 3: 'Excepcional', 4: 'Excelente', 5: 'Obra-prima' };

  function defaultOptions() {
    const sites = {};
    for (const s of SITES) sites[s.key] = true;
    return { sites, quality: 1 };
  }

  /** Qualquer coisa vinda do storage vira opções válidas (site desconhecido some, qualidade fora de 1–5 vira 1). */
  function normalizeOptions(raw) {
    const out = defaultOptions();
    if (!raw || typeof raw !== 'object') return out;
    if (raw.sites && typeof raw.sites === 'object') {
      for (const s of SITES) if (typeof raw.sites[s.key] === 'boolean') out.sites[s.key] = raw.sites[s.key];
    }
    out.quality = parseQuality(raw.quality) || 1;
    return out;
  }

  /** 1 a 5, ou null. */
  function parseQuality(v) {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  }

  // ---------- detecção do item na imagem do render ----------

  const RENDER_RE = /^(?:https?:)?\/\/render\.albiononline\.com\/v1\/item\/([^/?#]+?)(?:\.png)?(?:[?#].*)?$/i;
  const ID_RE = /^(?:T[1-8]_)?[A-Z0-9_]+(?:@[0-4])?$/;

  /**
   * Id e qualidade a partir do endereço da imagem oficial, ex.:
   * https://render.albiononline.com/v1/item/T4_BAG%401.png?quality=2&size=64 → { id: 'T4_BAG@1', quality: 2 }.
   * Aceita também url(...) de background-image. Fora do render, ou id estranho, devolve null.
   */
  function parseItemSrc(src) {
    if (typeof src !== 'string' || !src) return null;
    let s = src.trim();
    const css = /^url\((['"]?)(.*)\1\)$/i.exec(s);
    if (css) s = css[2].trim();
    const m = RENDER_RE.exec(s);
    if (!m) return null;
    let raw;
    try {
      raw = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
    const id = raw.trim().toUpperCase();
    if (!id || id.length > 80 || !ID_RE.test(id)) return null;
    let quality = null;
    const q = /[?&]quality=(\d)(?:&|#|$)/i.exec(s);
    if (q) quality = parseQuality(q[1]);
    return { id, quality };
  }

  /** "T4_BAG@2" → { tier: 4, ench: 2 }; 0 quando não tem. */
  function tierFromId(id) {
    const t = /^T(\d)_/.exec(id);
    const e = /@(\d)$/.exec(id);
    return { tier: t ? Number(t[1]) : 0, ench: e ? Number(e[1]) : 0 };
  }

  /** "T4.1", "T6", ou "" quando o item não tem tier. */
  function tierLabel(tier, ench) {
    if (!tier) return '';
    return ench ? `T${tier}.${ench}` : `T${tier}`;
  }

  // ---------- formatação (mesma régua do site, src/lib/format.ts) ----------

  const nfInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

  function fmtSilver(n) {
    return isNum(n) ? nfInt.format(Math.round(n)) : DASH;
  }

  /** Idade em minutos → "agora", "há 12 min", "há 2 h 5 min", "há 3 h", "há 2 dias". */
  function fmtAge(min) {
    if (!isNum(min)) return 'sem dado';
    const m = Math.max(0, Math.round(min));
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 3) return m % 60 ? `há ${h} h ${m % 60} min` : `há ${h} h`;
    if (h < 48) return `há ${h} h`;
    return `há ${Math.floor(h / 24)} dias`;
  }

  /** Até 1 h verde, até 6 h âmbar, mais velho cinza (bolinha .age do site). */
  function ageTone(min) {
    if (!isNum(min)) return 'none';
    if (min <= 60) return 'fresh';
    if (min <= 360) return 'stale';
    return 'old';
  }

  function confidenceTone(label) {
    return label === 'alta' ? 'good' : label === 'média' ? 'warn' : label === 'baixa' ? 'bad' : '';
  }

  /** Hora em Brasília (ou outro fuso), "21:42" ou "21:42:05". */
  function fmtTime(v, tz, seconds) {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return DASH;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz || TZ_BR,
      hour: '2-digit',
      minute: '2-digit',
      second: seconds ? '2-digit' : undefined,
      hourCycle: 'h23',
    }).format(d);
  }

  // ---------- cartão do item ----------

  /**
   * Cidade mais barata para comprar (ordem de venda), fora o Black Market (que só compra). Prefere selo alta/média;
   * se nenhuma for confiável, devolve a mais barata com reliable=false. Espelho de cheapestReliable do site.
   */
  function cheapestReliable(cities) {
    const list = Array.isArray(cities) ? cities : [];
    const withSell = list.filter((c) => c && c.city !== 'Black Market' && isNum(c.sellMin) && c.sellMin > 0);
    if (!withSell.length) return null;
    const score = (c) => (c.confidence && isNum(c.confidence.score) ? c.confidence.score : 0);
    const byPrice = (a, b) => a.sellMin - b.sellMin || score(b) - score(a);
    const good = withSell.filter((c) => c.confidence && (c.confidence.label === 'alta' || c.confidence.label === 'média')).sort(byPrice);
    if (good.length) return { quote: good[0], reliable: true };
    return { quote: withSell.slice().sort(byPrice)[0], reliable: false };
  }

  function itemPageUrl(id, quality) {
    const q = parseQuality(quality) || 1;
    return `${BASE}/item/${encodeURIComponent(id)}${q === 1 ? '' : `?q=${q}`}`;
  }

  function apiItemUrl(id, quality) {
    const q = parseQuality(quality) || 1;
    return `${BASE}/api/item/${encodeURIComponent(id)}${q === 1 ? '' : `?q=${q}`}`;
  }

  /**
   * Modelo do cartão (o que a tela mostra), a partir da resposta de /api/item e do nome no índice.
   * names: { pt, en } ou null (índice indisponível: mostra o id).
   */
  function buildCard(id, quality, item, names) {
    const { tier, ench } = tierFromId(id);
    const q = parseQuality(quality) || 1;
    const name = (names && (names.pt || names.en)) || id;
    const tags = [tierLabel(tier, ench), q > 1 ? QUALITY_LABEL[q] : ''].filter(Boolean);
    const best = item ? cheapestReliable(item.cities) : null;
    const card = {
      id,
      quality: q,
      name,
      nameEn: names && names.en && names.en !== name ? names.en : '',
      tags,
      url: itemPageUrl(id, q),
      best: null,
      note: '',
    };
    if (!best) {
      card.note = 'Nenhum preço recente nas cidades. O dado vem de quem joga com o cliente do Albion Data Project.';
      return card;
    }
    const c = best.quote;
    const label = (c.confidence && c.confidence.label) || 'sem dado';
    card.best = {
      city: c.city,
      price: c.sellMin,
      priceText: `${fmtSilver(c.sellMin)} prata`,
      ageText: fmtAge(c.ageMin),
      ageTone: ageTone(c.ageMin),
      badge: `selo ${label}`,
      badgeTone: confidenceTone(label),
      reliable: best.reliable,
    };
    if (!best.reliable) card.note = 'Nenhuma cidade com preço confiável agora; este é o mais barato visto.';
    return card;
  }

  // ---------- relógio ----------

  const SERVER_LABEL = { online: 'Servidor online', offline: 'Servidor offline', 'manutenção': 'Em manutenção', desconhecido: 'Status desconhecido' };
  const SERVER_TONE = { online: 'good', offline: 'bad', 'manutenção': 'warn', desconhecido: '' };

  /** O que o mini relógio mostra a partir de /api/clock. now: Date de agora (para festividade ativa). */
  function clockModel(clock, now) {
    const t = now instanceof Date ? now.getTime() : Date.now();
    const status = clock && clock.server && SERVER_LABEL[clock.server.status] ? clock.server.status : 'desconhecido';
    const fest = (clock && Array.isArray(clock.festivities) ? clock.festivities : [])
      .filter((f) => f && Date.parse(f.start) <= t && t < Date.parse(f.end))
      .map((f) => ({ label: f.labelPt || f.name || 'Festividade', endsAt: fmtTime(f.end, TZ_BR, false) }));
    const gold = clock && clock.gold ? clock.gold : null;
    return {
      serverLabel: SERVER_LABEL[status],
      serverTone: SERVER_TONE[status],
      festivities: fest,
      goldText: gold && isNum(gold.price) ? `${fmtSilver(gold.price)} prata` : DASH,
    };
  }

  // ---------- busca no índice (versão enxuta da busca do site, shared/items.ts) ----------

  const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'of', 'the', 'and']);
  const TIER_WORDS = new Map(
    Object.entries({
      calouro: 1, novato: 2, iniciante: 3, jornaleiro: 3, adepto: 4, perito: 5, mestre: 6, graomestre: 7, anciao: 8,
      beginner: 1, novice: 2, journeyman: 3, adept: 4, adepts: 4, expert: 5, experts: 5, master: 6, masters: 6,
      grandmaster: 7, grandmasters: 7, elder: 8, elders: 8,
    }),
  );

  /** Minúsculas, sem acento, sem apóstrofo; o que não é letra/número vira espaço. */
  function normalize(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Prepara o índice uma vez: [id, pt, en, tier, ench][] → linhas com texto normalizado. */
  function prepareIndex(items) {
    const rows = [];
    const byId = new Map();
    for (const it of Array.isArray(items) ? items : []) {
      if (!Array.isArray(it) || typeof it[0] !== 'string') continue;
      const [id, pt, en, tier, ench] = it;
      const row = {
        id,
        pt: pt || '',
        en: en || '',
        tier: tier | 0,
        ench: ench | 0,
        npt: normalize(pt),
        nen: normalize(en),
        nid: normalize(id.replace(/_/g, ' ')),
      };
      rows.push(row);
      byId.set(id, row);
    }
    return { rows, byId };
  }

  /**
   * Busca tolerante: toda palavra precisa aparecer no nome PT, EN ou no id; "t4", "4.1", "adepto" filtram o tier.
   * Ordem: casa o começo do nome PT, depois nome mais curto, depois tier menor.
   */
  function searchIndex(prepared, query, limit) {
    const max = limit || 8;
    if (!prepared || !prepared.rows) return [];
    const words = normalize(query).split(' ').filter(Boolean);
    let tier = 0;
    let ench = -1;
    const terms = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const next = words[i + 1];
      const tm = /^t([1-8])$/.exec(w);
      if (tm) {
        tier = Number(tm[1]);
        continue;
      }
      // "4.1" normaliza para "4 1"; "t4.1" para "t4 1".
      if (/^[1-8]$/.test(w) && next !== undefined && /^[0-4]$/.test(next) && tier === 0) {
        tier = Number(w);
        ench = Number(next);
        i++;
        continue;
      }
      if (tier && /^[0-4]$/.test(w) && ench < 0) {
        ench = Number(w);
        continue;
      }
      if (w === 'grao' && next === 'mestre') {
        tier = 7;
        i++;
        continue;
      }
      if (TIER_WORDS.has(w)) {
        tier = TIER_WORDS.get(w);
        continue;
      }
      if (STOPWORDS.has(w)) continue;
      terms.push(w);
    }
    if (!terms.length && !tier) return [];
    const hits = [];
    for (const r of prepared.rows) {
      if (tier && r.tier !== tier) continue;
      if (ench >= 0 ? r.ench !== ench : r.ench !== 0) continue;
      let ok = true;
      for (const t of terms) {
        if (!r.npt.includes(t) && !r.nen.includes(t) && !r.nid.includes(t)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let score = 0;
      if (terms.length && r.npt.startsWith(terms[0])) score += 4;
      if (terms.length && r.npt.split(' ').some((w) => w === terms[0])) score += 2;
      if (terms.length && r.nen.startsWith(terms[0])) score += 1;
      hits.push({ r, score });
    }
    hits.sort((a, b) => b.score - a.score || a.r.pt.length - b.r.pt.length || a.r.tier - b.r.tier || a.r.id.localeCompare(b.r.id));
    return hits.slice(0, max).map(({ r }) => ({ id: r.id, pt: r.pt, en: r.en, tier: r.tier, ench: r.ench, tag: tierLabel(r.tier, r.ench) }));
  }

  // ---------- freios: limite por minuto e cache com validade ----------

  /** Janela deslizante: no máximo `max` consultas em `windowMs`. take() devolve { ok, retryInS }. */
  function createLimiter(max, windowMs) {
    const stamps = [];
    return {
      take(now) {
        const t = isNum(now) ? now : Date.now();
        while (stamps.length && t - stamps[0] >= windowMs) stamps.shift();
        if (stamps.length >= max) return { ok: false, retryInS: Math.max(1, Math.ceil((stamps[0] + windowMs - t) / 1000)) };
        stamps.push(t);
        return { ok: true, retryInS: 0 };
      },
      get used() {
        return stamps.length;
      },
    };
  }

  /** Cache em memória com validade e teto de entradas (a mais antiga sai primeiro). */
  function createTtlCache(ttlMs, maxEntries) {
    const map = new Map();
    return {
      get(key, now) {
        const t = isNum(now) ? now : Date.now();
        const e = map.get(key);
        if (!e) return undefined;
        if (t - e.at >= ttlMs) {
          map.delete(key);
          return undefined;
        }
        return e.value;
      },
      set(key, value, now) {
        const t = isNum(now) ? now : Date.now();
        map.delete(key);
        map.set(key, { value, at: t });
        while (map.size > maxEntries) map.delete(map.keys().next().value);
      },
      get size() {
        return map.size;
      },
    };
  }

  /** O índice guardado ainda vale? (24 h por padrão; o índice muda só com patch do jogo.) */
  function indexFresh(stored, now, ttlMs) {
    if (!stored || !Array.isArray(stored.items) || !stored.items.length || !isNum(stored.fetchedAt)) return false;
    const t = isNum(now) ? now : Date.now();
    return t - stored.fetchedAt < (ttlMs || 24 * 3600 * 1000) && stored.fetchedAt <= t;
  }

  /** Mensagem de erro em PT-BR para o status HTTP da API da Guarita. */
  function httpErrorMessage(status, apiMessage) {
    if (status === 404) return 'Item não encontrado na Guarita.';
    if (status === 429) return 'A Guarita está recebendo muitas consultas. Tente de novo em instantes.';
    if (typeof apiMessage === 'string' && apiMessage && apiMessage.length < 200) return apiMessage;
    if (status >= 500) return 'A Guarita não conseguiu buscar o preço agora. Tente de novo em instantes.';
    return 'Não foi possível consultar a Guarita.';
  }

  g.GuaritaCore = {
    BASE,
    TZ_BR,
    SITES,
    QUALITY_LABEL,
    siteFor,
    siteOrigins,
    defaultOptions,
    normalizeOptions,
    parseQuality,
    parseItemSrc,
    tierFromId,
    tierLabel,
    fmtSilver,
    fmtAge,
    ageTone,
    confidenceTone,
    fmtTime,
    cheapestReliable,
    itemPageUrl,
    apiItemUrl,
    buildCard,
    clockModel,
    normalize,
    prepareIndex,
    searchIndex,
    createLimiter,
    createTtlCache,
    indexFresh,
    httpErrorMessage,
  };
})(globalThis);
