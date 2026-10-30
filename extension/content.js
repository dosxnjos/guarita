// Content script: nos sites de Albion da lista, passar o mouse (ou o foco do teclado) num ícone oficial de item
// (render.albiononline.com/v1/item/<ID>.png) mostra um cartão com o nome em PT-BR (ou em espanhol, pela opção de
// língua ou pela língua do navegador), o tier e o melhor preço confiável com idade e selo. Só lê o endereço da imagem;
// não lê mais nada da página e não manda nada além do id do item, da qualidade e da língua para o fundo da extensão
// (que consulta a Guarita).
(function () {
  'use strict';
  const C = globalThis.GuaritaCore;
  const ext = globalThis.browser ?? globalThis.chrome;
  if (!C || !ext || !ext.runtime || globalThis.__guaritaCard) return;
  globalThis.__guaritaCard = true;

  const site = C.siteFor(location.hostname);
  if (!site) return;

  const DWELL_MS = 300; // espera com o mouse parado antes de consultar (debounce)
  const HIDE_MS = 250; // tempo para levar o mouse do ícone até o cartão sem ele sumir

  let enabled = false;
  let defaultQuality = 1;
  let loc = 'pt'; // língua do cartão (opção salva ou a do navegador)
  let dwellTimer = 0;
  let hideTimer = 0;
  let seq = 0;
  let currentEl = null;
  let host = null;
  let root = null;
  let box = null;

  function uiLanguage() {
    try {
      return ext.i18n && ext.i18n.getUILanguage ? ext.i18n.getUILanguage() : '';
    } catch {
      return '';
    }
  }

  function readOptions(raw) {
    const o = C.normalizeOptions(raw);
    enabled = o.sites[site.key] !== false;
    defaultQuality = o.quality;
    loc = C.resolveLocale(o.lang, uiLanguage());
    if (!enabled) hide(true);
  }

  try {
    ext.storage.local.get('options').then(
      (r) => readOptions(r && r.options),
      () => readOptions(null),
    );
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.options) readOptions(changes.options.newValue);
    });
  } catch {
    readOptions(null);
  }

  // ---------- encontrar o item sob o ponteiro ----------

  function itemOf(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.tagName === 'IMG') return C.parseItemSrc(el.currentSrc || el.src);
    const bg = el.style && el.style.backgroundImage;
    if (bg && bg.includes('render.albiononline.com')) return C.parseItemSrc(bg);
    return null;
  }

  /** Link ou botão focado pelo teclado que contém um ícone de item. */
  function itemInside(el) {
    if (!el || el.nodeType !== 1 || !el.querySelector) return null;
    const img = el.querySelector('img[src*="render.albiononline.com/v1/item/"]');
    if (!img) return null;
    const it = itemOf(img);
    return it ? { it, anchor: img } : null;
  }

  // ---------- o cartão (Shadow DOM: o estilo da página não vaza para dentro nem para fora) ----------

  const CSS = `
    :host { all: initial; }
    .card { position: fixed; z-index: 2147483647; box-sizing: border-box; width: 280px; max-width: calc(100vw - 16px);
      padding: 12px 14px; border-radius: 10px; border: 1px solid #ddd5c7; background: #fffdf9; color: #1c1915;
      font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
      display: grid; gap: 6px; }
    .name { font-weight: 700; font-size: 15px; margin: 0; }
    .en { color: #645d52; font-size: 12.5px; margin: -4px 0 0; }
    .tags, .meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .tag { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: #efe9df; color: #645d52; }
    .tag.good { background: #dcefe3; color: #1f6b45; } .tag.warn { background: #f7ebc9; color: #8a5a00; }
    .tag.bad { background: #f7dcd8; color: #a3322a; }
    .price { font-size: 18px; font-weight: 700; color: #9a6416; }
    .city { color: #1c1915; }
    .muted { color: #645d52; font-size: 12.5px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: #9a948a; }
    .dot.fresh { background: #2f9a5f; } .dot.stale { background: #d39b2a; }
    .note { color: #645d52; font-size: 12.5px; margin: 0; }
    .err { color: #a3322a; margin: 0; }
    a { color: #9a6416; font-weight: 600; text-decoration: none; white-space: nowrap; flex: none; }
    a:hover, a:focus-visible { text-decoration: underline; }
    .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid #ddd5c7;
      padding-top: 6px; margin-top: 2px; }
    @media (prefers-color-scheme: dark) {
      .card { background: #1d1a16; color: #ede6d9; border-color: #343028; box-shadow: 0 6px 24px rgb(0 0 0 / 50%); }
      .en, .muted, .note { color: #a59c8d; } .city { color: #ede6d9; }
      .tag { background: #26221c; color: #a59c8d; } .tag.good { background: #16301f; color: #7fd3a3; }
      .tag.warn { background: #352c10; color: #e8c766; } .tag.bad { background: #3d1714; color: #f09a90; }
      .price, a { color: #e3a84c; } .err { color: #f09a90; } .foot { border-color: #343028; }
    }
    @media (prefers-reduced-motion: no-preference) { .card { animation: in 120ms ease-out; }
      @keyframes in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } } }
  `;

  function ensureBox() {
    if (box) {
      box.setAttribute('lang', C.t(loc, 'htmlLang')); // a língua pode ter mudado nas opções com o cartão aberto
      return box;
    }
    host = document.createElement('guarita-cartao');
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    box = document.createElement('div');
    box.className = 'card';
    // aria-describedby no ícone não atravessaria o Shadow DOM fechado; quem anuncia é a região viva.
    box.setAttribute('role', 'tooltip');
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('lang', C.t(loc, 'htmlLang'));
    box.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    box.addEventListener('mouseleave', () => scheduleHide());
    root.append(style, box);
    (document.body || document.documentElement).appendChild(host);
    return box;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function footer(url) {
    const foot = el('div', 'foot');
    foot.append(el('span', 'muted', 'Guarita · Albion Data Project'));
    if (url) {
      const a = el('a', '', C.t(loc, 'viewOnGuarita'));
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      foot.append(a);
    }
    return foot;
  }

  function renderLoading(it) {
    const b = ensureBox();
    b.replaceChildren(el('p', 'name', it.id), el('p', 'muted', C.t(loc, 'loadingPrice')), footer(C.itemPageUrl(it.id, it.quality || defaultQuality, loc)));
    b.setAttribute('aria-busy', 'true');
  }

  function renderError(res, it) {
    const b = ensureBox();
    b.removeAttribute('aria-busy');
    b.replaceChildren(el('p', 'name', it.id), el('p', 'err', res.error || C.t(loc, 'errGeneric')), footer(res.url || C.itemPageUrl(it.id, it.quality || defaultQuality, loc)));
  }

  function renderCard(card) {
    const b = ensureBox();
    b.removeAttribute('aria-busy');
    const parts = [el('p', 'name', card.name)];
    if (card.nameEn) parts.push(el('p', 'en', card.nameEn));
    if (card.tags.length) {
      const tags = el('div', 'tags');
      for (const t of card.tags) tags.append(el('span', 'tag', t));
      parts.push(tags);
    }
    if (card.best) {
      const line = el('div', 'meta');
      line.append(el('span', 'price', card.best.priceText), el('span', 'city', `${C.t(loc, 'cityIn')} ${card.best.city}`));
      const meta = el('div', 'meta');
      const dot = el('span', `dot ${card.best.ageTone}`);
      dot.setAttribute('aria-hidden', 'true');
      meta.append(dot, el('span', 'muted', `${C.t(loc, 'seen')} ${card.best.ageText}`), el('span', `tag ${card.best.badgeTone}`, card.best.badge));
      parts.push(el('span', 'muted', C.t(loc, card.best.reliable ? 'bestReliable' : 'cheapestSeen')), line, meta);
    }
    if (card.note) parts.push(el('p', 'note', card.note));
    parts.push(footer(card.url));
    b.replaceChildren(...parts);
  }

  function place(anchor) {
    if (!box || !anchor || !anchor.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const w = box.offsetWidth || 280;
    const h = box.offsetHeight || 140;
    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = document.documentElement.clientHeight || innerHeight;
    // Ao lado direito do ícone; sem espaço, à esquerda; sem espaço dos dois lados (celular), embaixo ou em cima.
    let left = r.right + 8;
    let top = r.top;
    let below = false;
    if (left + w > vw - 8) left = r.left - w - 8;
    if (left < 8) {
      left = Math.max(8, Math.min(vw - w - 8, r.left));
      top = r.bottom + 8;
      below = true;
    }
    if (top + h > vh - 8) top = below ? Math.max(8, r.top - h - 8) : Math.max(8, vh - h - 8);
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  function show(it, anchor) {
    clearTimeout(hideTimer);
    const my = ++seq;
    const q = it.quality || defaultQuality;
    renderLoading(it);
    place(anchor);
    let req;
    try {
      req = ext.runtime.sendMessage({ type: 'item', id: it.id, q, lang: loc });
    } catch {
      // Extensão atualizada ou removida com a página aberta: o contexto antigo morreu.
      renderError({ error: C.t(loc, 'extUpdated') }, it);
      place(anchor);
      return;
    }
    Promise.resolve(req).then(
      (res) => {
        if (my !== seq || !box || !box.isConnected) return; // o mouse já foi para outro ícone
        if (res && res.ok) renderCard(res.card);
        else renderError(res || {}, it);
        place(anchor);
      },
      () => {
        if (my !== seq) return;
        renderError({ error: C.t(loc, 'extUpdated') }, it);
        place(anchor);
      },
    );
  }

  function hide(now) {
    clearTimeout(dwellTimer);
    clearTimeout(hideTimer);
    const go = () => {
      seq++;
      currentEl = null;
      if (host) host.remove();
      host = root = box = null;
    };
    if (now) go();
    else hideTimer = setTimeout(go, HIDE_MS);
  }

  function scheduleHide() {
    hide(false);
  }

  // ---------- eventos (delegação no documento: serve para páginas que carregam ícones depois) ----------

  document.addEventListener(
    'mouseover',
    (e) => {
      if (!enabled) return;
      const t = e.target;
      if (host && (t === host || (host.contains && host.contains(t)))) return;
      const it = itemOf(t);
      if (!it) return;
      clearTimeout(hideTimer);
      if (t === currentEl && box) return;
      clearTimeout(dwellTimer);
      currentEl = t;
      dwellTimer = setTimeout(() => {
        if (currentEl === t && t.isConnected) show(it, t);
      }, DWELL_MS);
    },
    true,
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      if (e.target !== currentEl) return;
      clearTimeout(dwellTimer);
      if (box) scheduleHide();
      else currentEl = null;
    },
    true,
  );

  document.addEventListener(
    'focusin',
    (e) => {
      if (!enabled) return;
      const found = itemInside(e.target);
      if (!found) return;
      clearTimeout(dwellTimer);
      currentEl = e.target;
      const t = e.target;
      dwellTimer = setTimeout(() => {
        if (currentEl === t) show(found.it, t);
      }, DWELL_MS);
    },
    true,
  );

  document.addEventListener(
    'focusout',
    (e) => {
      if (e.target === currentEl) scheduleHide();
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && box) hide(true);
    },
    true,
  );

  // Rolar a página tira o ícone de baixo do cartão.
  addEventListener('scroll', () => box && hide(true), { passive: true, capture: true });
})();
