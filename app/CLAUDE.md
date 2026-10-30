# Guarita no PC (app/)

Tauri 2 + Svelte 5, `package.json` próprio (o da raiz não muda). Como funciona: [README.md](README.md) ·
armadilhas: [docs/ARMADILHAS.md](docs/ARMADILHAS.md) · plano: [../../roadmap/2026-10-30-guarita-app-pc.md](../../roadmap/2026-10-30-guarita-app-pc.md) ·
regras do repo: [../CLAUDE.md](../CLAUDE.md).

- **Só com o app aberto:** nada de tarefa agendada, serviço ou `autostart.enable()` fora de `src/lib/autostart.ts` (ação do usuário).
- **Fronteira SBI:** nada lê o processo do jogo, manda tecla/clique ou pacote ao jogo ou alerta jogador avistado; "sempre por cima" só depois do aviso (o Rust confere `avisoSbiAceitoEm`).
- **Captura de rede:** só a passiva do próprio jogador (`src-tauri/src/capture/`), opt-in (o Rust confere `avisoAceitoEm` em `captura.json`); evento de outro jogador se descarta no parser, nunca chega à tela nem ao diagnóstico.
- **Widget novo:** rótulo em `WIDGETS` (`src-tauri/src/lib.rs`), `capabilities/widgets.json` e `src/lib/windows.ts`. Comando novo: `build.rs` + capability.
- **Rede:** só `src/lib/api.ts` (plugin-http, escopo `guarita.pages.dev`) e `src/lib/capture/dados.ts` (3 URLs fixas do GitHub); CSP e capabilities mínimas, sem shell nem fs.
- **Pronto** = `npm run check`, `npm test` e `npm run vite:build` verdes dentro de `app/`.
