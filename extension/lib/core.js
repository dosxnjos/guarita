// Lógica pura da extensão da Guarita (sem DOM, sem chrome.*). Script clássico de propósito: o content script do
// Manifest V3 não carrega módulo ES, e o service worker usa importScripts. Expõe tudo em globalThis.GuaritaCore;
// os testes (tests/extension.test.ts) importam este arquivo pelo efeito colateral e leem o mesmo objeto.
(function (g) {
  'use strict';

  const BASE = 'https://guarita.pages.dev';
  const TZ_BR = 'America/Sao_Paulo';
  const DASH = '—';

  // ---------- línguas ----------
  // Português é o padrão (como no site); espanhol neutro latino (es-419, "tú"), termos do cliente oficial
  // (docs/glossario-es.md). Toda função com texto ou número aceita `loc` ('pt' | 'es') no fim; sem ele, 'pt', igual a
  // antes. O texto da interface mora aqui e não no chrome.i18n.getMessage: o getMessage segue sempre a língua do
  // navegador e não obedeceria à opção "Português/Español". O _locales/ guarda só o nome e a descrição do manifest.

  const LANG_OPTIONS = ['auto', 'pt', 'es'];

  /** Língua efetiva: a escolhida nas opções ou, em "auto", a do navegador (começa com "es" → espanhol). */
  function resolveLocale(pref, uiLanguage) {
    if (pref === 'pt' || pref === 'es') return pref;
    return String(uiLanguage || '').toLowerCase().startsWith('es') ? 'es' : 'pt';
  }

  const isEs = (loc) => loc === 'es';

  /** Locale do Intl: pt-BR ou espanhol latino (es-419 agrupa milhar com vírgula, "4,120", como o site). */
  function intlLocale(loc) {
    return isEs(loc) ? 'es-419' : 'pt-BR';
  }

  /** Textos da interface (popup, opções, cartão e mensagens do fundo). Chave igual nas duas línguas (o teste confere). */
  const STR = {
    pt: {
      htmlLang: 'pt-BR',
      // popup
      popupTitle: 'Guarita',
      opts: 'Opções',
      permText: 'Para consultar preços, a extensão precisa de acesso a',
      permBtn: 'Permitir acesso',
      searchTitle: 'Preço de item',
      searchLabel: 'Nome do item',
      searchPlaceholder: 'Ex.: bolsa adepto, capa de thetford 4.1',
      quality: 'Qualidade',
      results: 'Resultados',
      searching: 'Buscando…',
      resultOne: 'resultado',
      resultMany: 'resultados',
      noHits: 'Nenhum item com esse nome.',
      loadingPrice: 'Consultando o preço…',
      openOnGuarita: 'Abrir na Guarita',
      allCities: 'Ver todas as cidades na Guarita',
      noResponse: 'A extensão não respondeu. Feche e abra o popup.',
      clockTitle: 'Relógio do Americas',
      brasilia: 'Brasília',
      serverUtc: 'Servidor (UTC)',
      clockLoading: 'Carregando o status do servidor…',
      gold: 'Ouro',
      festActive: 'Bônus e eventos ativos',
      until: 'até',
      noFest: 'Nenhum bônus de festividade agora.',
      fullClock: 'Relógio completo na Guarita',
      pricesFrom: 'Preços do',
      notAffiliated: 'Não afiliado à Sandbox Interactive.',
      // cartão
      viewOnGuarita: 'Ver na Guarita',
      cityIn: 'em',
      seen: 'visto',
      bestReliable: 'Melhor preço confiável para comprar',
      cheapestSeen: 'Mais barato visto para comprar',
      noPriceNote: 'Nenhum preço recente nas cidades. O dado vem de quem joga com o cliente do Albion Data Project.',
      weakNote: 'Nenhuma cidade com preço confiável agora; este é o mais barato visto.',
      silver: 'prata',
      extUpdated: 'A extensão foi atualizada. Recarregue a página.',
      // opções
      optionsTitle: 'Opções da Guarita',
      langLegend: 'Língua',
      langHelp: 'Língua do cartão, do popup e destas opções, e dos nomes de item.',
      langAuto: 'Automático (língua do navegador)',
      cardLegend: 'Cartão de preço nos sites',
      cardHelp: 'Ao passar o mouse num ícone de item nestes sites, a Guarita mostra o nome em português e o preço. Desligue onde não quiser o cartão.',
      qualityLegend: 'Qualidade padrão',
      qualityHelp: 'Usada quando o ícone não diz a qualidade do item, e como ponto de partida na busca do popup.',
      privacyLegend: 'Privacidade',
      privacyText: 'A extensão não coleta nada sobre você. Ela só lê o endereço da imagem do item embaixo do mouse e pede à Guarita o preço daquele item (id e qualidade). Não há conta, rastreamento nem anúncio. Os preços vêm do',
      privacyTail: ', mantido por jogadores.',
      moreAt: 'Não afiliado à Sandbox Interactive. Mais em',
      saved: 'Opções salvas.',
      saveFailed: 'Não foi possível salvar as opções.',
      noSitePermission: 'Sem permissão do navegador para',
      cardOn: 'Cartão ligado em',
      cardOff: 'Cartão desligado em',
      // erros (fundo)
      errTimeout: 'A Guarita demorou demais para responder. Tente de novo.',
      errOffline: 'Sem conexão com a Guarita. Confira a internet ou a permissão de acesso da extensão.',
      errUnexpected: 'Resposta inesperada da Guarita.',
      errEmptyIndex: 'Índice de itens vazio.',
      errInvalidItem: 'Item inválido.',
      errLimited: 'Muitas consultas em pouco tempo. Espere {s} s ou abra o item na Guarita.',
      errItem: 'Erro ao consultar a Guarita.',
      errSearch: 'Não foi possível carregar a lista de itens.',
      errClock: 'Não foi possível consultar o relógio.',
      errBadMessage: 'Mensagem inválida.',
      errUnknownMessage: 'Mensagem desconhecida.',
      errInternal: 'Erro interno da extensão.',
      err404: 'Item não encontrado na Guarita.',
      err429: 'A Guarita está recebendo muitas consultas. Tente de novo em instantes.',
      err5xx: 'A Guarita não conseguiu buscar o preço agora. Tente de novo em instantes.',
      errGeneric: 'Não foi possível consultar a Guarita.',
    },
    es: {
      htmlLang: 'es',
      popupTitle: 'Guarita',
      opts: 'Opciones',
      permText: 'Para consultar precios, la extensión necesita acceso a',
      permBtn: 'Permitir acceso',
      searchTitle: 'Precio de objeto',
      searchLabel: 'Nombre del objeto',
      searchPlaceholder: 'Ej.: bolsa iniciado, capa de thetford 4.1',
      quality: 'Calidad',
      results: 'Resultados',
      searching: 'Buscando…',
      resultOne: 'resultado',
      resultMany: 'resultados',
      noHits: 'Ningún objeto con ese nombre.',
      loadingPrice: 'Consultando el precio…',
      openOnGuarita: 'Abrir en la Guarita',
      allCities: 'Ver todas las ciudades en la Guarita',
      noResponse: 'La extensión no respondió. Cierra y vuelve a abrir el popup.',
      clockTitle: 'Reloj de Americas',
      brasilia: 'Brasilia',
      serverUtc: 'Servidor (UTC)',
      clockLoading: 'Cargando el estado del servidor…',
      gold: 'Oro',
      festActive: 'Bonificaciones y eventos activos',
      until: 'hasta',
      noFest: 'Ninguna bonificación de festividad por ahora.',
      fullClock: 'Reloj completo en la Guarita',
      pricesFrom: 'Precios del',
      notAffiliated: 'No afiliado a Sandbox Interactive.',
      viewOnGuarita: 'Ver en la Guarita',
      cityIn: 'en',
      seen: 'visto',
      bestReliable: 'Mejor precio confiable para comprar',
      cheapestSeen: 'Más barato visto para comprar',
      noPriceNote: 'No hay precios recientes en las ciudades. Los datos vienen de quienes juegan con el cliente del Albion Data Project.',
      weakNote: 'Ninguna ciudad tiene un precio confiable ahora; este es el más barato visto.',
      silver: 'plata',
      extUpdated: 'La extensión se actualizó. Recarga la página.',
      optionsTitle: 'Opciones de la Guarita',
      langLegend: 'Idioma',
      langHelp: 'Idioma de la tarjeta, del popup, de estas opciones y de los nombres de objetos.',
      langAuto: 'Automático (idioma del navegador)',
      cardLegend: 'Tarjeta de precio en los sitios',
      cardHelp: 'Al pasar el mouse sobre el ícono de un objeto en estos sitios, la Guarita muestra el nombre en español y el precio. Desactívala donde no quieras la tarjeta.',
      qualityLegend: 'Calidad predeterminada',
      qualityHelp: 'Se usa cuando el ícono no indica la calidad del objeto y como punto de partida en la búsqueda del popup.',
      privacyLegend: 'Privacidad',
      privacyText: 'La extensión no recopila nada sobre ti. Solo lee la dirección de la imagen del objeto que está bajo el mouse y le pide a la Guarita el precio de ese objeto (id y calidad). No hay cuenta, rastreo ni anuncios. Los precios vienen del',
      privacyTail: ', mantenido por jugadores.',
      moreAt: 'No afiliado a Sandbox Interactive. Más en',
      saved: 'Opciones guardadas.',
      saveFailed: 'No se pudieron guardar las opciones.',
      noSitePermission: 'Sin permiso del navegador para',
      cardOn: 'Tarjeta activada en',
      cardOff: 'Tarjeta desactivada en',
      errTimeout: 'La Guarita tardó demasiado en responder. Inténtalo de nuevo.',
      errOffline: 'Sin conexión con la Guarita. Revisa tu internet o el permiso de acceso de la extensión.',
      errUnexpected: 'Respuesta inesperada de la Guarita.',
      errEmptyIndex: 'Índice de objetos vacío.',
      errInvalidItem: 'Id de objeto no válido.',
      errLimited: 'Demasiadas consultas en poco tiempo. Espera {s} s o abre el objeto en la Guarita.',
      errItem: 'Error al consultar la Guarita.',
      errSearch: 'No se pudo cargar la lista de objetos.',
      errClock: 'No se pudo consultar el reloj.',
      errBadMessage: 'Mensaje no válido.',
      errUnknownMessage: 'Mensaje desconocido.',
      errInternal: 'Error interno de la extensión.',
      err404: 'Objeto no encontrado en la Guarita.',
      err429: 'La Guarita está recibiendo muchas consultas. Inténtalo de nuevo en unos instantes.',
      err5xx: 'La Guarita no pudo obtener el precio ahora. Inténtalo de nuevo en unos instantes.',
      errGeneric: 'No se pudo consultar la Guarita.',
    },
  };

  /**
   * Traduz as páginas da extensão (popup e opções): data-i18n troca o texto; data-i18n-placeholder e
   * data-i18n-aria-label trocam o atributo. O HTML já vem com o português (o teste confere que é igual à tabela), então
   * em português isto não muda nada. root: o document (recebido, sem tocar em global).
   */
  function applyI18n(root, loc) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(loc, el.getAttribute('data-i18n'));
    for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.setAttribute('placeholder', t(loc, el.getAttribute('data-i18n-placeholder')));
    for (const el of root.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(loc, el.getAttribute('data-i18n-aria-label')));
  }

  /** Texto da chave na língua; {x} vira vars.x. Chave sem tradução cai no português (nunca some). */
  function t(loc, key, vars) {
    const table = STR[isEs(loc) ? 'es' : 'pt'];
    let s = table[key] !== undefined ? table[key] : STR.pt[key] !== undefined ? STR.pt[key] : key;
    if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
    return s;
  }

  // ---------- sites onde o cartão aparece (espelho do content_scripts.matches do manifest) ----------

  /** key: chave nas opções; label/labelEs: nome na lista; hosts: nomes exatos de host; matches: padrões do manifest. */
  const SITES = [
    { key: 'wiki', label: 'Wiki oficial do Albion', labelEs: 'Wiki oficial de Albion', hosts: ['wiki.albiononline.com'], matches: ['https://wiki.albiononline.com/*'] },
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

  /** Nome do site na língua (os nomes próprios ficam iguais). */
  function siteLabel(site, loc) {
    return isEs(loc) && site.labelEs ? site.labelEs : site.label;
  }

  // ---------- opções ----------

  const QUALITY_LABEL = { 1: 'Normal', 2: 'Bom', 3: 'Excepcional', 4: 'Excelente', 5: 'Obra-prima' };
  /** Nomes do cliente oficial em espanhol (glossário: Excepcional = Notable, Excelente = Sobresaliente). */
  const QUALITY_LABEL_ES = { 1: 'Normal', 2: 'Bueno', 3: 'Notable', 4: 'Sobresaliente', 5: 'Obra maestra' };

  function qualityLabel(q, loc) {
    return (isEs(loc) ? QUALITY_LABEL_ES : QUALITY_LABEL)[q] || '';
  }

  function defaultOptions() {
    const sites = {};
    for (const s of SITES) sites[s.key] = true;
    return { sites, quality: 1, lang: 'auto' };
  }

  /**
   * Qualquer coisa vinda do storage vira opções válidas (site desconhecido some, qualidade fora de 1–5 vira 1,
   * língua fora de auto/pt/es vira auto).
   */
  function normalizeOptions(raw) {
    const out = defaultOptions();
    if (!raw || typeof raw !== 'object') return out;
    if (raw.sites && typeof raw.sites === 'object') {
      for (const s of SITES) if (typeof raw.sites[s.key] === 'boolean') out.sites[s.key] = raw.sites[s.key];
    }
    out.quality = parseQuality(raw.quality) || 1;
    out.lang = LANG_OPTIONS.includes(raw.lang) ? raw.lang : 'auto';
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
  const nfIntEs = new Intl.NumberFormat('es-419', { maximumFractionDigits: 0 });
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

  function fmtSilver(n, loc) {
    return isNum(n) ? (isEs(loc) ? nfIntEs : nfInt).format(Math.round(n)) : DASH;
  }

  /** Idade em minutos → "agora", "há 12 min", "há 2 h 5 min", "há 3 h", "há 2 dias" (es: "ahora", "hace 12 min"…). */
  function fmtAge(min, loc) {
    const E = isEs(loc);
    if (!isNum(min)) return E ? 'sin datos' : 'sem dado';
    const m = Math.max(0, Math.round(min));
    const ago = E ? 'hace' : 'há';
    if (m < 1) return E ? 'ahora' : 'agora';
    if (m < 60) return `${ago} ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 3) return m % 60 ? `${ago} ${h} h ${m % 60} min` : `${ago} ${h} h`;
    if (h < 48) return `${ago} ${h} h`;
    return E ? `hace ${Math.floor(h / 24)} días` : `há ${Math.floor(h / 24)} dias`;
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

  /** Selo do cartão: "selo alta" em português; "confianza alta/media/baja" em espanhol (glossário). */
  function confidenceBadge(label, loc) {
    if (!isEs(loc)) return `selo ${label}`;
    const es = { alta: 'alta', 'média': 'media', baixa: 'baja', 'sem dado': 'sin datos' }[label];
    return `confianza ${es || label}`;
  }

  /** Hora em Brasília (ou outro fuso), "21:42" ou "21:42:05". */
  function fmtTime(v, tz, seconds, loc) {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return DASH;
    return new Intl.DateTimeFormat(intlLocale(loc), {
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

  /** Página do item no site, na língua: /item/<ID> em português, /es/item/<ID> em espanhol. */
  function itemPageUrl(id, quality, loc) {
    const q = parseQuality(quality) || 1;
    return `${BASE}${isEs(loc) ? '/es' : ''}/item/${encodeURIComponent(id)}${q === 1 ? '' : `?q=${q}`}`;
  }

  /** Página do site na língua ("/relogio" → "/es/relogio"). */
  function sitePageUrl(path, loc) {
    return `${BASE}${isEs(loc) ? '/es' : ''}${path}`;
  }

  function apiItemUrl(id, quality) {
    const q = parseQuality(quality) || 1;
    return `${BASE}/api/item/${encodeURIComponent(id)}${q === 1 ? '' : `?q=${q}`}`;
  }

  /**
   * Modelo do cartão (o que a tela mostra), a partir da resposta de /api/item e do nome no índice.
   * names: { pt, en } ou null (índice indisponível: mostra o id). Em espanhol, `pt` traz o nome do índice ES (o
   * items-index-es.json tem o mesmo formato, com o espanhol no lugar do português).
   */
  function buildCard(id, quality, item, names, loc) {
    const { tier, ench } = tierFromId(id);
    const q = parseQuality(quality) || 1;
    const name = (names && (names.pt || names.en)) || id;
    const tags = [tierLabel(tier, ench), q > 1 ? qualityLabel(q, loc) : ''].filter(Boolean);
    const best = item ? cheapestReliable(item.cities) : null;
    const card = {
      id,
      quality: q,
      name,
      nameEn: names && names.en && names.en !== name ? names.en : '',
      tags,
      url: itemPageUrl(id, q, loc),
      best: null,
      note: '',
    };
    if (!best) {
      card.note = t(loc, 'noPriceNote');
      return card;
    }
    const c = best.quote;
    const label = (c.confidence && c.confidence.label) || 'sem dado';
    card.best = {
      city: c.city,
      price: c.sellMin,
      priceText: `${fmtSilver(c.sellMin, loc)} ${t(loc, 'silver')}`,
      ageText: fmtAge(c.ageMin, loc),
      ageTone: ageTone(c.ageMin),
      badge: confidenceBadge(label, loc),
      badgeTone: confidenceTone(label),
      reliable: best.reliable,
    };
    if (!best.reliable) card.note = t(loc, 'weakNote');
    return card;
  }

  // ---------- relógio ----------

  const SERVER_LABEL = { online: 'Servidor online', offline: 'Servidor offline', 'manutenção': 'Em manutenção', desconhecido: 'Status desconhecido' };
  const SERVER_LABEL_ES = { online: 'Servidor en línea', offline: 'Servidor fuera de línea', 'manutenção': 'En mantenimiento', desconhecido: 'Estado desconocido' };
  const SERVER_TONE = { online: 'good', offline: 'bad', 'manutenção': 'warn', desconhecido: '' };

  /**
   * Rótulo da festividade: em espanhol, o `label` que /api/clock?lang=es acrescenta (o `labelPt` continua o
   * português nas duas línguas); sem ele (API antiga), o rótulo PT.
   */
  function festivityText(f, loc) {
    if (isEs(loc) && typeof f.label === 'string' && f.label) return f.label;
    return f.labelPt || f.name || (isEs(loc) ? 'Festividad' : 'Festividade');
  }

  /** O que o mini relógio mostra a partir de /api/clock. now: Date de agora (para festividade ativa). */
  function clockModel(clock, now, loc) {
    const nowMs = now instanceof Date ? now.getTime() : Date.now();
    const status = clock && clock.server && SERVER_LABEL[clock.server.status] ? clock.server.status : 'desconhecido';
    const fest = (clock && Array.isArray(clock.festivities) ? clock.festivities : [])
      .filter((f) => f && Date.parse(f.start) <= nowMs && nowMs < Date.parse(f.end))
      .map((f) => ({ label: festivityText(f, loc), endsAt: fmtTime(f.end, TZ_BR, false, loc) }));
    const gold = clock && clock.gold ? clock.gold : null;
    return {
      serverLabel: (isEs(loc) ? SERVER_LABEL_ES : SERVER_LABEL)[status],
      serverTone: SERVER_TONE[status],
      festivities: fest,
      goldText: gold && isNum(gold.price) ? `${fmtSilver(gold.price, loc)} ${t(loc, 'silver')}` : DASH,
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
  // Espanhol (só com loc 'es', para a busca em português não mudar): tiers como no nome do item no cliente ES
  // ("Bolsa del iniciado" = T4; "obrero" = T3; glossário), mais os do inglês.
  const STOPWORDS_ES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'of', 'the', 'and']);
  const TIER_WORDS_ES = new Map(
    Object.entries({
      principiante: 1, novato: 2, obrero: 3, iniciado: 4, experto: 5, maestro: 6, granmaestro: 7, anciano: 8,
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
   * Ordem: casa o começo do nome PT, depois nome mais curto, depois tier menor. Com loc 'es' o índice é o espanhol
   * (o nome ES ocupa o lugar do PT) e as palavras de tier são as do cliente em espanhol ("iniciado", "gran maestro").
   */
  function searchIndex(prepared, query, limit, loc) {
    const max = limit || 8;
    if (!prepared || !prepared.rows) return [];
    const E = isEs(loc);
    const tierWords = E ? TIER_WORDS_ES : TIER_WORDS;
    const stopwords = E ? STOPWORDS_ES : STOPWORDS;
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
      if (!E && w === 'grao' && next === 'mestre') {
        tier = 7;
        i++;
        continue;
      }
      if (E && w === 'gran' && next === 'maestro') {
        tier = 7;
        i++;
        continue;
      }
      if (tierWords.has(w)) {
        tier = tierWords.get(w);
        continue;
      }
      if (stopwords.has(w)) continue;
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

  /**
   * Mensagem de erro para o status HTTP da API da Guarita. Em português repassa a mensagem curta da API; em espanhol
   * não (a API responde em português, e o texto vazaria no cartão em espanhol).
   */
  function httpErrorMessage(status, apiMessage, loc) {
    if (status === 404) return t(loc, 'err404');
    if (status === 429) return t(loc, 'err429');
    if (!isEs(loc) && typeof apiMessage === 'string' && apiMessage && apiMessage.length < 200) return apiMessage;
    if (status >= 500) return t(loc, 'err5xx');
    return t(loc, 'errGeneric');
  }

  g.GuaritaCore = {
    BASE,
    TZ_BR,
    SITES,
    QUALITY_LABEL,
    QUALITY_LABEL_ES,
    LANG_OPTIONS,
    STR,
    t,
    applyI18n,
    resolveLocale,
    intlLocale,
    siteLabel,
    qualityLabel,
    confidenceBadge,
    sitePageUrl,
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
