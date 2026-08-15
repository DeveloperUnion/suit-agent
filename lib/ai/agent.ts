import type { AgentAction, AgentCitation, AgentMessage, Uuid } from "@/lib/types";
import type { ExtractionMeta } from "@/lib/ai/extraction";
import { getViewingStaffId } from "@/lib/auth/current-staff";
import { postStream } from "@/lib/api/client";
import { toolLabel } from "@/lib/ai/tool-labels";

/**
 * 話しかけた内容の解釈。
 *
 * 中身はサーバ（app/api/agent）にある。ここに残るのは、画面が渡すものを
 * 組み立てて呼ぶところだけ。LLM のキーをブラウザへ出さないのと、
 * 道具の往復（名前を引く → カルテを読む → 提案）をサーバの中で閉じるため。
 *
 * **書き込みはここを通らない。**返るのは提案までで、実際に書くのは人が
 * 「適用」を押したあとの適用ハンドラ（components/agent/agent-panel.tsx）。
 */

export type AgentTurn = ExtractionMeta & {
  reply: string;
  /** 人が「適用」を押すまで書き込まない提案。検索結果もここに入る */
  action?: AgentAction;
  /**
   * 答えの根拠になった記録。**サーバが実際に返した id と突き合わせた後**のものだけ。
   * タップでカルテの該当行へ飛ばす。
   */
  citations?: AgentCitation[];
  /**
   * そのターンが誰の話だったか。**サーバが道具の呼び方から決める。**
   * 会話の行に残り、次のターンの「直前に話していた相手」になる。
   */
  subjectCustomerId?: Uuid | null;
};

export type AgentInterpretContext = {
  /** いま開いている顧客。文中に名前が無いときの既定の相手になる */
  customerId?: Uuid;
  /** 直近のやり取り。「さっきの続き」を拾えるようにする */
  history?: AgentMessage[];
  /**
   * いま何をしているか。道具を呼ぶたびに鳴る。
   *
   * 道具を 2〜3 本回すと数秒かかり、**無音のままだとスマホでは「固まった」に
   * 見える**。返答の文字より先に、これを出すほうが接客の合間には効く。
   */
  onProgress?: (label: string) => void;
};

/** モデルへ渡すターン数。画面の表示件数とは別で、ここは短くてよい */
const HISTORY_TURNS = 20;

/**
 * 直前に話していた相手。
 *
 * **「最後に提案を出した相手」ではない。**そう数えていたときに、こうなった:
 *
 *   1. 山岸さんへ提案を出す          → 直前の相手 = 山岸さん
 *   2.「天野さんの広背筋は」と聞く    → カルテを読むだけなので足跡が残らない
 *   3.「日本一の背中って言われてる」  → 名前が無い → 山岸さんのカルテへ提案
 *
 * いまはサーバが各ターンの相手（subjectCustomerId）を決めて行に残すので、
 * 読んだだけのターンも足跡になる。
 *
 * **相手が決まらなかったターンで足跡は切れる。**検索結果や、同姓が 2 人出た
 * 聞き返しのあとに名前なしで話が続いたら、遡って古い相手を当てにいくより
 * 聞き返させるほうがよい（宛先の取り違えは、聞き返しより高くつく）。
 */
function lastCustomerId(history: AgentMessage[]): Uuid | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message.role !== "assistant") continue;
    if (message.subjectCustomerId) return message.subjectCustomerId;
    // この列より前に残った会話は、提案の相手から読む（以前と同じ振る舞い）
    const action = message.action;
    if (action && "customer" in action) return action.customer.id;
    // 相手が決まらないまま検索・聞き返しを出したターン
    if (action) return null;
  }
  return null;
}

export async function interpret(
  input: string,
  ctx: AgentInterpretContext = {},
): Promise<AgentTurn> {
  return postStream<AgentTurn>(
    "/api/agent",
    {
      text: input,
      contextCustomerId: ctx.customerId ?? null,
      // 管理者がスタッフを切り替えているときは、その人の顧客を見ている。
      // 画面に出ているものと答えを一致させる。
      viewingStaffId: getViewingStaffId(),
      // 直前に誰の話をしていたか。カルテを開いたまま別の人の話をするのは
      // 普通にあるので、開いているカルテだけでは宛先が決まらない。
      recentCustomerId: lastCustomerId(ctx.history ?? []),
      history: (ctx.history ?? []).slice(-HISTORY_TURNS).map((m) => ({
        role: m.role,
        body: m.body,
      })),
    },
    (event) => {
      if (event.type === "tool" && event.name) ctx.onProgress?.(toolLabel(event.name));
    },
  );
}
