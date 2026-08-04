import type { ApproachTask, CompanyNews, Message, MessageChannel, Uuid } from "@/lib/types";
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

export type ApproachTaskView = ApproachTask & {
  news?: CompanyNews;
  /** このアプローチをきっかけに送られたメッセージ */
  relatedMessages: Message[];
};

export async function listApproachTasks(customerId: Uuid): Promise<ApproachTaskView[]> {
  const db = getDb();
  return db.approachTasks
    .filter((t) => t.customerId === customerId)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .map((task) => ({
      ...task,
      news: task.companyNewsId ? db.companyNews.find((n) => n.id === task.companyNewsId) : undefined,
      relatedMessages: db.messages.filter((m) => m.approachTaskId === task.id),
    }));
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
    approachTasks: input.approachTaskId
      ? db.approachTasks.map((t) =>
          t.id === input.approachTaskId
            ? { ...t, status: "done" as const, resolvedAt: now.toISOString() }
            : t,
        )
      : db.approachTasks,
  }));

  return id;
}

export async function getApproachTask(id: Uuid): Promise<ApproachTask | undefined> {
  return getDb().approachTasks.find((t) => t.id === id);
}
