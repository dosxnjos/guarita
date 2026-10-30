// Opções: língua, liga e desliga o cartão por site e escolhe a qualidade padrão. Grava em storage.local ("options"); o
// content script de cada aba aberta escuta a mudança e obedece na hora (inclusive a troca de língua).
(function () {
  'use strict';
  const C = globalThis.GuaritaCore;
  const ext = globalThis.browser ?? globalThis.chrome;
  const sitesBox = document.getElementById('sites');
  const qual = document.getElementById('qual');
  const lang = document.getElementById('lang');
  const salvo = document.getElementById('salvo');
  const moreLink = document.getElementById('more-link');
  let opts = C.defaultOptions();
  let loc = 'pt';
  let savedTimer = 0;

  function uiLanguage() {
    try {
      return ext.i18n && ext.i18n.getUILanguage ? ext.i18n.getUILanguage() : '';
    } catch {
      return '';
    }
  }

  async function save(msg) {
    try {
      await ext.storage.local.set({ options: opts });
      salvo.textContent = msg || C.t(loc, 'saved');
    } catch {
      salvo.textContent = C.t(loc, 'saveFailed');
    }
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (salvo.textContent = ''), 2500);
  }

  /**
   * No Firefox o acesso a cada site pode ter sido negado na instalação: ao ligar, pede de novo. O `request` tem de
   * ser a PRIMEIRA chamada assíncrona do clique: qualquer `await` antes (até um `contains`) perde o gesto do
   * usuário e o Firefox recusa. Se a permissão já existe, o `request` devolve `true` sem perguntar nada.
   */
  async function ensureSitePermission(site) {
    if (!ext.permissions || !ext.permissions.request) return true; // navegador sem a API: o manifest cobre
    const origins = C.siteOrigins(site);
    try {
      return await ext.permissions.request({ origins });
    } catch {
      // Recusou ou não deu para pedir: só segue se a permissão já existir de fato.
      try {
        return await ext.permissions.contains({ origins });
      } catch {
        return false;
      }
    }
  }

  /** Textos fixos do HTML (que já vem em português), nomes de qualidade e o link da página na língua. */
  function applyLocale() {
    document.documentElement.lang = C.t(loc, 'htmlLang');
    C.applyI18n(document, loc);
    for (const opt of qual.options) opt.textContent = C.qualityLabel(Number(opt.value), loc);
    const page = C.sitePageUrl('/extensao', loc);
    moreLink.href = page;
    moreLink.textContent = page.replace('https://', '');
  }

  function render() {
    sitesBox.replaceChildren();
    for (const s of C.SITES) {
      const label = document.createElement('label');
      label.className = 'site';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = opts.sites[s.key] !== false;
      box.addEventListener('change', async () => {
        if (box.checked && !(await ensureSitePermission(s))) {
          box.checked = false;
          salvo.textContent = `${C.t(loc, 'noSitePermission')} ${s.hosts[0]}.`;
          return;
        }
        opts.sites[s.key] = box.checked;
        save(`${C.t(loc, box.checked ? 'cardOn' : 'cardOff')} ${C.siteLabel(s, loc)}.`);
      });
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = C.siteLabel(s, loc);
      const host = document.createElement('span');
      host.className = 'small muted';
      host.textContent = s.matches[0].replace('https://', '').replace(/\/?\*$/, '');
      text.append(strong, host);
      label.append(box, text);
      sitesBox.append(label);
    }
    qual.value = String(opts.quality);
    lang.value = opts.lang;
  }

  qual.addEventListener('change', () => {
    opts.quality = C.parseQuality(qual.value) || 1;
    save();
  });

  lang.addEventListener('change', () => {
    opts.lang = C.LANG_OPTIONS.includes(lang.value) ? lang.value : 'auto';
    loc = C.resolveLocale(opts.lang, uiLanguage());
    applyLocale();
    render();
    save();
  });

  (async () => {
    try {
      opts = C.normalizeOptions((await ext.storage.local.get('options')).options);
    } catch {
      opts = C.defaultOptions();
    }
    loc = C.resolveLocale(opts.lang, uiLanguage());
    if (loc !== 'pt') applyLocale(); // o HTML já está em português
    render();
  })();
})();
