import { render } from "preact";
import { loadSettings } from "../shared/settings";
import {
  PORT_NAME,
  type ClientMessage,
  type PriorTurn,
  type Query,
  type Settings,
  type ServerMessage,
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
import { getArticle } from "./article";
import { readSelection } from "./selection";

/* ---------------- Shadow DOM 挂载 ---------------- */

const host = document.createElement("div");
host.id = "sidenote-root";
host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;";
const shadow = host.attachShadow({ mode: "open" });

const styleEl = document.createElement("style");
styleEl.textContent = css;
shadow.append(styleEl);

const mountPoint = document.createElement("div");
shadow.append(mountPoint);
document.documentElement.append(host);

/* ---------------- 与 service worker 的长连接 ---------------- */

let port: chrome.runtime.Port | null = null;
let currentId: string | null = null;
let lastQuery: (Query & { range: Range }) | null = null;

function getPort(): chrome.runtime.Port {
  if (port) return port;
  port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener(onServerMessage);
  // SW 被回收后连接会断，下次用时重连
  port.onDisconnect.addListener(() => {
    port = null;
  });
  return port;
}

function send(msg: ClientMessage) {
  try {
    getPort().postMessage(msg);
  } catch {
    port = null;
    // 扩展刚被 reload 过，重连一次
    try {
      getPort().postMessage(msg);
    } catch {
      status.value = "error";
      failure.value = { code: "unknown", message: "扩展已更新，请刷新页面。" };
    }
  }
}

function onServerMessage(msg: ServerMessage) {
  if (msg.id !== currentId) return; // 丢弃已作废请求的回包

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

/* ---------------- 查询 ---------------- */

function ask(q: Query & { range: Range }) {
  lastQuery = q;
  currentId = crypto.randomUUID();

  word.value = q.word;
  anchor.value = q.range;
  thread.value = [{ question: null, answer: "" }];
  failure.value = null;
  status.value = "loading";
  visible.value = true;

  const { range: _range, ...payload } = q;
  send({ type: "explain", id: currentId, ...payload });
}

/**
 * 追问。把之前来回过的内容原样带上，模型才接得住"它"、"这个"之类的指代。
 * 上文本身排在最前面，仍然走前缀缓存，追问只多付新增的那几句。
 */
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

  const { range: _range, ...payload } = lastQuery;
  send({ type: "followup", id: currentId, question, prior, ...payload });
}

function close() {
  if (currentId) send({ type: "cancel", id: currentId });
  currentId = null;
  visible.value = false;
}

/* ---------------- 事件 ---------------- */

let settings: Settings | null = null;

function applySettings(s: Settings) {
  settings = s;
  placement.value = s.placement;
}

void loadSettings().then(applySettings);
chrome.storage.onChanged.addListener(() => {
  void loadSettings().then(applySettings);
});

let debounce: number | undefined;

function insideUs(e: Event): boolean {
  return e.composedPath().includes(host);
}

document.addEventListener(
  "mouseup",
  (e) => {
    if (insideUs(e)) return;
    if (settings?.trigger === "alt-select" && !e.altKey) return;

    window.clearTimeout(debounce);
    // 拖选过程中会连续触发，等手停稳
    debounce = window.setTimeout(() => {
      const pick = readSelection();
      if (!pick) return;

      const article = getArticle();
      ask({
        word: pick.word,
        sentence: pick.sentence,
        paragraph: pick.paragraph,
        range: pick.range,
        article: article.text,
        title: article.title,
        url: location.href,
      });
    }, 160);
  },
  true,
);

document.addEventListener(
  "mousedown",
  (e) => {
    if (!visible.value || insideUs(e)) return;
    close();
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

/* ---------------- 渲染 ---------------- */

render(
  <Popup
    onClose={close}
    onOpenOptions={() => send({ type: "openOptions" })}
    onRetry={() => lastQuery && ask(lastQuery)}
    onAsk={askFollowup}
  />,
  mountPoint,
);
