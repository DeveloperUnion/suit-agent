import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー側（Route Handler）から Supabase を触るときの接続。
 *
 * ブラウザ用の lib/supabase/client.ts は "use client" 付きのシングルトンなので、
 * サーバーからは読めない。こちらは**リクエストごとに 1 つ作る**。
 *
 * 境界はブラウザから来たときと 1 ミリも変わらない。利用者のアクセストークンを
 * そのまま Authorization に載せるので、PostgREST から見れば
 * 接続ロールは authenticated、auth.uid() は本人、つまり RLS が同じように効く。
 * **サーバーを通したことで見える範囲が広がる経路を作らない**、が唯一の要件。
 *
 * service_role キーはここでも使わない。BYPASSRLS 相当なので、置いた瞬間に
 * 「RLS が天井」という前提がどこか 1 行のインポートで消える。
 *
 * モジュールグローバルに保持しない。Vercel の Fluid Compute は同じインスタンスで
 * 複数のリクエストを扱うので、クライアントを使い回すと**別の利用者のトークンで
 * 引いてしまう**（RLS を迂回するのではなく、他人になりきる形の事故）。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function serverSupabase(accessToken: string): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が要ります。");
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    // サーバーには localStorage が無く、リフレッシュトークンも渡していない。
    // 渡されたトークンだけで 1 リクエストを完結させる。
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
