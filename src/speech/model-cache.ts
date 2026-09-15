import { INITIAL_MODEL_STATE, MODEL_BYTES, MODEL_CACHE, MODEL_SHA256, MODEL_SOURCES, MODEL_URL, type ModelState } from "./protocol";

let pending: Promise<void> | undefined;
let state: ModelState = { ...INITIAL_MODEL_STATE };
let notify: (state: ModelState) => void = () => {};

export function observeModel(listener: typeof notify) {
  notify = listener;
  notify(state);
}

function update(patch: Partial<ModelState>) {
  state = { ...state, error: undefined, ...patch };
  notify(state);
}

export async function cachedModel(): Promise<Response | undefined> {
  const cache = await caches.open(MODEL_CACHE);
  const response = await cache.match(MODEL_URL);
  // Only fully downloaded, SHA-256 checked data is ever committed to this key.
  if (response?.headers.get("x-model-sha256") === MODEL_SHA256 &&
      Number(response.headers.get("content-length")) === MODEL_BYTES) return response;
  return undefined;
}

export function ensureModel(): Promise<void> {
  if (pending) return pending;
  pending = prepare().catch((error: unknown) => {
    update({ phase: "error", error: error instanceof Error ? error.message : "语音包准备失败，请重试" });
    throw error;
  }).finally(() => { pending = undefined; });
  return pending;
}

async function prepare() {
  if (await cachedModel()) {
    update({ phase: "ready", received: MODEL_BYTES });
    return;
  }
  update({ phase: "downloading", received: 0 });
  let lastError: unknown;
  for (const url of MODEL_SOURCES) {
    try { await download(url); return; }
    catch (error) { lastError = error; }
  }
  throw lastError;
}

async function download(url: string) {
  update({ phase: "downloading", received: 0 });
  const controller = new AbortController();
  let timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!response.ok || !response.body) throw new Error(`语音包下载失败（HTTP ${response.status}），请检查 GitHub / Hugging Face 网络后重试`);
    const reader = response.body.getReader();
    const bytes = new Uint8Array(MODEL_BYTES);
    let received = 0;
    let lastUpdate = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), 60_000);
      if (received + value.length > MODEL_BYTES) throw new Error("语音包大小不符，请重试");
      bytes.set(value, received);
      received += value.length;
      if (Date.now() - lastUpdate > 200) {
        update({ received });
        lastUpdate = Date.now();
      }
    }
    if (received !== MODEL_BYTES) throw new Error("语音包下载不完整，请重试");
    update({ phase: "verifying", received });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0")).join("");
    if (hash !== MODEL_SHA256) throw new Error("语音包校验未通过，请重试");
    const cache = await caches.open(MODEL_CACHE);
    await cache.put(MODEL_URL, new Response(bytes, {
      headers: { "content-type": "application/octet-stream", "content-length": String(MODEL_BYTES), "x-model-sha256": hash },
    }));
    update({ phase: "ready" });
  } catch (error) {
    controller.abort();
    if (error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError")) {
      throw new Error("语音包下载中断，请检查 GitHub / Hugging Face 网络后重试");
    }
    throw error;
  } finally { clearTimeout(timeout); }
}
