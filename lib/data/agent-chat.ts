import type { AgentAction, AgentMessage, Uuid } from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { getCurrentStaffId } from "@/lib/auth/current-staff";

/**
 * AI アシスタントとの会話。
 *
 * Provider の state ではなく localStorage に置く。接客の合間に開き直したり
 * 端末を持ち替えたりする使い方で、リロードのたびに消えると
 * 「さっき何を頼んだか」が追えなくなるため。
 * 顧客と同じくスタッフごとに分ける。
 */

export async function listAgentMessages(): Promise<AgentMessage[]> {
  const staffId = getCurrentStaffId();
  return getDb().agentMessages.filter((m) => m.staffId === staffId);
}

export async function appendAgentMessage(
  input: Pick<AgentMessage, "role" | "body"> & { action?: AgentAction },
): Promise<Uuid> {
  const id = newId("agmsg");
  mutateDb((db) => ({
    ...db,
    agentMessages: [
      ...db.agentMessages,
      {
        ...input,
        id,
        staffId: getCurrentStaffId(),
        sentAt: new Date().toISOString(),
      },
    ],
  }));
  return id;
}

/** 提案を適用したことを記録する。カードから適用ボタンが消える */
export async function markAgentActionApplied(messageId: Uuid): Promise<void> {
  mutateDb((db) => ({
    ...db,
    agentMessages: db.agentMessages.map((m) =>
      m.id === messageId ? { ...m, appliedAt: new Date().toISOString() } : m,
    ),
  }));
}

/** 会話を捨てる。自分の分だけ */
export async function clearAgentMessages(): Promise<void> {
  const staffId = getCurrentStaffId();
  mutateDb((db) => ({
    ...db,
    agentMessages: db.agentMessages.filter((m) => m.staffId !== staffId),
  }));
}
