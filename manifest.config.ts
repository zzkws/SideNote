import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "划词旁注 · SideNote",
  version: pkg.version,
  description: pkg.description,

  // 最小权限：storage 存 API Key，activeTab 用于点击图标打开设置
  // activeTab 只在用户按下快捷键那一刻临时授予，够 captureVisibleTab 用，
  // 不必要 <all_urls> 那种大权限
  permissions: ["storage", "activeTab"],
  host_permissions: ["https://api.deepseek.com/*"],

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

  commands: {
    "capture-region": {
      suggested_key: { default: "Alt+S" },
      description: "框选一块区域，问它是什么",
    },
  },

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
    default_title: "划词旁注 · SideNote",
    default_popup: "src/menu/index.html",
    default_icon: {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
});
