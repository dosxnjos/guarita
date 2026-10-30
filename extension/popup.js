// Popup: busca de item com preço (índice da Guarita guardado pelo fundo da extensão) e mini relógio do Americas.
(function () {
  'use strict';
  const C = globalThis.GuaritaCore;
  const ext = globalThis.browser ?? globalThis.chrome;
  const $ = (id) => document.getElementById(id);
  const ORIGIN = `${C.BASE}/*`;

  const q = $('q');
  const qual = $('qual');
  const hits = $('hits');
  const status = $('busca-status');
  const item = $('item');
  let searchTimer = 0;
  let searchSeq = 0;
  let itemSeq = 0;
  let current = null; // { id } do item aberto
  let loc = 'pt'; // língua do popup (opção salva ou a do navegador), definida no início

  /** Toda mensagem leva a língua do popup: o fundo devolve nome e texto nela. */
  function send(msg) {
    return Promise.resolve(ext.runtime.sendMessage({ ...msg, lang: loc })).catch(() => ({ ok: false, error: C.t(loc, 'noResponse') }));
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function link(href, text) {
    const a = el('a', '', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  // ---------- permissão (Firefox pode instalar sem o acesso ao site da Guarita) ----------

  async function checkPermission() {
    if (!ext.permissions || !ext.permissions.contains) return;
    try {
      const ok = await ext.permissions.contains({ origins: [ORIGIN] });
      $('perm').hidden = ok;
    } catch {
      /* navegador sem a API: segue */
    }
  }
  $('perm-btn').addEventListener('click', async () => {
    try {
      const ok = await ext.permissions.request({ origins: [ORIGIN] });
      $('perm').hidden = ok;
      if (ok) loadClock();
    } catch {
      /* recusado */
    }
  });

  $('opts').addEventListener('click', (e) => {
    if (!ext.runtime.openOptionsPage) return; // sem a API: o link abre a página numa aba
    e.preventDefault();
    Promise.resolve(ext.runtime.openOptionsPage()).then(() => window.close(), () => window.open('options.html'));
  });

  // ---------- busca ----------

  function renderHits(list) {
    hits.replaceChildren();
    for (const h of list) {
      const li = el('li');
      const b = el('button');
      b.type = 'button';
      b.append(el('span', '', h.pt || h.en || h.id));
      if (h.tag) b.append(el('span', 'tag', h.tag));
      b.addEventListener('click', () => openItem(h.id));
      li.append(b);
      hits.append(li);
    }
  }

  async function runSearch() {
    const text = q.value.trim();
    const my = ++searchSeq;
    if (text.length < 2) {
      hits.replaceChildren();
      status.textContent = '';
      return;
    }
    status.textContent = C.t(loc, 'searching');
    const res = await send({ type: 'search', q: text });
    if (my !== searchSeq) return;
    if (!res.ok) {
      hits.replaceChildren();
      status.textContent = res.error;
      return;
    }
    renderHits(res.hits);
    status.textContent = res.hits.length ? `${res.hits.length} ${C.t(loc, res.hits.length === 1 ? 'resultOne' : 'resultMany')}` : C.t(loc, 'noHits');
  }

  q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 200);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      runSearch().then(() => {
        const first = hits.querySelector('button');
        if (first) first.click();
      });
    } else if (e.key === 'ArrowDown') {
      const first = hits.querySelector('button');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  hits.addEventListener('keydown', (e) => {
    const all = [...hits.querySelectorAll('button')];
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' && all[i + 1]) {
      e.preventDefault();
      all[i + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (all[i - 1] || q).focus();
    }
  });
  qual.addEventListener('change', () => current && openItem(current.id));

  // ---------- item escolhido ----------

  async function openItem(id) {
    current = { id };
    const my = ++itemSeq;
    item.hidden = false;
    item.setAttribute('aria-busy', 'true');
    item.replaceChildren(el('strong', '', id), el('span', 'small muted', C.t(loc, 'loadingPrice')));
    const res = await send({ type: 'item', id, q: Number(qual.value) });
    if (my !== itemSeq) return;
    item.removeAttribute('aria-busy');
    if (!res.ok) {
      const parts = [el('strong', '', id), el('p', 'err', res.error)];
      if (res.url) parts.push(link(res.url, C.t(loc, 'openOnGuarita')));
      item.replaceChildren(...parts);
      return;
    }
    const c = res.card;
    const parts = [el('strong', '', c.name)];
    if (c.tags.length) {
      const tags = el('div', 'row');
      for (const t of c.tags) tags.append(el('span', 'tag', t));
      parts.push(tags);
    }
    if (c.best) {
      parts.push(el('span', 'small muted', C.t(loc, c.best.reliable ? 'bestReliable' : 'cheapestSeen')));
      const line = el('div', 'row');
      line.append(el('span', 'price', c.best.priceText), el('span', '', `${C.t(loc, 'cityIn')} ${c.best.city}`));
      const meta = el('div', 'row small');
      const dot = el('span', `dot ${c.best.ageTone}`);
      dot.setAttribute('aria-hidden', 'true');
      meta.append(dot, el('span', 'muted', `${C.t(loc, 'seen')} ${c.best.ageText}`), el('span', `tag ${c.best.badgeTone}`, c.best.badge));
      parts.push(line, meta);
    }
    if (c.note) parts.push(el('p', 'small muted', c.note));
    parts.push(link(c.url, C.t(loc, 'allCities')));
    item.replaceChildren(...parts);
  }

  // ---------- relógio ----------

  let offsetMs = 0; // diferença entre o relógio do aparelho e o "now" da Guarita
  function tick() {
    const now = new Date(Date.now() + offsetMs);
    $('hora-br').textContent = C.fmtTime(now, C.TZ_BR, true, loc);
    $('hora-utc').textContent = C.fmtTime(now, 'UTC', false, loc);
  }
  tick();
  setInterval(tick, 1000);

  async function loadClock() {
    const info = $('clock-info');
    const res = await send({ type: 'clock' });
    if (!res.ok) {
      info.replaceChildren(el('p', 'err', res.error));
      return;
    }
    const server = Date.parse(res.clock.now);
    if (Number.isFinite(server) && Math.abs(server - Date.now()) > 5000) offsetMs = server - Date.now();
    tick();
    const m = C.clockModel(res.clock, new Date(Date.now() + offsetMs), loc);
    const parts = [];
    const line = el('div', 'row');
    line.append(el('span', `tag ${m.serverTone}`, m.serverLabel), el('span', 'muted', `${C.t(loc, 'gold')}: ${m.goldText}`));
    parts.push(line);
    if (m.festivities.length) {
      parts.push(el('strong', '', C.t(loc, 'festActive')));
      const ul = el('ul', 'fest');
      for (const f of m.festivities) ul.append(el('li', '', `${f.label}, ${C.t(loc, 'until')} ${f.endsAt}`));
      parts.push(ul);
    } else {
      parts.push(el('span', 'muted', C.t(loc, 'noFest')));
    }
    parts.push(link(C.sitePageUrl('/relogio', loc), C.t(loc, 'fullClock')));
    info.replaceChildren(...parts);
  }

  // ---------- língua ----------

  function uiLanguage() {
    try {
      return ext.i18n && ext.i18n.getUILanguage ? ext.i18n.getUILanguage() : '';
    } catch {
      return '';
    }
  }

  /** Traduz o HTML (que já vem em português) e os nomes de qualidade do seletor. */
  function applyLocale() {
    document.documentElement.lang = C.t(loc, 'htmlLang');
    C.applyI18n(document, loc);
    for (const opt of qual.options) opt.textContent = C.qualityLabel(Number(opt.value), loc);
  }

  // ---------- início ----------

  (async () => {
    let o = C.defaultOptions();
    try {
      o = C.normalizeOptions((await ext.storage.local.get('options')).options);
    } catch {
      /* padrão: Normal, língua automática */
    }
    qual.value = String(o.quality);
    loc = C.resolveLocale(o.lang, uiLanguage());
    if (loc !== 'pt') applyLocale(); // o HTML já está em português
    await checkPermission();
    loadClock();
    q.focus();
  })();
})();
