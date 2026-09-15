import { KokoroTTS } from "kokoro-js";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import { env } from "@huggingface/transformers";
import { cachedModel, ensureModel, observeModel } from "./model-cache";
import { normalizeSpeechText, speechTextError, type SpeechCommand, type SpeechEvent } from "./protocol";

// A single shared worker, off the reading page's main thread. All code/WASM is local.
const root = new URL("../", self.location.href);
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("tts/", root).href;
env.useBrowserCache = false;
env.useFSCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(key: string) {
    if (key.endsWith("/onnx/model_quantized.onnx")) return cachedModel();
    return undefined;
  },
  async put() { /* Model cache is managed atomically with checksum verification. */ },
};
env.backends.onnx.wasm!.wasmPaths = {
  wasm: new URL(wasmUrl, root).href,
  mjs: new URL("tts/wasm/ort-wasm-simd-threaded.jsep.mjs", root).href,
};
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;

function send(event: SpeechEvent) { self.postMessage(event); }
observeModel((state) => send({ type: "model", state }));
let engine: Promise<KokoroTTS> | undefined;
let currentId: string | undefined;
let queue = Promise.resolve();
let idle: ReturnType<typeof setTimeout> | undefined;
// Memory-only replay cache: no selected text or generated speech is persisted.
const audioCache = new Map<string, { pcm: string; sampleRate: number }>();

async function loadEngine() {
  if (!engine) engine = (async () => {
    // kokoro-js reads this voice cache before attempting any remote voice request.
    const cache = await caches.open("kokoro-voices");
    const voice = await fetch(new URL("tts/kokoro/af_heart.bin", root));
    if (!voice.ok) throw new Error("本地音色文件缺失，请重新安装插件");
    await cache.put("https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_heart.bin", voice);
    return KokoroTTS.from_pretrained("kokoro", { dtype: "q8", device: "wasm" });
  })().catch((error) => { engine = undefined; throw error; });
  return engine;
}

function encodePCM(audio: Float32Array): string {
  const bytes = new Uint8Array(audio.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < audio.length; i++) {
    const sample = Math.max(-1, Math.min(1, audio[i]));
    view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function speak(id: string, rawText: string) {
  try {
    if (currentId !== id) return;
    const text = normalizeSpeechText(rawText);
    const invalid = speechTextError(text);
    if (invalid) throw new Error(invalid);
    await ensureModel();
    if (currentId !== id) return;
    let result = audioCache.get(text);
    if (!result) {
      send({ type: "working", id, stage: "loading" });
      const tts = await loadEngine();
      if (currentId !== id) return;
      send({ type: "working", id, stage: "synthesizing" });
      const audio = await tts.generate(text, { voice: "af_heart", speed: 1 });
      if (currentId !== id) return;
      result = { pcm: encodePCM(audio.audio), sampleRate: audio.sampling_rate };
      audioCache.set(text, result);
      if (audioCache.size > 16) audioCache.delete(audioCache.keys().next().value!);
    }
    send({ type: "audio", id, ...result });
  } catch (error) {
    if (currentId === id) send({ type: "error", id,
      message: error instanceof Error ? error.message : "发音失败，请重试" });
  } finally {
    // Release model memory after reading pauses; next playback uses the disk cache.
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!engine) return;
      const old = engine;
      engine = undefined;
      queue = queue.then(async () => { await (await old).model.dispose(); }).catch(() => {});
      audioCache.clear();
    }, 5 * 60_000);
  }
}

self.onmessage = ({ data }: MessageEvent<SpeechCommand>) => {
  if (data.type === "prepare") { void ensureModel().catch(() => {}); return; }
  if (data.type === "cancel") {
    if (currentId === data.id) currentId = undefined;
    return;
  }
  if (data.type === "speak") {
    currentId = data.id;
    clearTimeout(idle);
    queue = queue.then(() => speak(data.id, data.text));
  }
};
