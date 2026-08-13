import { errorResponse, requireStaff } from "@/lib/api/auth";
import { embedFacts } from "@/lib/db/search-chunks";

/**
 * 書き込んだ直後に、その事実だけ埋め込む。
 *
 * Cron のバックフィルと**二重**にしてある。片方だけだと
 * 「その顧客だけ検索に出てこない」が無音で起きるため。こちらが落ちても
 * 次の Cron が拾うので、呼び出し側は結果を待たない（fire-and-forget）。
 *
 * 返すのは件数だけ。事実の中身は 1 文字も返さない — worker_role は RLS を
 * 越えて事実を読めるので、ここから内容が漏れる形にしてはいけない。
 * 他人の事実 ID を渡されても、起きるのは「その事実が埋め込まれる」だけで、
 * それは Cron がどのみちやること。
 */

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireStaff(request);

    const body = (await request.json()) as { factIds?: unknown };
    const factIds = Array.isArray(body.factIds)
      ? body.factIds.filter((v): v is string => typeof v === "string")
      : [];
    if (factIds.length === 0) {
      return Response.json({ message: "factIds が空です。" }, { status: 400 });
    }

    return Response.json({ embedded: await embedFacts(factIds) });
  } catch (error) {
    return errorResponse(error);
  }
}
