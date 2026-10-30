// Prova da extensão num Chromium real (fora da suíte; usa a API publicada da Guarita). Não entra no .zip.
// Precisa de playwright-core instalado FORA deste repo (ex.: numa pasta temporária: npm i playwright-core) e de um
// Chromium (o do Playwright serve). Uso, da pasta onde está o playwright-core:
//   CHROMIUM_PATH=".../chrome.exe" node <repo>/extension/scripts/prova-chromium.mjs <repo>/extension <pasta-dos-prints>
// Carrega extension/ descompactada, abre uma página falsa em wiki.albiononline.com (servida pelo route do
// Playwright) com ícones do render, passa o mouse e fotografa o cartão; abre o popup e testa busca, item, relógio,
// o limite de 20 consultas por minuto e o desligamento por site nas opções.
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXT = process.argv[2];
const OUT = process.argv[3];
const exe = process.env.CHROMIUM_PATH;
if (!EXT || !OUT || !exe) {
  console.error('uso: CHROMIUM_PATH=<chrome.exe> node prova-chromium.mjs <pasta extension> <pasta dos prints>');
  process.exit(2);
}
const user = mkdtempSync(join(tmpdir(), 'gx-'));
const ctx = await chromium.launchPersistentContext(user, {
  executablePath: exe,
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1000, height: 640 },
  colorScheme: 'dark',
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const extId = sw.url().split('/')[2];
console.log('service worker:', sw.url());

const html = `<!doctype html><html><body style="font-family:sans-serif;padding:40px">
<h1>Wiki falsa</h1>
<p>Bolsa <img id="a" src="https://render.albiononline.com/v1/item/T4_BAG.png?size=64" width="64" height="64"></p>
<p><a id="lnk" href="#x"><img id="b" src="https://render.albiononline.com/v1/item/T5_CAPEITEM_FW_THETFORD%401.png?quality=2&size=64" width="64" height="64"></a></p>
<p><img id="c" src="https://example.com/x.png" width="64" height="64"></p>
</body></html>`;
await ctx.route('https://wiki.albiononline.com/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));

const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));
await page.goto('https://wiki.albiononline.com/wiki/Teste');
await page.waitForTimeout(800);
await page.hover('#a');
await page.waitForSelector('guarita-cartao', { timeout: 5000, state: 'attached' });
await page.waitForTimeout(6000);
await page.screenshot({ path: join(OUT, 'cartao-hover.png') });
console.log('cartao presente após hover:', await page.locator('guarita-cartao').count());
await page.keyboard.press('Escape');
console.log('cartao após Esc:', await page.locator('guarita-cartao').count());
await page.hover('#c');
await page.waitForTimeout(700);
console.log('cartao em imagem fora do render:', await page.locator('guarita-cartao').count());
// teclado: foco no link com ícone (qualidade 2 na URL)
await page.focus('#lnk');
await page.waitForTimeout(6000);
console.log('cartao com foco de teclado:', await page.locator('guarita-cartao').count());
await page.screenshot({ path: join(OUT, 'cartao-foco.png') });

// popup como página
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 380, height: 640 });
await pop.goto(`chrome-extension://${extId}/popup.html`);
const item = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'item', id: 'T4_BAG', q: 1 }));
console.log('item T4_BAG:', JSON.stringify(item));
const search = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'search', q: 'bolsa adepto' }));
console.log('busca:', JSON.stringify(search).slice(0, 300));
const clock = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'clock' }));
console.log('relógio ok:', clock.ok, clock.ok ? clock.clock.server.status : clock.error);
const bad = await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'item', id: '<script>', q: 1 }));
console.log('id inválido:', JSON.stringify(bad));
await pop.fill('#q', 'capa de thetford 4.1');
await pop.waitForTimeout(1500);
await pop.locator('#hits button').first().click();
await pop.waitForTimeout(5000);
await pop.screenshot({ path: join(OUT, 'popup.png'), fullPage: true });
console.log('popup item:', (await pop.textContent('#item'))?.replace(/\s+/g, ' ').trim());
console.log('popup relógio:', (await pop.textContent('#clock-info'))?.replace(/\s+/g, ' ').trim());

// limite: 25 ids distintos seguidos → os últimos são barrados sem chamar a API
const ids = Array.from({ length: 25 }, (_, i) => `T${(i % 5) + 4}_BAG@${Math.floor(i / 5) % 5}`);
const res = await pop.evaluate((ids) => Promise.all(ids.map((id) => chrome.runtime.sendMessage({ type: 'item', id, q: 3 }))), ids);
console.log('rajada de 25: ok', res.filter((r) => r.ok).length, '· limitados', res.filter((r) => r.limited).length, '·', res.find((r) => r.limited)?.error);

// opções: desligar a wiki some com o cartão
const opt = await ctx.newPage();
await opt.goto(`chrome-extension://${extId}/options.html`);
await opt.waitForTimeout(500);
await opt.locator('#sites input').first().uncheck();
await opt.waitForTimeout(500);
await opt.screenshot({ path: join(OUT, 'opcoes.png'), fullPage: true });
await page.bringToFront();
await page.hover('h1');
await page.hover('#a');
await page.waitForTimeout(800);
console.log('cartao com a wiki desligada:', await page.locator('guarita-cartao').count());
console.log('console da página:', logs.filter((l) => /guarita|error/i.test(l)));
await ctx.close();
