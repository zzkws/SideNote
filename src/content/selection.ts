import { normalize } from "./article";

export interface Pick {
  word: string;
  sentence: string;
  paragraph: string;
  /** 保留 Range 而非快照 rect：浮层要能跟随页面滚动 */
  range: Range;
}

const PREFERRED_BLOCKS = "p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6,math,mrow";

/**
 * 值得解释的字符。除了拉丁字母和数字，还必须认这些，否则公式一概不触发：
 *   U+0370–03FF  希腊字母        α β σ Δ Σ
 *   U+2070–209F  上标下标        ⁿ ₁ ₂
 *   U+2100–214F  类字母符号      ℝ ℕ ℓ ℮
 *   U+2190–23FF  箭头 + 数学算子  → ∀ ∈ ∑ ∫ ≤ ≠ √ ∞
 *   U+2A00–2AFF  补充算子        ⨁ ⨂
 *   U+1D400–1D7FF 数学字母数字   𝑋 𝑛 𝒩 𝔽  ← MathML 渲染的公式落在这里
 * 另加 ± × ÷ ° µ 这几个散落在 Latin-1 里的常用符号。
 */
const MEANINGFUL =
  /[A-Za-z0-9±µ°×÷Ͱ-Ͽ⁰-₟℀-⅏←-⏿⨀-⫿\u{1D400}-\u{1D7FF}]/u;

/** 纯中文（含中文标点）多半是误选，不触发 */
const CJK_ONLY = /^[\s　-〿一-鿿＀-￯]+$/u;

/** 看着像散文（有空格、且主要是拉丁字母），才套词数上限 */
const PROSE = /^[\sA-Za-z0-9'’\-–—,.;:()"“”]+$/;

/**
 * 选中的内容值不值得解释。
 * 门槛只拦三样：空白、纯标点、以及明显是误选整段的长文本。
 * 公式、符号、缩写、单个字母一律放行 —— 读论文时它们恰恰是最需要解释的。
 */
export function worthExplaining(word: string): boolean {
  if (!word) return false;
  if (CJK_ONLY.test(word)) return false;
  if (!MEANINGFUL.test(word)) return false;
  // 放到两句话的量：英文一句约 25 词 / 150 字符，两句留足余量。
  // 再往上就是整段了，那多半是误选。
  if (word.length > 400) return false;
  // 公式没有空格，词数上限会误伤，所以只对散文生效
  if (PROSE.test(word) && word.split(" ").length > 60) return false;
  return true;
}

export function readSelection(): Pick | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const word = sel.toString().trim().replace(/\s+/g, " ");
  if (!worthExplaining(word)) return null;

  const range = sel.getRangeAt(0);
  const block = nearestBlock(range.startContainer);
  const rawParagraph = block?.textContent ?? word;

  const sentence = sentenceAt(rawParagraph, offsetInBlock(range, block)) || rawParagraph;

  return {
    word,
    sentence: normalize(sentence),
    paragraph: normalize(rawParagraph).slice(0, 2000),
    range: range.cloneRange(),
  };
}

/** 选区起点在 block 的 textContent 中的字符偏移 */
function offsetInBlock(range: Range, block: HTMLElement | null): number {
  if (!block) return 0;
  try {
    const pre = range.cloneRange();
    pre.selectNodeContents(block);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  } catch {
    return 0;
  }
}

/**
 * 找"选中处所在的段落"。不能直接 closest('div') —— 可能命中整个页面容器。
 * 先找语义块级元素，不行再往上走到文本量合适的祖先。
 *
 * 选中公式时最近的块级元素往往是 <math>，那里面只有公式没有上下文，
 * 所以文本太少就继续往上找，直到拿到一段真正的正文。
 */
function nearestBlock(node: Node): HTMLElement | null {
  const start =
    node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (!start) return null;

  const preferred = start.closest<HTMLElement>(PREFERRED_BLOCKS);
  if (preferred && (preferred.textContent?.length ?? 0) > 60) return preferred;

  let el: HTMLElement | null = preferred ?? start;
  while (el) {
    const len = el.textContent?.length ?? 0;
    if (len >= 60 && len <= 4000) return el;
    if (len > 4000) break;
    el = el.parentElement;
  }
  return preferred ?? start;
}

/**
 * 切句。Intl.Segmenter 用的是 ICU 规则，默认不启用缩写抑制表 ——
 * "e.g. Dr. Hinton" 会被切成三段。所以要再合并一次：
 * 上一段以缩写结尾、或短得不像一个句子时，并入下一段。
 */
const ABBREV_END =
  /(?:\b(?:[A-Za-z]\.){1,3}|\b(?:mr|mrs|ms|dr|prof|sr|jr|st|fig|eq|no|vs|etc|al|inc|ltd|co|cf|approx|ch|pp|vol|ref|dept|univ|est)\.)\s*$/i;

interface Sentence {
  index: number;
  text: string;
}

function segment(text: string): Sentence[] {
  const raw: Sentence[] = [];

  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    try {
      for (const s of new Segmenter("en", { granularity: "sentence" }).segment(text)) {
        raw.push({ index: s.index, text: s.segment });
      }
    } catch {
      // 落到下面的正则兜底
    }
  }

  if (raw.length === 0) {
    const re = /[^.!?]*[.!?]+\s*|[^.!?]+$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!m[0]) break;
      raw.push({ index: m.index, text: m[0] });
    }
  }

  const merged: Sentence[] = [];
  for (const s of raw) {
    const prev = merged[merged.length - 1];
    if (prev && (ABBREV_END.test(prev.text) || prev.text.trim().length < 20)) {
      prev.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

export function sentenceAt(text: string, offset: number): string {
  const sentences = segment(text);
  for (const s of sentences) {
    if (offset >= s.index && offset < s.index + s.text.length) return s.text;
  }
  return sentences.at(-1)?.text ?? text;
}
