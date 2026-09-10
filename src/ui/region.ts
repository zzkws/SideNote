/**
 * 框选一块区域。
 *
 * 页面上画一层半透明遮罩，用户拖出一个框，回调拿到的是 CSS 像素坐标。
 * 真正的截图在 service worker 里做（captureVisibleTab 拿整个可见区，再按这个框裁）——
 * content script 拿不到跨源画面，只能由后台来。
 */
export function selectRegion(onPick: (rect: DOMRect) => void, onCancel: () => void): void {
  const layer = document.createElement("div");
  layer.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "cursor:crosshair",
    "background:rgba(20,20,22,0.28)",
  ].join(";");

  const box = document.createElement("div");
  box.style.cssText = [
    "position:fixed",
    "border:2px solid #7aa2f7",
    "background:rgba(122,162,247,0.12)",
    "border-radius:3px",
    "pointer-events:none",
    "display:none",
  ].join(";");

  const tip = document.createElement("div");
  tip.textContent = "拖一个框框住图，松手就问它是什么 · Esc 取消";
  tip.style.cssText = [
    "position:fixed",
    "top:18px",
    "left:50%",
    "transform:translateX(-50%)",
    "padding:7px 14px",
    "border-radius:8px",
    "background:#1f2023",
    "color:#e8e9ec",
    "font:13px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
    "box-shadow:0 4px 20px rgba(0,0,0,.35)",
    "pointer-events:none",
  ].join(";");

  layer.append(box, tip);
  document.documentElement.append(layer);

  let sx = 0;
  let sy = 0;
  let dragging = false;

  const cleanup = () => {
    layer.remove();
    window.removeEventListener("keydown", onKey, true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    cleanup();
    onCancel();
  };
  window.addEventListener("keydown", onKey, true);

  layer.addEventListener("mousedown", (e) => {
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    box.style.display = "block";
    box.style.left = `${sx}px`;
    box.style.top = `${sy}px`;
    box.style.width = "0px";
    box.style.height = "0px";
  });

  layer.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const x = Math.min(sx, e.clientX);
    const y = Math.min(sy, e.clientY);
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${Math.abs(e.clientX - sx)}px`;
    box.style.height = `${Math.abs(e.clientY - sy)}px`;
  });

  layer.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(sx, e.clientX);
    const y = Math.min(sy, e.clientY);
    const w = Math.abs(e.clientX - sx);
    const h = Math.abs(e.clientY - sy);
    cleanup();
    // 太小多半是误点
    if (w < 24 || h < 24) {
      onCancel();
      return;
    }
    onPick(new DOMRect(x, y, w, h));
  });
}

/** 框住的那块地方有哪些文字 —— 图注通常就在框里或紧挨着 */
export function textNear(rect: DOMRect): string {
  const pad = 90; // 往外放一圈，把框外的图注也捞进来
  const zone = new DOMRect(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const el of document.querySelectorAll<HTMLElement>("p,li,td,figcaption,h1,h2,h3,h4,span,div")) {
    const t = el.textContent?.trim();
    if (!t || t.length < 8 || t.length > 600) continue;
    if (el.childElementCount > 0 && el.tagName !== "FIGCAPTION") continue; // 只要叶子，避免整段重复
    const r = el.getBoundingClientRect();
    if (r.right < zone.x || r.left > zone.right || r.bottom < zone.y || r.top > zone.bottom) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out.join("\n");
}
