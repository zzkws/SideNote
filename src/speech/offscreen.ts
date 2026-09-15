import { ENGINE_PORT, INITIAL_MODEL_STATE, type SpeechCommand, type SpeechEvent } from "./protocol";

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let port: chrome.runtime.Port;
let modelState = INITIAL_MODEL_STATE;
let activeId: string | undefined;

function post(event: SpeechEvent) {
  try { port.postMessage(event); } catch { /* Reconnected port receives the current state. */ }
}

function connect() {
  port = chrome.runtime.connect({ name: ENGINE_PORT });
  port.postMessage({ type: "model", state: modelState } satisfies SpeechEvent);
  port.onMessage.addListener((command: SpeechCommand) => {
    if (command.type === "speak") activeId = command.id;
    if (command.type === "cancel" && command.id === activeId) activeId = undefined;
    worker.postMessage(command);
  });
  port.onDisconnect.addListener(() => {
    // A browser may suspend the SW. Never replay an old selection after reconnection.
    if (activeId) worker.postMessage({ type: "cancel", id: activeId } satisfies SpeechCommand);
    activeId = undefined;
    setTimeout(connect, 1000);
  });
}
worker.onmessage = ({ data }: MessageEvent<SpeechEvent>) => {
  if (data.type === "model") modelState = data.state;
  if (data.type === "audio" || data.type === "error") activeId = undefined;
  post(data);
};
worker.onerror = () => {
  if (activeId) post({ type: "error", id: activeId, message: "语音引擎异常，请重新加载扩展后重试" });
  activeId = undefined;
  modelState = { ...modelState, phase: "error", error: "语音引擎异常，请重新加载扩展" };
  post({ type: "model", state: modelState });
};
connect();
// Sending activity, not just holding a port open, keeps a busy MV3 SW alive.
setInterval(() => {
  if (activeId || modelState.phase === "downloading" || modelState.phase === "verifying") post({ type: "heartbeat" });
}, 20_000);
