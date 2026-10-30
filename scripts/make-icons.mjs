// Gera os ícones PNG do PWA sem dependência (zlib do Node): fundo #16130f, guarita âmbar #e3a84c.
// Mesmo desenho do public/icons/icon.svg (grade de 64 unidades). Uso: node scripts/make-icons.mjs
// Saída: public/icons/icon-192.png, icon-512.png (cantos arredondados, fundo transparente fora)
//        e icon-maskable-192.png, icon-maskable-512.png (fundo cheio, desenho dentro da zona segura de 80%).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const BG = [0x16, 0x13, 0x0f];
const FG = [0xe3, 0xa8, 0x4c];

// ---- forma da guarita em coordenadas 0..64 ----
const RECTS = [
  [14, 20, 50, 26], // beiral do telhado
  [18, 28, 46, 36], // corpo acima da porta
  [18, 36, 24, 48], // pilar esquerdo
  [40, 36, 46, 48], // pilar direito
  [10, 50, 54, 56], // base
];
const ROOF = [[32, 10], [14, 20], [50, 20]]; // triângulo do telhado

function inTri(px, py, [a, b, c]) {
  const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [px, py];
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
const inShape = (x, y) => RECTS.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1) || inTri(x, y, ROOF);

// Cantos arredondados (rx 14 em 64) para o ícone comum.
function inRounded(x, y, r = 14) {
  const cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, maskable) {
  const SS = 4; // supersampling 4×4 para borda suave
  const px = Buffer.alloc(size * size * 4);
  // maskable: desenho encolhido para 72% em torno do centro (zona segura é o círculo de 80%)
  const k = maskable ? 0.72 : 1;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((i + (sx + 0.5) / SS) / size) * 64;
          const v = ((j + (sy + 0.5) / SS) / size) * 64;
          const inside = maskable || inRounded(u, v);
          if (!inside) continue;
          bg++;
          const su = 32 + (u - 32) / k, sv = 33 + (v - 33) / k;
          if (inShape(su, sv)) fg++;
        }
      }
      const n = SS * SS, o = (j * size + i) * 4;
      const a = bg / n, f = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(BG[c] * (1 - f) + FG[c] * f);
      px[o + 3] = Math.round(a * 255);
    }
  }
  return png(size, size, px);
}

// ---- PNG mínimo (RGBA 8 bits, sem filtro) ----
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
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, mask] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
]) {
  const buf = render(size, mask);
  writeFileSync(join(OUT, name), buf);
  console.log(`${name}: ${size}×${size}, ${buf.length} bytes`);
}
