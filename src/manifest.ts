import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Karuta YouTube HUD",
  version: "0.3.0",
  description: "競技かるた向け、上の句直前にワンクリックで巻き戻すYouTube HUD",
  permissions: ["storage"],
  host_permissions: ["https://www.youtube.com/*"],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://www.youtube.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  web_accessible_resources: [
    {
      resources: [
        "assets/*",
        "models/*",
        "models/whisper-tiny/*",
        "worklets/*",
      ],
      matches: ["https://www.youtube.com/*"],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  minimum_chrome_version: "116",
});
