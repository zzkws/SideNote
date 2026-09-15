import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "DeepSeek 伴读",
  version: pkg.version,
  description: pkg.description,

  minimum_chrome_version: "116",
  // Model cache should not be evicted under ordinary website storage pressure.
  permissions: ["storage", "offscreen", "unlimitedStorage"],
  host_permissions: ["https://api.deepseek.com/*", "https://huggingface.co/*", "https://*.hf.co/*",
    "https://github.com/*", "https://release-assets.githubusercontent.com/*"],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },

  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },

  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle",
      all_frames: false, // iframe 内暂不支持
    },
  ],

  options_page: "src/options/index.html",

  // PDF 阅读器是扩展自己的页面，不靠 content script 注入，
  // 直接 import 那套 UI，逻辑跟网页版共用。
  web_accessible_resources: [
    {
      resources: ["src/pdf/index.html"],
      matches: ["http://*/*", "https://*/*"],
    },
  ],

  icons: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },

  action: {
    default_title: "DeepSeek 伴读",
    default_popup: "src/menu/index.html",
    default_icon: {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
});
