import { modelStatusText } from "../speech/protocol";
import { useSpeech } from "../speech/useSpeech";
import { SpeakerIcon } from "../ui/Pronunciation";

export function SpeechSettings() {
  const speech = useSpeech("Knowledge distillation. Multi-scale patterns.");
  const model = speech.model;
  const downloading = model.phase === "downloading" || model.phase === "checking" || model.phase === "verifying";
  return <section class="speech-panel" aria-labelledby="speech-title">
    <div class="speech-heading">
      <span class="speech-mark"><SpeakerIcon /></span>
      <div><h2 id="speech-title">听见原文</h2><p>Kokoro Q8 <span>·</span> 美式 Heart</p></div>
      <span class="speech-local">本地发音</span>
    </div>
    <p class="speech-description">选中英文，点词旁的发音按钮。声音在你的电脑上生成，不上传选中文字。</p>
    <div class={`speech-download${model.phase === "error" ? " has-error" : ""}`}>
      <div class="speech-status"><span role="status">{modelStatusText(model)}</span><span>92.4 MB</span></div>
      {downloading && <progress aria-label="语音包下载进度" max={model.total}
        value={model.phase === "checking" ? undefined : model.received} />}
    </div>
    <div class="speech-actions">
      {model.phase === "error" ? <button type="button" onClick={speech.prepare}>重新下载</button>
        : <button type="button" onClick={() => void speech.toggle()} disabled={downloading}>
          {speech.active ? "停止试听" : "试听发音"}
        </button>}
      <span role="status">{speech.active || speech.playback === "error" ? speech.label : "首次自动下载，之后离线可用"}</span>
    </div>
    <p class="speech-footnote">无需 API Key 或另装软件。首次加载需稍候；再次播放同一词句会直接复用本次阅读的声音。语音包由 GitHub 下载，Hugging Face 备用。</p>
  </section>;
}
