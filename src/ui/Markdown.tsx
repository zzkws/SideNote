import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useState } from "preact/hooks";

marked.setOptions({ gfm: true, breaks: false });

type Katex = typeof import("katex").default;

/**
 * KaTeX 只在正文真的出现公式时才加载，单独打成一个 chunk。
 * 用 mathml 输出：Chrome 原生渲染 MathML，不必随扩展打包字体和 katex.css。
 */
let pending: Promise<Katex> | null = null;
function loadKatex(): Promise<Katex> {
  pending ??= import("katex")
    .then((m) => m.default ?? (m as unknown as Katex))
    .catch((e) => {
      pending = null; // 别把失败缓存住，下次还能再试
      throw e;
    });
  return pending;
}

const BS = String.fromCharCode(92);

/** 模型有时用 \( \) \[ \]，先统一成 $ 和 $$，后面只认一种分隔符 */
function toDollar(md: string): string {
  return md
    .split(`${BS}(`)
    .join("$")
    .split(`${BS})`)
    .join("$")
    .split(`${BS}[`)
    .join("$$")
    .split(`${BS}]`)
    .join("$$");
}

const MATH_G = /\$\$([\s\S]+?)\$\$|\$(.+?)\$/g;
const HAS_MATH = /\$\$[\s\S]+?\$\$|\$.+?\$/;

/** 浮层标题栏已经显示了原词，模型若仍输出标题就去掉，免得重复 */
function stripLeadingHeading(md: string): string {
  return md.replace(/^\s*#{1,6}[^\n]*\n+/, "");
}

export function render(src: string, katex: Katex | null): string {
  const slots: string[] = [];

  // 公式必须在 markdown 解析之前抽走 —— 否则 _ 会被当成斜体、反斜杠会被当成转义
  const staged = toDollar(stripLeadingHeading(src)).replace(
    MATH_G,
    (whole: string, block: string | undefined, inline: string | undefined) => {
      if (!katex) return whole; // 还没加载完先原样显示，加载好会自动重渲染
      const tex = block ?? inline;
      if (!tex) return whole;
      try {
        const out = katex.renderToString(tex, {
          output: "mathml",
          displayMode: block !== undefined,
          throwOnError: false,
        });
        // KaTeX 会在 MathML 里塞一个 <annotation> 存原始 LaTeX（给复制用）。
        // DOMPurify 不认这个标签，剥掉标签却留下文字 —— 于是公式底下多出一行
        // 生的 rac{1}{2} 之类。这里直接删掉，我们用不上。
        slots.push(out.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, ""));
        return `%%SNMATH${slots.length - 1}%%`;
      } catch {
        return whole; // 流式输出中途公式还不完整，先留着
      }
    },
  );

  let html = (marked.parse(staged, { async: false }) as string).replace(
    /%%SNMATH(\d+)%%/g,
    (_: string, i: string) => slots[Number(i)] ?? "",
  );

  // 只有这几个固定小节名才当标题渲染。原来靠"整段只有一个 <strong>"来判断，
  // 正文里出现独立成段的粗体（比如「椭球状的云团」）也会被误当成小节名。
  // 所以只换段首那个 <strong>，段里其余内容原样保留。
  html = html.replace(
    /<p><strong>(英文释意|文化拆解|在英语里|背景|记住)<\/strong>/g,
    '<p><span class="sn-label">$1</span>',
  );

  // 内容来自模型，直接 innerHTML 是 XSS 面 —— 必过消毒（DOMPurify 默认放行 MathML）
  return DOMPurify.sanitize(html);
}

export function Markdown({ source }: { source: string }) {
  const [katex, setKatex] = useState<Katex | null>(null);
  const needsMath = HAS_MATH.test(toDollar(source));

  useEffect(() => {
    if (!needsMath || katex) return;
    let alive = true;
    void loadKatex().then((k) => {
      if (alive) setKatex(() => k);
    });
    return () => {
      alive = false;
    };
  }, [needsMath, katex]);

  const html = useMemo(() => render(source, katex), [source, katex]);
  return <div class="sn-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
