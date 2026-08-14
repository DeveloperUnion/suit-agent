import type { AgentAction, AgentMessage, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";

/**
 * AI アシスタントとの会話。
 *
 * 揮発させない。接客の合間に開き直したり端末を持ち替えたりする使い方で、
 * リロードのたびに消えると「さっき何を頼んだか」が追えなくなる。
 *
 * スタッフごとの分割はここに書かない。agent_messages の RLS が
 * staff_id = app.current_staff_id() を持っており、insert の staff_id も
 * 同じ関数が既定値になっている。他人の会話は覗けないし、他人名義でも書けない。
 */

const COLUMNS =
  "id, staffId:staff_id, role, body, action, appliedAt:applied_at, rejectedAt:rejected_at, sentAt:sent_at";

/**
 * 画面に出す件数。
 *
 * 消しゴムを押すまで会話は残るので、数ヶ月使えば数千件になる。
 * 上限を置かないと、そのままモデルへ渡すプロンプトにもなる。
 * 遡りたければ消さずに増やせばよいので、まずは十分に大きい値で切っておく。
 */
const DEFAULT_LIMIT = 200;

export async function listAgentMessages(limit = DEFAULT_LIMIT): Promise<AgentMessage[]> {
  // 新しい方から limit 件取って、表示のために時系列へ戻す。
  // order("sent_at") のまま limit を付けると**古いほうが残る**。
  const { data, error } = await supabase()
    .from("agent_messages")
    .select(COLUMNS)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse().map((r) => {
    const m = r as unknown as AgentMessage & {
      appliedAt: string | null;
      rejectedAt: string | null;
      action: AgentAction | null;
    };
    return {
      ...m,
      action: m.action ?? undefined,
      appliedAt: m.appliedAt ?? undefined,
      rejectedAt: m.rejectedAt ?? undefined,
    };
  });
}

export async function appendAgentMessage(
  input: Pick<AgentMessage, "role" | "body"> & { action?: AgentAction },
): Promise<Uuid> {
  const { data, error } = await supabase()
    .from("agent_messages")
    .insert({ role: input.role, body: input.body, action: input.action ?? null })
    .select("id")
    .single();
  if (error) throw error;
  bump();
  return (data as { id: string }).id;
}

/**
 * 提案を適用したことを記録する。カードから適用ボタンが消える。
 *
 * この列があることが「提案 → 適用」機構の本体。applied_at が NULL の間、
 * 提案は DB のどこにも反映されていない。
 */
export async function markAgentActionApplied(
  messageId: Uuid,
  appliedAction: AgentAction,
): Promise<void> {
  // **提案そのものではなく、人が見て押した形**を残す。カードの上でラベルを外したり
  // 宛先を差し替えたりできるので、両者は食い違いうる。その差分が、注釈をつける手間
  // ゼロで得られる「AI がどこを外したか」の記録になる。
  const { error } = await supabase()
    .from("agent_messages")
    .update({ applied_at: new Date().toISOString(), applied_action: appliedAction })
    .eq("id", messageId);
  if (error) throw error;
  bump();
}

/**
 * 「違う」を押したときの記録。
 *
 * 書き込みは何も起きない。**残すこと自体が目的**で、押されなかった提案と
 * 「見て、違うと判断した提案」は別物として数えられる必要がある。
 */
export async function rejectAgentAction(messageId: Uuid): Promise<void> {
  const { error } = await supabase()
    .from("agent_messages")
    .update({ rejected_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw error;
  bump();
}

/** 会話を捨てる。RLS が自分の分に絞るので、条件は書かない */
export async function clearAgentMessages(): Promise<void> {
  const { error } = await supabase()
    .from("agent_messages")
    .delete()
    .not("id", "is", null);
  if (error) throw error;
  bump();
}
