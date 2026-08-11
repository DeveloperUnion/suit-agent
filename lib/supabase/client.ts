"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase への接続。
 *
 * ブラウザから直接叩く。境界は DB が持つ（RLS）ので、間にサーバー層を
 * 挟む必要がない。lib/store/mock-db.ts が約束していた
 * 「DB を入れるときは lib/data/* の中身を差し替えれば済む」が
 * そのまま守れるのはこのため。
 *
 * サーバー側は API キーを隠す用途だけに置く（app/api/extract/* の Gemini、
 * のちのエージェントと埋め込みバックフィル）。
 *
 * service_role キーはここでも Vercel の環境変数でも使わない。
 * BYPASSRLS 相当なので、置いた瞬間に「RLS が天井」という前提が
 * どこか 1 行のインポートで消える。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が要ります。" +
      "ローカルは `supabase start` の出力を .env.local に入れてください。",
  );
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(url!, anonKey!, {
    auth: {
      // セッションは端末に残す。既定でリフレッシュトークンは無期限・ローテーション
      // なので、開くたびに延命されて実質切れない。
      // 例外は iOS の ITP（7 日間まったく開かないと localStorage が消える）で、
      // 毎日の業務利用では起きず、長期休暇明けに 1 度出るだけ。
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
