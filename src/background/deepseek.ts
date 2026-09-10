import type { ErrorCode, Settings } from "../shared/types";
import type { ChatMessage } from "./prompt";

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  /** 命中前缀缓存的 token 数 —— 消息顺序设计得对不对，看这个 */
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

/** 抽出来供测试复用，保证测的就是线上发出去的那个 body */
export function buildRequestBody(settings: Settings, messages: ChatMessage[]) {
  return {
    model: settings.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    // DeepSeek 的 temperature 映射与 OpenAI 不同；释义任务要稳，取偏低值
    temperature: 0.6,
    // 追问是教学式的，会很长。上限给足，实际长度交给模型决定 ——
    // 之前设 600 会把讲到一半的回答直接切断，而且看不出是被切的。
    max_tokens: 8192,
    // v4-flash 默认先思考，实测多等 5-10 秒，而思考内容我们本就丢弃；
    // 关掉后 prompt 还少 ~79 tok（少了思考模式的系统前缀）
    ...(settings.deepThinking ? {} : { reasoning_effort: "none" as const }),
  };
}

export interface StreamHandlers {
  onDelta(text: string): void;
  /** truncated 为真表示答案是撞上限被切的，不是自然说完 */
  onDone(truncated: boolean): void;
  onError(code: ErrorCode, message: string): void;
  onUsage?(usage: Usage): void;
}

/**
 * 供应商接口的唯一实现点。将来若要换成自建后端代理（上架必须），只改这个文件。
 */
export async function streamChat(
  settings: Settings,
  messages: ChatMessage[],
  signal: AbortSignal,
  h: StreamHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(settings, messages)),
    });
  } catch {
    if (signal.aborted) return;
    h.onError("network", "连不上 DeepSeek。检查网络或代理设置。");
    return;
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    const [code, msg] = mapStatus(res.status, detail);
    h.onError(code, msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  let stopReason: string | null = null;

  const consume = (data: string) => {
    if (data === "[DONE]") {
      finished = true;
      return;
    }
    try {
      const json = JSON.parse(data);
      const choice = json?.choices?.[0];
      const delta: string | undefined = choice?.delta?.content;
      if (delta) h.onDelta(delta);
      // "length" 表示是撞上限被切的，不是自然说完
      if (choice?.finish_reason) stopReason = choice.finish_reason as string;
      // 最后一个 chunk 带 usage，choices 为空数组
      if (json?.usage) h.onUsage?.(json.usage as Usage);
    } catch {
      // 忽略心跳 / 非 JSON 行
    }
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE 事件以空行分隔；最后一段可能不完整，留在 buffer 里
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (line.startsWith("data:")) consume(line.slice(5).trim());
        }
      }
    }
  } catch {
    if (signal.aborted) return;
    h.onError("network", "连接中断，请重试。");
    return;
  }

  h.onDone(stopReason === "length");
}

function mapStatus(status: number, detail: string): [ErrorCode, string] {
  switch (status) {
    case 400:
      return ["unknown", `请求被拒绝（400）。${brief(detail)}`];
    case 401:
      return ["unauthorized", "API Key 无效。检查是否复制完整、有无多余空格。"];
    case 402:
      return ["insufficient-balance", "DeepSeek 账户余额不足，请先充值。"];
    case 429:
      return ["rate-limited", "请求过于频繁，稍等几秒再试。"];
    default:
      if (status >= 500) return ["server", `DeepSeek 服务暂时不可用（${status}）。`];
      return ["unknown", `请求失败（${status}）。${brief(detail)}`];
  }
}

function brief(detail: string): string {
  if (!detail) return "";
  try {
    const j = JSON.parse(detail);
    return String(j?.error?.message ?? "").slice(0, 160);
  } catch {
    return detail.slice(0, 160);
  }
}
