import { signal } from "@preact/signals";
import type { ErrorCode, Settings, Turn } from "../shared/types";

export type Status = "loading" | "streaming" | "done" | "error";

export const visible = signal(false);
/** 卡片停靠方式，跟设置页同步 */
export const placement = signal<Settings["placement"]>("follow");
export const word = signal("");
/** 保留 Range，浮层用它跟随滚动 */
export const anchor = signal<Range | null>(null);
/** 整串对话：第一轮是划词，之后每一轮是一次追问 */
export const thread = signal<Turn[]>([]);
export const status = signal<Status>("loading");
export const failure = signal<{ code: ErrorCode; message: string } | null>(null);

/** 往最后一轮的回答上追加流式片段 */
export function appendDelta(text: string): void {
  const list = thread.value;
  if (list.length === 0) return;
  const last = list[list.length - 1];
  thread.value = [...list.slice(0, -1), { ...last, answer: last.answer + text }];
}

/** 开一轮新的问答 */
export function pushTurn(question: string | null): void {
  thread.value = [...thread.value, { question, answer: "" }];
}
