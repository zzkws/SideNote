/** Model data is pinned; executable code and the voice ship inside the extension. */
export const SPEECH_PORT = "companion-speech";
export const ENGINE_PORT = "companion-speech-engine";
export const MODEL_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
export const MODEL_URL = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${MODEL_REVISION}/onnx/model_quantized.onnx`;
export const MODEL_SOURCES = [
  "https://github.com/zzkws/SideNote/releases/download/kokoro-v1.0-q8/model_quantized.onnx",
  MODEL_URL,
] as const;
export const MODEL_BYTES = 92_361_116;
export const MODEL_SHA256 = "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478";
export const MODEL_CACHE = "companion-kokoro-q8-v1";
export const MAX_SPEECH_CHARS = 240;

export type ModelPhase = "checking" | "downloading" | "verifying" | "ready" | "error";
export interface ModelState {
  phase: ModelPhase;
  received: number;
  total: number;
  error?: string;
}
export const INITIAL_MODEL_STATE: ModelState = { phase: "checking", received: 0, total: MODEL_BYTES };
export type SpeechCommand =
  | { type: "prepare" }
  | { type: "speak"; id: string; text: string }
  | { type: "cancel"; id: string };
export type SpeechEvent =
  | { type: "model"; state: ModelState }
  | { type: "working"; id: string; stage: "loading" | "synthesizing" }
  | { type: "audio"; id: string; pcm: string; sampleRate: number }
  | { type: "error"; id: string; message: string }
  | { type: "cancelled"; id: string }
  | { type: "heartbeat" };

/** The reader already repairs PDF line-break hyphens. Keep real hyphens here. */
export function normalizeSpeechText(text: string): string {
  return text.normalize("NFKC").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
}

export function speechTextError(text: string): string | null {
  if (!/[a-z]/i.test(text)) return "请选择英文单词或短语";
  if (text.length > MAX_SPEECH_CHARS) return `请选短一些的词句（最多 ${MAX_SPEECH_CHARS} 字符）`;
  return null;
}

export function modelStatusText(state: ModelState): string {
  switch (state.phase) {
    case "checking": return "正在检查本地语音包…";
    case "downloading": return `下载语音包 · ${Math.min(99, Math.floor(state.received / state.total * 100))}%`;
    case "verifying": return "下载完成，正在校验…";
    case "ready": return "已就绪 · 可离线发音";
    case "error": return state.error || "下载失败，请重试";
  }
}
