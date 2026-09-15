import { useEffect, useRef, useState } from "preact/hooks";
import { INITIAL_MODEL_STATE, SPEECH_PORT, modelStatusText, normalizeSpeechText, speechTextError,
  type ModelState, type SpeechCommand, type SpeechEvent } from "./protocol";

type Playback = "idle" | "waiting" | "loading" | "synthesizing" | "playing" | "error";

/** Audio stays in the reader's user-activated AudioContext, not a remote media URL. */
export function useSpeech(text: string) {
  const [model, setModel] = useState<ModelState>(INITIAL_MODEL_STATE);
  const [playback, setPlayback] = useState<Playback>("idle");
  const [error, setError] = useState("");
  const port = useRef<chrome.runtime.Port>();
  const context = useRef<AudioContext>();
  const source = useRef<AudioBufferSourceNode>();
  const request = useRef<string>();
  const watchdog = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(false);

  function stop() {
    clearTimeout(watchdog.current);
    const id = request.current;
    request.current = undefined;
    if (id) try { port.current?.postMessage({ type: "cancel", id } satisfies SpeechCommand); } catch { /* Closed. */ }
    source.current?.stop();
    source.current = undefined;
    if (mounted.current) setPlayback("idle");
  }

  function fail(message: string) {
    stop();
    if (!mounted.current) return;
    setError(message);
    setPlayback("error");
  }

  function armWatchdog() {
    clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => fail("语音准备超时，点击重试"), 120_000);
  }

  function onMessage(message: SpeechEvent) {
    if (!mounted.current) return;
    if (message.type === "model") {
      setModel(message.state);
      if (request.current) {
        armWatchdog();
        if (message.state.phase === "error") fail(message.state.error || "下载失败，请重试");
      }
      return;
    }
    if (!("id" in message) || message.id !== request.current) return;
    if (message.type === "cancelled") { stop(); return; }
    if (message.type === "error") { fail(message.message); return; }
    if (message.type === "working") { armWatchdog(); setPlayback(message.stage); return; }
    if (message.type !== "audio" || !context.current) return;
    clearTimeout(watchdog.current);
    try {
      const binary = atob(message.pcm);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const view = new DataView(bytes.buffer);
      const buffer = context.current.createBuffer(1, bytes.length / 2, message.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
      const node = context.current.createBufferSource();
      node.buffer = buffer;
      node.connect(context.current.destination);
      node.onended = () => {
        node.disconnect();
        if (source.current === node) { source.current = undefined; stop(); }
      };
      source.current = node;
      if (context.current.state !== "running") throw new Error("浏览器暂停了声音，请再次点击播放");
      node.start();
      setPlayback("playing");
    } catch (cause) { fail(cause instanceof Error ? cause.message : "无法播放，请重试"); }
  }

  function connect() {
    if (port.current) return port.current;
    const connection = chrome.runtime.connect({ name: SPEECH_PORT });
    port.current = connection;
    connection.onMessage.addListener(onMessage);
    connection.onDisconnect.addListener(() => {
      if (port.current !== connection) return;
      port.current = undefined;
      if (request.current) fail("语音连接已断开，点击重试；扩展更新后请刷新页面");
    });
    return connection;
  }

  function prepare() {
    try { connect().postMessage({ type: "prepare" } satisfies SpeechCommand); }
    catch { setModel({ ...INITIAL_MODEL_STATE, phase: "error", error: "扩展已更新，请刷新页面" }); }
  }

  useEffect(() => {
    mounted.current = true;
    prepare();
    return () => {
      mounted.current = false;
      stop();
      port.current?.disconnect();
      port.current = undefined;
      void context.current?.close();
      context.current = undefined;
    };
  }, []);

  useEffect(() => { stop(); setError(""); }, [text]);

  async function toggle() {
    if (request.current) { stop(); return; }
    const normalized = normalizeSpeechText(text);
    const invalid = speechTextError(normalized);
    if (invalid) { fail(invalid); return; }
    try {
      // Called immediately in the click event, preserving browser user activation.
      if (!context.current || context.current.state === "closed") context.current = new AudioContext();
      const id = crypto.randomUUID();
      request.current = id;
      setError("");
      setPlayback("waiting");
      armWatchdog();
      await context.current.resume();
      if (request.current !== id || !mounted.current) return;
      connect().postMessage({ type: "speak", id, text: normalized } satisfies SpeechCommand);
    } catch { fail("无法启动发音，请刷新页面后重试"); }
  }

  const active = playback !== "idle" && playback !== "error";
  const label = playback === "error" ? error
    : playback === "playing" ? "正在播放 · 点击停止"
    : playback === "loading" ? "首次加载语音引擎…"
    : playback === "synthesizing" ? "正在生成发音…"
    : playback === "waiting" ? (model.phase === "ready" ? "正在准备发音…" : modelStatusText(model))
    : "播放英文发音 · Kokoro Q8 · 美式";

  return { model, playback, active, label, toggle, prepare };
}
