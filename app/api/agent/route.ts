import type { ResponseInput } from "openai/resources/responses/responses";

import type { AgentAction, AgentCustomerRef, CustomerFieldKey } from "@/lib/types";
import { AgentError, runTurn } from "@/lib/ai/agent-loop";
import { AGENT_TOOLS } from "@/lib/ai/agent-schema";
import { MODELS } from "@/lib/ai/models";
import { contextLine, systemPrompt } from "@/lib/ai/prompt";
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
      customer: { id: string; name: string; nameKana: string } & Record<string, unknown>;
      facts: { id: string; label: string | null; body: string }[];
    };
    const dossiers = new Map<string, Dossier>();
    const dossierOf = async (id: string): Promise<Dossier | null> => {
      if (!dossiers.has(id)) {
        const d = (await getCustomer(ctx, id)) as Dossier | null;
        if (!d) return null;
        dossiers.set(id, d);
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

    const handle = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      const cid = typeof args.customerId === "string" ? args.customerId : "";
      const quote = typeof args.quote === "string" ? args.quote : undefined;

      switch (name) {
        case "search_customers": {
          const result = await searchCustomers(ctx, {
            labels: Array.isArray(args.labels) ? (args.labels as string[]) : [],
            freeText: typeof args.freeText === "string" ? args.freeText : undefined,
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
            similar: result.similar.map((s) => ({
              customer: remember({ id: s.id, name: s.name, nameKana: s.nameKana }),
              content: s.content,
            })),
          };
          // モデルには件数と、名前だけを返す。カルテの中身は渡さない
          // （一覧を描くのは画面で、モデルに並べ直させない）。
          return {
            exactCount: result.exactCount,
            exact: result.exact.map((c) => ({ id: c.id, name: c.name })),
            similar: result.similar.map((s) => ({ id: s.id, name: s.name, content: s.content })),
            similarAvailable: result.similarAvailable,
          };
        }

        case "find_customer": {
          const hits = await findCustomer(ctx, String(args.name ?? ""));
          hits.forEach((h) => remember(h));
          return hits.map((h) => ({
            id: h.id,
            name: h.name,
            companyName: h.companyName,
            labels: h.labels,
          }));
        }

        case "get_customer":
          return (await dossierOf(cid)) ?? { error: "そのカルテは開けませんでした。" };

        case "propose_add_fact": {
          const labels = Array.isArray(args.labels) ? (args.labels as string[]) : [];
          const plan = await planFactAdd(ctx, { customerId: cid, labels });
          const ref = await refOf(cid);
          if (!plan || !ref) return { error: "そのカルテは開けませんでした。" };
          if (plan.labelNames.length === 0) {
            return { alreadyHas: plan.alreadyHas, note: "すでに入っているので提案は作りません。" };
          }
          action = {
            kind: "add_fact",
            customer: ref,
            labelNames: plan.labelNames,
            newLabelNames: plan.newLabelNames,
            categoryKey: typeof args.categoryKey === "string" ? args.categoryKey : "hobby",
            body: String(args.body ?? ""),
            quote,
          };
          return plan;
        }

        case "propose_add_ng_note": {
          const ref = await refOf(cid);
          if (!ref) return { error: "そのカルテは開けませんでした。" };
          action = { kind: "add_ng_note", customer: ref, body: String(args.body ?? ""), quote };
          return { ok: true };
        }

        case "propose_update_customer": {
          const dossier = await dossierOf(cid);
          const ref = await refOf(cid);
          if (!dossier || !ref) return { error: "そのカルテは開けませんでした。" };
          const incoming = Array.isArray(args.changes)
            ? (args.changes as { field: CustomerFieldKey; value: string }[])
            : [];
          const changes = incoming
            .filter((c) => c.field in CUSTOMER_FIELD_LABELS)
            .map((c) => ({
              field: c.field,
              label: CUSTOMER_FIELD_LABELS[c.field],
              // 現在値を必ず添える。何が何に変わるかを見ずに押させない
              before: (dossier.customer[c.field] as string | null) ?? undefined,
              after: c.value,
            }))
            .filter((c) => c.before !== c.after);
          if (changes.length === 0) return { note: "変わる項目がありません。" };
          action = { kind: "update_customer", customer: ref, changes, quote };
          return { changes };
        }

        case "propose_add_anniversary": {
          const ref = await refOf(cid);
          if (!ref) return { error: "そのカルテは開けませんでした。" };
          action = {
            kind: "add_anniversary",
            customer: ref,
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
          const ids = new Set(Array.isArray(args.factIds) ? (args.factIds as string[]) : []);
          // カルテに実在する行だけ。モデルが作った id は落とす
          const facts = dossier.facts
            .filter((f) => ids.has(f.id))
            .map((f) => ({ id: f.id, label: f.label ?? undefined, body: f.body }));
          if (facts.length === 0) return { error: "その記録は見つかりませんでした。" };
          action = { kind: "invalidate_fact", customer: ref, facts, quote };
          return { facts };
        }

        case "propose_resolve_approach": {
          const ref = await refOf(cid);
          if (!ref) return { error: "そのカルテは開けませんでした。" };
          action = {
            kind: "resolve_approach",
            customer: ref,
            status: args.status === "skipped" ? "skipped" : "done",
            quote,
          };
          return { ok: true };
        }

        case "propose_ask_customer": {
          const ids = Array.isArray(args.candidateIds) ? (args.candidateIds as string[]) : [];
          const candidates = (await Promise.all(ids.map((id) => refOf(id)))).filter(
            (c): c is AgentCustomerRef => c !== null,
          );
          if (candidates.length === 0) return { error: "候補がありません。" };
          action = {
            kind: "ask_customer",
            keyword: "",
            candidates,
            pendingLabels: Array.isArray(args.labels) ? (args.labels as string[]) : [],
            body: String(args.body ?? ""),
          };
          return { ok: true };
        }

        default:
          return { error: `${name} という道具はありません。` };
      }
    };

    const contextCustomer = body.contextCustomerId
      ? ((await dossierOf(body.contextCustomerId))?.customer ?? undefined)
      : undefined;

    const input: ResponseInput = [
      ...(body.history ?? [])
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.body }) as const),
      { role: "user" as const, content: `${contextLine(contextCustomer)}\n\n${text}` },
    ];

    const turn = await runTurn({
      system: systemPrompt(await factVocabulary(ctx)),
      input,
      tools: AGENT_TOOLS,
      handle,
      // スタッフごとに分ける。同じ人の続けての問い合わせが温まったまま返る
      cacheKey: `agent:${caller.userId}`,
      });

    return Response.json({
      reply: turn.reply,
      action,
      source: MODELS.chat,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    if (error instanceof AgentError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
