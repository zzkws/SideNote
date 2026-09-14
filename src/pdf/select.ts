import { sentenceAt, worthExplaining } from "../content/selection";
import { normalize } from "../content/article";
import type { Doc, ItemSpan } from "./layout";
import { wholeWordBounds, textPointAt, showCompletedSelection } from "../shared/word-selection";

export interface PdfPick {
  word: string;
  sentence: string;
  paragraph: string;
  range: Range;
  selectionStart: number;
  selectionEnd: number;
  pdfPage: number;
  contextEnd?: number;
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
    const mapped = span.offsets?.[Math.max(0, Math.min(within, span.offsets.length - 1))] ?? within;
    return span.start + Math.max(0, Math.min(mapped, span.end - span.start));
  }

  paragraphAt(offset: number): Para | null {
    for (const p of this.paras) if (offset >= p.start && offset <= p.end) return p;
    return null;
  }

  /** 将补齐后的正文边界映射回 PDF 文字层，包含断词、连字的逆向映射。 */
  pointAt(offset: number, edge: "start" | "end") {
    const span = this.doc.spans.find(s => edge === "start"
      ? s.start <= offset && offset < s.end
      : s.start < offset && offset <= s.end);
    if (!span) return null;
    const element = document.querySelector(`.textLayer [data-p="${span.page}"][data-i="${span.index}"]`);
    if (!element) return null;
    const within = offset - span.start;
    let raw = within;
    if (span.offsets) {
      // 起点取不晚于该边界的位置；终点包含展开为多个字符的原始连字。
      raw = edge === "start" ? span.offsets.lastIndexOf(within) : span.offsets.findIndex(n => n >= within);
      if (raw < 0) raw = Math.max(0, span.offsets.findIndex(n => n > within) - 1);
    }
    return textPointAt(element, raw);
  }

  contextEndFor(offset: number, page: number): number | undefined {
    if (offset < this.doc.bodyEnd) return undefined;
    // 图注集中放在正文后。选中图注时，把上下文截在当前页的最后一个文字项，
    // 既保留前面的正文与已读图注，也不把后面章节的图注一并送进模型。
    return Math.max(offset, ...this.doc.spans.filter(s => s.page <= page).map(s => s.end));
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

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const host = el?.closest<HTMLElement>("[data-i]");
  if (!host) return null;

  const before = document.createRange();
  before.selectNodeContents(host);
  before.setEnd(range.startContainer, range.startOffset);
  const offset = index.offsetOf(host, before.toString().length);
  if (offset === null) return null;

  const endNode = range.endContainer;
  const endEl = endNode.nodeType === Node.ELEMENT_NODE ? endNode as Element : endNode.parentElement;
  const endHost = endEl?.closest<HTMLElement>("[data-i]");
  if (!endHost) return null;
  const endRange = document.createRange();
  endRange.selectNodeContents(endHost);
  endRange.setEnd(endNode, range.endOffset);
  const end = index.offsetOf(endHost, endRange.toString().length);
  if (end === null || end <= offset) return null;
  // 从同一份规范正文取选中内容：跨行单词不再使用 DOM 的断行表示。
  const completed = wholeWordBounds(index.doc.text, offset, end);
  const word = index.doc.text.slice(completed.start, completed.end).replace(/\s+/g, " ");
  if (!worthExplaining(word)) return null;

  const para = index.paragraphAt(completed.start);
  if (!para) return null;

  const sentence = sentenceAt(para.text, completed.start - para.start) || para.text;
  const completedRange = range.cloneRange();
  const startPoint = index.pointAt(completed.start, "start");
  const endPoint = index.pointAt(completed.end, "end");
  if (startPoint && endPoint) {
    completedRange.setStart(startPoint.node, startPoint.offset);
    completedRange.setEnd(endPoint.node, endPoint.offset);
    // 不同栏的 DOM 顺序可能与正文顺序不同，此时保留原高亮供定位。
    if (!completedRange.collapsed) showCompletedSelection(sel, completedRange);
  }
  const pdfPage = Number((startPoint?.node.parentElement?.closest<HTMLElement>("[data-p]") ?? host).dataset.p);

  return {
    word,
    sentence: normalize(sentence),
    paragraph: normalize(para.text),
    selectionStart: completed.start,
    selectionEnd: completed.end,
    pdfPage,
    contextEnd: index.contextEndFor(completed.start, pdfPage),
    range: completedRange.collapsed ? range.cloneRange() : completedRange,
  };
}
