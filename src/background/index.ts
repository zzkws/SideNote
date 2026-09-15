import { loadSettings } from "../shared/settings";
import { prepareSpeech } from "./speech";
import { PORT_NAME, type ClientMessage, type ServerMessage } from "../shared/types";
import { streamChat } from "./deepseek";
import { buildFollowupMessages, buildMessages, messageText, type ChatMessage } from "./prompt";

/**
 * API 调用必须在 service worker 里：
 * 1. content script 受宿主页面 CSP 约束，很多站点会直接 block fetch；
 * 2. API Key 不该出现在页面上下文中。
 * 用长连接 Port 而非 sendMessage：既支持流式推送，也能在流式期间保活 SW。
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const inflight = new Map<string, AbortController>();

  const post = (msg: ServerMessage) => {
    try {
      port.postMessage(msg);
    } catch {
      // Port 已断开（页面刷新），忽略
    }
  };

  const abortAll = () => {
    for (const ctrl of inflight.values()) ctrl.abort();
    inflight.clear();
  };

  port.onMessage.addListener((msg: ClientMessage) => {
    if (msg.type === "openOptions") {
      chrome.runtime.openOptionsPage();
      return;
    }
    if (msg.type === "cancel") {
      inflight.get(msg.id)?.abort();
      inflight.delete(msg.id);
      return;
    }
    if (msg.type !== "explain" && msg.type !== "followup") return;

    // 快速连续选词：新请求作废旧请求，省钱也省得结果错位
    abortAll();

    void handleExplain(msg);
  });

  port.onDisconnect.addListener(abortAll);

  async function handleExplain(msg: ClientMessage & { type: "explain" | "followup" }) {
    const settings = await loadSettings();
    if (!settings.apiKey) {
      post({
        type: "error",
        id: msg.id,
        code: "no-key",
        message: "还没有配置 DeepSeek API Key。",
      });
      return;
    }

    const messages =
      msg.type === "followup"
        ? buildFollowupMessages(msg, msg.prior, msg.question)
        : buildMessages(msg);
    if (settings.debug) dumpContext(msg.type === "followup" ? msg.question : msg.word, messages);

    const ctrl = new AbortController();
    inflight.set(msg.id, ctrl);

    await streamChat(settings, messages, ctrl.signal, {
      onDelta: (text) => post({ type: "delta", id: msg.id, text }),
      onDone: (truncated) => {
        inflight.delete(msg.id);
        post({ type: "done", id: msg.id, truncated });
      },
      onError: (code, message) => {
        inflight.delete(msg.id);
        post({ type: "error", id: msg.id, code, message });
      },
    });
  }
});

/** debug 开关打开时，把实际发送的每条消息完整打出来。 */
function dumpContext(word: string, messages: ChatMessage[]) {
  const chars = messages.reduce((n, m) => n + messageText(m).length, 0);
  console.group(`[DeepSeek 伴读] 选中 "${word}" —— 共 ${chars.toLocaleString()} 字符`);

  messages.forEach((m, i) => {
    console.log(
      `%c消息 ${i + 1}  role=${m.role}  ${messageText(m).length.toLocaleString()} 字符`,
      "font-weight:bold;color:#7aa2f7",
    );
    console.log(messageText(m));
  });

  console.log(
    "%c—— 下面是拼成一份的纯文本，右键 Copy string 可整份复制 ——",
    "font-weight:bold;color:#f7768e",
  );
  const joined = messages
    .map((m, i) => `===== 消息 ${i + 1}  (role=${m.role}) =====\n${messageText(m)}`)
    .join("\n\n");
  console.log(joined);

  console.groupEnd();
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.runtime.openOptionsPage();
  void prepareSpeech();
});
