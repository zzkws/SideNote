import type { Turn } from "./types";

/** 一次完整的查询：划中的词 + 之后所有的追问 */
export interface Conversation {
  id: string;
  word: string;
  /** 划中处所在的那一句，回看时用来想起当时的语境 */
  sentence: string;
  title: string;
  url: string;
  at: number;
  /** 框选提问时的那块画面，data URL；划词提问时没有 */
  shot?: string;
  turns: Turn[];
}

const KEY = "history";
/** 留多少条。一条大约 1~3 KB，200 条不到 600 KB，离配额还远 */
const MAX = 200;

export async function loadHistory(): Promise<Conversation[]> {
  const got = (await chrome.storage.local.get(KEY)) as { history?: Conversation[] };
  return got.history ?? [];
}

/**
 * 存一次对话。同一次查询里追问几轮就更新几次，所以按 id 覆盖而不是追加。
 */
export async function saveConversation(c: Conversation): Promise<void> {
  const list = await loadHistory();
  const next = [c, ...list.filter((x) => x.id !== c.id)].slice(0, MAX);
  await chrome.storage.local.set({ [KEY]: next });
}

export async function removeConversation(id: string): Promise<void> {
  const list = await loadHistory();
  await chrome.storage.local.set({ [KEY]: list.filter((x) => x.id !== id) });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [KEY]: [] });
}
