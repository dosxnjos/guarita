// Registra os comandos de barra do bot Guarita no Discord (sobrescreve a lista inteira: PUT é idempotente).
// Uso (via npm run discord:register, que injeta o Doppler pessoal):
//   node scripts/register-commands.mjs            → servidor de teste (GUARITA_TEST_GUILD_ID), aparece na hora
//   node scripts/register-commands.mjs --global   → todos os servidores (propagação pode levar até 1 h)
//   node scripts/register-commands.mjs --dry-run  → só imprime o JSON, não chama o Discord
// Env: GUARITA_APP_ID, GUARITA_BOT_TOKEN, GUARITA_TEST_GUILD_ID. O token nunca é impresso.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const isGlobal = args.has('--global');
const dryRun = args.has('--dry-run');

// commands.ts é TypeScript: empacota em memória e importa como módulo (mesma fonte que o Worker usa).
const entry = fileURLToPath(new URL('../worker/discord/commands.ts', import.meta.url));
const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'warning' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
// integration_types e contexts só valem para comandos globais: no servidor de teste vão sem eles.
const commands = isGlobal ? mod.COMMANDS : mod.COMMANDS?.map(({ integration_types: _i, contexts: _c, ...rest }) => rest);
if (!Array.isArray(commands) || commands.length === 0) {
  console.error('COMMANDS vazio em worker/discord/commands.ts');
  process.exit(1);
}

if (dryRun) {
  console.log(JSON.stringify(commands, null, 2));
  process.exit(0);
}

const appId = process.env.GUARITA_APP_ID;
const token = process.env.GUARITA_BOT_TOKEN;
const guildId = process.env.GUARITA_TEST_GUILD_ID;
const missing = [['GUARITA_APP_ID', appId], ['GUARITA_BOT_TOKEN', token], ...(isGlobal ? [] : [['GUARITA_TEST_GUILD_ID', guildId]])]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error('Faltam variáveis de ambiente: ' + missing.join(', ') + ' (rode por npm run discord:register).');
  process.exit(1);
}

const path = isGlobal ? `/applications/${appId}/commands` : `/applications/${appId}/guilds/${guildId}/commands`;
const where = isGlobal ? 'global' : 'servidor de teste';

async function put(attempt = 1) {
  const res = await fetch('https://discord.com/api/v10' + path, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://guarita.pages.dev, 0.1)',
    },
    body: JSON.stringify(commands),
  });
  if (res.status === 429 && attempt < 4) {
    const body = await res.json().catch(() => ({}));
    const wait = Math.ceil((Number(body.retry_after) || 2) * 1000);
    console.warn(`Limite do Discord: aguardando ${wait} ms (tentativa ${attempt}).`);
    await new Promise((r) => setTimeout(r, wait));
    return put(attempt + 1);
  }
  return res;
}

const res = await put();
const text = await res.text();
if (!res.ok) {
  // O corpo de erro do Discord não contém o token; o cabeçalho Authorization nunca é impresso.
  console.error(`Falha ao registrar (${where}): HTTP ${res.status}\n${text.slice(0, 2000)}`);
  process.exit(1);
}
const saved = JSON.parse(text);
console.log(`Registrados ${saved.length} comandos (${where}): ${saved.map((c) => '/' + c.name).join(', ')}`);
