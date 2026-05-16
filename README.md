# Karuta YouTube HUD

YouTubeで競技かるたの試合動画を視聴中、「静粛まで巻き戻し」ボタンをワンクリックで使えるChrome拡張 (Manifest V3)。

下の句→無音→次の和歌の上の句、というかるた特有の構造を、ブラウザ内のVAD (Silero VAD) でリアルタイム検出し、ユーザーが「上の句が始まったあと」にHUDを押すと、上の句開始の N 秒前 (既定 2秒) まで巻き戻して再生し直す。

通常動画 (`/watch?v=...`) と **YouTube Live** (`/watch?v=...` / `/live/<id>`) の両方に対応。ライブ視聴時はHUDに「LIVE」バッジが表示され、DVRバッファ範囲外への巻き戻しを試みる場合はボタンが自動的にグレーになる。

## アーキテクチャ概要

- 音声キャプチャ: `<video>` 要素から `AudioContext` + `MediaElementAudioSourceNode` で取得
- リサンプル: `AudioWorklet` で 16kHz 単チャンネル / 512サンプルフレーム
- VAD: Web Worker 上で `onnxruntime-web` + `silero_vad.onnx`
- 上の句判定: 直前無音区間長 ≥ `gapThresholdSeconds` (既定 1.5s) で「上の句開始」とみなす
- HUD: Shadow DOM、フルスクリーン追従、巻き戻しボタン+Nスライダー+タイムラインCanvas

設計の詳細は `/Users/kurihara/.claude/plans/chrome-youtube-wisper-hud-shimmying-iverson.md` を参照。

## セットアップ

### 1. 依存をインストール

```bash
npm install
```

### 2. Silero VAD モデルをダウンロード

ライセンス: MIT。`public/models/silero_vad.onnx` (~2MB) を配置する。

```bash
bash scripts/fetch-models.sh
```

または手動で:

```
https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
→ public/models/silero_vad.onnx
```

(将来 Whisper-tiny を有効化する際は `public/models/whisper-tiny/` 配下に同梱予定)

### 3. アイコン画像

`public/icons/icon-{16,32,48,128}.png` を配置する。試用中は任意の単色PNGで構わない。

### 4. ビルド

```bash
npm run dev    # ウォッチビルド (vite build --watch)
# or
npm run build  # 1回ビルド -> dist/
```

### 5. Chromeに読み込み

1. `chrome://extensions/` を開く
2. 「デベロッパーモード」ON
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` を選択

## 使い方

1. YouTubeで競技かるたの動画 (`https://www.youtube.com/watch?v=...`) を開く
2. 動画を再生すると、右上にHUDが現れる
3. 上の句が読み始められた直後、HUDのボタンが青に変わる
4. ボタンをクリックすると、上の句開始の N 秒前にseekして再生し直す
5. N の値はHUDのスライダーで 0.0〜5.0秒の範囲で調整可能
6. ⚙ ボタンで「無音閾値」を調整可能 (誤検出が多い場合に上げる)

## デバッグ

URLに `?karuta-debug=1` を付けると詳細ログを出力する。例:

```
https://www.youtube.com/watch?v=XXXXX&karuta-debug=1
```

DevToolsのConsoleで `[karuta]` プレフィックスのログを確認できる。

## 既知の制限

- v1ではWhisper-tinyはロードしない (VADギャップのみで判定)。将来的に `src/workers/whisper-worker.ts` で有効化予定。
- YouTube広告再生中も同じ `<video>` 要素を共有するため、広告のVAD区間も検出に混ざる。
- 初回再生時にユーザー操作 (HUDクリック等) が必要な場合がある (AudioContext autoplay制限)。
- **ライブ配信時**: 巻き戻し先がDVRバッファ範囲を超えている場合は、`video.seekable.start(0)` までで頭打ちされる。HUDのボタンは「届く範囲か」を200ms間隔でチェックして、届かない時はグレーに戻る。

## ライセンス

- 本拡張のソース: ご自由に
- Silero VAD: MIT
- onnxruntime-web: MIT
