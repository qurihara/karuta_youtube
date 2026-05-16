import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [
    crx({ manifest }),
    viteStaticCopy({
      // Only ship the files onnxruntime-web actually fetches at runtime
      // with our config (executionProviders=['wasm'], numThreads=1).
      // The /wasm subpath bundle references the plain (non-jsep,
      // non-jspi, non-asyncify) WASM loader, so that's all we need.
      // Skipping the others cuts ~60 MB from the packaged zip.
      targets: [
        {
          src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
          dest: "assets",
        },
        {
          src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
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
