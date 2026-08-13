import { backfillChunks, pendingCount } from "@/lib/db/search-chunks";

/**
 * 埋め込みのバックフィル。
 *
 * 拾うのは「まだ埋め込まれていない事実」で、その集合は
 * `customer_facts left join search_chunks` が null のところ。**キューを持たない。**
 * キューテーブルを置くと「入れ忘れた事実」という無音の失敗が生まれるが、
 * 外部結合なら事実が存在する限り必ず拾われる。
 *
 * 1 回の起動で全部やろうとしない。初期投入は 6.6 万行あって実行時間に収まらない。
 * 残りは次の起動が拾う。
 *
 * 認証は CRON_SECRET。Vercel の Cron は Authorization: Bearer <CRON_SECRET> を
 * 付けて呼ぶ。**これが無いと、埋め込み（＝課金）を誰でも走らせられる。**
 */

export const maxDuration = 300;

/** 1 起動あたり 50 × 20 = 1,000 事実まで */
const MAX_BATCHES = 20;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ message: "CRON_SECRET が設定されていません。" }, { status: 500 });
  }
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return Response.json({ message: "許可されていません。" }, { status: 401 });
  }

  try {
    const embedded = await backfillChunks(MAX_BATCHES);
    // 残りを返す。0 に落ち着かないまま何日も続くなら、どこかで失敗し続けている。
    return Response.json({ embedded, remaining: await pendingCount() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "埋め込みに失敗しました。";
    return Response.json({ message }, { status: 500 });
  }
}
