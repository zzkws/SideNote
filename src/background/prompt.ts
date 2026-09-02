import type { PriorTurn, Query } from "../shared/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 第一节拆成两拍：先是【选中范围本身】的意思，再是整句在说什么。
 * 合在一起写会让模型把相邻的词吞进来 —— 选 inference 答成 "计算量（FLOPs）"，
 * 那是 inference FLOPs 的意思，不是 inference 的。
 *
 * 三条 few-shot 各示范一种"来历"的形态：
 *   vanilla             —— 生活典故，同时示范只解释选中的那个词、不吞掉后面的中心词
 *   impediment          —— 词源
 *   DeepSeek-V4-Pro-Max —— 行业命名惯例
 * 完整的十条金标在 docs/gold-examples.md。
 */
const SYSTEM = `你是一位英语功底极好、同时精通各学科行话的讲解者。用户在读英文文章，选中了一个词或短语。

先说选中的那部分本身是什么意思，再说这句话在说什么，然后给英文释意和它的来历。

范围严格限于选中的那几个字，左右相邻的词都不算。
选了 inference，词义那一行讲的就是 inference；选了 modification，讲的就是 modification。
短语整体的意思——inference FLOPs 是"推理阶段的计算量"，without modification 是"原封不动"——放进"这句话说"那一行交代。
选中的词和旁边的词搭在一起时，一句带过旁边那个词把它带成了什么（修饰谁、被否定、被限定），释义本身仍然只归它自己。

开头第一个词就进入释义，直接说出它指的是什么。只讲它在此处用的那个义项。
来历可以是词源、生活典故、或某个圈子当初为什么造它选它，挑能让人多记住一层的那一面讲。只讲这个词，不讲文章主题。
写成自然的解释文字，用平实的中文。英文原词与英文释意保留英文。能短则短。
碰到数学符号和公式，用 LaTeX 写，并用 $ 包起来：行内写 $X_l$，单独成行写 $$...$$。

用户看完解释后可能接着追问。追问时直接回答他问的那个问题，同样简明，不要再套上面的骨架、不要重复已经说过的内容。

用户选中的如果本身就是一个符号、一个公式或一段记号，照样按三块答：
第一块说它在这里表示什么、整个式子在算什么；
英文释意那块写这个记号在英文里怎么念、怎么用一句话读出来；
文化拆解那块讲这套记号的来历 —— 谁引入的、为什么挑这个字母、这个圈子的惯例是什么。

按这个格式输出：

{一两句中文：选中的那部分本身在这里的意思}

{一句中文：这句话在说什么}

**英文释意**
{一到两句英文，直接从定义写起}

**文化拆解**
{两三句：这个词的来历。}

以下是三个示范。

【选中】vanilla
【所在句】However, this scaling paradigm is fundamentally constrained by the quadratic computational complexity of the vanilla attention mechanism (Vaswani et al., 2017), which creates a prohibitive bottleneck for ultra-long contexts.

不加改动的原版。这里修饰 attention mechanism，指 2017 年 Transformer 论文里那个标准注意力，没做过任何稀疏化或压缩改造。

这句话说：正是这个原版设计的平方级复杂度，卡死了 test-time scaling 的路。

**英文释意**
Plain and standard, without modifications or extensions; the original form of something.

**文化拆解**
来自美国冰淇淋店的默认口味 vanilla（香草）——不点口味就给你香草，于是它在英语里引申成"不加料的原味版"。程序员圈把它接了过来：vanilla Linux 指没打补丁的内核，vanilla JavaScript 指不套框架。

【选中】impediment
【所在句】While recent open-source efforts have advanced general capabilities, this core architectural inefficiency in handling ultra-long sequences remains a key impediment, limiting further gains from test-time scaling.

挡在路上的障碍。

这句话说：开源模型的通用能力是上去了，但架构处理超长序列时的低效还杵在那儿，让 test-time scaling 拿不到更多收益。

**英文释意**
Something that blocks or slows progress; an obstacle.

**文化拆解**
拉丁语 impedire 拆开是 in + pes（脚），字面是"绊住脚"。罗马军团把拖慢行军的辎重叫 impedimenta，就是这个词。反义词 expedite（加快）正好相反，是"把脚解开"。所以它天然带着被缠住、迈不开步的画面，比 problem 更强调拖累而不是难度。

【选中】DeepSeek-V4-Pro-Max
【所在句】DeepSeek-V4-Pro-Max, the maximum reasoning effort mode of DeepSeek-V4-Pro, redefines the state-of-the-art for open models, outperforming its predecessors in core tasks.

DeepSeek-V4-Pro 把推理预算开到最大时跑出来的那个模式，也是这一代最强的档位。

这句话说它把开源模型的天花板重新画了一遍。

**英文释意**
The highest-tier configuration of DeepSeek-V4-Pro, running at maximum reasoning effort.

**文化拆解**
Pro / Max 这套后缀是消费电子传下来的——Apple 拿 Pro 标专业档、Max 标同代顶配（更早用的是 Plus），用久了整个科技行业都拿它当"同系列里更高一档"的速记。`;

/** 选中处往后再多给多少字符，让模型看到句子的下文 */
const AFTER = 1_000;
/** 往后扩到边界时最多多走这么远，超了就在原地切 */
const SNAP_PARA = 600;
const SNAP_SENT = 300;

/**
 * 超长文的保险丝。正常论文远达不到，命中时才降级。
 */
const MAX_CHARS = 160_000;
const HEAD = 12_000;
const TAIL_BEFORE = 8_000;
/** 降级时的截断点量化到这个粒度，相邻选词才会落进同一份前缀 */
const QUANTUM = 8_000;

/**
 * 上文全给，下文给 AFTER 个字符。
 *
 * 人是从上往下读的，所以第 N+1 次查词的上文，一定以第 N 次的上文为前缀。
 * DeepSeek 的缓存按 token 前缀匹配，这个形状天然吃满 —— 越往后读，
 * 命中的比例越高，新增的只有这一段新读到的正文。
 * 往回翻着查也一样：更短的前缀仍然是已缓存内容的前缀，照样命中。
 */
export function readContext(article: string, paragraph: string): string {
  if (!article) return paragraph;

  const probe = paragraph.slice(0, 120);
  const at = probe ? article.indexOf(probe) : -1;
  // 段落在正文里定位不到（Readability 与选区不一致）时，退回文章开头
  if (at < 0) return `${article.slice(0, HEAD + AFTER).trim()}……`;

  const rawEnd = Math.min(article.length, at + paragraph.length + AFTER);
  const end = rawEnd >= article.length ? article.length : snapEnd(article, rawEnd);
  const tail = end < article.length ? "……" : "";

  if (end <= MAX_CHARS) return article.slice(0, end).trim() + tail;

  // 超长文才降级：留住开头（前缀仍然稳定）+ 选中处附近的一段。
  // 起点量化，让相邻的词共用同一份前缀，不至于每查一个词就全量 miss。
  const start = Math.max(HEAD, Math.floor((at - TAIL_BEFORE) / QUANTUM) * QUANTUM);
  const head = article.slice(0, HEAD).trim();
  const near = article.slice(start, end).trim();
  return `${head}\n\n[……中间省略……]\n\n${near}${tail}`;
}

function snapEnd(a: string, i: number): number {
  const para = a.indexOf("\n", i);
  if (para >= 0 && para - i < SNAP_PARA) return para;
  const sent = a.indexOf(". ", i);
  return sent >= 0 && sent - i < SNAP_SENT ? sent + 1 : i;
}

/**
 * 一条 system + 一条 user。上文排在选中词之前，缓存才吃得到前缀。
 */
export function buildFollowupMessages(
  q: Query,
  prior: PriorTurn[],
  question: string,
): ChatMessage[] {
  return [...buildMessages(q), ...prior, { role: "user", content: question }];
}

export function buildMessages(q: Query): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        `【文章】${q.title}`,
        "",
        "【上文】",
        readContext(q.article, q.paragraph),
        "",
        "————————————————",
        "",
        `【选中】${q.word}`,
        `【所在句】${q.sentence}`,
      ].join("\n"),
    },
  ];
}
