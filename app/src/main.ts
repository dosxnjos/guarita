import { mount } from 'svelte';
import App from './App.svelte';
import '../../src/app.css';
import './app.css';
import { loadConfig, onConfigChange } from './lib/config';
import { EV_VOZ_SILENCIADA, PAINEL, applyOpacity, currentLabel, isTauri, setCloseToTray } from './lib/windows';
import { setSilenciada } from './lib/voice';
import { listen } from '@tauri-apps/api/event';

async function iniciar() {
  const label = currentLabel();
  const root = document.documentElement;
  root.dataset.theme = 'dark';
  if (label !== PAINEL) root.classList.add('widget');

  await loadConfig().catch((e) => console.error('config', e));
  onConfigChange((c) => applyOpacity(c.janelas[label]?.opacidade ?? 1));

  if (isTauri()) {
    await listen<boolean>(EV_VOZ_SILENCIADA, (e) => setSilenciada(e.payload));
    if (label === PAINEL) {
      // O motor local (engine/*), os atalhos globais e a reabertura dos widgets nascem aqui, só no painel.
      // Fronteira dos módulos (b) e (a); no esqueleto só a preferência de fechar para a bandeja.
      let bandeja: boolean | null = null;
      onConfigChange((c) => {
        if (c.fecharParaBandeja === bandeja) return;
        bandeja = c.fecharParaBandeja;
        void setCloseToTray(bandeja).catch((e) => console.error('bandeja', e));
      });
      // Motor local (alertas de preço, despertador, relógio) e atalhos globais: só no painel, só com o app aberto.
      void import('./lib/engine/motor')
        .then((m) => m.iniciarMotorLocal())
        .catch((e) => console.error('motor local', e));
    }
  }

  mount(App, { target: document.getElementById('app')!, props: { label } });
}

void iniciar();
