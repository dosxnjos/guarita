// Gera os ícones da extensão (16, 32, 48 e 128 px) a partir do ícone do site, ../public/icons/icon-512.png, sem
// dependência (zlib do Node). Lê o PNG RGBA 8 bits (os cinco filtros de linha), reduz por média de área com alfa
// pré-multiplicado e grava PNG sem filtro. Uso: node extension/scripts/make-icons.mjs
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'public', 'icons', 'icon-512.png');
const OUT = join(HERE, '..', 'icons');
const SIZES = [16, 32, 48, 128];

// ---- PNG: leitura ----
function decodePng(buf) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!SIG.every((b, i) => buf[i] === b)) throw new Error('não é PNG');
  let off = 8;
  let w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || color !== 6 || interlace !== 0) throw new Error(`PNG não suportado (profundidade ${depth}, cor ${color}, entrelaçado ${interlace}); esperado RGBA 8 bits`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`filtro de linha ${f} inválido`);
      out[y * stride + x] = v & 0xff;
    }
  }
  return { w, h, px: out };
}

// ---- redução por média de área (alfa pré-multiplicado, sem halo escuro na borda) ----
function resize({ w, h, px }, size) {
  const out = Buffer.alloc(size * size * 4);
  const sx = w / size, sy = h / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x0 = i * sx, x1 = (i + 1) * sx, y0 = j * sy, y1 = (j + 1) * sy;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          const k = wx * wy, o = (y * w + x) * 4, al = px[o + 3] / 255;
          r += px[o] * al * k; g += px[o + 1] * al * k; b += px[o + 2] * al * k; a += al * k; area += k;
        }
      }
      const o = (j * size + i) * 4;
      const A = a / area;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(A * 255);
    }
  }
  return out;
}

// ---- PNG: escrita (mesmo formato de scripts/make-icons.mjs do site) ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const img = decodePng(readFileSync(SRC));
mkdirSync(OUT, { recursive: true });
for (const s of SIZES) {
  const buf = encodePng(s, s, resize(img, s));
  writeFileSync(join(OUT, `icon-${s}.png`), buf);
  console.log(`icon-${s}.png: ${s}×${s}, ${buf.length} bytes`);
}
