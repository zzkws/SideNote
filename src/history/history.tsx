import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  clearHistory,
  loadHistory,
  removeConversation,
  type Conversation,
} from "../shared/history";
import { Markdown } from "../ui/Markdown";
import "./history.css";

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "今天";
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (same(d, y)) return "昨天";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function App() {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    void loadHistory().then(setList);
  }, []);

  const shown = useMemo(() => {
    if (!list) return [];
    const k = q.trim().toLowerCase();
    if (!k) return list;
    return list.filter(
      (c) =>
        c.word.toLowerCase().includes(k) ||
        c.title.toLowerCase().includes(k) ||
        c.turns.some((t) => (t.answer + (t.question ?? "")).toLowerCase().includes(k)),
    );
  }, [list, q]);

  if (!list) return null;

  if (list.length === 0) {
    return (
      <div class="wrap">
        <div class="top">
          <h1>历史</h1>
        </div>
        <div class="empty">还没有记录。在网页或 PDF 上划词查过之后，会自动存到这里。</div>
      </div>
    );
  }

  // 按天分组，同一天的按时间倒序
  const groups: { day: string; items: Conversation[] }[] = [];
  for (const c of shown) {
    const d = dayLabel(c.at);
    const g = groups[groups.length - 1];
    if (g && g.day === d) g.items.push(c);
    else groups.push({ day: d, items: [c] });
  }

  return (
    <div class="wrap">
      <div class="top">
        <h1>历史</h1>
        <span class="count">{list.length} 条</span>
      </div>
      <p class="sub">只存在你本机，最多保留最近 200 条。</p>

      <input
        class="search"
        type="text"
        placeholder="搜词、搜文章标题、搜答案里的字"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />

      {groups.map((g) => (
        <div key={g.day}>
          <div class="day">{g.day}</div>
          {g.items.map((c) => {
            const expanded = open === c.id;
            return (
              <div class="item" key={c.id}>
                <button class="head" type="button" onClick={() => setOpen(expanded ? null : c.id)}>
                  <span class="word">{c.word}</span>
                  {c.turns.length > 1 && <span class="turns">+{c.turns.length - 1} 追问</span>}
                  <span class="where">{c.title}</span>
                  <span class="when">{timeLabel(c.at)}</span>
                </button>

                {expanded && (
                  <div class="body">
                    {c.sentence && <div class="ctx">{c.sentence}</div>}
                    {c.turns.map((t, i) => (
                      <div key={i}>
                        {i > 0 && t.question && <div class="q">{t.question}</div>}
                        <Markdown source={t.answer} />
                      </div>
                    ))}
                    <div class="acts">
                      {/^https?:/.test(c.url) && (
                        <a class="mini" href={c.url} target="_blank" rel="noreferrer">
                          回到原文
                        </a>
                      )}
                      <button
                        class="mini"
                        type="button"
                        onClick={() => {
                          void removeConversation(c.id).then(() =>
                            setList((v) => (v ?? []).filter((x) => x.id !== c.id)),
                          );
                        }}
                      >
                        删除这条
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div class="acts" style="margin-top:32px">
        <button
          class="mini"
          type="button"
          onClick={() => {
            if (!confirm("清空全部历史？不可恢复。")) return;
            void clearHistory().then(() => setList([]));
          }}
        >
          清空全部
        </button>
      </div>
    </div>
  );
}

const root = document.getElementById("app");
if (root) render(<App />, root);
