<div align="center">

<img src="public/icons/icon128.png" width="88" alt="SideNote">

# 划词旁注 · SideNote

**读英文文章时划中一个词，右边就给出它在这句话里的意思。**

像一个什么领域都懂的英文家教坐在旁边——你指着一个词，
他告诉你这里它是什么意思、为什么这么用、这个说法是从哪来的。

Chrome 扩展 · 用你自己的 DeepSeek API Key · 数据不经过任何第三方

[快速开始](#快速开始) · [它解决什么](#它解决什么) · [看看效果](#看看效果) · [English](#english)

</div>

---

## 它解决什么

读英文论文的时候，卡住你的往往只是一个词。

你可以停下来去查——切到词典，或者把这一段贴给 ChatGPT 问一句。查完再切回来，刚才读到哪、上一句在讲什么，得重新找回来。一篇论文卡十几次，读完已经挺累了。这些零散的、每次都不算大的中断，加起来就是理解这篇文章的障碍。

SideNote 想做的事很简单：**让这个动作短到不构成打断**。划中那个词，答案出现在正文右边，视线不用离开文章。

而且它读得到你正在看的这段上下文，所以给的不是通用释义，是**这个词在这一句里的意思**。

### 三种卡壳

| 你的处境 | 例子 |
|---|---|
| 这个词没见过，读到就断了 | `inklings` |
| 每个字母都认识，但不知道在这一行里指什么 | `indexer`、`GRPO` |
| 意思是知道的，可就是记不牢，查过好几次还是眼生 | `residual`、`frontier` |

第三种最值得说一句。记不牢往往不是不够用功，而是手上只有一个对应词，缺了它的来历。知道 `residual` 来自拉丁语"留下、剩余"、知道统计里残差指观测值与拟合值的差，这个词才在脑子里有了位置，下次见到就不用重查。

所以每次划词，它固定回答三件事：

```
1. 它在这句话里是什么意思    ← 结合上下文，不是泛泛的释义
2. 英文释意                  ← 只写此处这一个义项
3. 文化拆解                  ← 词源、典故，或这个圈子当初为什么造它
```

不论你读的是 AI 论文、法律文书还是医学综述，它都在同一个位置给你这三样。

---

## 看看效果

下面几张都截自 [DeepSeek-V4 技术报告](https://arxiv.org/html/2606.19348v1)。

**论文自造的词，查不到的那种。** `Hyper-Connections` 是这篇论文提出的新结构。它先说清这是残差连接的什么升级，再拆开 "Hyper-" 这个前缀在数学里表示"更高维"的由来。

![Hyper-Connections](docs/screenshots/hyper-connections.png)

**你知道它叫什么，但不知道为什么叫这个。** `residual` 就是"残差"——可为什么是"残"？拉丁语 *residere* 是"留下、剩余"，统计里残差指观测值与拟合值之差，深度学习沿用了这个意象。

![residual](docs/screenshots/residual.png)

**认得，但说不出它比近义词多了什么味道。** `dramatic leap` 里的 leap 与 climb 相对——"爬坡是慢慢挪，跳跃是一步到位"，作者选它是想强调这不是渐进式改良。

![dramatic leap](docs/screenshots/dramatic-leap.png)

**缩写和行话。** `FLOPs` 在这一句里具体指什么，以及这个说法是 1950 年代超算性能评测留下来的。

![FLOPs](docs/screenshots/flops.png)

**读到一半冒出来的算法名。** `GRPO` 是什么、为什么 DeepSeek 要在 PPO 之外另造一个——这类问题不打断阅读就能解决。

![GRPO](docs/screenshots/grpo.png)

---

## 快速开始

### 1. 拿到扩展

**方式 A：下载现成的**（推荐，不需要装任何开发工具）

到 [Releases](../../releases) 下载最新的 `sidenote.zip`，解压到一个不会误删的目录。

**方式 B：从源码构建**

```bash
git clone https://github.com/zzkws/SideNote.git
cd sidenote
npm install
npm run build
```

产物在 `dist/`。Windows PowerShell 5.1 不支持 `&&`，命令要分行写。

### 2. 装进 Chrome

1. 地址栏打开 `chrome://extensions`
2. 右上角打开**开发者模式**
3. 点**加载已解压的扩展程序**
4. 选中上一步的目录（`dist/` 或解压出来的文件夹）

### 3. 填 API Key

安装后会自动打开设置页。到 [platform.deepseek.com](https://platform.deepseek.com/api_keys) 创建一个 Key 粘贴进去，点**测试连接**确认通了，再点**保存**。

Key 只存在你本机的 `chrome.storage.local`，不上传到任何地方。

### 4. 用

打开任意英文文章，**鼠标左键划选一个词或短语，松手**。就这样。

| 操作 | 效果 |
|---|---|
| 划选英文词 / 短语 | 弹出解释 |
| `Esc` / 点浮层外 / 点右上角 | 关闭 |
| 划选新词 | 自动取消上一个请求 |
| 在底部输入框提问 + 回车 | 追问，答案接在同一张卡片里 |
| 页面滚动 | 浮层跟着走 |

**看完还想问，就在下面接着问。** 浮层底部有个输入框，回车发出，答案接在同一张卡片里，不用另开窗口。

追问会带上之前来回过的内容，所以「它和普通蒸馏差在哪」这种指代它接得住。而且上文排在最前面不变，仍然走前缀缓存 —— 实测追问那次 prompt 1320 token，命中 1280（97%），只付新问的那几句。

**公式和数学记号也能选。** arXiv 这类站点把公式渲染成 MathML，选中拿到的是 Unicode 数学字母（𝑋 𝑛 ∑ ℝ），跟普通的 `X n` 是完全不同的码位。它们同样会弹出解释 —— 这个式子在算什么、记号怎么念、这套写法是谁定下来的。

比如选中 `D_KL(p_student || p_teacher)`，它会告诉你 KL 散度是 Kullback 和 Leibler 在 1951 年提出的，以及竖线左边是真实分布、右边是近似分布，所以这里叫「反向 KL」。

**不触发的只有三种**：纯空白、纯标点、明显误选整段（超过 200 字符或 16 个英文词）。单个字母、缩写、希腊字母、百分比都会触发 —— 读论文时它们恰恰最需要解释。

---

## 花多少钱

输入大约 800 ～ 4,000 token，输出 100 ～ 250 token。按 DeepSeek 现价，读完一篇长论文查几十个词，成本在几分钱量级。

关键在缓存。**你是从上往下读的，所以每次查词的上文，一定以上一次的上文为前缀** —— DeepSeek 的缓存按 token 前缀匹配，这个形状天然吃满。每次真正付全价的，只有你这段新读到的正文。

实测在 DeepSeek-V4 技术报告上连查三个词：

| 查的词 | 位置 | prompt | 缓存命中 |
|---|---|---|---|
| `impediment` | 第 9,287 字符 | 3,640 | 3,584（98%） |
| `frontier` | 第 10,063 字符 | 3,771 | 3,712（98%） |
| `Muon` | 第 1,414 字符（往回翻） | 1,511 | 1,408（93%） |

往回翻着查也命中——更短的前缀仍然是已缓存内容的前缀。

注意缓存写入有几秒延迟，背靠背连打两次第二次仍会 miss，正常阅读节奏下不受影响。

---

## 设置项

| 设置 | 说明 |
|---|---|
| **API Key** | 你自己的 DeepSeek Key |
| **模型** | 默认 `deepseek-v4-flash`（快）；也可选 `deepseek-v4-pro` |
| **触发方式** | 选中即弹出 / 按住 `Alt` 选中才弹出 |
| **深度思考** | 默认关。开了慢一倍，查词场景不划算 |
| **浮层位置** | 贴着选中的词 / 固定在视口右侧 |
| **调试：打印上下文** | 开了会把每次真实发出的两条消息打进 service worker 控制台 |

---

## 它是怎么工作的

```
content script（页面内，隔离环境）
  ├─ article.ts    Readability 抽正文，按 URL 缓存
  ├─ selection.ts  选区 → 词 / 句 / 段（Intl.Segmenter + 缩写合并）
  └─ index.tsx     Shadow DOM 挂载 Preact 浮层
        │
        │  chrome.runtime.connect — 长连接，支持流式
        ▼
service worker（后台）
  ├─ prompt.ts     组装两条消息 + 取上文
  └─ deepseek.ts   SSE 流式客户端
        │
        ▼  https://api.deepseek.com/chat/completions
```

几个不那么显然的设计：

**API 调用必须在 service worker 里。** content script 受宿主页面 CSP 约束，GitHub、Notion、多数新闻站会直接 block 掉 fetch。而且 API Key 不该出现在页面上下文里。

**上文全给，下文给 1000 字符。** 你读到哪，模型就看到哪 —— 一个词的定义常常出现在文章更靠前的地方，只给附近几百字会够不着。下文的切口往外扩到段落或句子边界，不从半句话中断。

**上文排在选中词之前。** 缓存按 token 前缀匹配，这个顺序是死的；反过来每次都是全量 miss。

**超长文才降级。** 正文超过 16 万字符时退回「开头 + 选中处附近一段」，截断点量化到 8k 边界，让相邻的词共用同一份前缀，不至于查一个词就全量 miss 一次。

**浮层位置在开窗时一次算定。** 流式输出时卡片不再重新定位——否则文字每流进来一块就往上顶一下，一顿一顿的。

**数学公式走 KaTeX 的 MathML 输出**，Chrome 原生渲染，不必打包字体，而且只在正文真出现公式时才按需加载。

---

## 调教输出风格

风格全在 [`src/background/prompt.ts`](src/background/prompt.ts) 的 `SYSTEM` 常量里，改完 `npm run build` 重新加载即可。

[`docs/gold-examples.md`](docs/gold-examples.md) 收了 10 条金标样例，取自 DeepSeek-V4 技术报告，按"来历是哪一种"分成词源 / 生活典故 / 圈内惯例三组。其中 3 条作为 few-shot 写进了 prompt，一组一条。想换风格，照着这个文件改。

---

## 已知边界

- iframe 里的文字不支持（`all_frames: false`）
- Readability 在 Twitter、Reddit 这类非文章页抽不出正文，会自动兜底到 `document.body.innerText`
- **API Key 打包在扩展内，仅适合自用。** 若要上架商店必须换成后端代理——只需改 `src/background/deepseek.ts` 一个文件

---

## 开发

```bash
npm run dev      # Vite + CRXJS，content script 支持热更新
npm run build    # 类型检查 + 构建到 dist/
npm run zip      # 构建并打包成 sidenote.zip
npm run icons    # 重新生成图标
```

改了 `manifest.config.ts` 需要在 `chrome://extensions` 手动刷新一次。

技术栈：Manifest V3 · Vite + CRXJS · TypeScript · Preact · Shadow DOM · Readability · KaTeX

---

## License

MIT

---

<a name="english"></a>

# English

**划词旁注 · SideNote** — a Chrome extension for Chinese speakers reading English text. Select a word and a sidenote appears beside the paragraph: what it means *in that sentence*, an English gloss of that sense, and where the word comes from. Explanations are in Chinese.

## Why

When you are reading a paper, what stops you is often a single word. You can pause and go look it up — switch to a dictionary, or paste the paragraph into ChatGPT. Then you come back and have to find your place again. Do that fifteen times in one paper and the reading itself becomes work.

SideNote tries to make that step short enough that it is not an interruption. Select the word; the answer appears next to the text; your eyes stay on the page. And because it can see the surrounding context, what you get is the meaning of that word *here*, not a general definition.

It always answers the same three things — meaning in this sentence, an English gloss of this sense, and the word's origin — whether you are reading an AI paper, a legal document, or a medical review.

## Quick start

1. Download `sidenote.zip` from [Releases](../../releases) and unzip — or build from source with `npm install` then `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select the folder
3. The options page opens automatically. Paste your own [DeepSeek API key](https://platform.deepseek.com/api_keys), click 测试连接 to verify, then 保存
4. Select any English word on any page

Your key is stored in `chrome.storage.local` on your machine only. Nothing passes through a third-party server.

## Notes

- Everything above your selection is sent, plus 1,000 characters after it. Since you read top-down, each lookup's context is a prefix of the next one, so DeepSeek's prefix cache hits ~98% after the first request
- Prompt and output style live in [`src/background/prompt.ts`](src/background/prompt.ts); ten reference examples are in [`docs/gold-examples.md`](docs/gold-examples.md)
- The API key is bundled client-side, which is fine for personal use. Publishing to the Chrome Web Store would require a backend proxy — one file, `src/background/deepseek.ts`

MIT License.
