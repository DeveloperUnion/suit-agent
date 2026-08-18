import type { ResponseInput } from "openai/resources/responses/responses";

import type {
  AgentAction,
  AgentCustomerRef,
  CustomerFieldKey,
  SubjectOrigin,
} from "@/lib/types";
import { actionSentence } from "@/lib/ai/action-sentence";
import { AgentError, runTurn } from "@/lib/ai/agent-loop";
import { AGENT_TOOLS } from "@/lib/ai/agent-schema";
import { MODELS } from "@/lib/ai/models";
import { contextLine, systemPrompt } from "@/lib/ai/prompt";
import { mentionsName } from "@/lib/ai/spoken-name";
import { errorResponse, requireStaff, type Caller } from "@/lib/api/auth";
import {
  factVocabulary,
  findCustomer,
  getCustomer,
  planFactAdd,
  searchCustomers,
  type ToolContext,
} from "@/lib/ai/agent-tools";
import { CUSTOMER_FIELD_LABELS } from "@/lib/constants/customer-fields";
import { INDUSTRIES } from "@/lib/constants/industries";
import { factCategoryKey } from "@/lib/constants/facts";

/**
 * 会話。
 *
 * ここがサーバに在る理由は 2 つ。API キーをブラウザへ出さないことと、
 * 道具の往復（名前を引く → カルテを読む → 提案）をサーバの中で閉じること。
 * モバイル回線を 3 往復させると、それだけで体感が 1 秒近く伸びる。
 *
 * **DB は利用者のトークンで触る。**サーバを通したことで見える範囲は広がらない。
 * 書き込みはここでは一切しない — 返すのは提案までで、書くのは人が
 * 「適用」を押したあとのブラウザ側。
 */

export const maxDuration = 60;

type Body = {
  text?: string;
  history?: { role: "user" | "assistant"; body: string }[];
  contextCustomerId?: string | null;
  recentCustomerId?: string | null;
  viewingStaffId?: string | null;
};

/** モデルへ渡す履歴の窓。画面の表示件数とは別の値 */
const HISTORY_TURNS = 20;

export async function POST(request: Request) {
  const startedAt = performance.now();
  let caller: Caller;
  try {
    caller = await requireStaff(request);
  } catch (error) {
    return errorResponse(error);
  }

  try {
    const body = (await request.json()) as Body;
    const text = body.text?.trim();
    if (!text) return Response.json({ message: "入力が空です。" }, { status: 400 });

    const ctx: ToolContext = {
      supabase: caller.supabase,
      viewingStaffId: body.viewingStaffId ?? null,
    };
    const contextId = body.contextCustomerId ?? null;
    const recentId =
      body.recentCustomerId && body.recentCustomerId !== contextId ? body.recentCustomerId : null;

    // ── 顧客の見出しを覚えておく ──
    // 提案カードは名前とラベルを畳んで持つ（会話ログの再描画に要る）。
    // 道具が返した値から組み立て、無ければカルテを引き直す。
    const refs = new Map<string, AgentCustomerRef>();
    const remember = (c: {
      id: string;
      name: string;
      nameKana: string;
      labels?: string[];
    }): AgentCustomerRef => {
      const ref = { id: c.id, name: c.name, nameKana: c.nameKana, labels: c.labels ?? [] };
      refs.set(c.id, ref);
      return ref;
    };

    type Dossier = {
      customer: { id: string; name: string; nameKana: string; companyName?: string } & Record<
        string,
        unknown
      >;
      facts: { id: string; label: string | null; body: string }[];
    };
    const dossiers = new Map<string, Dossier>();
    /** このターンで実際に返した記録。出典の検証はこれだけを正とする */
    const factIndex = new Map<
      string,
      { id: string; customerId: string; label?: string; body: string }
    >();
    const dossierOf = async (id: string): Promise<Dossier | null> => {
      if (!dossiers.has(id)) {
        const d = (await getCustomer(ctx, id)) as Dossier | null;
        if (!d) return null;
        dossiers.set(id, d);
        for (const f of d.facts) {
          factIndex.set(f.id, {
            id: f.id,
            customerId: d.customer.id,
            label: f.label ?? undefined,
            body: f.body,
          });
        }
        remember({
          ...d.customer,
          labels: d.facts.map((f) => f.label).filter((l): l is string => Boolean(l)),
        });
      }
      return dossiers.get(id) ?? null;
    };
    const refOf = async (id: string): Promise<AgentCustomerRef | null> => {
      if (refs.has(id)) return refs.get(id)!;
      return (await dossierOf(id)) ? (refs.get(id) ?? null) : null;
    };

    // 提案は 1 ターンに 1 つだけ持ち帰る。2 つ出されたら最後のものを採る
    // （カードが複数並ぶと、押し忘れたほうが無言で消える）。
    let action: AgentAction | undefined;

    /**
     * このターンで**モデルが名指しした**顧客。
     *
     * 次のターンで名前が言われなかったときの宛先（＝「直前に話していた相手」）は、
     * これを 1 人に絞れたときだけ立つ。以前は提案の相手だけを足跡にしていたので、
     * **カルテを読んだだけ・聞き返しただけのターンが素通り**し、もっと前の提案の
     * 相手が「直前」として残り続けた。
     *
     * サーバが自分で開いたカルテ（開いているカルテ・直前の相手のカルテ）は数えない。
     * ここに入れると、いま話題にしていない人が毎ターン足跡を作り直してしまう。
     */
    const pinned = new Set<string>();

    /**
     * 相手の決め方を検算する。
     *
     * **モデルの自己申告をそのまま信じない。**道具の選択は間違えないが、対象の
     * 束縛は実測で 24〜26% 間違える。しかもプロンプトの注意書きでは直らないことが
     * 分かっているので、ここで受け付けない形にしてある。
     *
     * 通らなかったら error-as-prompt で差し戻す。エラーは「何が悪くて、次に何を
     * すべきか」を書く（Anthropic の指針）。
     */
    const checkSubject = (
      from: unknown,
      customer: AgentCustomerRef,
    ): { ok: true; from: SubjectOrigin } | { ok: false; error: string } => {
      if (from !== "spoken_name" && from !== "open_karte" && from !== "recent_topic") {
        return { ok: false, error: "subjectFrom が要ります（spoken_name / open_karte / recent_topic）。" };
      }
      // 発話に名前が出ているか。姓だけで呼ぶのが普通なので、姓でも照合する
      // （判定は lib/ai/spoken-name.ts。空白の無い氏名でも通るようにしてある）
      const spoken = mentionsName(text, customer.name);
      if (from === "spoken_name") {
        if (!spoken) {
          return {
            ok: false,
            error:
              `いまの発話に ${customer.name} さんの名前は出てきません。名前で決めたのでなければ、` +
              "open_karte か recent_topic を選ぶか、どちらとも言えないなら propose_ask で聞き返してください。",
          };
        }
        return { ok: true, from };
      }
      // **申告より、発話に名前がある事実のほうが強い。**
      //
      // 「横川くん」と名前を言っているのに open_karte と申告され、下の
      // 「開いているカルテと直前の相手が別人」に当たって聞き返していた。
      // 人からは、名前を言ったのに誰の話か聞かれたようにしか見えない。
      if (spoken) return { ok: true, from: "spoken_name" };
      // この人の名前は出ていないのに、**別の人の名前が出ている**。
      // 話題が移ったのに前の相手へ書きにいく形なので、当てずに聞き返させる
      const other = [...refs.values()].find(
        (r) => r.id !== customer.id && mentionsName(text, r.name),
      );
      if (other) {
        return {
          ok: false,
          error:
            `いまの発話に出ているのは ${other.name} さんの名前で、${customer.name} さんではありません。` +
            "相手が違うなら名前の出ている方を、迷うなら propose_ask で聞き返してください。",
        };
      }
      // 名前が言われていないのに、開いているカルテと直前の相手が別人。
      // ここで当てにいくと「黙って別人のカルテへ書く」が起きる（実際に起きた）
      if (recentId && contextId && recentId !== contextId) {
        return {
          ok: false,
          error:
            "いまの発話に名前が無く、開いているカルテと直前に話していた相手が別人です。" +
            "どちらか当てずに propose_ask で聞き返してください（選択肢には氏名だけでなく会社名も添える）。",
        };
      }
      // 検算の相手には**生の値**を使う。recentId は「開いているカルテと別人のとき」
      // だけ立つ値なので、そちらで比べると同一人物のときに検算が空振りする
      const expected = from === "open_karte" ? contextId : body.recentCustomerId ?? null;
      if (!expected) {
        // **検算できない由来は通さない。**ここを素通りさせていたので、
        // カルテを開いていない・直前の相手もいない状態では、モデルが
        // recent_topic と名乗れば**どの顧客でも**宛先にできた。
        return {
          ok: false,
          error:
            from === "open_karte"
              ? "いまカルテは開いていません。発話に名前があるなら spoken_name を、なければ propose_ask で聞き返してください。"
              : "直前に誰の話をしていたかは決まっていません。発話に名前があるなら spoken_name を、なければ propose_ask で聞き返してください。",
        };
      }
      if (expected !== customer.id) {
        return {
          ok: false,
          error:
            `${from} で決めたのなら相手は別の人です。発話に名前があるなら spoken_name を、` +
            "決められないなら propose_ask を使ってください。",
        };
      }
      return { ok: true, from };
    };

    const handle = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      const cid = typeof args.customerId === "string" ? args.customerId : "";
      const quote = typeof args.quote === "string" ? args.quote : undefined;

      switch (name) {
        case "search_customers": {
          const result = await searchCustomers(ctx, {
            labels: Array.isArray(args.labels) ? (args.labels as string[]) : [],
            freeText: typeof args.freeText === "string" ? args.freeText : undefined,
            match: args.match === "all" ? "all" : "any",
            exclude: Array.isArray(args.exclude) ? (args.exclude as string[]) : [],
          });
          const customers = result.exact.map((c) =>
            remember({
              ...c,
              labels: c.matched.map((m) => m.label).filter((l): l is string => Boolean(l)),
            }),
          );
          action = {
            kind: "search_result",
            keyword: [
              ...(Array.isArray(args.labels) ? (args.labels as string[]) : []),
              ...(typeof args.freeText === "string" ? [args.freeText] : []),
            ]
              .filter(Boolean)
              .join("・"),
            customers,
            exactCount: result.exactCount,
            match: result.match,
            excluded: result.excluded?.length ? result.excluded : undefined,
            similar: result.similar.map((s) => ({
              customer: remember({ id: s.id, name: s.name, nameKana: s.nameKana }),
              content: s.content,
            })),
          };
          // モデルには件数と、名前だけを返す。カルテの中身は渡さない
          // （一覧を描くのは画面で、モデルに並べ直させない）。
          // モデルにも「何の数か」を返す。数だけ渡すと別の問いの答えに使われる
          return {
            exactCount: result.exactCount,
            countMeans:
              result.match === "all"
                ? `${result.labels.join("・")} の全部に当てはまる人数`
                : result.excluded.length > 0 && result.labels.length === 0
                  ? `${result.excluded.join("・")} を除いた人数`
                  : `${result.labels.join("・")} のいずれかに当てはまる人数`,
            exact: result.exact.map((c) => ({ id: c.id, name: c.name })),
            similar: result.similar.map((s) => ({ id: s.id, name: s.name, content: s.content })),
            similarAvailable: result.similarAvailable,
          };
        }

        case "find_customer": {
          const hits = await findCustomer(ctx, String(args.name ?? ""));
          hits.forEach((h) => remember(h));
          // 1 人に定まったときだけ足跡にする。同姓が複数出たターンは
          // 「誰の話か決まらなかった」ターンで、次の宛先にはできない
          if (hits.length === 1) pinned.add(hits[0].id);
          return hits.map((h) => ({
            id: h.id,
            name: h.name,
            companyName: h.companyName,
            labels: h.labels,
          }));
        }

        case "get_customer": {
          const dossier = await dossierOf(cid);
          if (!dossier) return { error: "そのカルテは開けませんでした。" };
          // 読んだ相手も足跡にする。「天野さんってどんな人だっけ」の次に
          // 名前なしで話が続くのは普通で、そこで前の提案の相手へ飛ばれると困る
          pinned.add(cid);
          return dossier;
        }

        case "propose_add_fact": {
          const labels = (Array.isArray(args.labels) ? (args.labels as string[]) : []).filter(
            (l) => typeof l === "string" && l.trim().length > 0,
          );
          // **「語が来なかった」と「すでに入っている」を混ぜない。**
          // どちらも「提案は作れません」で返していたので、モデルがそれを
          // 「すでに登録済みです」と読み、DB に無いことを断言して返していた。
          if (labels.length === 0) {
            return { error: "labels が空です。足す語を 1 つ以上渡してください。" };
          }
          const plan = await planFactAdd(ctx, { customerId: cid, labels });
          const ref = await refOf(cid);
          if (!plan || !ref) return { error: "そのカルテは開けませんでした。" };
          const subject = checkSubject(args.subjectFrom, ref);
          if (!subject.ok) return { error: subject.error };
          if (plan.labelNames.length === 0) {
            return {
              alreadyHas: plan.alreadyHas,
              note: `渡された語はすべて ${ref.name} さんに登録済みです（${plan.alreadyHas.join("・")}）。提案は作りません。`,
            };
          }
          action = {
            kind: "add_fact",
            customer: ref,
            labelNames: plan.labelNames,
            subjectFrom: subject.from,
            newLabelNames: plan.newLabelNames,
            // 存在しない分類は提案に載せない。載せると、適用を押した瞬間に
            // 外部キー違反で落ちる（提案を作るところまでは通ってしまう）。
            categoryKey: factCategoryKey(args.categoryKey),
            body: String(args.body ?? ""),
            quote,
          };
          return plan;
        }

        case "propose_add_ng_note": {
          const ref = await refOf(cid);
          if (!ref) return { error: "そのカルテは開けませんでした。" };
          const subject = checkSubject(args.subjectFrom, ref);
          if (!subject.ok) return { error: subject.error };
          action = {
            kind: "add_ng_note",
            customer: ref,
            subjectFrom: subject.from,
            body: String(args.body ?? ""),
            quote,
          };
          return { ok: true };
        }

        case "propose_update_customer": {
          const dossier = await dossierOf(cid);
          const ref = await refOf(cid);
          if (!dossier || !ref) return { error: "そのカルテは開けませんでした。" };
          const subject = checkSubject(args.subjectFrom, ref);
          if (!subject.ok) return { error: subject.error };
          const incoming = Array.isArray(args.changes)
            ? (args.changes as { field: CustomerFieldKey; value: string }[])
            : [];
          // 項目名が違うのか、値が同じなのかを分ける。混ぜると
          // 「変わる項目がありません」→「すでに登録済みです」と読まれる。
          const unknown = incoming.filter((c) => !(c.field in CUSTOMER_FIELD_LABELS));
          if (unknown.length > 0) {
            return {
              error: `${unknown.map((c) => c.field).join("・")} という項目はありません。` +
                "「職業」「仕事の内容」はどの項目にも当たらないので、propose_add_fact（分類は work）で残してください。",
            };
          }
          // **値の側を検査する。**「職業がパーソナルジム」が業種に化けたのは、
          // jobTitle も industry も enum に**在る**ので未知項目のチェックが発火せず、
          // モデルが「妥当だが誤り」な列を選べてしまうため。説明文で否定を書いても、
          // 選べる選択肢として出ている限り選ばれる。
          const badIndustry = incoming.find(
            (c) => c.field === "industry" && !INDUSTRIES.includes(c.value as (typeof INDUSTRIES)[number]),
          );
          if (badIndustry) {
            return {
              error:
                `業種は決まった一覧から選びます（「${badIndustry.value}」は一覧にありません）。` +
                "その人が何をしているかは項目ではないので、propose_add_fact（分類は work）で残してください。",
            };
          }
          // 利き手・利き足も値の側を検査する。日本語で「左利きです」と言われた
          // ままの「左」を入れられると、DB の check 制約に当たって無音で失敗する。
          const badSide = incoming.find(
            (c) =>
              (c.field === "dominantHand" || c.field === "dominantFoot") &&
              c.value !== "right" &&
              c.value !== "left",
          );
          if (badSide) {
            return {
              error:
                `${CUSTOMER_FIELD_LABELS[badSide.field]}は right か left で入れてください` +
                `（「${badSide.value}」は入りません）。` +
                "両利きは登録できないので、どちらかに決まっていなければ書き換えないでください。",
            };
          }
          const changes = incoming
            .map((c) => ({
              field: c.field,
              label: CUSTOMER_FIELD_LABELS[c.field],
              // 現在値を必ず添える。何が何に変わるかを見ずに押させない
              before: (dossier.customer[c.field] as string | null) ?? undefined,
              after: c.value,
            }))
            .filter((c) => c.before !== c.after);
          if (changes.length === 0) {
            return {
              note: `${ref.name} さんのその項目は、すでに同じ値です。提案は作りません。`,
              current: incoming.map((c) => ({
                field: c.field,
                value: dossier.customer[c.field] ?? null,
              })),
            };
          }
          action = {
            kind: "update_customer",
            customer: ref,
            subjectFrom: subject.from,
            changes,
            quote,
          };
          return { changes };
        }

        case "propose_add_anniversary": {
          const ref = await refOf(cid);
          if (!ref) return { error: "そのカルテは開けませんでした。" };
          const subject = checkSubject(args.subjectFrom, ref);
          if (!subject.ok) return { error: subject.error };
          action = {
            kind: "add_anniversary",
            customer: ref,
            subjectFrom: subject.from,
            anniversary: {
              type: args.type as "birthday" | "first_purchase" | "wedding" | "other",
              date: String(args.date ?? ""),
              label: typeof args.label === "string" ? args.label : undefined,
            },
            quote,
          };
          return { ok: true };
        }

        case "propose_invalidate_fact": {
          const dossier = await dossierOf(cid);
          const ref = await refOf(cid);
          if (!dossier || !ref) return { error: "そのカルテは開けませんでした。" };
          const subject = checkSubject(args.subjectFrom, ref);
          if (!subject.ok) return { error: subject.error };
          const ids = new Set(Array.isArray(args.factIds) ? (args.factIds as string[]) : []);
          // カルテに実在する行だけ。モデルが作った id は落とす
          const facts = dossier.facts
            .filter((f) => ids.has(f.id))
            .map((f) => ({ id: f.id, label: f.label ?? undefined, body: f.body }));
          if (facts.length === 0) return { error: "その記録は見つかりませんでした。" };
          action = {
            kind: "invalidate_fact",
            customer: ref,
            subjectFrom: subject.from,
            facts,
            quote,
          };
          return { facts };
        }

        case "propose_resolve_approach": {
          const ref = await refOf(cid);
          if (!ref) return { error: "そのカルテは開けませんでした。" };
          const subject = checkSubject(args.subjectFrom, ref);
          if (!subject.ok) return { error: subject.error };
          action = {
            kind: "resolve_approach",
            customer: ref,
            subjectFrom: subject.from,
            status: args.status === "skipped" ? "skipped" : "done",
            quote,
          };
          return { ok: true };
        }

        case "propose_ask": {
          const question = String(args.question ?? "").trim();
          const raw = (Array.isArray(args.options) ? args.options : []).map(
            (o) => o as { customerId?: unknown; answer?: unknown; hint?: unknown },
          );
          // **顧客の選択肢は文言もコードが作る。**
          //
          // カードの見出しと同じ理屈で、選択肢もモデルに書かせると出所が 2 つになる。
          // ここは「どちらの人か」を人が見分ける最後の場所なので、名前や会社名が
          // 1 文字でもずれると、**間違いに気づく手段そのものが壊れる**。
          // モデルには id だけ渡させ、表示する文字はこちらが DB から作る。
          type AskOption = { answer: string; hint?: string };
          const options: AskOption[] = (
            await Promise.all(
              raw.map(async (o): Promise<AskOption | null> => {
                if (typeof o.customerId === "string") {
                  const ref = await refOf(o.customerId);
                  if (!ref) return null;
                  // 誰かを選ばせている以上、そのターンは相手が決まっていない。
                  // 2 人を pinned に入れることで、足跡は立たない（1 人のときだけ立つ）
                  pinned.add(o.customerId);
                  const dossier = dossiers.get(o.customerId);
                  const company = dossier?.customer.companyName;
                  const where =
                    o.customerId === contextId
                      ? "開いているカルテ"
                      : o.customerId === recentId
                        ? "直前に話していた相手"
                        : undefined;
                  return {
                    answer: `${ref.name} さんのことです`,
                    hint: [company, where].filter(Boolean).join(" ／ ") || undefined,
                  };
                }
                if (typeof o.answer === "string" && o.answer.trim()) {
                  return {
                    answer: o.answer.trim(),
                    hint: typeof o.hint === "string" && o.hint.trim() ? o.hint.trim() : undefined,
                  };
                }
                return null;
              }),
            )
          ).filter((o): o is AskOption => o !== null);
          if (!question || options.length < 2) {
            return {
              error:
                "question と、選択肢が 2 つ以上要ります。顧客を選ばせるなら customerId を、" +
                "それ以外なら押したらそのまま送れる完全な文を answer に入れてください。",
            };
          }
          action = { kind: "ask", question, options };
          return { ok: true };
        }

        default:
          return { error: `${name} という道具はありません。` };
      }
    };

    const contextCustomer = body.contextCustomerId
      ? ((await dossierOf(body.contextCustomerId))?.customer ?? undefined)
      : undefined;
    const recentCustomer =
      body.recentCustomerId && body.recentCustomerId !== body.contextCustomerId
        ? ((await dossierOf(body.recentCustomerId))?.customer ?? undefined)
        : undefined;

    const input: ResponseInput = [
      ...(body.history ?? [])
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.body }) as const),
      { role: "user" as const, content: `${contextLine(contextCustomer, recentCustomer)}\n\n${text}` },
    ];

    const system = systemPrompt(await factVocabulary(ctx));

    /**
     * 進捗を流す。
     *
     * 道具を 2〜3 本回すと数秒かかる。**無音の 4 秒はスマホでは「固まった」に
     * 見える。**返答の文字を 1 文字ずつ流すより、「カルテを読んでいます」が
     * 先に出るほうが接客の合間には効く。
     *
     * 途中経過は画面の state に置くだけで、DB には書かない。確定した 1 件だけを
     * agent_messages に入れる（購読は自プロセスのカウンタなので、
     * 二重描画も競合も起こらない）。
     *
     * Node ランタイムのままで動く。Edge は要らない。
     */
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

        try {
          const turn = await runTurn({
            system,
            input,
            tools: AGENT_TOOLS,
            handle,
            // スタッフごとに分ける。同じ人の続けての問い合わせが温まったまま返る
            cacheKey: `agent:${caller.userId}`,
            onToolStart: (name) => send({ type: "tool", name }),
          });
          // ── 出典 ──
          //
          // モデルには本文中に [[factId]] を書かせ、**そのターンに実際に返した
          // 記録の id と突き合わせて、無いものは捨てる**（quote を発話と突き合わせて
          // いるのと同じ考え方）。書かせたものをそのまま信じない。
          //
          // 根拠を「出典: カルテ」で終わらせず**その行まで飛ばす**のが要点で、
          // NotebookLM が信用を作っているのもここ。マーカーは表示前に必ず外す。
          const cited: { id: string; customerId: string; label?: string; body: string }[] = [];
          const seenCite = new Set<string>();
          for (const m of turn.reply.matchAll(/\[\[([0-9a-fA-F-]{36})\]\]/g)) {
            const factId = m[1];
            if (seenCite.has(factId)) continue;
            const found = factIndex.get(factId);
            if (!found) continue; // モデルが作った id は捨てる
            seenCite.add(factId);
            cited.push(found);
          }
          // 記法は**中身によらず**必ず外す。id の形をしていないものを書かれたとき
          // （[[abc]] など）に、そこだけ生のまま画面へ出るのを防ぐ
          const cleaned = turn.reply.replace(/\s*\[\[[^\]]*\]\]/g, "").trim();

          // **提案があるターンは、返答文もコードが作る。**
          // モデルの散文とカードが同じ提案を別々に説明していたので、
          // 「職業として記録します」と言いながらカードは「パーソナルに追加」になった。
          // 出所を 1 つにすれば、ずれようがない。
          const sentence = action ? actionSentence(action) : null;
          // **そのターンが誰の話だったか。**次に名前が言われなかったときの宛先になる。
          // 提案があればその相手。無ければ、モデルが名指しした顧客が 1 人に
          // 定まったときだけ立てる（検索や、同姓が 2 人出た聞き返しでは立たない）。
          const subjectCustomerId =
            action && "customer" in action
              ? action.customer.id
              : pinned.size === 1
                ? [...pinned][0]
                : null;
          send({
            type: "done",
            reply: sentence ?? cleaned,
            citations: cited,
            action,
            subjectCustomerId,
            source: MODELS.chat,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
        } catch (error) {
          // ヘッダはもう出ているので status を変えられない。
          // 失敗も同じ流れに乗せて、受け側で例外に戻す。
          send({
            type: "error",
            message: error instanceof Error ? error.message : "応答を作れませんでした。",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        // no-transform が無いと、間に入るものが溜めてから流すことがある
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof AgentError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
