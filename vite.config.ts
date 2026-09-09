import { crx } from "@crxjs/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  build: {
    target: "esnext",
    rollupOptions: {
      // CRXJS 只编译 manifest 里当页面用的 HTML；PDF 阅读器是我们自己开的页，
      // 不显式列成入口的话会被当静态资源原样拷贝，里面的 .tsx 不会被编译。
      input: { pdfViewer: "src/pdf/index.html", menu: "src/menu/index.html" },
    },
    // content script 里的 CSS 通过 ?inline 注入 Shadow DOM，不需要额外拆分
    cssCodeSplit: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
