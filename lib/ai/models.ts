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

  /** 接客の合間の会話（Responses API）。lib/ai/agent.ts のパターン照合と入れ替えた */
  chat: "gpt-5.6-luna",

  /** パーソナルの意味検索。Matryoshka で EMBEDDING_DIMENSIONS まで切り詰めて使う */
  embedding: "gemini-embedding-001",
} as const;

/**
 * 埋め込みの次元。
 *
 * **`search_chunks.embedding` の `vector(N)` と必ず一致させること。**
 * ずれると挿入時に落ちる（無音にはならない）。
 *
 * 1536 なのはモデルの都合ではなく、走査するバイト数の都合。
 * 3072 次元のモデル（text-embedding-3-large、gemini-embedding-001 の既定）を
 * Matryoshka でここへ切り詰めている（outputDimensionality / dimensions）。
 * 先頭を切り出すだけなので精度の劣化はわずかで、代わりに 1 行が halfvec で
 * 3KB に収まり、6.6 万行の全走査が数十ミリ秒で終わる。
 *
 * 当初は「HNSW が 2000 次元までだから」と書いていたが、**索引を張らないことに
 * したのでその制約は効かない**（張るとしても halfvec は 4000 次元まで張れる）。
 * 索引を張らない理由は supabase/migrations の search_customers の回に書いてある。
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * 埋め込みの用途。**document と query で別の値を使う。**
 *
 * 実装が 2 箇所に分かれる（バックフィルは app/api/cron/embed、問い合わせ側は
 * エージェントの検索ツール）ので、片方だけ直すと**無音で精度が落ちる**。
 * 定数をここに置いて、両方が同じものを見るようにする。
 */
export const EMBEDDING_TASK_TYPES = {
  /** search_chunks に入れる側 */
  document: "RETRIEVAL_DOCUMENT",
  /** 「アウトドア系が好きな人」の側 */
  query: "RETRIEVAL_QUERY",
} as const;
