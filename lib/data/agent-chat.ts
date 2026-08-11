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

const COLUMNS = "id, staffId:staff_id, role, body, action, appliedAt:applied_at, sentAt:sent_at";

export async function listAgentMessages(): Promise<AgentMessage[]> {
  const { data, error } = await supabase().from("agent_messages").select(COLUMNS).order("sent_at");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const m = r as unknown as AgentMessage & { appliedAt: string | null; action: AgentAction | null };
    return {
      ...m,
      action: m.action ?? undefined,
      appliedAt: m.appliedAt ?? undefined,
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
export async function markAgentActionApplied(messageId: Uuid): Promise<void> {
  const { error } = await supabase()
    .from("agent_messages")
    .update({ applied_at: new Date().toISOString() })
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
