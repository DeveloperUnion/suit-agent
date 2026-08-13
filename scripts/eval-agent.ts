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
 * ローカルの DB と dev-seed が前提。トークンは**人と同じ経路**で取る —
 * Magic Link を要求し、Mailpit に届いたメールからリンクの token_hash を拾って
 * verify する。JWT を自作しないのは、ローカルの GoTrue が ES256 で署名して
 * いるからで、HS256 で作ったものは getClaims に弾かれる。ついでに
 * 「staff に行があるメールしか通らない」という門番そのものの検査になる。
 */

import { readFileSync } from "node:fs";

type Expectation = {
  kind: string | null;
  customer?: string;
  labels?: string[];
  field?: string;
  status?: string;
};
type Case = { id: string; utterance: string; expect: Expectation };

/**
 * 判定の分類。合計ではなく、この内訳を見る。
 *
 * **error を match に混ぜない。**混ぜると、鍵が切れて全部落ちている状態で
 * 「否定ケースは全部 ✓」という嘘の合格が出る（実際に一度出した）。
 */
type Verdict = "match" | "mismatch" | "omission" | "hallucination" | "error";

const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const MAILPIT = process.env.EVAL_MAILPIT_URL ?? "http://127.0.0.1:54324";
/** dev-seed の管理者。担当顧客がいる人なら誰でもよい */
const STAFF_EMAIL = process.env.EVAL_STAFF_EMAIL ?? "hosokawa@example.com";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return (await res.json()) as T;
}

/**
 * 人と同じ経路でサインインする。
 * Magic Link を要求 → Mailpit で受け取る → リンクの token_hash で verify。
 */
async function signIn(anonKey: string): Promise<string> {
  const headers = { apikey: anonKey, "Content-Type": "application/json" };
  const latest = async () =>
    (await json<{ messages: { ID: string }[] }>(`${MAILPIT}/api/v1/messages?limit=1`)).messages[0]
      ?.ID;

  const before = await latest();
  await fetch(`${SUPABASE}/auth/v1/otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: STAFF_EMAIL, create_user: false }),
  });

  let id: string | undefined;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 400));
    id = await latest();
    if (id && id !== before) break;
  }
  if (!id || id === before) throw new Error(`Mailpit にメールが届きません（${MAILPIT}）`);

  const mail = await json<{ Text?: string }>(`${MAILPIT}/api/v1/message/${id}`);
  const tokenHash = /token=([0-9a-f]+)/.exec(mail.Text ?? "")?.[1];
  if (!tokenHash) throw new Error("メールからトークンを取り出せません");

  const verified = await json<{ access_token?: string; msg?: string }>(
    `${SUPABASE}/auth/v1/verify`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
    },
  );
  if (!verified.access_token) throw new Error(`サインインできません: ${verified.msg}`);
  return verified.access_token;
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
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY が要ります（.env.local を読ませてください）。");
    process.exit(1);
  }
  const token = await signIn(anonKey);

  const cases = JSON.parse(
    readFileSync(new URL("../lib/ai/eval/cases.json", import.meta.url), "utf8"),
  ) as Case[];

  const rows: { id: string; verdict: Verdict; got: string; ms: number; reply: string }[] = [];

  for (const c of cases) {
    const startedAt = Date.now();
    let action: Record<string, unknown> | undefined;
    let reply = "";
    let failed = false;
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
      failed = true;
      reply = `エラー: ${error instanceof Error ? error.message : String(error)}`;
    }

    rows.push({
      id: c.id,
      // 落ちたものを判定に混ぜない。混ぜると、全部落ちている状態で
      // 「否定ケースは全部 ✓」という嘘の合格が出る
      verdict: failed ? "error" : judge(c.expect, action),
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
    error: "! 落ちた",
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
  console.log(`落ちた        ${count("error")}`);
  const p50 = [...rows].sort((a, b) => a.ms - b.ms)[Math.floor(rows.length / 2)]?.ms;
  console.log(`所要 中央値   ${p50}ms`);
}

void main();
