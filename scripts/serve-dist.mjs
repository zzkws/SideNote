// 本地预览构建产物用，跟扩展无关
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".png": "image/png",
};

createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  const rel = normalize(url).replace(/^[/]+/, "").split("..").join("");
  const file = join("dist", rel);
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(5190, () => console.log("http://localhost:5190/src/pdf/index.html?file=/paper.pdf"));
