import { render } from "preact";
import "./menu.css";

/** 点工具栏图标弹出的小菜单。设置页太深，PDF 阅读器得摆在一眼能看见的地方。 */
function Menu() {
  const open = (path: string) => {
    window.open(chrome.runtime.getURL(path), "_blank");
    window.close();
  };

  return (
    <>
      <div class="m-title">划词旁注 · SideNote</div>

      <button class="m-item" type="button" onClick={() => open("src/pdf/index.html")}>
        <strong>打开 PDF 阅读器</strong>
        <span>把 PDF 拖进去就能划词。Chrome 自带的查看器拿不到选区，所以另开一页。</span>
      </button>

      <button class="m-item" type="button" onClick={() => open("src/history/index.html")}>
        <strong>历史对话</strong>
        <span>查过的词和追问都存在本机，可以搜、可以回到原文。</span>
      </button>

      <button class="m-item" type="button" onClick={() => open("src/options/index.html")}>
        <strong>设置</strong>
        <span>API Key、模型、浮层位置、触发方式。</span>
      </button>

      <div class="m-foot">网页上直接划词即可，不用打开这个菜单。</div>
    </>
  );
}

const root = document.getElementById("app");
if (root) render(<Menu />, root);
