// 生成扩展图标：蓝底圆角方块 + 三行"文字"，中间一行是高亮的选中态。
// 纯 Node（zlib + 手写 PNG 分块），不引任何依赖。4x 超采样做抗锯齿。
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const SS = 4; // 超采样倍率

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 圆角矩形覆盖测试 */
function inRoundRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function draw(size) {
  const S = size * SS;
  const acc = new Float64Array(size * size * 4);

  const BG = [77, 107, 254]; // #4d6bfe，伴读的蓝色主题
  const LINE = [255, 255, 255];

  // 三行"文字"：中间一行是选中高亮，做得更亮更粗
  const rows = [
    { y: 0.3, x: 0.2, w: 0.55, h: 0.085, a: 0.5 },
    { y: 0.475, x: 0.2, w: 0.42, h: 0.115, a: 1.0, sel: true },
    { y: 0.675, x: 0.2, w: 0.48, h: 0.085, a: 0.5 },
  ];

  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      if (!inRoundRect(sx + 0.5, sy + 0.5, S, S, S * 0.225)) continue;

      let r = BG[0];
      let g = BG[1];
      let b = BG[2];

      const fx = (sx + 0.5) / S;
      const fy = (sy + 0.5) / S;
      for (const row of rows) {
        if (fx >= row.x && fx <= row.x + row.w && fy >= row.y && fy <= row.y + row.h) {
          // 选中那行画成实心白块（像被高亮选中的文字），其余是半透明线条
          const a = row.a;
          r = r + (LINE[0] - r) * a;
          g = g + (LINE[1] - g) * a;
          b = b + (LINE[2] - b) * a;
        }
      }

      const px = Math.floor(sx / SS);
      const py = Math.floor(sy / SS);
      const i = (py * size + px) * 4;
      acc[i] += r;
      acc[i + 1] += g;
      acc[i + 2] += b;
      acc[i + 3] += 255;
    }
  }

  const n = SS * SS;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const cover = acc[i * 4 + 3] / 255 / n;
    if (cover === 0) continue;
    out[i * 4] = Math.round(acc[i * 4] / (n * cover));
    out[i * 4 + 1] = Math.round(acc[i * 4 + 1] / (n * cover));
    out[i * 4 + 2] = Math.round(acc[i * 4 + 2] / (n * cover));
    out[i * 4 + 3] = Math.round(cover * 255);
  }
  return png(size, size, out);
}

mkdirSync("public/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = `public/icons/icon${size}.png`;
  writeFileSync(file, draw(size));
  console.log(`${file}  ${size}x${size}`);
}
