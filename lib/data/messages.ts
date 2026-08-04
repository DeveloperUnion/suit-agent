import type { ApproachTask, CompanyNews, Message, Uuid } from "@/lib/types";
import { getDb } from "@/lib/store/mock-db";

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
