import { useSpeech } from "../speech/useSpeech";

export function SpeakerIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
  </svg>;
}

export function Pronunciation({ text }: { text: string }) {
  const speech = useSpeech(text);
  const waiting = speech.active && speech.playback !== "playing";
  return <span class="sn-pronunciation">
    <button type="button" class={`sn-speak${speech.active ? " is-active" : ""}${speech.playback === "error" ? " is-error" : ""}`}
      onClick={() => void speech.toggle()} title={speech.label} aria-label={speech.active ? "停止发音" : "播放英文发音"}
      aria-pressed={speech.active}>
      {waiting ? <span class="sn-speech-spinner" />
        : speech.playback === "playing" ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        : <SpeakerIcon />}
    </button>
    <span class="sn-speech-hint" role="status">{speech.label}{speech.playback === "error" ? " · 点击重试" : ""}</span>
  </span>;
}
