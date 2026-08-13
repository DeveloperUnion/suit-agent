/**
 * アシスタントの回帰テスト。
 *
 *   npm run eval
 *
 * プロンプトかモデルを触る前後で回し、**前回との差**を見る。絶対的な合格点は
 * 置かない（腐るので）。単一のスコアも出さない — 集計が 0.94 でも
 * 「電話番号だけ 2 割捏造」を隠せる。
 *
 * **CI には入れない。**実 API を叩くので鍵と課金と非決定性を持ち込むことになり、
 * 1 ヶ月で無効化される。無効化された門は、門が無いより悪い。
 *
 * ローカルの DB と dev-seed が前提。手元でサインインしなくてよいように、
 * ローカルの JWT_SECRET でトークンを 1 枚作る（`supabase status -o env` の値）。
 * 本番の鍵ではこれは動かないし、動かす必要も無い。
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

type Expectation = {
  kind: string | null;
  customer?: string;
  labels?: string[];
  field?: string;
  status?: string;
};
type Case = { id: string; utterance: string; expect: Expectation };

/** 判定の 4 分類。合計ではなく、この内訳を見る */
type Verdict = "match" | "mismatch" | "omission" | "hallucination";

const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
/** dev-seed の管理者。担当顧客がいる人なら誰でもよい */
const STAFF_EMAIL = process.env.EVAL_STAFF_EMAIL ?? "hosokawa@example.com";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** ローカルの JWT_SECRET で HS256 のトークンを作る */
function mintToken(secret: string, sub: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      sub,
      aud: "authenticated",
      role: "authenticated",
      iat: now,
      exp: now + 3600,
      session_id: "00000000-0000-4000-8000-000000000000",
      aal: "aal1",
      iss: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"}/auth/v1`,
    }),
  );
  const signature = base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

function psql(sql: string): string {
  const url = process.env.EVAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  return execSync(`psql "${url}" -At -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
    env: { ...process.env, PATH: `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}` },
  }).trim();
}

function judge(expect: Expectation, action: Record<string, unknown> | undefined): Verdict {
  const got = (action?.kind as string | undefined) ?? null;
  if (expect.kind === null) return got === null ? "match" : "hallucination";
  if (got === null) return "omission";
  if (got !== expect.kind) return "mismatch";

  const customer = (action?.customer as { name?: string } | undefined)?.name;
  if (expect.customer && customer !== expect.customer) return "mismatch";
  if (expect.status && action?.status !== expect.status) return "mismatch";
  if (expect.field) {
    const changes = (action?.changes ?? []) as { field: string }[];
    if (!changes.some((c) => c.field === expect.field)) return "mismatch";
  }
  if (expect.labels) {
    const labels = (action?.labelNames ?? []) as string[];
    if (!expect.labels.every((l) => labels.includes(l))) return "mismatch";
  }
  return "match";
}

async function main() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.error(
      "SUPABASE_JWT_SECRET が要ります。`supabase status -o env` の JWT_SECRET を渡してください。",
    );
    process.exit(1);
  }

  const authUserId = psql(
    `select auth_user_id from public.staff where email = '${STAFF_EMAIL}'`,
  );
  if (!authUserId) {
    console.error(`${STAFF_EMAIL} が staff にいません。npm run db:reset を先に。`);
    process.exit(1);
  }
  const token = mintToken(secret, authUserId);

  const cases = JSON.parse(
    readFileSync(new URL("../lib/ai/eval/cases.json", import.meta.url), "utf8"),
  ) as Case[];

  const rows: { id: string; verdict: Verdict; got: string; ms: number; reply: string }[] = [];

  for (const c of cases) {
    const startedAt = Date.now();
    let action: Record<string, unknown> | undefined;
    let reply = "";
    try {
      const res = await fetch(`${BASE}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: c.utterance, history: [] }),
      });
      const json = (await res.json()) as {
        reply?: string;
        action?: Record<string, unknown>;
        message?: string;
      };
      if (!res.ok) throw new Error(json.message ?? `HTTP ${res.status}`);
      action = json.action;
      reply = json.reply ?? "";
    } catch (error) {
      reply = `エラー: ${error instanceof Error ? error.message : String(error)}`;
    }

    rows.push({
      id: c.id,
      verdict: judge(c.expect, action),
      got: (action?.kind as string | undefined) ?? "—",
      ms: Date.now() - startedAt,
      reply: reply.replace(/\s+/g, " ").slice(0, 60),
    });
    process.stdout.write(".");
  }
  process.stdout.write("\n\n");

  const mark: Record<Verdict, string> = {
    match: "✓",
    mismatch: "✗ 取り違え",
    omission: "✗ 出さなかった",
    hallucination: "✗ 出しすぎ",
  };
  for (const r of rows) {
    console.log(`${mark[r.verdict].padEnd(14)} ${r.id.padEnd(26)} ${r.got.padEnd(18)} ${r.ms}ms`);
    if (r.verdict !== "match") console.log(`${" ".repeat(16)}${r.reply}`);
  }

  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  console.log("\n── 内訳 ──");
  console.log(`一致          ${count("match")} / ${rows.length}`);
  console.log(`取り違え      ${count("mismatch")}`);
  console.log(`出さなかった  ${count("omission")}`);
  // ここが 0 でないまま出さない。**捏造だけは頻度の問題ではない。**
  console.log(`出しすぎ      ${count("hallucination")}   ← 0 であること`);
  const p50 = [...rows].sort((a, b) => a.ms - b.ms)[Math.floor(rows.length / 2)]?.ms;
  console.log(`所要 中央値   ${p50}ms`);
}

void main();
