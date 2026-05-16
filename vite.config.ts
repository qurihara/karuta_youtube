import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/onnxruntime-web/dist/*.wasm",
          dest: "assets",
        },
        {
          src: "node_modules/onnxruntime-web/dist/*.mjs",
          dest: "assets",
        },
      ],
    }),
  ],
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        chunkFileNames: "assets/chunk-[hash].js",
      },
    },
  },
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
