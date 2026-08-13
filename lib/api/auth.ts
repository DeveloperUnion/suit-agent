import type { SupabaseClient } from "@supabase/supabase-js";

import { serverSupabase } from "@/lib/supabase/server";

/**
 * Route Handler の入口の門番。
 *
 * このアプリのサーバー側は「API キーを隠すため」だけに在る。裏を返すと、
 * **認証を付け忘れたエンドポイントは、その API キーを世界中に配る口**になる。
 * 読み取り（Gemini）なら他人の課金で終わるが、会話（LLM）は任意のプロンプトを
 * 通す中継になるので、置いた瞬間に塞いでおくこと。
 *
 * 確かめるのはトークンの正しさだけで、行の境界は確かめない。境界は RLS が持って
 * いて、ここで staff_id を見ても二重化にしかならない（そして二重化した側は必ず
 * ずれる）。**退職者のトークンでも 401 にはならない**が、DB へ触った時点で
 * app.current_staff_id() が NULL になり 0 行に倒れる。残るのは
 * 「失効までの最大 1 時間、読み取りの API を叩ける」だけ。
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Caller = {
  /** 利用者のトークンを載せた Supabase。RLS はブラウザから叩いたときと同じに効く */
  supabase: SupabaseClient;
  /** auth.users.id。staff.id ではない */
  userId: string;
};

export async function requireStaff(request: Request): Promise<Caller> {
  const header = request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  if (!token) throw new ApiError("サインインが必要です。", 401);

  const supabase = serverSupabase(token);

  // **必ずトークンを引数で渡すこと。**引数なしで呼ぶと先にセッションを見に行き、
  // サーバーにはセッションが無いので検証せず { data: null, error: null } で
  // 静かに抜ける（＝誰でも通る門になる）。
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new ApiError("サインインが必要です。", 401);
  }

  return { supabase, userId: data.claims.sub };
}

/** ApiError を Response に落とす。想定外の例外は 500 に畳む */
export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return Response.json({ message }, { status: 500 });
}
