// v1ではロードしない。v2でTransformers.jsを使ってwhisper-tinyを駆動する予定。
// 構造の placeholder としてWorkerファイルは存在させる。

self.onmessage = (_ev: MessageEvent) => {
  // no-op for v1
};

export {};
