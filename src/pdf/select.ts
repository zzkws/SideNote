import { sentenceAt, worthExplaining } from "../content/selection";
import { normalize } from "../content/article";
import type { Doc, ItemSpan } from "./layout";

export interface PdfPick {
  word: string;
  sentence: string;
  paragraph: string;
  range: Range;
}

/** 段落在正文里的区间，用来由偏移反查所属段落 */
interface Para {
  start: number;
  end: number;
  text: string;
}

export class DocIndex {
  private byKey = new Map<string, ItemSpan>();
  private paras: Para[] = [];

  constructor(readonly doc: Doc) {
    for (const s of doc.spans) this.byKey.set(`${s.page}:${s.index}`, s);

    let at = 0;
    for (const t of doc.text.split("\n\n")) {
      this.paras.push({ start: at, end: at + t.length, text: t });
      at += t.length + 2;
    }
  }

  /** 文字层的 span 元素 → 它在正文里的起始偏移 */
  offsetOf(el: Element, within: number): number | null {
    const p = (el as HTMLElement).dataset.p;
    const i = (el as HTMLElement).dataset.i;
    if (p === undefined || i === undefined) return null;
    const span = this.byKey.get(`${p}:${i}`);
    if (!span) return null;
    return span.start + Math.min(within, span.end - span.start);
  }

  paragraphAt(offset: number): Para | null {
    for (const p of this.paras) if (offset >= p.start && offset <= p.end) return p;
    return null;
  }
}

/**
 * 读取 PDF 文字层里的选区。
 *
 * 跟网页版的区别在于：不能靠 DOM 结构找"段落"—— PDF 的文字层是一堆按坐标
 * 绝对定位的 span，DOM 上没有段落这回事。所以先把整份文档还原成干净正文，
 * 再把选区换算成正文里的偏移，段落和句子都从那份正文上取。
 */
export function readPdfSelection(index: DocIndex): PdfPick | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const word = sel.toString().trim().replace(/\s+/g, " ");
  if (!worthExplaining(word)) return null;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const host = el?.closest<HTMLElement>("[data-i]");
  if (!host) return null;

  const offset = index.offsetOf(host, range.startOffset);
  if (offset === null) return null;

  const para = index.paragraphAt(offset);
  if (!para) return null;

  const sentence = sentenceAt(para.text, offset - para.start) || para.text;

  return {
    word,
    sentence: normalize(sentence),
    paragraph: normalize(para.text).slice(0, 2000),
    range: range.cloneRange(),
  };
}
