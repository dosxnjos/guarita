// Empacota a extensão em dist/guarita-extensao-<versão>.zip, pronto para a Chrome Web Store, o Edge Add-ons, o AMO
// do Firefox ou para "carregar sem compactação" depois de descompactar. Sem dependência: zip escrito à mão (cabeçalho
// local + diretório central + fim), deflate cru do zlib do Node, CRC-32 e nomes com "/". O manifest.json fica na raiz
// do zip (as lojas recusam pasta aninhada). A versão vem do manifest. Uso: node extension/build.mjs
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Só o que a extensão usa em tempo de execução (lista fechada: script de build e testes ficam fora). */
export const FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'lib/core.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js',
  'ui.css',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato do DOS (fixas: o zip sai igual byte a byte para os mesmos arquivos). */
const DOS_TIME = (12 << 11) | (0 << 5) | 0;
const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 30;

/** entries: { name, data: Buffer }[] → Buffer do .zip. */
export function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão para extrair
    local.writeUInt16LE(0x0800, 6); // bit 11: nome em UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // feito por
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentário
    central.writeUInt16LE(0, 34); // disco
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function main() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error(`versão inválida no manifest: ${version}`);
  const missing = FILES.filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length) {
    throw new Error(`faltam arquivos: ${missing.join(', ')}${missing.some((f) => f.startsWith('icons/')) ? ' (rode node extension/scripts/make-icons.mjs)' : ''}`);
  }
  const entries = FILES.map((name) => ({ name, data: readFileSync(join(ROOT, name)) }));
  const zip = makeZip(entries);
  const outDir = join(ROOT, 'dist');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `guarita-extensao-${version}.zip`);
  writeFileSync(out, zip);
  console.log(`${out}: ${entries.length} arquivos, ${zip.length} bytes`);
}

// Roda só quando chamado direto (os testes importam makeZip/crc32 sem gerar o arquivo).
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) main();
