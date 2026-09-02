import { autoUpdate } from "@floating-ui/dom";
import { useEffect, useRef, useState } from "preact/hooks";
import { Markdown } from "./Markdown";
import { anchor, failure, placement, status, thread, visible, word } from "./store";

interface Props {
  onClose(): void;
  onOpenOptions(): void;
  onRetry(): void;
  onAsk(question: string): void;
}

/** 卡片与视口边缘留的空隙 */
const GAP = 16;
/** 卡片与选中词之间的间隙 */
const NUDGE = 8;
/** 宽度上限；右边空间不够就往下压 */
const MAX_W = 400;
/** 压到这个宽度就不再压了，再窄中文会挤得没法读，改为整体往左挤 */
const MIN_W = 300;
/** 卡片至少要留出这么高才不算憋屈；下方空间不够就整体上移 */
const MIN_H = 280;
/** 卡片高度上限 */
const MAX_H = 560;

/**
 * 正文第一行文字的上缘，距离卡片上缘有多远。
 *
 * 只用 .sn-body 自己的几何（顶部位置 + 内边距 + 半行距），不看里面装的是什么，
 * 这样骨架屏换成正文、或者追问让内容变长，这个数都不会变，卡片也就不会瞬移。
 */
function firstLineInset(card: HTMLElement, body: HTMLElement | null): number {
  if (!body) return 0;

  const cs = getComputedStyle(body);
  const padTop = Number.parseFloat(cs.paddingTop) || 0;
  const fs = Number.parseFloat(cs.fontSize) || 14;
  const lh = Number.parseFloat(cs.lineHeight);
  const halfLeading = Number.isFinite(lh) ? Math.max(0, (lh - fs) / 2) : 0;

  return body.getBoundingClientRect().top - card.getBoundingClientRect().top + padTop + halfLeading;
}

export function Popup({ onClose, onOpenOptions, onRetry, onAsk }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  const shown = visible.value;
  const range = anchor.value;
  const mode = placement.value;
  const st = status.value;
  const turns = thread.value;
  const err = failure.value;

  const busy = st === "loading" || st === "streaming";

  useEffect(() => {
    const el = cardRef.current;
    if (!shown || !el || !range) return;

    const reference = {
      getBoundingClientRect: () => range.getBoundingClientRect(),
      contextElement:
        (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement) ?? undefined,
    };

    /**
     * 一次算全：宽、高预算、位置。
     *
     * 高度不由内容决定，而是先划定预算（到视口底部为止），内容在预算内涨、
     * 涨满就在卡片内部滚动。卡片本身自始至终不动，所以流式输出和追问都不会让它跳。
     */
    const update = () => {
      const rect = reference.getBoundingClientRect();

      const spaceRight = window.innerWidth - rect.right - NUDGE - GAP;
      const w = Math.min(MAX_W, Math.max(MIN_W, spaceRight), window.innerWidth - 2 * GAP);
      el.style.width = `${w}px`;

      const left =
        mode === "right"
          ? Math.max(GAP, window.innerWidth - w - GAP)
          : Math.max(GAP, Math.min(rect.right + NUDGE, window.innerWidth - w - GAP));

      const inset = firstLineInset(el, bodyRef.current);
      const floor = window.innerHeight - GAP;
      let top = rect.top - inset;
      if (top + MIN_H > floor) top = floor - MIN_H;
      top = Math.max(GAP, top);

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.maxHeight = `${Math.max(MIN_H, Math.min(MAX_H, floor - top))}px`;
    };

    return autoUpdate(reference, el, update, { elementResize: false });
  }, [shown, range, mode]);

  // 换一个词就把正文滚回顶部。首答生成时不自动跟到底 ——
  // 最要紧的词义和句义在最上面，跟着尾巴走反而把它顶出视野。
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [range]);

  // 追问则相反：把新问题滚进视野，让人看到自己问的那句
  useEffect(() => {
    if (turns.length > 1 && bodyRef.current) {
      const last = bodyRef.current.querySelector(".sn-turn:last-of-type");
      last?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [turns.length]);

  function submit() {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    onAsk(q);
  }

  if (!shown) return null;

  const first = turns[0];

  return (
    <div class="sn-card" ref={cardRef}>
      <div class="sn-head">
        <span class="sn-word">{word.value}</span>
        {busy && <span class="sn-tag">生成中</span>}
        <button class="sn-x" onClick={onClose} title="关闭 (Esc)" type="button">
          ×
        </button>
      </div>

      <div class="sn-body" ref={bodyRef}>
        {first?.answer ? (
          <>
            <Markdown source={first.answer} />
            {turns.slice(1).map((t, i) => (
              <div class="sn-turn" key={i}>
                {t.question && <div class="sn-q">{t.question}</div>}
                <Markdown source={t.answer} />
                {/* 追问失败时只在这一轮里提示，已经答好的内容不受影响 */}
                {st === "error" && err && i === turns.length - 2 && (
                  <p class="sn-inline-error">{err.message}</p>
                )}
              </div>
            ))}
            {st === "streaming" && <span class="sn-caret" />}
          </>
        ) : st === "error" && err ? (
          <div class="sn-error">
            <strong>{errorTitle(err.code)}</strong>
            <p>{err.message}</p>
            {err.code === "no-key" ? (
              <button class="sn-btn" onClick={onOpenOptions} type="button">
                打开设置
              </button>
            ) : (
              <button class="sn-btn" onClick={onRetry} type="button">
                重试
              </button>
            )}
          </div>
        ) : (
          <div class="sn-skeleton">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      {(first?.answer || st !== "error") && (
        <div class="sn-ask">
          <input
            ref={inputRef}
            type="text"
            placeholder={busy ? "生成中…" : "接着问点什么"}
            value={draft}
            disabled={busy}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            class="sn-send"
            onClick={submit}
            disabled={busy || !draft.trim()}
            title="发送 (Enter)"
            type="button"
          >
            ↑
          </button>
        </div>
      )}
    </div>
  );
}

function errorTitle(code: string): string {
  switch (code) {
    case "no-key":
      return "尚未配置";
    case "unauthorized":
      return "认证失败";
    case "insufficient-balance":
      return "余额不足";
    case "rate-limited":
      return "请求过快";
    case "network":
      return "网络问题";
    default:
      return "出错了";
  }
}
