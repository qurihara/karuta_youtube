# Karuta YouTube HUD

YouTubeで競技かるたの試合動画を視聴中、「静粛まで巻き戻し」ボタンをワンクリックで使えるChrome拡張 (Manifest V3)。

下の句→無音→次の和歌の上の句、というかるた特有の構造を、ブラウザ内のVAD (Silero VAD) でリアルタイム検出し、ユーザーが「上の句が始まったあと」にHUDを押すと、上の句開始の N 秒前 (既定 1秒) まで巻き戻して再生し直す。

通常動画 (`/watch?v=...`) と **YouTube Live** (`/live/<id>` / `/watch?v=...`) の両方に対応。ライブ視聴時はHUDに「LIVE」バッジが表示され、DVRバッファ範囲外への巻き戻しを試みる場合はボタンが自動的にグレーになる。

## インストール (利用するだけの場合)

[GitHub Release](https://github.com/qurihara/karuta_youtube/releases/latest) から `karuta-youtube-hud.zip` をダウンロードして:

1. zip を解凍
2. Chrome で `chrome://extensions/` を開く
3. 右上の **デベロッパーモード** を ON
4. 左上の **「パッケージ化されていない拡張機能を読み込む」** をクリックして、解凍したフォルダを選択
5. ツールバーのアイコンをクリックしてポップアップを開き、スイッチが ON であることを確認

Silero VAD の ONNX モデル (~2MB) は zip に同梱済みで、追加ダウンロード不要。

## 使い方

1. YouTubeで動画を開く (`https://www.youtube.com/watch?v=...` または `/live/...`)
2. 動画上部中央にHUDが現れる (デフォルトでは「◀ 静粛まで巻き戻し」ボタンと ⚙ だけ表示)
3. 新たな上の句の開始が検出されるとボタンが**青になりフラッシュ**で点滅
4. クリックすると、上の句開始の N 秒前にseekして再生し直す
5. ⚙ ボタンで詳細パネルが開き、以下を調整・確認できる:
   - **N (巻き戻し秒数)**: 0.0〜5.0秒 (既定 1.0)
   - **無音閾値**: 0.1〜1.0秒 (既定 0.5)。下の句末尾と次の上の句冒頭の間の沈黙の最低長
   - **タイムライン**: 直近30秒の音声区間と上の句開始マーク
   - **ステータス**: 認識準備状態、LIVEバッジ
   - **診断行**: フレーム数 / ピーク / AGCゲイン / VAD確率 / 区間数 / YouTube音量 / AudioContext 状態
6. ツールバーアイコンのポップアップで拡張全体を ON / OFF (緑=ON, グレー=OFF)。OFF にすると音声認識・HUD表示の両方が停止

## アーキテクチャ概要

- **音声キャプチャ**: `<video>` 要素から `AudioContext` + `MediaElementAudioSourceNode` で取得
- **リサンプル**: `AudioWorklet` で 48kHz → 16kHz 単チャンネル / 576サンプルフレームに整形
- **AGC**: VAD の前段で 直近ピークから自動ゲイン (最大 32×) を適用。音量の小さい配信にも対応
- **VAD**: **メインスレッド上で** `onnxruntime-web/wasm` + `silero_vad.onnx` を実行 (YouTubeのCSPが Worker からの chrome-extension スクリプト読み込みも blob URLs も拒否するため、Worker は使えない。Silero の単フレーム推論は ~1–5ms で 32ms 間隔に十分間に合う)
- **上の句判定**: 直前無音区間長 ≥ `gapThresholdSeconds` (既定 0.5s) で「上の句開始」とみなす
- **HUD**: Shadow DOM。動画上部中央に position: fixed で追従。フルスクリーン切替時は fullscreen 要素内に移動して継続表示
- **ライブ対応**: `video.seekable.start(0)` を毎フレーム参照し、巻き戻し先が DVR バッファ外なら自動的にボタンをグレー化

## 開発 (ソースから動かす場合)

### 1. 依存をインストール

```bash
npm install
```

### 2. Silero VAD モデルを取得

リポジトリには含まれていないので、初回のみ:

```bash
bash scripts/fetch-models.sh
```

`public/models/silero_vad.onnx` (~2MB, MIT) が配置される。

### 3. ビルド

```bash
npm run dev      # ウォッチビルド (vite build --watch)
npm run build    # 1 回ビルド → dist/
npm run package  # build + zip 化 → karuta-youtube-hud.zip
```

### 4. Chrome に読み込み

`chrome://extensions/` → デベロッパーモード ON → 「パッケージ化されていない拡張機能を読み込む」→ `dist/` を選択。

## デバッグ

URLに `?karuta-debug=1` を付けると、Console に各種診断 (モデルロード結果、セルフテスト、フレーム単位のVAD確率、3秒おきのスナップショット等) が出る:

```
https://www.youtube.com/watch?v=XXXXX&karuta-debug=1
```

DevTools の Console フィルタを `[karuta]` に絞ると見やすい。HUDの ⚙ から見える診断行 (`f:... pk:.../... g:...x p:.../...`) も常時更新されていて、リアルタイム状態の確認に使える。

## 既知の制限

- YouTube が広告を本編と同じ `<video>` 要素で再生するため、広告中の発話も VAD に混じる
- AudioContext の autoplay 制限により、初回再生時にユーザー操作 (動画クリックなど) が必要な場合がある
- **ライブ配信**: 巻き戻し先 (uta開始 − N秒) が `video.seekable.start(0)` を超えている場合は、自動的にバッファの先頭までで頭打ち。HUDのボタンは200ms間隔で「届く範囲か」をチェックし、届かない時はグレーに戻る
- 動画自体が極端に小さい音量で録音されている場合、AGC の最大 32× ブーストを超える静かさだと VAD が反応しないことがある
- DRM 保護コンテンツ (Premium 一部映画など) は `createMediaElementSource` が無音を返すため対応不可

## ライセンス

- 本拡張のソース: ご自由に
- Silero VAD: MIT
- onnxruntime-web: MIT
