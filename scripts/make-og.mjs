// Gera public/og.png (1200×630, prévia de link do Open Graph) sem dependência (zlib do Node), no estilo de
// scripts/make-icons.mjs: fundo #16130f, ícone da guarita âmbar e o nome em letras de bloco (fonte 5×7 embutida,
// sem precisar de fonte instalada). Uso: node scripts/make-og.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og.png');
const W = 1200, H = 630;
const BG = [0x16, 0x13, 0x0f];
const TILE = [0x22, 0x1d, 0x17];
const FG = [0xe3, 0xa8, 0x4c];
const MUTED = [0xa5, 0x9c, 0x8d];
const LINE = [0x34, 0x30, 0x28];

const px = Buffer.alloc(W * H * 3);
function put(x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  for (let k = 0; k < 3; k++) px[o + k] = Math.round(px[o + k] * (1 - a) + c[k] * a);
}
function rect(x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, c);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, BG);

// ---- ícone (mesma grade 0..64 do icon.svg), com supersampling 4×4 ----
const RECTS = [[14, 20, 50, 26], [18, 28, 46, 36], [18, 36, 24, 48], [40, 36, 46, 48], [10, 50, 54, 56]];
const ROOF = [[32, 10], [14, 20], [50, 20]];
function inTri(px_, py, [a, b, c]) {
  const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [px_, py];
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
const inShape = (x, y) => RECTS.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1) || inTri(x, y, ROOF);
function inRounded(x, y, r = 14) {
  const cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function icon(ox, oy, size) {
  const SS = 4;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((i + (sx + 0.5) / SS) / size) * 64, v = ((j + (sy + 0.5) / SS) / size) * 64;
          if (!inRounded(u, v)) continue;
          bg++;
          if (inShape(u, v)) fg++;
        }
      }
      if (!bg) continue;
      put(ox + i, oy + j, TILE, bg / (SS * SS));
      if (fg) put(ox + i, oy + j, FG, fg / (SS * SS));
    }
  }
}

// ---- fonte 5×7 (só as letras usadas) ----
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
// Acento circunflexo (2 linhas acima da letra) para o Ê de PORTUGUÊS.
const CIRCUMFLEX = ['00100', '01010'];

function text(str, x0, y0, scale, color) {
  let x = x0;
  for (const ch of str) {
    const base = ch === 'Ê' ? 'E' : ch;
    const g = GLYPHS[base];
    if (!g) throw new Error(`sem glifo para "${ch}"`);
    g.forEach((row, r) => [...row].forEach((b, c) => b === '1' && rect(x + c * scale, y0 + r * scale, scale, scale, color)));
    if (ch === 'Ê') CIRCUMFLEX.forEach((row, r) => [...row].forEach((b, c) => b === '1' && rect(x + c * scale, y0 - (3 - r) * scale, scale, scale, color)));
    x += 6 * scale;
  }
  return x - scale - x0; // largura usada
}
const width = (str, scale) => str.length * 6 * scale - scale;

// ---- composição ----
const ICON = 300;
const iconX = 110, iconY = (H - ICON) / 2;
icon(iconX, iconY, ICON);

const textX = iconX + ICON + 60;
const TITLE_S = 16, SUB_S = 5;
const blockH = 7 * TITLE_S + 48 + 7 * SUB_S + 30 + 7 * SUB_S;
let y = Math.round((H - blockH) / 2);
text('GUARITA', textX, y, TITLE_S, FG);
y += 7 * TITLE_S + 48;
text('COMPANHEIRO DO ALBION', textX, y, SUB_S, MUTED);
y += 7 * SUB_S + 30;
text('EM PORTUGUÊS', textX, y, SUB_S, MUTED);

// Faixa âmbar fina no rodapé e linha discreta no topo.
rect(0, H - 10, W, 10, FG);
rect(0, 0, W, 2, LINE);

if (textX + Math.max(width('GUARITA', TITLE_S), width('COMPANHEIRO DO ALBION', SUB_S)) > W - 40) {
  throw new Error('texto passou da margem direita');
}

// ---- PNG mínimo (RGB 8 bits, sem filtro) ----
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
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // profundidade
ihdr[9] = 2; // RGB
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let r = 0; r < H; r++) {
  raw[r * (W * 3 + 1)] = 0;
  px.copy(raw, r * (W * 3 + 1) + 1, r * W * 3, (r + 1) * W * 3);
}
const buf = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(OUT, buf);
console.log(`og.png: ${W}×${H}, ${buf.length} bytes`);
