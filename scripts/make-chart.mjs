// 造一张像论文插图的折线图，用来验证视觉理解
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 900, H = 620;
const px = Buffer.alloc(W * H * 4, 255);
const set = (x, y, r, g, b) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
};
const dot = (x, y, r, g, b, s = 2) => {
  for (let dx = -s; dx <= s; dx++) for (let dy = -s; dy <= s; dy++) set(x + dx, y + dy, r, g, b);
};
const L = 110, R = W - 60, T = 70, B = H - 90;
for (let i = 0; i <= 5; i++) { const y = B - (B - T) * i / 5; for (let x = L; x <= R; x++) set(x, y, 232, 232, 232); }
for (let x = L; x <= R; x++) { set(x, B, 40, 40, 40); set(x, B + 1, 40, 40, 40); }
for (let y = T; y <= B; y++) { set(L, y, 40, 40, 40); set(L + 1, y, 40, 40, 40); }
// 两条曲线：一条快速下降后平缓，一条线性下降
for (let i = 0; i <= 100; i++) {
  const t = i / 100, x = L + (R - L) * t;
  dot(x, B - (B - T) * (0.92 * Math.exp(-3.2 * t) + 0.06), 200, 60, 40, 2);
  dot(x, B - (B - T) * (0.88 - 0.62 * t), 40, 90, 200, 2);
}
// 图例色块
for (let x = R - 210; x < R - 180; x++) for (let y = T + 12; y < T + 20; y++) set(x, y, 200, 60, 40);
for (let x = R - 210; x < R - 180; x++) for (let y = T + 40; y < T + 48; y++) set(x, y, 40, 90, 200);

const t = (() => { const a = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; a[n] = c; } return a; })();
const crc = (b) => { let c = -1; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(b)); return Buffer.concat([l, b, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
writeFileSync(process.argv[2], Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih),
  chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0)),
]));
console.log("图已生成");
