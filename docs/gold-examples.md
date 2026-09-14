# 早期回答样例（存档）

以下保留早期固定模板设计，已不作为当前回答标准。DeepSeek 伴读现使用自然中文段落，规则见 `src/background/prompt.ts`。

取自 [DeepSeek-V4 技术报告](https://arxiv.org/html/2606.19348v1) 的 Abstract 与 §1 Introduction。
每条按插件真实发出的格式写：`【选中】` + `【所在句】`，然后是理想输出。

输出恒定四块：

```
{选中范围本身的意思}      ← 只归选中的那部分，相邻的词不算
{这句话在说什么}
**英文释意**
**文化拆解**              ← 常驻，没有条件
```

第一块拆成两拍是有原因的：合着写模型会把相邻的词吞进来——选 `inference` 答成"计算量"，
那是 `inference FLOPs` 的意思。选中的词若作修饰语，写清它修饰的是什么，但释义只归它自己。

按「来历是哪一种」分组。三条标 ★ 的已写进 `src/background/prompt.ts` 当 few-shot，
一组挑一条，让模型碰到任何词都有一条可走的路。

---

## 一、来历在词源

拉丁语／希腊语的字面画面还活着，说破了就能记住。

### 1. impediment ★

【所在句】While recent open-source efforts have advanced general capabilities, this core architectural inefficiency in handling ultra-long sequences remains a key impediment, limiting further gains from test-time scaling.

挡在路上的障碍。

这句话说：开源模型的通用能力是上去了，但架构处理超长序列时的低效还杵在那儿，让 test-time scaling 拿不到更多收益。

**英文释意**
Something that blocks or slows progress; an obstacle.

**文化拆解**
拉丁语 impedire 拆开是 in + pes（脚），字面是"绊住脚"。罗马军团把拖慢行军的辎重叫 impedimenta，就是这个词。反义词 expedite（加快）正好相反，是"把脚解开"。所以它天然带着被缠住、迈不开步的画面，比 problem 更强调拖累而不是难度。

### 2. prohibitive

【所在句】However, this scaling paradigm is fundamentally constrained by the quadratic computational complexity of the vanilla attention mechanism, which creates a prohibitive bottleneck for ultra-long contexts and reasoning processes.

代价高到让人做不下去的。这里修饰 bottleneck——不是"有点贵"，是根本负担不起。

这句话说：原版注意力的平方级复杂度，把超长上下文和推理过程卡成了一道过不去的坎。

**英文释意**
So costly or difficult that it prevents something from being done.

**文化拆解**
拉丁语 prohibere = pro（离开）+ habere（持有），字面是"把它拦开、不让你碰"。这个词先在法律里用（prohibitive law 禁止性法条，美国禁酒令时期的 Prohibition 就是它的名词形式），后来才挪到价格和成本上。所以 prohibitive cost 的语气不是"有点贵"，而是"贵到等于在说：不许买"。

### 3. ushering in

【所在句】This breakthrough enables efficient support for a context length of one million tokens, ushering in a new era of million-length contexts for next-generation LLMs.

把某个新阶段引进来、开启。

这句话说：百万 token 上下文的高效支持，直接把下一代 LLM 带进了"百万级上下文"这个新阶段。

**英文释意**
Bringing in or marking the beginning of a new period or development.

**文化拆解**
往上追是拉丁语 ostium（门）→ ostiarius（看门人），经古法语进英语变成 usher，指剧院、教堂、婚礼上领人入座的引座员。动词化后是"把人领进来"，再引申成"把一个新时代领进来"。它自带仪式感，所以只用在庄重场合——论文用它，是在给成果定调：这是分水岭，不是小改进。

### 4. long-horizon

【所在句】Concurrently, the emergence of long-horizon scenarios and tasks — from complex agentic workflows to massive cross-document analysis — has also made efficient support for ultra-long contexts critical for future progress.

跨度很长的。这里修饰 scenarios and tasks，指那种要跨很多步、拖很长时间才能完成的活儿。

这句话说：这类任务的出现，让高效支持超长上下文变成了往后走的关键——例子是复杂的 agent 工作流和跨文档分析。

**英文释意**
Spanning a long sequence of steps or an extended time before the outcome is known.

**文化拆解**
希腊语 horizein 是"划界"，horizon 就是那条把你能看见和看不见分开的线。经济学先拿它算投资期限（investment horizon），强化学习接过来指一个 episode 有多长（finite/infinite horizon）。AI 圈说 long-horizon，讲的是任务链条长到模型必须自己撑住状态，中途没人给反馈。

---

## 二、来历在生活典故

某个具体的生活场景被抽象成了通用说法。

### 5. vanilla ★

【所在句】However, this scaling paradigm is fundamentally constrained by the quadratic computational complexity of the vanilla attention mechanism (Vaswani et al., 2017), which creates a prohibitive bottleneck for ultra-long contexts.

不加改动的原版。这里修饰 attention mechanism，指 2017 年 Transformer 论文里那个标准注意力，没做过任何稀疏化或压缩改造。

这句话说：正是这个原版设计的平方级复杂度，卡死了 test-time scaling 的路。

**英文释意**
Plain and standard, without modifications or extensions; the original form of something.

**文化拆解**
来自美国冰淇淋店的默认口味 vanilla（香草）——不点口味就给你香草，于是它在英语里引申成"不加料的原味版"。程序员圈把它接了过来：vanilla Linux 指没打补丁的内核，vanilla JavaScript 指不套框架。（词本身来自西班牙语 vainilla，意思是"小豆荚"。）

### 6. frontier

【所在句】We believe our capability to efficiently handle ultra-long sequences unlocks the next frontier of test-time scaling, paves the way for deeper research into long-horizon tasks.

尚未开发的下一片疆域。

这句话说：高效处理超长序列的能力，把 test-time scaling 带到了下一块还没被挖掘的地方——之前被算力卡住够不着，现在门打开了。

**英文释意**
The furthest limit of current knowledge or achievement, beyond which lies unexplored territory.

**文化拆解**
在美国语境里 frontier 是"西部边疆"——那条不断向西推进的拓荒线，带着开拓、冒险、无主之地的味道，跟英式英语里单指"国境线"的 frontier 完全不是一个东西。1893 年特纳的 Frontier Thesis 把它写成美国精神的源头，肯尼迪的 New Frontier、《星际迷航》的 "Space: the final frontier" 一路接力，它就成了科技话语的标配。AI 圈的 frontier model 也是这套修辞——说话人在把自己放进拓荒者的位置。

### 7. paves the way

【所在句】We believe our capability to efficiently handle ultra-long sequences unlocks the next frontier of test-time scaling, paves the way for deeper research into long-horizon tasks, and establishes a necessary foundation for exploring future paradigms like online learning.

为后面的事扫清障碍、打好基础。

这句话说：高效处理超长序列这件事本身，让后续研究 long-horizon 任务变得可行了。

**英文释意**
To create the conditions that make something else possible later.

**文化拆解**
pave 来自拉丁语 pavire，本义是"夯实、砸平"——铺路最早指的是把地面砸结实，不是铺石板。所以这个词的重心不在"修好了一条路"，而在"把地基弄平，让后来的人走得稳"。它天生是给别人做的动作，所以论文用它，姿态是"我这一步是给下一阶段开道"，而不是"我完成了什么"。

---

## 三、来历在圈内惯例

这个圈子当初为什么造它、选它。

### 8. DeepSeek-V4-Pro-Max ★

【所在句】DeepSeek-V4-Pro-Max, the maximum reasoning effort mode of DeepSeek-V4-Pro, redefines the state-of-the-art for open models, outperforming its predecessors in core tasks.

DeepSeek-V4-Pro 把推理预算开到最大时跑出来的那个模式，也是这一代最强的档位。

这句话说它把开源模型的天花板重新画了一遍。

**英文释意**
The highest-tier configuration of DeepSeek-V4-Pro, running at maximum reasoning effort.

**文化拆解**
Pro / Max 这套后缀是消费电子传下来的——Apple 拿 Pro 标专业档、Max 标同代顶配（更早用的是 Plus），用久了整个科技行业都拿它当"同系列里更高一档"的速记。AI 模型沿用它，读者不用查文档就知道彼此的层级关系。

### 9. test-time scaling

【所在句】The emergence of reasoning models has established a new paradigm of test-time scaling, driving substantial performance gains for Large Language Models (LLMs).

靠在推理阶段多花算力来换性能，而不是把模型和训练数据堆得更大。

这句话说：推理模型的出现把这条路走通了，成了一种新范式。

**英文释意**
Improving model performance by spending more computation at inference time rather than during training.

**文化拆解**
这是个对照着造出来的词。机器学习里 train time 和 test time 是几十年的老划分，而 scaling 一直说的是训练侧——模型更大、数据更多（Kaplan 的 scaling law、Chinchilla 那一路）。推理模型出来之后，圈子需要一个词指"推理时多想一会儿"，于是把 scaling 挪到了 test time 这一侧。它能被一听就懂，全靠跟旧词组的对仗。

### 10. activated

【所在句】We present a preview version of DeepSeek-V4 series, including two strong Mixture-of-Experts (MoE) language models — DeepSeek-V4-Pro with 1.6T parameters (49B activated) and DeepSeek-V4-Flash with 284B parameters (13B activated) — both supporting a context length of one million tokens.

真正被点起来、参与这一次计算的。这里作后置说明修饰 parameters。

这句话说：DeepSeek-V4-Pro 总共 1.6T 参数，但每处理一个 token 只调用其中 49B，其余的都歇着——这就是它能又大又快的原因。

**英文释意**
The subset of parameters actually used for a given input, as opposed to the total parameter count.

**文化拆解**
activate 本是电路术语，指让某一部分通电开始工作。MoE 架构借了过来：总参数像编制里的全部员工，activated 是这一轮点名上岗的那批。这个区分之所以成了模型发布时必报的一组数字，是因为两个数管的事不一样——激活参数决定推理要花多少钱，总参数决定模型能装下多少东西。
