// Acompanha os logs do Pages (conta pessoal) em JSON: npm run tail
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const env = { ...process.env, CLOUDFLARE_API_TOKEN: process.env.GUARITA_CF_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: process.env.GUARITA_CF_ACCOUNT_ID };
spawnSync(`"${resolve('node_modules/.bin/wrangler')}" pages deployment tail --project-name guarita --format json`, { stdio: 'inherit', env, shell: true });
