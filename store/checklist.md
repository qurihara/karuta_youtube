# Chrome Web Store 提出チェックリスト

## 提出前に揃えるもの

### 1. デベロッパー登録
- [ ] https://chrome.google.com/webstore/devconsole にアクセス
- [ ] Google アカウントでログイン
- [ ] **登録料 $5** を一回払い (クレジットカード)
- [ ] デベロッパー情報入力 (公開名、メールアドレス、物理住所など)

### 2. 拡張パッケージ
- [x] `karuta-youtube-hud.zip` (リポジトリルートに `npm run package` で生成、または最新の [GitHub Release](https://github.com/qurihara/karuta_youtube/releases/latest) から)

### 3. 画像素材
- [ ] **アイコン 128×128** — `public/icons/icon-128.png` に同梱済み (zip経由で自動使用)
- [x] **スクリーンショット 1280×800** — `store/screenshots/` に 5枚同梱済み:
  1. `1-active.png` — 通常動画でHUDが青く点灯した瞬間 (基本機能)
  2. `2-expanded.png` — ⚙ を展開した詳細パネル (N秒, 無音閾値, タイムライン, 診断行)
  3. `3-live.png` — ライブ配信で LIVEバッジ表示
  4. `4-popup-on.png` — ツールバーのポップアップ ON 状態
  5. `5-popup-off.png` — ツールバーのポップアップ OFF 状態

  → そのままストアにアップロードしてもよいし、`store/screenshots-prompts.md` のプロンプトで LLM 画像生成して差し替えてもOK
- [ ] **小プロモタイル 440×280** (任意・推奨) — `store/screenshots-prompts.md` のセクション2参照

### 4. プライバシーポリシー
- [x] `PRIVACY.md` 作成済み
- 公開URL (ストアの「プライバシーポリシー URL」に入力):
  ```
  https://github.com/qurihara/karuta_youtube/blob/main/PRIVACY.md
  ```

## ストア入力項目 (デベロッパーコンソール)

### ストア掲載情報 (Store listing)
- [ ] **名称**: `store/listing-ja.md` 参照
- [ ] **概要 (短い説明)**: 同上
- [ ] **詳細**: 同上
- [ ] **カテゴリ**: 仕事効率化 (Productivity)
- [ ] **言語**: 日本語
- [ ] **アイコン**: 128×128 (zip 内から自動)
- [ ] **スクリーンショット**: 1〜5枚アップロード

### プライバシー
- [ ] **シングルパーパス**の説明: `store/listing-ja.md` 末尾参照
- [ ] **権限の正当化** (storage / host_permissions): `store/justifications.md` 参照
- [ ] **リモートコード**: 使用していない (justifications.md 参照)
- [ ] **データ使用**: justifications.md の表を参照して各項目入力
- [ ] **プライバシーポリシー URL**: 上記参照
- [ ] **3つの宣誓**にチェック

### 配布
- [ ] **公開状態**: 公開 (誰でもインストール可) ／ 非公開 (リンクを知っている人のみ)
- [ ] **配布地域**: 全世界 ／ 日本のみ (任意)
- [ ] **対象ユーザー**: 一般 (年齢制限なし)

## 提出後

- 審査時間: 通常1〜数営業日。MV3の単純な拡張は早いことが多い
- 拒否されたら修正版を再提出 (バージョン番号は上げる必要あり)
- 承認されたら公開URLが発行される (例: `https://chromewebstore.google.com/detail/<extension-id>/...`)

## 提出後のリリースサイクル (今後)

1. コード修正 → バージョン bump (`package.json` と `src/manifest.ts`)
2. `npm run package` → `karuta-youtube-hud.zip`
3. デベロッパーコンソールで新パッケージをアップロード
4. (任意) 同時に GitHub にも tag + Release を作る

## ヒント

- 初回審査で蹴られる頻出原因:
  - スクリーンショットが拡張の機能と関係ない / 画像サイズが規定外
  - シングルパーパスの説明が曖昧
  - プライバシーポリシーがリンク切れ
  - 権限正当化が「便利だから」レベルで具体的な目的が書かれていない
- 本拡張は YouTube DOM 上にUIをかぶせるだけで `tabs` / `scripting` などの広範な権限を使わないため、比較的すんなり通る想定
