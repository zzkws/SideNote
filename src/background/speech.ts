import { ENGINE_PORT, INITIAL_MODEL_STATE, SPEECH_PORT, normalizeSpeechText, speechTextError,
  type SpeechCommand, type SpeechEvent } from "../speech/protocol";

const clients = new Set<chrome.runtime.Port>();
let engine: chrome.runtime.Port | undefined;
let state = INITIAL_MODEL_STATE;
let creating: Promise<void> | undefined;
let active: { port: chrome.runtime.Port; id: string } | undefined;
const engineWaiters = new Set<(port: chrome.runtime.Port) => void>();

function post(port: chrome.runtime.Port, message: SpeechEvent) {
  try { port.postMessage(message); } catch { clients.delete(port); }
}

async function getEngine(): Promise<chrome.runtime.Port> {
  if (engine) return engine;
  if (!creating) creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL("src/speech/offscreen.html")],
    });
    if (!contexts.length) await chrome.offscreen.createDocument({
      url: "src/speech/offscreen.html", reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "在独立 Worker 中下载并运行本地 Kokoro 英文发音模型，不阻塞阅读页面。",
    });
  })().finally(() => { creating = undefined; });
  await creating;
  if (engine) return engine;
  return new Promise((resolve, reject) => {
    const receive = (port: chrome.runtime.Port) => { clearTimeout(timeout); resolve(port); };
    const timeout = setTimeout(() => {
      engineWaiters.delete(receive);
      reject(new Error("语音引擎启动超时，请重新加载扩展后重试"));
    }, 15_000);
    engineWaiters.add(receive);
  });
}

export async function prepareSpeech() {
  try { (await getEngine()).postMessage({ type: "prepare" } satisfies SpeechCommand); }
  catch (error) {
    state = { ...state, phase: "error", error: error instanceof Error ? error.message : "语音引擎无法启动" };
    for (const client of clients) post(client, { type: "model", state });
  }
}

function cancelActive() {
  if (!active) return;
  const command = { type: "cancel", id: active.id } as const;
  try { engine?.postMessage(command); } catch { /* Engine will reconnect. */ }
  post(active.port, { type: "cancelled", id: active.id });
  active = undefined;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === ENGINE_PORT) {
    // Only our private offscreen document may send synthesized audio/model state.
    if (port.sender?.url !== chrome.runtime.getURL("src/speech/offscreen.html")) return;
    engine = port;
    for (const resolve of engineWaiters) resolve(port);
    engineWaiters.clear();
    port.onMessage.addListener((message: SpeechEvent) => {
      if (message.type === "model") {
        state = message.state;
        for (const client of clients) post(client, message);
      } else if ("id" in message && active?.id === message.id) post(active.port, message);
    });
    port.onDisconnect.addListener(() => {
      if (engine !== port) return;
      engine = undefined;
      if (active) post(active.port, { type: "error", id: active.id, message: "语音连接中断，请重试" });
      active = undefined;
    });
    return;
  }
  if (port.name !== SPEECH_PORT) return;
  clients.add(port);
  post(port, { type: "model", state });
  port.onDisconnect.addListener(() => {
    clients.delete(port);
    if (active?.port === port) cancelActive();
  });
  port.onMessage.addListener((command: SpeechCommand) => {
    if (command.type === "prepare") { void prepareSpeech(); return; }
    if (command.type === "cancel") {
      if (active?.port === port && active.id === command.id) cancelActive();
      return;
    }
    if (command.type !== "speak" || typeof command.text !== "string" || typeof command.id !== "string") return;
    const invalid = speechTextError(normalizeSpeechText(command.text));
    if (invalid) { post(port, { type: "error", id: command.id, message: invalid }); return; }
    cancelActive();
    active = { port, id: command.id };
    void getEngine().then((worker) => {
      if (active?.port === port && active.id === command.id) worker.postMessage(command);
    }).catch(() => {
      if (active?.port === port && active.id === command.id) {
        post(port, { type: "error", id: command.id, message: "语音引擎未能启动，请重试" });
        active = undefined;
      }
    });
  });
});
