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
 * ローカルの DB と dev-seed が前提。**本番には向けられない** — サインインが
 * Mailpit からメールを拾う作りで、本番にその口が無いため。
 *
 * トークンは**人と同じ経路**で取る —
 * Magic Link を要求し、Mailpit に届いたメールからリンクの token_hash を拾って
 * verify する。JWT を自作しないのは、ローカルの GoTrue が ES256 で署名して
 * いるからで、HS256 で作ったものは getClaims に弾かれる。ついでに
 * 「staff に行があるメールしか通らない」という門番そのものの検査になる。
 */

import { readFileSync } from "node:fs";

type Expectation = {
  /**
   * 期待する提案の種類。null は「提案を作らない」。
   *
   * **配列で書くと「どれでもよい」。**相手が決まらないターンの正解は 1 つに
   * 絞れない（選択肢を出して聞き返しても、返答で名前を聞き直しても正しい）。
   * 絞れないものを絞ると、正しい答えを失敗として数えることになる。
   */
  kind: string | null | (string | null)[];
  /** 件数まで見る。**数が合っていることが検索の存在理由**なので、種類だけでは足りない */
  exactCount?: number;
  customer?: string;
  labels?: string[];
  field?: string;
  status?: string;

  /**
   * 出典が付いたか。**記録から答えたのに出典が無い**のと、
   * **言い換えたのに出典を付けた**のは、どちらも別の壊れ方をする。
   *
   * サーバは本文中の [[factId]] を、そのターンに実際に返した記録の id と
   * 突き合わせて、無いものを捨てている。つまり true は
   * 「実在する行から答えた」と同義になる。
   */
  citation?: boolean;
  /** 聞き返しの選択肢の数。「2 人から選ばせる」が「3 人並べる」に化けたら落とす */
  options?: number;
  /** 検索結果に必ず入る人。**件数だけだと「正しい数の別人」が素通りする** */
  includes?: string[];
  /** 無効化の対象。facts[].label に入っているべき語 */
  factOf?: string;
  /**
   * そのターンの相手（subjectCustomerId）。氏名で書く。
   *
   * **null は「相手が決まらない」ことの検査。**検索や、同姓が 2 人出た聞き返しの
   * あとは足跡が切れるのが正しい。未指定（キーごと書かない）とは区別する。
   */
  subject?: string | null;
};
type Turn = { utterance: string; expect: Expectation };
type Case = {
  id: string;
  /** 1 発話のケース */
  utterance?: string;
  expect?: Expectation;
  /**
   * 続けて話すケース。**単発だけ見ていると宛先の取り違えが再現しない** —
   * 「古賀さんは…」→「あと出張も多いって」のように、名前の無い続きで起きる。
   */
  turns?: Turn[];
  /** 「開いているカルテ」と「直前に話していた相手」。氏名で書き、実行時に id へ直す */
  context?: { open?: string; recent?: string };
};

/**
 * 判定の分類。合計ではなく、この内訳を見る。
 *
 * **error を match に混ぜない。**混ぜると、鍵が切れて全部落ちている状態で
 * 「否定ケースは全部 ✓」という嘘の合格が出る（実際に一度出した）。
 */
type Verdict =
  | "match"
  | "mismatch"
  | "omission"
  | "hallucination"
  | "over_ask"
  /** 提案は合っているのに、返答文が食い違っている */
  | "reply_drift"
  /** 種類は合っているのに件数が違う。「両方」に和集合を返す類 */
  | "wrong_count"
  /** そのターンの相手が違う。**次のターンの宛先になる値**なので、ここのずれは伝播する */
  | "wrong_subject"
  | "error";

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

type DoneEvent = {
  type: string;
  message?: string;
  reply?: string;
  action?: Record<string, unknown>;
  /** そのターンが誰の話だったか。次のターンの「直前の相手」になる */
  subjectCustomerId?: string | null;
  /** 本文の [[factId]] のうち、サーバが実在する記録と突き合わせて残したもの */
  citations?: { id: string }[];
};

/**
 * SSE から done を取り出す。途中の tool イベントは eval では使わない。
 *
 * TextDecoderStream を挟まずに自分でデコードするのは、Node の型と DOM の型で
 * ReadableStream の噛み合いが違い、キャストで誤魔化すことになるため。
 */
async function readStream(body: ReadableStream<Uint8Array>): Promise<DoneEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: DoneEvent | undefined;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const event = JSON.parse(line.slice(5).trim()) as DoneEvent;
      if (event.type === "error") throw new Error(event.message ?? "応答を作れませんでした。");
      if (event.type === "done") done = event;
    }
  }
  if (!done) throw new Error("応答が途中で切れました。");
  return done;
}

function judge(
  expect: Expectation,
  action: Record<string, unknown> | undefined,
  reply: string,
  citations: { id: string }[],
): Verdict {
  // **出典は提案の有無と無関係に見る。**提案を出さずに答えるターン
  // （「どんな人だっけ」）こそ、記録から答えているかが問われる。
  if (expect.citation !== undefined && expect.citation !== (citations.length > 0)) {
    return "mismatch";
  }
  const got = (action?.kind as string | undefined) ?? null;
  if (Array.isArray(expect.kind)) {
    // 「どれでもよい」。外したときだけ、提案を作ったかどうかで呼び分ける
    if (expect.kind.includes(got)) return "match";
    return got === null ? "omission" : "hallucination";
  }
  if (expect.kind === null) {
    if (got === null) return "match";
    // 聞き返しは捏造とは別。無いものを作ったのではなく、答えられないことを
    // 聞き返して**できるふりをした**という失敗で、直し方も違う
    return got === "ask" ? "over_ask" : "hallucination";
  }
  if (got === null) return "omission";
  if (got !== expect.kind) return "mismatch";

  // 聞き返しの選択肢。**「誰かを選ばせる」形になっているかは数で決まる。**
  // 2 人から選ばせるはずが 3 人並んだら、候補の絞り込みが効いていない。
  if (expect.options !== undefined) {
    const options = (action?.options ?? []) as unknown[];
    if (options.length !== expect.options) return "wrong_count";
  }

  const customer = (action?.customer as { name?: string } | undefined)?.name;
  if (expect.customer && customer !== expect.customer) return "mismatch";
  if (expect.status && action?.status !== expect.status) return "mismatch";
  if (expect.exactCount !== undefined && action?.exactCount !== expect.exactCount) {
    return "wrong_count";
  }
  if (expect.field) {
    const changes = (action?.changes ?? []) as { field: string }[];
    if (!changes.some((c) => c.field === expect.field)) return "mismatch";
  }
  if (expect.labels) {
    const labels = (action?.labelNames ?? []) as string[];
    if (!expect.labels.every((l) => labels.includes(l))) return "mismatch";
  }
  // **検索結果の顔ぶれ。**件数だけを見ていると「正しい数の別人」が素通りする
  // （除外の条件を取り違えても、数だけは合うことがある）。
  if (expect.includes) {
    const names = ((action?.customers ?? []) as { name?: string }[]).map((c) => c.name);
    if (!expect.includes.every((n) => names.includes(n))) return "mismatch";
  }
  // 無効化の対象。id ではなく語で書く（id は実行のたびに変わる）
  if (expect.factOf) {
    const facts = (action?.facts ?? []) as { label?: string; body?: string }[];
    const hit = facts.some((f) => f.label === expect.factOf || f.body?.includes(expect.factOf!));
    if (!hit) return "mismatch";
  }

  // **返答文も見る。**構造だけ見ていると、カードは正しいのに「別人の名前を言う」が
  // 素通りする（実際にそれが最初の不具合だった）。いまは返答文をコードが action から
  // 作っているので、名前が一致しないなら、その仕組みが壊れている。
  if (expect.customer && customer && !reply.includes(expect.customer)) return "reply_drift";

  return "match";
}

async function main() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY が要ります（.env.local を読ませてください）。");
    process.exit(1);
  }
  const token = await signIn(anonKey);

  /** 氏名 → id。会話と同じ RPC を使うので、名寄せの挙動もここで一度通る */
  const idCache = new Map<string, string>();
  const idOf = async (name: string): Promise<string | undefined> => {
    if (!idCache.has(name)) {
      const hits = await json<{ id: string; name: string }[]>(
        `${SUPABASE}/rest/v1/rpc/find_customers_by_name`,
        {
          method: "POST",
          headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_query: name }),
        },
      );
      const hit = hits.find((h) => h.name === name) ?? hits[0];
      if (hit) idCache.set(name, hit.id);
    }
    return idCache.get(name);
  };

  const all = JSON.parse(
    readFileSync(new URL("../lib/ai/eval/cases.json", import.meta.url), "utf8"),
  ) as Case[];
  // 直したケースだけ回せるようにしておく（`npm run eval -- invalidate`）。
  // 全件を毎回流すと数分かかり、1 件直すたびに全部を待つことになる。
  // id の接頭辞が束になっている（fact- / subject- / cite- / neg- …）
  const only = process.argv[2];
  const cases = only ? all.filter((c) => c.id.includes(only)) : all;
  if (cases.length === 0) {
    console.error(`「${only}」に当たるケースがありません。`);
    process.exit(1);
  }

  // **先に、期待している顧客が実在するか確かめる。**
  //
  // dev-seed は lib/mock/seed.ts から生成されるので、作り直されると氏名が
  // 総入れ替えになる。実際に一度、main 側の変更で 7 名中 6 名が消えた状態で
  // eval を回し、**モデルが劣化したように見える結果**が出た。
  // ここで落としておけば「seed が変わった」と「精度が落ちた」を取り違えない。
  const wanted = [
    ...new Set(
      cases.flatMap((c) =>
        [
          c.expect?.customer,
          c.expect?.subject,
          ...(c.expect?.includes ?? []),
          ...(c.turns ?? []).map((t) => t.expect.customer),
          ...(c.turns ?? []).map((t) => t.expect.subject),
          ...(c.turns ?? []).flatMap((t) => t.expect.includes ?? []),
          c.context?.open,
          c.context?.recent,
        ].filter(Boolean),
      ),
    ),
  ] as string[];
  const missing: string[] = [];
  for (const name of wanted) if (!(await idOf(name))) missing.push(name);
  if (missing.length > 0) {
    console.error(
      `dev-seed にいない顧客が cases.json にあります: ${missing.join("、")}\n` +
        "npm run db:reset を流し直すか、いまの seed に合わせて cases.json を直してください。",
    );
    process.exit(1);
  }

  type Row = { id: string; verdict: Verdict; got: string; ms: number; reply: string };

  /**
   * 1 件のケースを最後まで回す。
   *
   * **ケース同士は独立している。**提案は誰も適用しないので DB は 1 行も動かず、
   * 会話の履歴もケースの中で閉じている。だから並べても壊れない。
   */
  const runCase = async (c: Case): Promise<Row> => {
    const startedAt = Date.now();
    const turns: Turn[] = c.turns ?? [{ utterance: c.utterance!, expect: c.expect! }];
    // 会話は積み上げる。宛先の引き継ぎは、履歴と「直前の相手」が揃って初めて再現する
    const history: { role: "user" | "assistant"; body: string }[] = [];
    let recent: string | undefined = c.context?.recent ? await idOf(c.context.recent) : undefined;
    let verdict: Verdict = "match";
    let got = "—";
    let reply = "";

    for (const turn of turns) {
      let action: Record<string, unknown> | undefined;
      let subject: string | null = null;
      let citations: { id: string }[] = [];
      try {
        const res = await fetch(`${BASE}/api/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            text: turn.utterance,
            history,
            contextCustomerId: c.context?.open ? await idOf(c.context.open) : null,
            recentCustomerId: recent ?? null,
          }),
        });
        if (!res.ok || !res.body) {
          const detail = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(detail.message ?? `HTTP ${res.status}`);
        }
        const done = await readStream(res.body);
        action = done.action;
        reply = done.reply ?? "";
        subject = (done.subjectCustomerId as string | null | undefined) ?? null;
        citations = done.citations ?? [];
      } catch (error) {
        verdict = "error";
        reply = `エラー: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }

      got = (action?.kind as string | undefined) ?? "—";
      const v = judge(turn.expect, action, reply, citations);
      if (v !== "match") {
        verdict = v;
        break;
      }
      // **そのターンの相手。**judge() の中では見られない — 氏名から id を引くのに
      // await が要るため。`subject: null`（相手が決まらないのが正解）と、
      // キーごと書いていない（見ない）を区別する。
      if ("subject" in turn.expect) {
        const want = turn.expect.subject ? ((await idOf(turn.expect.subject)) ?? null) : null;
        if (subject !== want) {
          verdict = "wrong_subject";
          break;
        }
      }
      // 「直前の相手」の引き継ぎ方は画面と揃える（lib/ai/agent.ts の lastCustomerId）。
      // サーバが決めた相手をそのまま使い、決まらなかったターンで足跡は切れる
      if (subject) recent = subject;
      else if (action) recent = undefined;
      history.push({ role: "user", body: turn.utterance }, { role: "assistant", body: reply });
    }

    process.stdout.write(".");
    return {
      id: c.id,
      verdict,
      got,
      ms: Date.now() - startedAt,
      reply: reply.replace(/\s+/g, " ").slice(0, 60),
    };
  };

  /*
   * 同時に走らせる本数。
   *
   * 直列だと 134 件 × 多ターンで 1 回 15 分かかり、**1 行直して回すができない**。
   * 4 本にすると 4 分前後に落ちる。
   *
   * レート制限に当たったら EVAL_CONCURRENCY=1 で直列に戻せる。
   * 上げすぎないこと — 429 は「落ちた」に数えられるので、**モデルの劣化と
   * 見分けが付かない結果**になる。
   */
  const concurrency = Math.max(1, Number(process.env.EVAL_CONCURRENCY ?? 4));
  const rows: Row[] = new Array(cases.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= cases.length) return;
        // 添字で書き戻す。並べても**出力の順序は cases.json のまま**にする
        rows[index] = await runCase(cases[index]);
      }
    }),
  );
  process.stdout.write("\n\n");

  const mark: Record<Verdict, string> = {
    match: "✓",
    mismatch: "✗ 取り違え",
    omission: "✗ 出さなかった",
    hallucination: "✗ 出しすぎ",
    over_ask: "✗ 聞きすぎ",
    reply_drift: "✗ 文言ずれ",
    wrong_count: "✗ 件数ちがい",
    wrong_subject: "✗ 宛先ちがい",
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
  console.log(`聞きすぎ      ${count("over_ask")}   ← 聞き返せば済むと思っている`);
  console.log(`文言ずれ      ${count("reply_drift")}   ← カードと返答が別のことを言う`);
  console.log(`件数ちがい    ${count("wrong_count")}   ← 種類は合っているのに数が違う`);
  // ここがずれると、**次のターンの宛先まで連れていかれる**
  console.log(`宛先ちがい    ${count("wrong_subject")}   ← そのターンの相手が違う`);
  console.log(`落ちた        ${count("error")}`);
  const p50 = [...rows].sort((a, b) => a.ms - b.ms)[Math.floor(rows.length / 2)]?.ms;
  console.log(`所要 中央値   ${p50}ms`);
}

void main();
