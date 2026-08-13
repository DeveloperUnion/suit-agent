import type { AgentAction, AgentMessage, Uuid } from "@/lib/types";
import type { ExtractionMeta } from "@/lib/ai/extraction";
import { getViewingStaffId } from "@/lib/auth/current-staff";
import { postApi } from "@/lib/api/client";

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
};

export type AgentInterpretContext = {
  /** いま開いている顧客。文中に名前が無いときの既定の相手になる */
  customerId?: Uuid;
  /** 直近のやり取り。「さっきの続き」を拾えるようにする */
  history?: AgentMessage[];
};

/** モデルへ渡すターン数。画面の表示件数とは別で、ここは短くてよい */
const HISTORY_TURNS = 20;

export async function interpret(
  input: string,
  ctx: AgentInterpretContext = {},
): Promise<AgentTurn> {
  return postApi<AgentTurn>("/api/agent", {
    body: {
      text: input,
      contextCustomerId: ctx.customerId ?? null,
      // 管理者がスタッフを切り替えているときは、その人の顧客を見ている。
      // 画面に出ているものと答えを一致させる。
      viewingStaffId: getViewingStaffId(),
      history: (ctx.history ?? []).slice(-HISTORY_TURNS).map((m) => ({
        role: m.role,
        body: m.body,
      })),
    },
  });
}
