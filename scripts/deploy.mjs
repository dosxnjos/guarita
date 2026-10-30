// Publica a Guarita no Cloudflare Pages da conta PESSOAL do Gabriel (guarita.pages.dev),
// sem tocar no login do wrangler da máquina, que é da conta Nomura. Chaves do Doppler pessoal:
//
//   npm run deploy
//
//   GUARITA_CF_API_TOKEN  → CLOUDFLARE_API_TOKEN
//   GUARITA_CF_ACCOUNT_ID → CLOUDFLARE_ACCOUNT_ID
//   GUARITA_PUBLIC_KEY, GUARITA_APP_ID, GUARITA_BOT_TOKEN, GUARITA_VAPID_PUBLIC → segredos do Pages
//
// Segredo entra pela entrada padrão do wrangler, nunca na linha de comando nem na tela.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const PROJECT = 'guarita';
const missing = ['GUARITA_CF_API_TOKEN', 'GUARITA_CF_ACCOUNT_ID'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`faltam no Doppler pessoal: ${missing.join(', ')}`);
  process.exit(1);
}

const env = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: process.env.GUARITA_CF_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: process.env.GUARITA_CF_ACCOUNT_ID,
};
const wrangler = `"${resolve('node_modules/.bin/wrangler')}"`;

function run(cmd, { allowFail = false } = {}) {
  const r = spawnSync(cmd, { stdio: 'inherit', env, shell: true });
  if (r.status !== 0 && !allowFail) process.exit(r.status ?? 1);
  return r.status === 0;
}

function secret(name, value) {
  if (!value) return;
  const r = spawnSync(`${wrangler} pages secret put ${name} --project-name ${PROJECT}`, {
    input: value,
    env,
    shell: true,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (r.status !== 0) console.error(`falhou ao gravar o segredo ${name}`);
}

run('npm run build');
secret('DISCORD_PUBLIC_KEY', process.env.GUARITA_PUBLIC_KEY);
secret('DISCORD_APP_ID', process.env.GUARITA_APP_ID);
secret('DISCORD_BOT_TOKEN', process.env.GUARITA_BOT_TOKEN);
secret('VAPID_PUBLIC', process.env.GUARITA_VAPID_PUBLIC);
run(`${wrangler} pages deploy dist --project-name ${PROJECT} --branch main --commit-dirty=true`);
