# Guarita (repo público)

Companheiro web em PT-BR para o jogador de Albion Online (Americas): Svelte 5 + Vite no front, `_worker.js` do Pages
para `/api/*` e `/discord`. Como funciona: [README.md](README.md) · [docs/ARQUITETURA.md](docs/ARQUITETURA.md) ·
armadilhas: [docs/ARMADILHAS.md](docs/ARMADILHAS.md) · hub: [../../cerebro/projetos/albion.md](../../cerebro/projetos/albion.md) ·
planos: [../roadmap/](../roadmap/) · par privado: `../guarita-core` (cron, Durable Objects).

- **Deploy** só na Cloudflare **pessoal** do Gabriel, sempre `npm run deploy` (`scripts/deploy.mjs`); nunca `wrangler` direto nem a conta Nomura logada na máquina.
- **Segredos** só no Doppler pessoal (`--config-dir "C:/Users/Gabriel dos Anjos/.doppler-pessoal" -p pessoal -c prd`, prefixo `GUARITA_`); repo público: nem valor, nem id de conta, nem host privado.
- **Fronteira dos Termos da SBI, inviolável:** nada de captura de rede, leitura do cliente, alerta por jogador avistado, requisição ao servidor do jogo além das APIs web públicas, RMT. Régua: [../roadmap/2026-10-29-guarita-fase1.md](../roadmap/2026-10-29-guarita-fase1.md) e a página `/permitido`.
- **Contrato** em `shared/types.ts` (cópia legível em `docs/CONTRATO-API.md`): mudar tipo é mudar front, API e bot juntos, e atualizar o doc.
- **APIs externas:** AODP sempre com gzip e Cache API; gameinfo com timeout e cache, nunca travar a tela. Detalhe em `docs/ARMADILHAS.md`.
- **Texto de interface** em PT-BR correto, tom de produto (sem gíria, sem persona); datas em horário de Brasília.
- **Pronto** = `npm run check`, `npm test` e `npm run build` verdes.
