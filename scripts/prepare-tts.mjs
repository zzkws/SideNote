// Package executable assets locally for MV3. The 92 MB model is NOT part of the bundle.
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
async function copy(source, target) {
  const destination = resolve(root, "public/tts", target);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await copyFile(resolve(root, source), destination);
}
for (const file of ["config.json", "tokenizer.json", "tokenizer_config.json"]) {
  await copy(`vendor/kokoro/${file}`, `kokoro/${file}`);
}
const voicePath = "node_modules/kokoro-js/voices/af_heart.bin";
const hash = createHash("sha256").update(await readFile(resolve(root, voicePath))).digest("hex");
if (hash !== "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b") throw new Error("Unexpected Kokoro voice checksum");
await copy(voicePath, "kokoro/af_heart.bin");
for (const extension of ["mjs"]) {
  const file = `ort-wasm-simd-threaded.jsep.${extension}`;
  await copy(`node_modules/onnxruntime-web/dist/${file}`, `wasm/${file}`);
}
for (const [source, name] of [
  ["node_modules/kokoro-js/LICENSE", "kokoro-Apache-2.0.txt"],
  ["node_modules/phonemizer/LICENSE", "phonemizer-Apache-2.0.txt"],
  ["node_modules/@huggingface/transformers/LICENSE", "transformers-Apache-2.0.txt"],
  ["vendor/kokoro/onnxruntime-LICENSE.txt", "onnxruntime-MIT.txt"],
  ["vendor/kokoro/espeak-COPYING.txt", "espeak-GPL-3.0.txt"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
]) await copy(source, `licenses/${name}`);
console.log("Kokoro Q8 local runtime assets prepared (model downloads on install).");
