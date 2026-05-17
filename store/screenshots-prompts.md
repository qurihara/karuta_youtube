# LLM画像生成プロンプト集 — Chrome Web Store 提出用

`store/screenshots/` 配下の 1〜5 は実コントロールUIモックのスクリーンショット (1280×800 PNG) が既に用意されています。下記は**ヒーロー画像**や**プロモタイル**など追加のイメージ素材を LLM画像生成 (DALL·E / Imagen / Midjourney / SDXL 等) で作るときの推奨プロンプトです。

すべて **横長 1280×800** または **440×280 (小プロモタイル)** で出力するように指定してください。

---

## 1. 大型プロモタイル / ヒーロー画像 (1280×800)

### Prompt A — 機能の視覚化 (推奨・抽象的)

```
A clean, modern Chrome browser window screenshot showing a YouTube-style video player on a dark background. At the top center of the video, a small horizontal pill-shaped overlay button is glowing soft blue with a subtle ring of light expanding outward, labeled "◀ 発話前に戻る" in white. Below the player is a faint waveform visualization with alternating speech and silence segments marked. The aesthetic is minimalist, dark-mode, slightly futuristic, with a hint of traditional Japanese karuta cards (small, gold leaf, blurred) in the bottom corner as a subtle motif. 16:9 aspect ratio, ultra-sharp, photographic realism with UI overlays.
```

### Prompt B — 競技かるたの瞬間 (ストーリー寄り)

```
A high-speed photographic moment of a traditional Japanese karuta (hyakunin isshu) competition: two players in formal seiza posture facing each other across a tatami mat covered with small white poetry cards, one player's hand frozen mid-swipe as it strikes a card. The lighting is warm and dramatic from above. Overlaid in the upper right corner, a translucent floating UI card with the text "巻き戻し可能" in Japanese, and a small left-pointing arrow icon ◀. Photorealistic, shallow depth of field, cinematic.
```

### Prompt C — 上の句/下の句のリズム可視化 (機能説明的)

```
Editorial illustration in muted dark blue, white, and ink-wash style. The composition shows a horizontal timeline with two phases labeled "下の句" (lower verse) and "上の句" (upper verse) in Japanese calligraphy, separated by a long pause marked with a soft gradient. Above the pause, a glowing left-pointing arrow icon labeled "巻き戻しポイント". The mood is contemplative and clean, like a Japanese textbook diagram. 1280×800.
```

---

## 2. 小プロモタイル (440×280)

ストアの一覧/カテゴリページで使われる小さなタイル。視認性の高さが命。

```
A compact branded tile, dark blue gradient background (#1a1a1a to #2563eb), with a large white pill-shaped button in the center labeled "◀ 発話前に戻る" in Japanese, accompanied by a small "K" logo bottom-right. Aspect ratio 440×280. Clean, high contrast, app-store-style branding.
```

---

## 3. マーキー画像 (1400×560 — 任意)

ストア掲載のトップに表示される大型バナー。

```
A wide, cinematic horizontal banner. Left side: an abstract dark blue gradient with concentric circular ripples emanating from a central "◀" arrow icon, suggesting speech-detection sonar. Right side: a soft photograph of stacked traditional karuta cards on a tatami mat, slightly out of focus. In the center, large Japanese type "競技かるたに、巻き戻し" (Rewind, for karuta) in elegant gothic font, white. Bottom-right corner: small "SpeechRewinder for YouTube" branding. 1400×560.
```

---

## 4. アプリアイコン (任意の置き換え)

既存の `public/icons/icon-128.png` (ユーザーが用意) を使う想定ですが、もし再生成したい場合の参考:

```
A flat, minimalist app icon: a stylized left-pointing arrow ◀ inside a rounded square. Background is a vertical gradient from deep navy (#0f172a) at top to vivid blue (#2563eb) at bottom. The arrow is bright white with a soft glow. Small "K" mark in the bottom-right corner of the icon (subtle). 128×128, sharp edges, suitable for Chrome Web Store.
```

---

## 使い方のヒント

- **生成後のリタッチ**: 多くの画像生成LLMは日本語テキストを正確に書けません。生成後にFigma / Photoshop / プレビュー.app で**テキストを差し替える**のが現実的です。背景画像だけ生成、テキストは別レイヤーで重ねる方針が確実
- **画像生成LLMにテキストを書かせる場合**: 短く、英字 (例 "Rewind") にした方が成功率が上がります
- **Chrome Web Store の要件**: PNG または JPEG、1280×800 または 640×400、最大5枚
- **小プロモタイル 440×280** は任意ですが**強く推奨**: 一覧表示で見栄えが大きく変わる
- **マーキー画像 1400×560** はピックアップされた時のみ使われる枠。プロモタイルがあれば後回し可

---

## 既存の実コントロールUIスクリーンショット (差し替え不要)

| ファイル | 内容 |
|---|---|
| `screenshots/1-active.png` | 動画上でコントロールUIが青く点灯した瞬間 (基本機能) |
| `screenshots/2-expanded.png` | ⚙ で展開した詳細パネル (N秒, 無音閾値, タイムライン, 診断行) |
| `screenshots/3-live.png` | ライブ配信での表示 (LIVEバッジ) |
| `screenshots/4-popup-on.png` | ブラウザツールバーのポップアップ ON 状態 |
| `screenshots/5-popup-off.png` | 同 OFF 状態 |

ストアの「スクリーンショット」欄にはこれら 5 枚をそのままアップロード可能。
