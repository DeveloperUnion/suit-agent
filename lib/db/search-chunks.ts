import { workerPool } from "@/lib/db/worker";
import { chunkContent, embedTexts, toVectorLiteral } from "@/lib/ai/embed";
import { MODELS } from "@/lib/ai/models";

/**
 * 事実を埋め込んで search_chunks へ入れる。
 *
 * **キューを別に持たない。**未処理の集合は
 * `customer_facts left join search_chunks が null` がそのまま担う。
 * キューテーブルを置くと「キューに入れ忘れた事実」という無音の失敗が生まれるが、
 * 外部結合なら**事実が存在する限り必ず拾われる**。
 *
 * 埋め込みは二重に走る。書き込み直後の fire-and-forget（/api/embed）と、
 * Cron のバックフィル（/api/cron/embed）。片方だけだと
 * 「その顧客だけ検索に出てこない」が無音で起きる。
 */

/** 1 回の API 呼び出しに載せる数。落ちたときの巻き戻しを小さく保つ */
const BATCH = 50;

type FactRow = {
  fact_id: string;
  customer_id: string;
  label: string | null;
  body: string;
};

const SELECT_FACTS = `
  select f.id as fact_id, f.customer_id, l.name as label, f.body
    from public.customer_facts f
    left join public.fact_labels l on l.id = f.label_id
`;

/** まだ埋め込まれていない事実。無効化されたものは索引の対象外 */
export async function pendingFacts(limit: number): Promise<FactRow[]> {
  const { rows } = await workerPool().query<FactRow>(
    `${SELECT_FACTS}
     left join public.search_chunks ch on ch.fact_id = f.id
      where f.invalidated_at is null
        and (ch.fact_id is null or ch.embedding is null or ch.embedding_model is distinct from $1)
      order by f.created_at
      limit $2`,
    [MODELS.embedding, limit],
  );
  return rows;
}

export async function pendingCount(): Promise<number> {
  const { rows } = await workerPool().query<{ n: string }>(
    `select count(*) as n
       from public.customer_facts f
       left join public.search_chunks ch on ch.fact_id = f.id
      where f.invalidated_at is null
        and (ch.fact_id is null or ch.embedding is null or ch.embedding_model is distinct from $1)`,
    [MODELS.embedding],
  );
  return Number(rows[0]?.n ?? 0);
}

async function factsByIds(ids: string[]): Promise<FactRow[]> {
  const { rows } = await workerPool().query<FactRow>(
    `${SELECT_FACTS} where f.id = any($1::uuid[]) and f.invalidated_at is null`,
    [ids],
  );
  return rows;
}

/**
 * 渡した事実を埋め込んで入れる。戻り値は実際に書けた数。
 *
 * モデル名を行に持たせる。**混在したまま検索してはいけない**（ベクトル空間が
 * 違うので距離が意味を成さない）ので、替えたときに全行を引き直せる目印が要る。
 */
async function embedRows(rows: FactRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const vectors = await embedTexts(
    rows.map((r) => chunkContent(r.label, r.body)),
    "document",
  );

  const client = await workerPool().connect();
  try {
    await client.query("begin");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `insert into public.search_chunks
           (fact_id, customer_id, content, embedding, embedding_model, embedded_at)
         values ($1, $2, $3, $4::extensions.halfvec, $5, now())
         on conflict (fact_id) do update
           set content = excluded.content,
               embedding = excluded.embedding,
               embedding_model = excluded.embedding_model,
               embedded_at = excluded.embedded_at`,
        [
          r.fact_id,
          r.customer_id,
          chunkContent(r.label, r.body),
          toVectorLiteral(vectors[i]),
          MODELS.embedding,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return rows.length;
}

/** 指定した事実だけ。書き込み直後の fire-and-forget から呼ぶ */
export async function embedFacts(factIds: string[]): Promise<number> {
  const unique = [...new Set(factIds)].slice(0, BATCH);
  return embedRows(await factsByIds(unique));
}

/**
 * 未処理をまとめて。Cron から呼ぶ。
 *
 * 1 回の起動で全部やろうとしない。初期投入は 6.6 万行あり、関数の実行時間に
 * 収まらない。**残りは次の起動が拾う**（キューが `left join` なので、
 * 途中で落ちても取りこぼしにならない）。
 */
export async function backfillChunks(maxBatches: number): Promise<number> {
  let done = 0;
  for (let i = 0; i < maxBatches; i++) {
    const rows = await pendingFacts(BATCH);
    if (rows.length === 0) break;
    done += await embedRows(rows);
  }
  return done;
}
