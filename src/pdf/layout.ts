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
}

export interface Doc {
  /** 还原后的完整正文，段落之间空一行 */
  text: string;
  /** 与 text 对齐的 item 索引，用来把 DOM 选区换算成正文偏移 */
  spans: ItemSpan[];
}

interface Frag {
  page: number;
  index: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
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
    if (!it.str) return;
    const h = Math.abs(it.transform[3]) || it.height || 10;
    out.push({
      page,
      index,
      str: it.str,
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

  const full: Frag[] = [];
  const left: Frag[] = [];
  const right: Frag[] = [];
  for (const f of frags) {
    if (f.x < gutter && f.x + f.w > gutter) full.push(f);
    else if (f.x + f.w / 2 < gutter) left.push(f);
    else right.push(f);
  }
  return [full, left, right].filter((g) => g.length > 0);
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

export function buildDoc(pages: { width: number; items: RawItem[] }[]): Doc {
  const blocks: { text: string; spans: ItemSpan[] }[] = [];
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
    for (const column of orderGroups(frags, pg.width)) {
      const lines = toLines(column)
        .map((l) => ({ l, t: joinLine(l).text.trim() }))
        .filter((x) => x.t && !/^[0-9]{1,5}$/.test(x.t)) // 页码之类的孤立数字
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

        if (prev && breaksParagraph(prev, line, rights[i - 1], localRight[i], localLeft[i])) {
          flush();
        }

        // 行末连字符：跟下一行接上，不留 "-"
        if (/[-‐]$/.test(buf) && /^[a-z]/.test(text)) buf = buf.slice(0, -1);
        else if (buf && !/\s$/.test(buf)) buf += " ";

        const base = buf.length;
        for (const p of parts) {
          bufSpans.push({
            page: p.frag.page,
            index: p.frag.index,
            start: base + p.at,
            end: base + p.at + p.frag.str.length,
          });
        }
        buf += text;
      }
      flush();
    }
  });
  flush();

  return assemble(merge(blocks));
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
    const bothShort = Boolean(prev) && prev.text.length < SHORT && b.text.length < SHORT;

    if (prev && (isTail || bothShort)) {
      // 上一块以连字符收尾说明词被断开了，直接接上不留空格
      const hyphen = isTail && /[-‐]$/.test(prev.text);
      if (hyphen) prev.text = prev.text.slice(0, -1);
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
function assemble(blocks: { text: string; spans: ItemSpan[] }[]): Doc {
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

