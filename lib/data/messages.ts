import type { CompanyNews, Message, MessageChannel, TriggerType, Uuid } from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { toIsoDate } from "@/lib/utils/date";

export type MessageView = Message & { staffName?: string };

export async function listMessages(customerId: Uuid): Promise<MessageView[]> {
  const db = getDb();
  return db.messages
    .filter((m) => m.customerId === customerId)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .map((m) => ({ ...m, staffName: db.staff.find((s) => s.id === m.staffId)?.name }));
}

export async function listCompanyNews(customerId: Uuid): Promise<CompanyNews[]> {
  return getDb()
    .companyNews.filter((n) => n.customerId === customerId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export type SendMessageInput = {
  customerId: Uuid;
  staffId: Uuid;
  body: string;
  channel: MessageChannel;
  isAiGenerated: boolean;
  /** アプローチをきっかけに送る場合。効果測定のために必ず紐づける */
  approachTaskId?: Uuid;
  /** 対応履歴に残す、発火していたトリガーと根拠 */
  approachContext?: { triggerTypes: TriggerType[]; reason: string };
};

/**
 * メッセージを送る。
 *
 * 送信と記録を同時に済ませるのがこのシステムの前提（要件3.3）。
 * スタッフが別途「送った」と記録する手間が残ると運用が形骸化するため、
 * 最終接触日の更新とアプローチの対応済み化もここでまとめて行う。
 */
export async function sendMessage(input: SendMessageInput): Promise<Uuid> {
  const id = newId("msg");
  const now = new Date();
  const today = toIsoDate(now);

  mutateDb((db) => ({
    ...db,
    messages: [
      ...db.messages,
      {
        id,
        customerId: input.customerId,
        staffId: input.staffId,
        sentAt: now.toISOString(),
        channel: input.channel,
        direction: "outbound",
        body: input.body,
        isAiGenerated: input.isAiGenerated,
        approachTaskId: input.approachTaskId,
      },
    ],
    // 経過日数トリガーの評価を軽くするため非正規化して持っている値
    customers: db.customers.map((c) =>
      c.id === input.customerId ? { ...c, lastContactedAt: today } : c,
    ),
    // アプローチは毎回評価して導出しているため、対応したものは履歴として書き残す。
    // 未解決のレコード（スヌーズ等）があればそれを対応済みに変える
    approachTasks: input.approachTaskId
      ? (() => {
          const open = db.approachTasks.find(
            (t) => t.customerId === input.customerId && t.status !== "done",
          );
          const resolved = {
            id: open?.id ?? `${input.approachTaskId}-${now.getTime()}`,
            customerId: input.customerId,
            dueDate: today,
            triggerTypes: input.approachContext?.triggerTypes ?? open?.triggerTypes ?? [],
            reason: input.approachContext?.reason ?? open?.reason ?? "",
            status: "done" as const,
            resolvedAt: now.toISOString(),
          };
          return open
            ? db.approachTasks.map((t) => (t.id === open.id ? resolved : t))
            : [...db.approachTasks, resolved];
        })()
      : db.approachTasks,
  }));

  return id;
}
