// Opções: liga e desliga o cartão por site e escolhe a qualidade padrão. Grava em storage.local ("options"); o
// content script de cada aba aberta escuta a mudança e obedece na hora.
(function () {
  'use strict';
  const C = globalThis.GuaritaCore;
  const ext = globalThis.browser ?? globalThis.chrome;
  const sitesBox = document.getElementById('sites');
  const qual = document.getElementById('qual');
  const salvo = document.getElementById('salvo');
  let opts = C.defaultOptions();
  let savedTimer = 0;

  async function save(msg) {
    try {
      await ext.storage.local.set({ options: opts });
      salvo.textContent = msg || 'Opções salvas.';
    } catch {
      salvo.textContent = 'Não foi possível salvar as opções.';
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
          salvo.textContent = `Sem permissão do navegador para ${s.hosts[0]}.`;
          return;
        }
        opts.sites[s.key] = box.checked;
        save(box.checked ? `Cartão ligado em ${s.label}.` : `Cartão desligado em ${s.label}.`);
      });
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = s.label;
      const host = document.createElement('span');
      host.className = 'small muted';
      host.textContent = s.matches[0].replace('https://', '').replace(/\/?\*$/, '');
      text.append(strong, host);
      label.append(box, text);
      sitesBox.append(label);
    }
    qual.value = String(opts.quality);
  }

  qual.addEventListener('change', () => {
    opts.quality = C.parseQuality(qual.value) || 1;
    save();
  });

  (async () => {
    try {
      opts = C.normalizeOptions((await ext.storage.local.get('options')).options);
    } catch {
      opts = C.defaultOptions();
    }
    render();
  })();
})();
