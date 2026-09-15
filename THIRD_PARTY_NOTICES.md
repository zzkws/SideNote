# Local speech components

The companion's original source remains MIT licensed. Bundled third-party components
retain their own licenses; the installation package is not exclusively MIT code.

| Component | Version / source | License |
| --- | --- | --- |
| Kokoro weights and Heart voice | Kokoro-82M v1.0; ONNX revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` | Apache-2.0 |
| kokoro-js | 1.2.1, https://github.com/hexgrad/kokoro/tree/main/kokoro.js | Apache-2.0 |
| Transformers.js | 3.8.1, https://github.com/huggingface/transformers.js | Apache-2.0 |
| ONNX Runtime Web | 1.22.0-dev.20250409-89f8206ba4, https://github.com/microsoft/onnxruntime | MIT |
| phonemizer.js wrapper | 1.2.1, https://github.com/xenova/phonemizer.js | Apache-2.0 |
| eSpeak NG engine/data embedded by phonemizer.js | https://github.com/espeak-ng/espeak-ng | GPL-3.0 |

The eSpeak engine is used for English phonemes, **not** for the audible voice.
Kokoro generates the audible waveform. The wrapper's Apache metadata does not
relicense its embedded eSpeak engine. Preserve the GPL notice and corresponding
source when redistributing that component. Upstream wrapper and embedded engine
source: https://github.com/xenova/phonemizer.js/tree/6835144b7ee9043129222549c1ed2f6a27216278
Full license texts are included in `tts/licenses/` in the built extension.

Model files: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231

`vendor/kokoro/` contains unmodified tokenizer/configuration files from that revision.
`af_heart.bin` is copied from the pinned kokoro-js npm package and checksum-verified.
Only the Q8 ONNX weight data is fetched after installation. No remote JavaScript or
WebAssembly is executed. Dependency versions are pinned by `package-lock.json`.
