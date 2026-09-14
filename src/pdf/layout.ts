/**
 * 把 PDF 文字层还原成人能读的正文。
 *
 * PDF 里没有"段落"这个概念 —— getTextContent() 给的是一堆按坐标散落的碎片，
 * 一个单词可能被拆成几个 item，一行可能横跨两栏。要让模型拿到干净的上文，
 * 得自己按坐标把行、栏、段重新拼回去。
 */

export interface RawItem {
  str: string;
  /** [a, b, c, d, e, f]，e/f 是左下角坐标 */
  transform: number[];
  width: number;
  height: number;
}

/** 一个 item 在还原后的正文里占据的区间，选中时靠它换算偏移 */
export interface ItemSpan {
  page: number;
  index: number;
  start: number;
  end: number;
  /** 原始 DOM 字符边界到清理后 item 内偏移的映射（含连字和断词）。 */
  offsets?: number[];
}

export interface Doc {
  /** 还原后的完整正文，段落之间空一行 */
  text: string;
  /** 与 text 对齐的 item 索引，用来把 DOM 选区换算成正文偏移 */
  spans: ItemSpan[];
  captions: { page: number; text: string }[];
  bodyEnd: number;
}

interface Frag {
  page: number;
  index: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  offsets: number[];
}

export function cleanFragment(raw: string): { text: string; offsets: number[] } {
  let text = "";
  const offsets = [0];
  for (const ch of raw) {
    const next = /[ﬀ-ﬆ]/.test(ch) ? ch.normalize("NFKC") : ch === "\u00ad" ? "" : /\s/.test(ch) ? " " : ch;
    text += next;
    for (let i = 0; i < ch.length; i++) offsets.push(text.length);
  }
  return { text, offsets };
}

/** 同一行的纵向容差，取字高的比例 */
const LINE_TOL = 0.55;
/** 行距超过这个倍数就认为换段 */
const PARA_GAP = 1.55;
/** 右边界比中位数缩进这么多（按字高算），说明这行是段末 */
const RAGGED = 1.2;
/** 左边界比中位数多缩这么多，说明这行是段首 */
const INDENT = 0.6;



function toFrags(page: number, items: RawItem[]): Frag[] {
  const out: Frag[] = [];
  items.forEach((it, index) => {
    if (!it.str.trim()) return;
    // arXiv 的侧边旋转版本水印，不属于论文正文。
    if (/arXiv:/i.test(it.str) && Math.abs(it.transform[1]) > Math.abs(it.transform[0])) return;
    const cleaned = cleanFragment(it.str);
    const h = Math.abs(it.transform[3]) || it.height || 10;
    out.push({
      page,
      index,
      str: cleaned.text,
      offsets: cleaned.offsets,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      h,
    });
  });
  return out;
}

/**
 * 找栏间空隙：把所有 item 的水平覆盖投影到一维，在页面中部找一条没有文字穿过的带。
 * 找到就是双栏，找不到就是单栏。
 */
function findGutter(frags: Frag[], pageWidth: number): number | null {
  if (frags.length < 24) return null;

  const BINS = 120;
  const hit = new Array<number>(BINS).fill(0);
  for (const f of frags) {
    const from = Math.max(0, Math.floor((f.x / pageWidth) * BINS));
    const to = Math.min(BINS - 1, Math.ceil(((f.x + f.w) / pageWidth) * BINS));
    for (let i = from; i <= to; i++) hit[i]++;
  }

  // 只在页面中段找中缝，两边留白不算
  const lo = Math.floor(BINS * 0.42);
  const hi = Math.ceil(BINS * 0.58);
  const band = hit.slice(lo, hi + 1);

  // 阈值取背景水平的比例，不是固定值。
  // PDF.js 常把整行合成一个 item，中缝处的残余覆盖来自标题、水印这些整页宽的行，
  // 绝对值不小（实测背景 ~40、中缝 ~9），但相对背景是个明显的谷。
  const sorted = [...band].sort((a, b) => a - b);
  const base = sorted[sorted.length >> 1];
  if (base === 0) return null;
  const thresh = Math.max(1, base * 0.45);

  let best = -1;
  let bestRun = 0;
  let run = 0;
  for (let i = lo; i <= hi; i++) {
    if (hit[i] <= thresh) {
      run++;
      if (run > bestRun) {
        bestRun = run;
        best = i - run / 2;
      }
    } else run = 0;
  }
  if (bestRun < BINS * 0.012) return null; // 谷太窄，不是栏间距
  return ((best + 0.5) / BINS) * pageWidth;
}

/**
 * 按阅读顺序把 item 分组：整页宽的（标题、跨栏图注）排在最前，然后左栏、右栏。
 *
 * 必须先分组再聚行 —— 反过来的话，左右栏里 y 相同的两行会被并成一行，
 * 拼出来就是 "1. Introduction ance:" 这种左栏标题接右栏词尾的东西。
 */
function orderGroups(frags: Frag[], pageWidth: number): Frag[][] {
  const gutter = findGutter(frags, pageWidth);
  if (gutter === null) return [frags];

  // 跨栏内容按纵向位置切带；同一行的作者、邮箱、公式碎片一起处理。
  // 不能把所有跨中缝的 item 提到最前，否则会拆散作者行和跨栏图注。
  const anchors = frags.filter(f => f.x < gutter - 2 && f.x + f.w > gutter + 2 && f.str.length > 12);
  const fullLines = toLines(frags.filter(f => anchors.some(a => Math.abs(a.y - f.y) < Math.max(a.h, f.h) * 0.65)));
  const fullSet = new Set(fullLines.flat());
  const groups: Frag[][] = [];
  let remaining = frags.filter(f => !fullSet.has(f));
  const columns = (part: Frag[]) => {
    const left = part.filter(f => f.x + f.w / 2 < gutter);
    const right = part.filter(f => f.x + f.w / 2 >= gutter);
    if (left.length) groups.push(left);
    if (right.length) groups.push(right);
  };
  for (const line of fullLines) {
    const y = line[0].y;
    columns(remaining.filter(f => f.y > y));
    remaining = remaining.filter(f => f.y <= y);
    groups.push(line);
  }
  columns(remaining);
  return groups;
}

/** 同一栏内按 y 聚行 */
function toLines(frags: Frag[]): Frag[][] {
  const sorted = [...frags].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Frag[][] = [];
  for (const f of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - f.y) <= f.h * LINE_TOL) line.push(f);
    else lines.push([f]);
  }
  for (const l of lines) l.sort((a, b) => a.x - b.x);
  return lines;
}

/** 拼一行：item 之间的空隙够宽就补空格 */
function joinLine(line: Frag[]): { text: string; parts: { frag: Frag; at: number }[] } {
  let text = "";
  const parts: { frag: Frag; at: number }[] = [];
  let prev: Frag | null = null;
  for (const f of line) {
    if (prev) {
      const gap = f.x - (prev.x + prev.w);
      const needsSpace = gap > prev.h * 0.18 && !/\s$/.test(text) && !/^\s/.test(f.str);
      if (needsSpace) text += " ";
    }
    parts.push({ frag: f, at: text.length });
    text += f.str;
    prev = f;
  }
  return { text, parts };
}

/** 图注按自身的栏宽和行距成组，避免截断跨栏正文。 */
function splitCaptions(frags: Frag[], width: number) {
  const gutter = findGutter(frags, width);
  const used = new Set<Frag>();
  const captions: Frag[][] = [];
  for (const anchor of frags.filter(f => /^(?:Figure|Fig\.|Table)\s+\d+[.:]/i.test(f.str))) {
    if (used.has(anchor)) continue;
    const row = frags.filter(f => Math.abs(f.y - anchor.y) < anchor.h * 0.55);
    const beforeGutter = Math.max(...row.filter(f => f.x < (gutter ?? width)).map(f => f.x + f.w));
    const afterGutter = Math.min(...row.filter(f => f.x >= (gutter ?? width)).map(f => f.x));
    const full = gutter === null || beforeGutter > gutter + 2 || afterGutter - beforeGutter < anchor.h;
    const left = gutter !== null && anchor.x < gutter;
    const candidates = frags.filter(f => !used.has(f) && f.y <= anchor.y + anchor.h * 0.5 &&
      (full || (left ? f.x + f.w / 2 < gutter! : f.x + f.w / 2 >= gutter!)));
    const caption: Frag[] = [];
    let previousY = anchor.y;
    for (const line of toLines(candidates)) {
      if (previousY - line[0].y > anchor.h * 1.8 || Math.max(...line.map(f => f.h)) > anchor.h * 1.2) break;
      if (caption.length && line.some(f => /^(?:Figure|Fig\.|Table)\s+\d+[.:]/i.test(f.str))) break;
      caption.push(...line);
      previousY = line[0].y;
    }
    if (caption.length) {
      caption.forEach(f => used.add(f));
      captions.push(caption);
    }
  }
  return { body: frags.filter(f => !used.has(f)), captions };
}

export function buildDoc(pages: { width: number; height?: number; items: RawItem[] }[]): Doc {
  const blocks: { text: string; spans: ItemSpan[] }[] = [];
  const captionKeys = new Set<string>();
  let buf = "";
  let bufSpans: ItemSpan[] = [];

  const flush = () => {
    const t = buf.trim();
    if (!t) {
      buf = "";
      bufSpans = [];
      return;
    }
    const lead = buf.length - buf.trimStart().length;
    blocks.push({
      text: t,
      spans: bufSpans.map((sp) => ({ ...sp, start: sp.start - lead, end: sp.end - lead })),
    });
    buf = "";
    bufSpans = [];
  };

  pages.forEach((pg, pi) => {
    const frags = toFrags(pi, pg.items);
    const separated = splitCaptions(frags, pg.width);
    for (const caption of separated.captions) for (const f of caption) captionKeys.add(`${f.page}:${f.index}`);
    for (const column of [...orderGroups(separated.body, pg.width), ...separated.captions]) {
      const isCaption = captionKeys.has(`${column[0].page}:${column[0].index}`);
      const lines = toLines(column)
        .map((l) => ({ l, t: joinLine(l).text.trim() }))
        .filter((x) => x.t && !(pg.height && /^[0-9]{1,5}$/.test(x.t) &&
          (x.l[0].y < pg.height * 0.06 || x.l[0].y > pg.height * 0.96)))
        .map((x) => x.l);
      if (!lines.length) continue;

      // 基准取局部而不是整栏 —— 摘要、图注、正文常常各有各的行宽，
      // 用整栏中位数会让窄块里的每一行都显得"没顶到右边"，于是行行成段。
      const rights = lines.map((l) => l[l.length - 1].x + l[l.length - 1].w);
      const lefts = lines.map((l) => l[0].x);
      const localRight = lines.map((_, i) => Math.max(...rights.slice(Math.max(0, i - 3), i + 4)));
      const localLeft = lines.map((_, i) => Math.min(...lefts.slice(Math.max(0, i - 3), i + 4)));

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const { text, parts } = joinLine(line);
        const prev = i > 0 ? lines[i - 1] : null;

        if (prev && !isCaption && breaksParagraph(prev, line, rights[i - 1], localRight[i], localLeft[i])) {
          flush();
        }

        // 行末连字符：跟下一行接上，不留 "-"
        if (/[-‐]$/.test(buf) && /^[a-z]/.test(text)) {
          buf = buf.slice(0, -1);
          clampSpans(bufSpans, buf.length);
        }
        else if (buf && !/\s$/.test(buf)) buf += " ";

        const base = buf.length;
        for (const p of parts) {
          bufSpans.push({
            page: p.frag.page,
            index: p.frag.index,
            start: base + p.at,
            end: base + p.at + p.frag.str.length,
            offsets: p.frag.offsets,
          });
        }
        buf += text;
      }
      flush();
    }
  });
  flush();

  // 图注是独立的浮动内容。保留全文和索引，集中放到正文后，避免插进跨栏/跨页句子。
  const body: typeof blocks = [];
  const captions: typeof blocks = [];
  for (const block of blocks) {
    if (block.spans.some(s => captionKeys.has(`${s.page}:${s.index}`))) captions.push(block);
    else body.push(block);
  }
  const main = merge(body);
  const bodyEnd = assemble(main).text.length;
  return { ...assemble([...main, ...captions]), bodyEnd,
    captions: captions.map(b => ({ page: b.spans[0].page, text: b.text })) };
}

function clampSpans(spans: ItemSpan[], end: number) {
  for (const sp of spans) {
    if (sp.end > end) {
      sp.end = end;
      sp.offsets = sp.offsets?.map(n => Math.min(n, Math.max(0, end - sp.start)));
    }
  }
}

/**
 * 合并碎块。PDF 的图注、公式、跨栏残留会切出一地短碎片 ——
 * 上文里满屏三五个字的"段落"既费 token 又难读。
 *
 * 两条规则：以小写字母或标点开头的块是上一块的续写（比如 "ex-" 断在栏尾、
 * "tends the MAD dataset" 落到下一块）；连续的短碎片并成一块。
 */
function merge(blocks: { text: string; spans: ItemSpan[] }[]) {
  const SHORT = 46;
  const out: { text: string; spans: ItemSpan[] }[] = [];

  for (const b of blocks) {
    const prev = out[out.length - 1];
    const isTail = /^[a-z,;:)\]]/.test(b.text);
    const bothShort = Boolean(prev) && prev.text.length < SHORT && b.text.length < SHORT &&
      !/[.!?:]$/.test(prev.text) && !/^\d+[.\s]|^(?:Abstract|References|Acknowledgments)$/i.test(b.text);
    const continuation = Boolean(prev) && /[a-z,]$/.test(prev.text) &&
      !/^\d+[.\s]|^(?:Abstract|References|Acknowledgments)$/i.test(b.text) &&
      prev.spans.at(-1)?.page !== b.spans[0]?.page;

    if (prev && (isTail || bothShort || continuation)) {
      // 上一块以连字符收尾说明词被断开了，直接接上不留空格
      const hyphen = isTail && /[-‐]$/.test(prev.text);
      if (hyphen) {
        prev.text = prev.text.slice(0, -1);
        clampSpans(prev.spans, prev.text.length);
      }
      const glue = hyphen ? "" : " ";
      const base = prev.text.length + glue.length;
      prev.text += glue + b.text;
      for (const sp of b.spans) {
        prev.spans.push({ ...sp, start: base + sp.start, end: base + sp.end });
      }
    } else {
      out.push({ text: b.text, spans: [...b.spans] });
    }
  }
  return out;
}

/** 拼成最终正文，并把每个 item 的区间换算成全文偏移 */
function assemble(blocks: { text: string; spans: ItemSpan[] }[]): Omit<Doc, "captions" | "bodyEnd"> {
  const spans: ItemSpan[] = [];
  let cursor = 0;
  for (const b of blocks) {
    for (const sp of b.spans) {
      spans.push({ ...sp, start: cursor + sp.start, end: cursor + sp.end });
    }
    cursor += b.text.length + 2; // 段落之间空一行
  }
  return { text: blocks.map((b) => b.text).join("\n\n"), spans };
}


/**
 * 判断 cur 是不是新一段的开头。
 * 主信号是右边界 —— 两端对齐的正文，除段末外每行都顶到同一条右线。
 */
function breaksParagraph(
  prev: Frag[],
  cur: Frag[],
  prevRight: number,
  localRight: number,
  localLeft: number,
): boolean {
  const h = cur[0].h;
  if (prev[0].y - cur[0].y > h * PARA_GAP) return true; // 行距突然变大
  if (prevRight < localRight - h * RAGGED) return true; // 上一行没顶到右线 = 段末
  if (cur[0].x - localLeft > h * INDENT) return true; // 首行缩进
  if (Math.abs(cur[0].h - prev[0].h) > Math.max(cur[0].h, prev[0].h) * 0.2) return true; // 字号变了
  return false;
}
