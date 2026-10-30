// Assina a tabela de códigos da captura do app (app/capture-codes.json → app/capture-codes.json.sig, Ed25519).
// O app 0.2.1+ só aceita a tabela remota (main do GitHub) com assinatura válida pela chave pública embutida em
// app/src-tauri/src/capture/codigos.rs (CHAVE_PUBLICA_B64). A 0.2.0 ignora o .sig.
//
// Assinar (a chave privada vem do Doppler pessoal, nunca do disco):
//   doppler run --config-dir "<pasta do Doppler pessoal>" -p pessoal -c prd -- node scripts/sign-codes.mjs
//   (de dentro de app/: npm run codes:sign, com o mesmo `doppler run ... --` na frente)
// Chave pública da privada atual (para conferir ou reembutir):  ... -- node scripts/sign-codes.mjs --publica
// Par novo (uma vez; recusa se o segredo já existir):           node scripts/sign-codes.mjs --gerar
//   grava a privada no Doppler pessoal via stdin e imprime só a pública.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOME = 'GUARITA_CODES_SIGN_KEY';
const DOPPLER = ['--config-dir', 'C:/Users/Gabriel dos Anjos/.doppler-pessoal', '-p', 'pessoal', '-c', 'prd'];
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TABELA = resolve(RAIZ, 'app/capture-codes.json');
const ASSINATURA = TABELA + '.sig';
const RUST = resolve(RAIZ, 'app/src-tauri/src/capture/codigos.rs');

const falhar = (msg) => {
  console.error(`sign-codes: ${msg}`);
  process.exit(1);
};

/** Chave pública Ed25519 em base64 dos 32 bytes crus (o formato que o Rust embute). */
const publicaB64 = (chave) => createPublicKey(chave).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');

function doppler(args, opcoes = {}) {
  const r = spawnSync('doppler', [...args, ...DOPPLER], { encoding: 'utf8', ...opcoes });
  if (r.error) falhar(`não consegui rodar o doppler (${r.error.message})`);
  return r;
}

function gerar() {
  const nomes = doppler(['secrets', '--only-names', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (nomes.status !== 0) falhar(`doppler secrets --only-names falhou: ${nomes.stderr.trim()}`);
  if (new RegExp(`"${NOME}"`).test(nomes.stdout)) {
    falhar(`${NOME} já existe no Doppler pessoal; não sobrescrevo. Para ver a pública: doppler run ... -- node scripts/sign-codes.mjs --publica`);
  }
  const { privateKey } = generateKeyPairSync('ed25519');
  const privada = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  // Valor só pelo stdin; a saída do `secrets set` (que mostra o valor) vai para o lixo.
  const r = doppler(['secrets', 'set', NOME, '--no-interactive'], { input: privada, stdio: ['pipe', 'ignore', 'pipe'] });
  if (r.status !== 0) falhar(`doppler secrets set falhou: ${r.stderr.trim()}`);
  console.log(`${NOME} gravada no Doppler pessoal.`);
  console.log(`Chave pública (CHAVE_PUBLICA_B64 em app/src-tauri/src/capture/codigos.rs): ${publicaB64(privateKey)}`);
}

function privadaDoAmbiente() {
  const b64 = process.env[NOME];
  if (!b64) {
    falhar(`${NOME} ausente no ambiente. Rode com: doppler run --config-dir "<pasta do Doppler pessoal>" -p pessoal -c prd -- node scripts/sign-codes.mjs`);
  }
  try {
    return createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
  } catch {
    return falhar(`${NOME} não é uma chave Ed25519 PKCS8 em base64`);
  }
}

function publicaEmbutida() {
  try {
    return /CHAVE_PUBLICA_B64: &str = "([^"]*)"/.exec(readFileSync(RUST, 'utf8'))?.[1] ?? null;
  } catch {
    return null;
  }
}

function assinar() {
  const privada = privadaDoAmbiente();
  const publica = publicaB64(privada);
  const embutida = publicaEmbutida();
  if (embutida !== publica) {
    falhar(`a chave do Doppler (pública ${publica}) não é a embutida no app (${embutida ?? 'não achei'}); a assinatura seria recusada`);
  }
  // Bytes exatos do arquivo, como o GitHub serve (o .gitattributes de app/ impede conversão de fim de linha).
  const bytes = readFileSync(TABELA);
  if (bytes.includes(0x0d)) falhar('capture-codes.json tem CR (fim de linha do Windows); salve com LF antes de assinar');
  const sig = sign(null, bytes, privada);
  if (!verify(null, bytes, createPublicKey(privada), sig)) falhar('a assinatura recém-feita não confere');
  writeFileSync(ASSINATURA, sig.toString('base64'));
  const versao = JSON.parse(bytes.toString('utf8')).versao;
  console.log(`app/capture-codes.json.sig gravado (tabela versão ${versao}). Commite os dois arquivos juntos.`);
}

const arg = process.argv[2];
if (arg === '--gerar') gerar();
else if (arg === '--publica') console.log(publicaB64(privadaDoAmbiente()));
else if (arg === undefined) assinar();
else falhar(`opção desconhecida: ${arg} (use --gerar, --publica ou nada)`);
