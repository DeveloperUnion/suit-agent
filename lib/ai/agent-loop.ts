import OpenAI from "openai";
import type { ResponseInput, Tool } from "openai/resources/responses/responses";

import { MODELS } from "@/lib/ai/models";

/**
 * モデルに道具を渡して、答えが出るまで回す。
 *
 * **openai SDK に Responses API 用の自動 tool loop は無い**（runTools() は
 * Chat Completions 専用）ので、ここで自分で回す。回数の上限を必ず置くこと —
 * 道具が空を返し続けると、上限が無ければ止まらない。
 *
 * store: false。会話には顧客の氏名が載る。OpenAI 側に保持させる設定
 * （conversation オブジェクト）は 30 日 TTL の対象外＝無期限なので使わない。
 * 履歴はこちらの DB が持っている。
 */

/** 1 ターンで道具を呼べる回数。名前を引く → カルテを読む → 提案、で 3 回 */
const MAX_STEPS = 6;

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export type TurnResult = {
  reply: string;
  /** 呼ばれた道具の名前と引数。提案カードはこれを見て組み立てる */
  calls: { name: string; args: Record<string, unknown>; result: unknown }[];
  steps: number;
};

export class AgentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export async function runTurn({
  system,
  input,
  tools,
  handle,
  cacheKey,
  onToolStart,
}: {
  system: string;
  input: ResponseInput;
  tools: Tool[];
  handle: ToolHandler;
  cacheKey: string;
  /** 道具を呼ぶ直前に鳴る。画面へ「いま何をしているか」を流すために使う */
  onToolStart?: (name: string) => void;
}): Promise<TurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AgentError("OPENAI_API_KEY が設定されていません。", 500);

  const client = new OpenAI({ apiKey });
  const calls: TurnResult["calls"] = [];
  const conversation: ResponseInput = [...input];

  for (let step = 0; step < MAX_STEPS; step++) {
    let response;
    try {
      response = await client.responses.create({
        model: MODELS.chat,
        instructions: system,
        input: conversation,
        tools,
        store: false,
        // GPT-5.6 のキャッシュは明示のキーで効く。スタッフごとに分ければ、
        // 同じ人の続けての問い合わせが温まったまま返る。
        prompt_cache_key: cacheKey,
      });
    } catch (cause) {
      throw new AgentError(
        `応答を受け取れませんでした: ${cause instanceof Error ? cause.message : String(cause)}`,
        502,
      );
    }

    const toolCalls = response.output.filter((item) => item.type === "function_call");

    if (toolCalls.length === 0) {
      return { reply: response.output_text.trim(), calls, steps: step + 1 };
    }

    // モデルが出した output は、そのまま次の input に積み直す。
    // 積み忘れると、同じ道具を延々と呼び続ける。
    // 出力の型（ResponseOutputItem）と入力の型は名目上ちがうが、
    // 積み直しは API が想定している使い方そのものなので、ここだけ嵌める。
    conversation.push(...(response.output as unknown as ResponseInput));

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments) as Record<string, unknown>;
      } catch {
        // 引数が壊れているのはモデル側の問題。握りつぶさず、そのまま伝えて
        // 直させる（ここで例外にすると 1 回の失敗でターンごと落ちる）。
        conversation.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ error: "引数を JSON として読めませんでした。" }),
        });
        continue;
      }

      onToolStart?.(call.name);

      let result: unknown;
      try {
        result = await handle(call.name, args);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : "道具が失敗しました。" };
      }
      calls.push({ name: call.name, args, result });
      conversation.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result ?? null),
      });
    }
  }

  // 上限に当たった。黙って途中経過を答えにしない。
  throw new AgentError("うまくまとまりませんでした。もう一度お願いします。", 504);
}
