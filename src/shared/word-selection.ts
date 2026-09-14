/** 只扩展与选区相交的英文词；保留词内撇号、连字符和型号数字。 */
export function wholeWordBounds(text: string, start: number, end: number) {
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(start, Math.min(end, text.length));
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (start === end || !/[\p{Script=Latin}0-9]/u.test(text.slice(start, end))) return { start, end };

  const words = /[\p{Script=Latin}\p{M}0-9]+(?:['’\-‐‑\u00ad][\p{Script=Latin}\p{M}0-9]+)*/gu;
  for (const match of text.matchAll(words)) {
    const from = match.index!;
    const to = from + match[0].length;
    if (from >= end) break;
    if (from < start && start < to) start = from;
    if (from < end && end < to) end = to;
  }
  return { start, end };
}

export interface TextPoint { node: Text; offset: number }

/** textContent 偏移 → DOM 文本节点；适用于被行内标签拆开的单词和 PDF span。 */
export function textPointAt(root: Node, offset: number): TextPoint | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (offset <= node.length) return { node, offset: Math.max(0, offset) };
    offset -= node.length;
    last = node;
  }
  return last ? { node: last, offset: last.length } : null;
}

/** 更新原生高亮，同时保留反向拖选的方向。 */
export function showCompletedSelection(selection: Selection, range: Range) {
  const backwards = selection.anchorNode === selection.getRangeAt(0).endContainer &&
    selection.anchorOffset === selection.getRangeAt(0).endOffset;
  if (backwards) selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
  else selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
}
