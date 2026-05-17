import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "SpeechRewinder for YouTube",
  version: "1.1.0",
  description: "YouTubeで「次の発話の直前」までワンクリックで巻き戻すHUD。競技かるたの上の句直前など、ピンポイントな聞き直しに最適。",
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
      resources: ["assets/*", "models/*", "worklets/*"],
      matches: ["https://www.youtube.com/*"],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  action: {
    default_popup: "src/popup/popup.html",
    default_title: "SpeechRewinder for YouTube",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
  },
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  minimum_chrome_version: "116",
});
