/** 裁完最长边不超过这么多像素。实测 800px 宽的插图约 326 tok，再大收益很小 */
const MAX_EDGE = 1000;

/**
 * 截当前可见区域，按给定的框裁下来。
 *
 * content script 拿不到页面画面（跨源、也没有截图 API），所以只能后台来做：
 * captureVisibleTab 给的是整个可见区、设备像素分辨率的图，
 * 前台传来的框是 CSS 像素，所以要乘 devicePixelRatio 才对得上。
 */
export async function captureRegion(
  rect: { x: number; y: number; w: number; h: number },
  dpr: number,
): Promise<string> {
  const shot = await chrome.tabs.captureVisibleTab({ format: "png" });
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());

  const sx = Math.max(0, Math.round(rect.x * dpr));
  const sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(bitmap.width - sx, Math.round(rect.w * dpr));
  const sh = Math.min(bitmap.height - sy, Math.round(rect.h * dpr));

  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("拿不到画布上下文");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return `data:image/png;base64,${toBase64(await blob.arrayBuffer())}`;
}

/** service worker 里没有 FileReader，手动转 —— 分块是为了避开参数个数上限 */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
