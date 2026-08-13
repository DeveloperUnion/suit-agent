import { Pool } from "pg";

/**
 * search_chunks へ書き込むための接続。
 *
 * このアプリで supabase-js を使わない唯一の場所。理由は 1 つで、
 * **search_chunks はアプリから 1 行も書けない**ように作ってあるから
 * （authenticated には権限ごと与えていない）。書けるのは worker_role だけで、
 * PostgREST 経由ではそのロールになれない。
 *
 * worker_role に BYPASSRLS は無い。越境できるのは facts の migration で
 * 明示的に書いたポリシーの範囲だけ:
 *   - search_chunks の読み書き
 *   - 埋め込む本文を組み立てるための customer_facts / fact_labels の select
 * 顧客の連絡先も注文も採寸も、このロールからは 1 行も見えない。
 *
 * 接続文字列は Session pooler（ポート 5432）を使う。直結ホスト
 * db.<ref>.supabase.co は IPv6 専用で、Vercel からは届かない。
 * Transaction pooler（6543）は使わない。
 */

let pool: Pool | null = null;

export class WorkerDbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkerDbError";
  }
}

/**
 * Pool はモジュールに保持する。Fluid Compute は同じインスタンスで複数の
 * リクエストを扱うので、毎回張り直すと接続の枯渇のほうが早く来る。
 *
 * 利用者のトークンを載せる supabase クライアント（lib/supabase/server.ts）を
 * モジュールに置いてはいけないのと逆で、こちらは**誰のリクエストでも同じロール**
 * なので使い回してよい。
 */
export function workerPool(): Pool {
  const url = process.env.WORKER_DATABASE_URL;
  if (!url) {
    throw new WorkerDbError("WORKER_DATABASE_URL が設定されていません。", 500);
  }
  pool ??= new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}
