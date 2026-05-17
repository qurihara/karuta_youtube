# プライバシーポリシー — SpeechRewinder for YouTube

最終更新日: 2026-05-17

本Chrome拡張機能「SpeechRewinder for YouTube」(以下「本拡張」) は、ユーザーのプライバシーを最大限尊重します。

## 収集する情報

**本拡張は、ユーザーの個人情報・利用情報・閲覧履歴・音声内容を一切収集しません。**

外部サーバー (本拡張開発者を含む) への通信は一切行いません。

## 取り扱うデータと処理場所

| データ | 処理場所 | 送信先 | 保存先 |
|---|---|---|---|
| YouTube動画の音声 (`<video>` 要素から取得) | ユーザーのブラウザ内のみ | 送信なし | 保存なし (リアルタイム解析後すぐに破棄) |
| 音声区間 / 非音声区間の検出結果 | ユーザーのブラウザ内のみ | 送信なし | メモリ内のみ (直近30秒〜100区間) |
| ユーザー設定 (ON/OFF, N秒, 無音閾値など) | ユーザーのブラウザ内のみ | 送信なし | `chrome.storage.sync` |

`chrome.storage.sync` は Google が提供する Chrome 同期機構であり、同一 Google アカウントのユーザー自身の他の Chrome 端末間でのみ同期されます。本拡張開発者は同期されたデータに一切アクセスできません。

## 音声処理について

本拡張は Silero VAD (Voice Activity Detection) モデルを **拡張機能内に同梱された WebAssembly** で実行します。音声サンプルはユーザーのブラウザのメモリ内でのみ処理され、外部ネットワークには一切送信されません。文字起こし (speech-to-text) は行いません。「音声があるか・無いか」だけを判定します。

## 権限の使用目的

- **`storage`**: ユーザー設定 (拡張ON/OFF、巻き戻し秒数、無音閾値) を保存するため
- **host_permissions `https://www.youtube.com/*`**: YouTube動画ページに HUD を表示し、`<video>` 要素から音声を取得するため

いずれの権限も上記目的以外には使用しません。

## トラッキング・分析

本拡張は分析ツール、トラッキングコード、広告 SDK などを一切含みません。Google Analytics・Sentry・LogRocket・その他の第三者サービスも一切利用しません。

## 第三者への提供

第三者にデータを提供することは一切ありません。本拡張開発者がデータを保有することもありません。

## ソースコード

本拡張のソースコードは MIT ライセンスで公開されています。実装の透明性を確認できます:

https://github.com/qurihara/SpeechRewinder-for-youtube

## 同梱モデル

- Silero VAD ONNX モデル — MIT License (https://github.com/snakers4/silero-vad)
- onnxruntime-web — MIT License (Microsoft)

## 変更履歴

- 2026-05-17: 初版

## 問い合わせ

本ポリシーまたは本拡張に関するお問い合わせは、GitHub Issues で受け付けます:

https://github.com/qurihara/SpeechRewinder-for-youtube/issues
