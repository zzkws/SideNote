const W = 1080, H = 1440;
const C = {
  bg: "#141518", card: "#1f2023", line: "#34363b", fg: "#e8e9ec",
  mute: "#9aa0a8", dim: "#6b7280", accent: "#7aa2f7", blue: "#2563eb",
};
const FONT = '"PingFang SC","Microsoft YaHei","Hiragino Sans GB",system-ui,sans-serif';
const f = (size, weight) => (weight || 400) + " " + size + "px " + FONT;

/** 按字符断行，中英文都适用 */
function wrap(ctx, str, maxW) {
  const out = [];
  let line = "";
  for (const ch of str) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}

function text(ctx, str, x, y, o) {
  o = o || {};
  const size = o.size || 32;
  const lh = o.lh || 1.5;
  const maxW = o.maxW || W - 160;
  ctx.font = f(size, o.weight);
  ctx.fillStyle = o.color || C.fg;
  ctx.textAlign = o.align || "left";
  ctx.textBaseline = "top";
  const lines = wrap(ctx, str, maxW);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
  return y + lines.length * size * lh;
}

function roundRect(ctx, x, y, w, h, r, o) {
  o = o || {};
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 2; ctx.stroke(); }
}

/** 页脚统一署名 */
function footer(ctx, note) {
  text(ctx, "DeepSeek 伴读", 80, H - 132, { size: 26, weight: 600, color: C.mute });
  if (note) text(ctx, note, 80, H - 92, { size: 22, color: C.dim });
}

/** 复刻一张产品输出卡片，返回高度 */
function card(ctx, x, y, w, word, blocks, scale) {
  scale = scale || 1;
  const pad = 34 * scale;
  const head = 78 * scale;
  const measured = [];
  let h = head + pad;
  for (const b of blocks) {
    if (b.label) h += 22 * scale * 1.5 + 6 * scale;
    ctx.font = f(b.size * scale, b.weight);
    const lines = wrap(ctx, b.text, w - pad * 2);
    measured.push(lines);
    h += lines.length * b.size * scale * 1.62 + 22 * scale;
  }
  h += pad - 22 * scale;

  roundRect(ctx, x, y, w, h, 18 * scale, { fill: C.card, stroke: C.line });
  ctx.beginPath();
  ctx.moveTo(x, y + head);
  ctx.lineTo(x + w, y + head);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, word, x + pad, y + 24 * scale, { size: 30 * scale, weight: 650 });

  let cy = y + head + pad;
  blocks.forEach((b, i) => {
    if (b.label) {
      text(ctx, b.label, x + pad, cy, { size: 22 * scale, weight: 600, color: C.mute });
      cy += 22 * scale * 1.5 + 6 * scale;
    }
    ctx.font = f(b.size * scale, b.weight);
    ctx.fillStyle = b.color || C.fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    measured[i].forEach((l, j) => ctx.fillText(l, x + pad, cy + j * b.size * scale * 1.62));
    cy += measured[i].length * b.size * scale * 1.62 + 22 * scale;
  });
  return h;
}

const posters = [];

// 一行英文，其中一个词被高亮选中
function markedLine(ctx, x, y, size, before, word, after) {
  ctx.font = f(size);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let cx = x;
  ctx.fillStyle = C.dim;
  ctx.fillText(before, cx, y);
  cx += ctx.measureText(before).width;
  if (word) {
    const w = ctx.measureText(word).width;
    roundRect(ctx, cx - 4, y - 5, w + 8, size * 1.45, 4, { fill: C.blue });
    ctx.fillStyle = "#ffffff";
    ctx.fillText(word, cx, y);
    cx += w;
    ctx.fillStyle = C.dim;
    ctx.fillText(after, cx, y);
  }
}

// 1 · 封面
posters.push(function (ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  roundRect(ctx, 80, 96, 214, 54, 27, { stroke: C.accent });
  text(ctx, "免费 · 开源", 187, 110, { size: 27, color: C.accent, align: "center" });

  let y = text(ctx, "读英文论文", 80, 208, { size: 88, weight: 700, lh: 1.24 });
  y = text(ctx, "不用再切 ChatGPT 了", 80, y + 2, { size: 88, weight: 700, lh: 1.24, color: C.accent });

  y = text(ctx, "划中一个词，右边直接告诉你", 80, y + 46, { size: 38, color: C.mute, lh: 1.55 });
  text(ctx, "它在这句话里是什么意思", 80, y, { size: 38, color: C.mute, lh: 1.55 });

  // 用起来的样子：一段正文，一个词被选中，旁边浮出卡片
  const bx = 80, by = 800, ls = 28, gap = 48;
  markedLine(ctx, bx, by, ls, "Manifold-Constrained Hyper-Connections", "", "");
  markedLine(ctx, bx, by + gap, ls, "that enhance conventional ", "residual", " connections.");
  markedLine(ctx, bx, by + gap * 2, ls, "Additionally, we introduce the Muon optimizer,", "", "");
  markedLine(ctx, bx, by + gap * 3, ls, "leading to faster convergence and improved", "", "");
  markedLine(ctx, bx, by + gap * 4, ls, "training stability.", "", "");

  card(ctx, 448, by + 78, 552, "residual", [
    { text: "残差 —— 神经网络里把输入直接加到输出上的那条捷径连接。", size: 27 },
    { label: "文化拆解", text: "来自拉丁语 residere（留下、剩余）。", size: 25 },
  ], 0.92);

  footer(ctx, "github.com/zzkws/SideNote");
});

// 2 · 三种卡壳
posters.push(function (ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  text(ctx, "不是所有生词", 80, 132, { size: 70, weight: 700 });
  text(ctx, "都一样卡人", 80, 132 + 70 * 1.3, { size: 70, weight: 700, color: C.accent });

  const items = [
    ["①", "这个词没见过", "读到就断了，得停下来查", "inklings"],
    ["②", "每个字母都认识", "但不知道它在这一行里指什么", "indexer · GRPO"],
    ["③", "意思是知道的", "可就是记不牢，查过好几次还是眼生", "residual · frontier"],
  ];
  let y = 430;
  for (const it of items) {
    roundRect(ctx, 80, y, W - 160, 208, 18, { fill: C.card, stroke: C.line });
    text(ctx, it[0], 120, y + 40, { size: 43, weight: 700, color: C.accent });
    text(ctx, it[1], 194, y + 42, { size: 39, weight: 600 });
    text(ctx, it[2], 194, y + 100, { size: 29, color: C.mute, maxW: W - 334 });
    text(ctx, it[3], 194, y + 152, { size: 27, color: C.accent, weight: 600 });
    y += 208 + 28;
  }

  text(ctx, "第三种最耗人", 80, y + 26, { size: 36, weight: 600 });
  text(ctx, "缺的不是翻译，是它的来历", 80, y + 84, { size: 31, color: C.mute });

  footer(ctx);
});

// 3 · 核心：固定给三样
posters.push(function (ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  text(ctx, "划中一个词", 80, 120, { size: 68, weight: 700 });
  text(ctx, "固定给三样", 80, 120 + 68 * 1.3, { size: 68, weight: 700, color: C.accent });

  const ch = card(ctx, 80, 344, W - 160, "residual", [
    { text: "残差 —— 指神经网络里把输入直接加到输出上的那条捷径连接，让梯度能绕过深层直接回流。", size: 30 },
    { text: "这句话说：mHC 这个新设计是对传统残差连接的升级改造。", size: 30 },
    { label: "英文释意", text: "Relating to a connection that adds the input of a layer to its output, allowing gradients to flow through without vanishing.", size: 28 },
    { label: "文化拆解", text: "来自拉丁语 residere（留下、剩余）。统计里残差指观测值与拟合值之差，深度学习沿用了这个意象。", size: 29 },
  ]);

  const ay = 344 + ch + 52;
  text(ctx, "① 在这句话里的意思", 80, ay, { size: 31, color: C.accent, weight: 600 });
  text(ctx, "② 英文释意，只写此处那一个义项", 80, ay + 52, { size: 31, color: C.accent, weight: 600 });
  text(ctx, "③ 文化拆解 —— 它是从哪来的", 80, ay + 104, { size: 31, color: C.accent, weight: 600 });
  text(ctx, "不论 AI 论文、法律文书还是医学综述，都是这三样", 80, ay + 168,
    { size: 27, color: C.mute });

  footer(ctx);
});

// 4 · 什么领域都答得上
posters.push(function (ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  text(ctx, "论文自造的词", 80, 120, { size: 68, weight: 700 });
  text(ctx, "它也答得上来", 80, 120 + 68 * 1.3, { size: 68, weight: 700, color: C.accent });

  let y = 376;
  y += card(ctx, 80, y, W - 160, "Hyper-Connections", [
    { text: "这篇论文当场提出的新结构，网上查不到。Hyper- 前缀在数学里表示更高维，比如 hyperplane（超平面）。", size: 28 },
  ], 0.92) + 30;

  y += card(ctx, 80, y, W - 160, "GRPO", [
    { text: "半路冒出来的算法名。DeepSeek 提出，砍掉 PPO 的 critic 网络，改成从组内相对比较来更新策略。", size: 28 },
  ], 0.92) + 30;

  y += card(ctx, 80, y, W - 160, "FLOPs", [
    { text: "词典查不到的缩写。1950 年代超算性能评测留下来的说法，比如 Cray-1 的 80 MFLOPS。", size: 28 },
  ], 0.92) + 30;

  text(ctx, "上下文它读得到", 80, y + 30, { size: 36, weight: 600 });
  text(ctx, "所以答的是在这一句里的意思，不是通用释义", 80, y + 88, { size: 30, color: C.mute });

  footer(ctx);
});

// 5 · 怎么拿
posters.push(function (ctx) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  text(ctx, "免费 · 开源", 80, 120, { size: 68, weight: 700 });
  text(ctx, "三步装好", 80, 120 + 68 * 1.3, { size: 68, weight: 700, color: C.accent });

  const steps = [
    ["1", "下载", "GitHub Releases 里的安装压缩包，解压出来"],
    ["2", "装进 Chrome", "chrome://extensions → 开发者模式 → 加载已解压的扩展程序"],
    ["3", "填 Key", "设置页会自动打开，填你自己的 DeepSeek API Key"],
  ];
  let y = 372;
  for (const s of steps) {
    roundRect(ctx, 80, y, W - 160, 182, 18, { fill: C.card, stroke: C.line });
    roundRect(ctx, 118, y + 46, 58, 58, 29, { fill: C.blue });
    text(ctx, s[0], 147, y + 60, { size: 31, weight: 700, color: "#ffffff", align: "center" });
    text(ctx, s[1], 206, y + 42, { size: 36, weight: 600 });
    text(ctx, s[2], 206, y + 96, { size: 26, color: C.mute, maxW: W - 350, lh: 1.5 });
    y += 182 + 28;
  }

  roundRect(ctx, 80, y + 26, W - 160, 176, 18, { stroke: C.accent });
  text(ctx, "github.com/zzkws/SideNote", 540, y + 58, { size: 37, weight: 600, color: C.accent, align: "center" });
  text(ctx, "MIT 协议 · 用你自己的 Key，数据不经过第三方", 540, y + 114, { size: 25, color: C.mute, align: "center", maxW: W - 240 });
  text(ctx, "查一个词大约几分钱", 540, y + 150, { size: 25, color: C.mute, align: "center", maxW: W - 240 });

  footer(ctx);
});

/* ── 渲染与导出 ── */

const row = document.getElementById("row");
const canvases = [];

function save(cv, n) {
  const a = document.createElement("a");
  a.download = "deepseek-reading-companion-poster-" + n + ".png";
  a.href = cv.toDataURL("image/png");
  a.click();
}

function build() {
  posters.forEach(function (paint, i) {
    const box = document.createElement("div");
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    paint(cv.getContext("2d"));
    const bar = document.createElement("div");
    bar.className = "bar";
    const btn = document.createElement("button");
    btn.textContent = "下载第 " + (i + 1) + " 张";
    btn.onclick = () => save(cv, i + 1);
    bar.append(btn);
    box.append(cv, bar);
    row.append(box);
    canvases.push(cv);
  });
}

document.getElementById("dl-all").onclick = function () {
  canvases.forEach((cv, i) => setTimeout(() => save(cv, i + 1), i * 400));
};

build();
