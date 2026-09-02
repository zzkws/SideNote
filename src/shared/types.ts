export const PORT_NAME = "sidenote";

export type ModelId = "deepseek-v4-flash" | "deepseek-v4-pro";

export interface Settings {
  apiKey: string;
  model: ModelId;
  baseUrl: string;
  /** 触发方式：选中即弹 / 按住 Alt 再选中 */
  trigger: "select" | "alt-select";
  /** 卡片停靠：贴着选中的词 / 固定在视口右缘 */
  placement: "follow" | "right";
  /** 深度思考。v4-flash 默认开启，但查词场景多等 5-10 秒不划算 */
  deepThinking: boolean;
  /** 打开后把每次实际发出的四条消息完整打进 service worker 控制台 */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "deepseek-v4-flash",
  baseUrl: "https://api.deepseek.com",
  trigger: "select",
  placement: "follow",
  deepThinking: false,
  debug: false,
};

/** 一次查询所需的全部上下文 —— 这是整个工具的输入契约 */
export interface Query {
  /** 用户选中的词或短语 */
  word: string;
  /** 选中处所在的那一句 */
  sentence: string;
  /** 选中处所在的段落 */
  paragraph: string;
  /** Readability 抽出的全文正文 */
  article: string;
  title: string;
  url: string;
}

/** 浮层里的一轮问答。第一轮是划词本身，question 为 null */
export interface Turn {
  question: string | null;
  answer: string;
}

/** 追问时把之前来回过的内容原样带上，让模型接着上文答 */
export interface PriorTurn {
  role: "user" | "assistant";
  content: string;
}

export type ClientMessage =
  | ({ type: "explain"; id: string } & Query)
  | ({ type: "followup"; id: string; question: string; prior: PriorTurn[] } & Query)
  | { type: "cancel"; id: string }
  | { type: "openOptions" };

export type ErrorCode =
  | "no-key"
  | "unauthorized"
  | "insufficient-balance"
  | "rate-limited"
  | "server"
  | "network"
  | "unknown";

export type ServerMessage =
  | { type: "delta"; id: string; text: string }
  | { type: "done"; id: string }
  | { type: "error"; id: string; code: ErrorCode; message: string };
