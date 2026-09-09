import { GlobalWorkerOptions, TextLayer, getDocument } from "pdfjs-dist";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { render } from "preact";
import { loadSettings } from "../shared/settings";
import {
  PORT_NAME,
  type ClientMessage,
  type PriorTurn,
  type Query,
  type ServerMessage,
  type Settings,
} from "../shared/types";
import { Popup } from "../ui/Popup";
import {
  anchor,
  appendDelta,
  failure,
  placement,
  pushTurn,
  status,
  thread,
  visible,
  word,
} from "../ui/store";
import css from "../ui/styles.css?inline";
import { buildDoc, type RawItem } from "./layout";
import { DocIndex, readPdfSelection } from "./select";
import "pdfjs-dist/web/pdf_viewer.css";
import "./viewer.css";

GlobalWorkerOptions.workerSrc = workerUrl;

/** 版面倍率：页面在屏幕上显示多大。用户可调 */
let zoom = 1.4;

/**
 * 画布的实际像素倍率。
 * 按 CSS 尺寸画会在高分屏上被浏览器拉伸，字就糊了 —— 必须乘上 devicePixelRatio
 * 才是屏幕的原生分辨率。上限 3 是为了拦住内存：一页 A4 在 3 倍下已经近 40 MB。
 */
function outputScale(): number {
  return Math.min(window.devicePixelRatio || 1, 3);
}

const app = document.getElementById("app") as HTMLDivElement;
let index: DocIndex | null = null;
let docTitle = "";

/* ---------------- 浮层：跟网页版共用同一套 UI ---------------- */

const host = document.createElement("div");
host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;";
const shadow = host.attachShadow({ mode: "open" });
const styleEl = document.createElement("style");
styleEl.textContent = css;
shadow.append(styleEl);
const mount = document.createElement("div");
shadow.append(mount);
document.documentElement.append(host);

/* ---------------- 与 service worker 的长连接 ---------------- */

/** 页面也可能被单独打开（比如本地起服务预览），那时没有扩展 API */
const inExtension = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

let port: chrome.runtime.Port | null = null;
let currentId: string | null = null;
let lastQuery: (Query & { range: Range }) | null = null;

function getPort(): chrome.runtime.Port {
  if (port) return port;
  port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener(onServerMessage);
  port.onDisconnect.addListener(() => {
    port = null;
  });
  return port;
}

function send(msg: ClientMessage) {
  if (!inExtension) {
    status.value = "error";
    failure.value = { code: "unknown", message: "这个页面要从扩展里打开才能查词。" };
    return;
  }
  try {
    getPort().postMessage(msg);
  } catch {
    port = null;
    try {
      getPort().postMessage(msg);
    } catch {
      status.value = "error";
      failure.value = { code: "unknown", message: "扩展已更新，请刷新页面。" };
    }
  }
}

function onServerMessage(msg: ServerMessage) {
  if (msg.id !== currentId) return;
  switch (msg.type) {
    case "delta":
      if (status.value === "loading") status.value = "streaming";
      appendDelta(msg.text);
      break;
    case "done":
      status.value = "done";
      break;
    case "error":
      status.value = "error";
      failure.value = { code: msg.code, message: msg.message };
      break;
  }
}

function ask(q: Query & { range: Range }) {
  lastQuery = q;
  currentId = crypto.randomUUID();
  word.value = q.word;
  anchor.value = q.range;
  thread.value = [{ question: null, answer: "" }];
  failure.value = null;
  status.value = "loading";
  visible.value = true;
  const { range: _r, ...payload } = q;
  send({ type: "explain", id: currentId, ...payload });
}

function askFollowup(question: string) {
  if (!lastQuery) return;
  const prior: PriorTurn[] = [];
  for (const t of thread.value) {
    if (t.question !== null) prior.push({ role: "user", content: t.question });
    if (t.answer) prior.push({ role: "assistant", content: t.answer });
  }
  currentId = crypto.randomUUID();
  pushTurn(question);
  failure.value = null;
  status.value = "loading";
  const { range: _r, ...payload } = lastQuery;
  send({ type: "followup", id: currentId, question, prior, ...payload });
}

function close() {
  if (currentId) send({ type: "cancel", id: currentId });
  currentId = null;
  visible.value = false;
}

render(
  <Popup
    onClose={close}
    onOpenOptions={() => send({ type: "openOptions" })}
    onRetry={() => lastQuery && ask(lastQuery)}
    onAsk={askFollowup}
  />,
  mount,
);

/* ---------------- 选区 ---------------- */

let settings: Settings | null = null;

function applySettings(s: Settings) {
  settings = s;
  placement.value = s.placement;
}
if (inExtension) {
  void loadSettings().then(applySettings);
  chrome.storage.onChanged.addListener(() => {
    void loadSettings().then(applySettings);
  });
}

const insideUs = (e: Event) => e.composedPath().includes(host);
let debounce: number | undefined;

document.addEventListener(
  "mouseup",
  (e) => {
    const idx = index;
    if (!idx || insideUs(e)) return;
    if (settings?.trigger === "alt-select" && !e.altKey) return;

    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      const pick = readPdfSelection(idx);
      if (!pick) return;
      ask({ ...pick, article: idx.doc.text, title: docTitle, url: location.href });
    }, 160);
  },
  true,
);

document.addEventListener(
  "mousedown",
  (e) => {
    if (visible.value && !insideUs(e)) close();
  },
  true,
);

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && visible.value) {
      close();
      e.stopPropagation();
    }
  },
  true,
);

/* ---------------- PDF 渲染 ---------------- */

function pickerHandler(input: HTMLInputElement) {
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void openFile(f);
  };
}

function buildChrome(): HTMLDivElement {
  app.textContent = "";

  const bar = document.createElement("div");
  bar.className = "pv-bar";

  const brand = document.createElement("span");
  brand.className = "pv-brand";
  brand.textContent = "划词旁注 · PDF";

  const name = document.createElement("span");
  name.className = "pv-name";
  name.textContent = docTitle;

  const label = document.createElement("label");
  label.className = "pv-open";
  label.textContent = "换一份 ";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf";
  input.hidden = true;
  pickerHandler(input);
  label.append(input);

  const zoomSel = document.createElement("select");
  zoomSel.className = "pv-zoom";
  for (const [label2, v] of [["100%", 1], ["125%", 1.25], ["140%", 1.4], ["175%", 1.75], ["200%", 2]] as [string, number][]) {
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = label2;
    if (v === zoom) o.selected = true;
    zoomSel.append(o);
  }
  zoomSel.onchange = () => {
    zoom = Number(zoomSel.value);
    void renderAll();
  };

  bar.append(brand, name, zoomSel, label);

  const pages = document.createElement("div");
  pages.className = "pv-pages";
  app.append(bar, pages);
  return pages;
}

async function openFile(file: File) {
  docTitle = file.name.replace(/\.pdf$/i, "");
  const buf = new Uint8Array(await file.arrayBuffer());
  const pages = buildChrome();

  const note = document.createElement("div");
  note.className = "pv-loading";
  note.textContent = "正在读取…";
  pages.append(note);

  const pdf = await getDocument({ data: buf }).promise;

  // 先把全文抽出来建索引。取文字很快，渲染画布很慢 ——
  // 分两段做，翻到第一页就能查词，不必等整份文档画完。
  const raw: { width: number; items: RawItem[] }[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    contents.push({ page, content });
    raw.push({
      width: page.getViewport({ scale: 1 }).width,
      items: content.items.filter((x) => "str" in x) as unknown as RawItem[],
    });
  }
  index = new DocIndex(buildDoc(raw));
  note.remove();

  pagesEl = pages;
  await renderAll();
}

/** 重新按当前 zoom 铺一遍页面。改缩放时文字层位置也要跟着变，所以整体重建 */
async function renderAll() {
  if (!pagesEl) return;
  pagesEl.textContent = "";
  queue = [];
  drawn.clear();

  // 文字层先上：它是纯 DOM，不依赖画布。这样翻到哪一页就能选哪一页的词，
  // 不用等画布画完（画布走 requestAnimationFrame，标签页在后台时会停）。
  for (let n = 1; n <= contents.length; n++) {
    const { page, content } = contents[n - 1];
    const viewport = page.getViewport({ scale: zoom });
    const os = outputScale();

    const wrap = document.createElement("div");
    wrap.className = "pv-page";
    wrap.style.width = `${Math.floor(viewport.width)}px`;
    wrap.style.height = `${Math.floor(viewport.height)}px`;
    // PDF.js 的文字层用这两个 CSS 变量算每个 span 的位置和字号。
    // 不设的话 span 按 1 倍排、画布按 zoom 倍画，误差沿行累积，
    // 于是"看着选中 introduced，实际选到 ntly introd"。
    wrap.style.setProperty("--scale-factor", String(zoom));
    wrap.style.setProperty("--total-scale-factor", String(zoom));

    const canvas = document.createElement("canvas");
    // 背后的位图按屏幕原生分辨率开，CSS 尺寸仍是版面尺寸
    canvas.width = Math.floor(viewport.width * os);
    canvas.height = Math.floor(viewport.height * os);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const layer = document.createElement("div");
    layer.className = "textLayer";
    wrap.append(canvas, layer);
    pagesEl.append(wrap);

    const tl = new TextLayer({ textContentSource: content, container: layer, viewport });
    await tl.render();
    // 给每个 span 打上页码和 item 序号，选中时靠它换算成正文偏移
    tl.textDivs.forEach((div, i) => {
      div.dataset.p = String(n - 1);
      div.dataset.i = String(i);
    });

    queue.push({ page, canvas, viewport });
    observer.observe(wrap);
    wrapToPage.set(wrap, queue.length - 1);
  }
}

/** 画布按需渲染：滚到跟前才画，几十页的书也不会一上来就卡住 */
let queue: { page: PDFPageProxy; canvas: HTMLCanvasElement; viewport: PageViewport }[] = [];
let contents: { page: PDFPageProxy; content: Awaited<ReturnType<PDFPageProxy["getTextContent"]>> }[] = [];
let pagesEl: HTMLDivElement | null = null;
const wrapToPage = new WeakMap<Element, number>();
const drawn = new Set<number>();

const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const i = wrapToPage.get(e.target);
      if (i === undefined || drawn.has(i)) continue;
      drawn.add(i);
      const { page, canvas, viewport } = queue[i];
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const os = outputScale();
      void page.render({
        canvasContext: ctx,
        viewport,
        canvas,
        transform: os === 1 ? undefined : [os, 0, 0, os, 0, 0],
      }).promise;
    }
  },
  { rootMargin: "600px 0px" },
);

/* ---------------- 入口 ---------------- */

function showDrop() {
  app.textContent = "";
  const box = document.createElement("div");
  box.className = "pv-drop";
  const inner = document.createElement("div");
  inner.className = "pv-drop-inner";

  const h = document.createElement("h1");
  h.textContent = "划词旁注 · PDF 阅读器";
  const p = document.createElement("p");
  p.textContent = "把 PDF 拖进来，或者点下面选一份。";
  const sub = document.createElement("p");
  sub.className = "pv-sub";
  sub.textContent = "渲染完就能像在网页上一样划词 —— Chrome 自带的查看器拿不到选区，所以另开这一页。";

  const label = document.createElement("label");
  label.className = "pv-pick";
  label.textContent = "选择 PDF";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf";
  input.hidden = true;
  pickerHandler(input);
  label.append(input);

  inner.append(h, p, sub, label);
  box.append(inner);
  app.append(box);
}

document.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("pv-dragging");
});
document.addEventListener("dragleave", () => {
  document.body.classList.remove("pv-dragging");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("pv-dragging");
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type === "application/pdf") void openFile(f);
});

/** ?file=<url> 可以直接打开一份 PDF，不用先拖进来 */
async function openFromQuery(): Promise<boolean> {
  const url = new URLSearchParams(location.search).get("file");
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const name = decodeURIComponent(url.split("/").pop() ?? "document.pdf");
    await openFile(new File([blob], name, { type: "application/pdf" }));
    return true;
  } catch {
    return false;
  }
}

void openFromQuery().then((ok) => {
  if (!ok) showDrop();
});
