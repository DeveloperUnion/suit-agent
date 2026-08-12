/**
 * モデル名の唯一の出どころ。
 *
 * 用途ごとに事業者もモデルも違ううえ、どれも半年で入れ替わる。呼び出し側に
 * 名前を書くと「どこを直せば全部替わるか」が分からなくなるので、ここに集める。
 * lib/ai/* と app/api/* はこの定数だけを参照し、文字列リテラルを書かない。
 *
 * 差し替えるときに気をつけること:
 *   - extraction … 過去の読み取り結果に `source` としてモデル名が残っている。
 *     替えても既存の記録は書き換えない（いつ何で読んだかの記録なので）
 *   - embedding  … 替えたら search_chunks を**全行**埋め込み直す。
 *     どのモデルで作った行かは search_chunks.embedding_model が持っている。
 *     混在したまま検索すると、ベクトル空間が違うので距離が意味を成さない
 */
export const MODELS = {
  /** 採寸票・名刺の読み取り（PDF と画像）。手書きを読ませるのでここは慎重に替える */
  extraction: "gemini-3.6-flash",

  /** 接客の合間の会話。Phase 2 で lib/ai/agent.ts のパターン照合と入れ替える */
  chat: "gpt5.6luna",

  /** パーソナルの意味検索。Matryoshka で EMBEDDING_DIMENSIONS まで切り詰めて使う */
  embedding: "gemini-embedding-001",
} as const;

/**
 * 埋め込みの次元。
 *
 * **`search_chunks.embedding` の `vector(N)` と必ず一致させること。**
 * ずれると挿入時に落ちる（無音にはならない）。
 *
 * 1536 なのはモデルの都合ではなく pgvector の都合。HNSW インデックスは
 * 2000 次元までしか張れないので、3072 次元のモデル（text-embedding-3-large、
 * gemini-embedding-001 の既定）はそのままでは索引化できない。
 * どちらも Matryoshka 表現なので、API 側の outputDimensionality / dimensions で
 * ここへ切り詰める。先頭を切り出すだけなので、精度の劣化はわずか。
 */
export const EMBEDDING_DIMENSIONS = 1536;
