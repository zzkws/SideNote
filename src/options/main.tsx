import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { loadSettings, saveSettings } from "../shared/settings";
import { DEFAULT_SETTINGS, type ModelId, type Settings } from "../shared/types";
import "./options.css";

function Options() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void loadSettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
  }, []);

  const patch = (p: Partial<Settings>) => {
    setS((prev) => ({ ...prev, ...p }));
    setMsg(null);
  };

  async function save() {
    await saveSettings(s);
    setMsg({ ok: true, text: "已保存" });
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch(`${s.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: s.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      if (res.ok) setMsg({ ok: true, text: `连接正常 · ${s.model}` });
      else if (res.status === 401) setMsg({ ok: false, text: "API Key 无效" });
      else if (res.status === 402) setMsg({ ok: false, text: "账户余额不足" });
      else setMsg({ ok: false, text: `失败：HTTP ${res.status}` });
    } catch {
      setMsg({ ok: false, text: "连不上，检查网络或代理" });
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return null;

  return (
    <div class="wrap">
      <h1>划词旁注 · SideNote</h1>
      <p class="sub">划中一个英文词，给出它在这句话里的意思、英文释意，和它背后的来历。</p>

      <div class="field">
        <label for="key">DeepSeek API Key</label>
        <input
          id="key"
          type="password"
          placeholder="sk-..."
          value={s.apiKey}
          onInput={(e) => patch({ apiKey: (e.target as HTMLInputElement).value })}
        />
        <div class="hint">
          在 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
            platform.deepseek.com
          </a> 创建。仅保存在本机 chrome.storage.local，不会上传到任何第三方。
        </div>
      </div>

      <div class="field">
        <label for="model">模型</label>
        <select
          id="model"
          value={s.model}
          onChange={(e) => patch({ model: (e.target as HTMLSelectElement).value as ModelId })}
        >
          <option value="deepseek-v4-flash">deepseek-v4-flash（推荐 · 响应快）</option>
          <option value="deepseek-v4-pro">deepseek-v4-pro（更强，但更慢更贵）</option>
        </select>
        <div class="hint">查词讲究即时反馈，日常用 flash。旧的 deepseek-chat 现在就是它的别名。</div>
      </div>

      <div class="field">
        <label for="trigger">触发方式</label>
        <select
          id="trigger"
          value={s.trigger}
          onChange={(e) =>
            patch({ trigger: (e.target as HTMLSelectElement).value as Settings["trigger"] })
          }
        >
          <option value="select">选中即弹出</option>
          <option value="alt-select">按住 Alt 选中才弹出</option>
        </select>
      </div>

      <div class="field">
        <label for="think">深度思考</label>
        <select
          id="think"
          value={s.deepThinking ? "on" : "off"}
          onChange={(e) => patch({ deepThinking: (e.target as HTMLSelectElement).value === "on" })}
        >
          <option value="off">关闭（推荐 · 快 5-10 秒）</option>
          <option value="on">开启（难词可能更准，但要多等）</option>
        </select>
        <div class="hint">v4 系列默认会先思考一轮。思考内容不会显示，只会让你多等，所以默认关掉。</div>
      </div>

      <div class="field">
        <label for="base">API 地址</label>
        <input
          id="base"
          type="text"
          value={s.baseUrl}
          onInput={(e) => patch({ baseUrl: (e.target as HTMLInputElement).value })}
        />
        <div class="hint">默认 https://api.deepseek.com。改动后需同步修改 manifest 的 host_permissions。</div>
      </div>

      <div class="field">
        <label for="placement">浮层位置</label>
        <select
          id="placement"
          value={s.placement}
          onChange={(e) =>
            patch({ placement: (e.target as HTMLSelectElement).value as Settings["placement"] })
          }
        >
          <option value="follow">贴着选中的词（推荐）</option>
          <option value="right">固定在视口右侧</option>
        </select>
        <div class="hint">
          贴着选中的词：从词的右侧展开，正文首行与选中的字上缘齐平；右侧放不下会先压窄，再整体往左挤。
        </div>
      </div>

      <div class="field">
        <label for="debug">调试：打印上下文</label>
        <select
          id="debug"
          value={s.debug ? "on" : "off"}
          onChange={(e) => patch({ debug: (e.target as HTMLSelectElement).value === "on" })}
        >
          <option value="off">关闭</option>
          <option value="on">开启</option>
        </select>
        <div class="hint">
          开启后每次查词，会把真实发出的四条消息完整打进 service worker 控制台。
          在 chrome://extensions 找到本扩展，点「Service Worker」即可查看。
        </div>
      </div>

      <div class="field">
        <label>PDF 阅读器</label>
        <button
          type="button"
          onClick={() => window.open(chrome.runtime.getURL("src/pdf/index.html"), "_blank")}
        >
          打开 PDF 阅读器
        </button>
        <div class="hint">
          Chrome 自带的 PDF 查看器拿不到选区（内部不是网页），所以另开一个页面。
          把 PDF 拖进去，渲染完就能像在网页上一样划词。
        </div>
      </div>

      <div class="actions">
        <button class="primary" type="button" onClick={() => void save()}>
          保存
        </button>
        <button type="button" onClick={() => void test()} disabled={testing || !s.apiKey.trim()}>
          {testing ? "测试中…" : "测试连接"}
        </button>
        {msg && <span class={`status ${msg.ok ? "ok" : "err"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

const root = document.getElementById("app");
if (root) render(<Options />, root);
