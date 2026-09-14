// 把 poster/poster.js 打包成一个可离线打开的 HTML。
// 全部用 canvas 矢量绘制，不依赖外部图片，导出的 PNG 在任何尺寸下都清晰。
import { readFileSync, writeFileSync } from "node:fs";

const js = readFileSync("poster/poster.js", "utf8");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>DeepSeek 伴读 · 早期海报存档</title>
<style>
  body { margin:0; padding:32px; background:#0d0e10; color:#e6e7ea;
         font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; }
  h1 { font-size:18px; margin:0 0 4px; }
  .hint { color:#9aa0a8; margin:0 0 24px; }
  .row { display:flex; flex-wrap:wrap; gap:24px; }
  .item { }
  canvas { width:360px; height:480px; border-radius:10px; display:block;
           box-shadow:0 8px 32px rgba(0,0,0,.5); }
  .bar { display:flex; gap:8px; align-items:center; margin-top:10px; }
  button { padding:6px 14px; border:1px solid #34363b; border-radius:7px;
           background:#1f2023; color:#e6e7ea; font:inherit; font-size:13px; cursor:pointer; }
  button:hover { border-color:#7aa2f7; color:#7aa2f7; }
  .all { margin:0 0 20px; }
  .all button { padding:9px 20px; font-size:14px; background:#2563eb; border-color:#2563eb; color:#fff; }
</style>
</head>
<body>
<h1>DeepSeek 伴读 · 早期海报存档 · 1080 × 1440</h1>
<p class="hint">下面是按 1:3 缩小的预览。点「下载」得到的是原始 1080×1440 PNG，可直接发小红书。</p>
<p class="all"><button id="dl-all">下载全部 5 张</button></p>
<div class="row" id="row"></div>
<script>
${js}
</script>
</body>
</html>`;

writeFileSync("poster/index.html", html);
console.log(`poster/index.html  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
