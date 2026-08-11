import {
  CONFIDENCE_RULE,
  EXTRACTION_MODEL,
  ExtractionError,
  extractedString,
  OMIT_RULE,
  runExtraction,
} from "@/lib/ai/gemini";
import type { BusinessCardExtraction } from "@/lib/ai/extract-business-card";

/**
 * 名刺の読み取り。
 *
 * 名刺には氏名・会社名・部署・役職・連絡先が揃っているのに、
 * いまは接客のたびに同じ内容を打ち直している。ここを埋めるのが目的。
 *
 * 読めた値は顧客登録フォームの初期値として置くだけで、
 * 人が確認して「登録」を押すまで保存はしない。
 */

const SCHEMA = {
  type: "object",
  properties: {
    fields: {
      type: "object",
      properties: {
        name: extractedString("氏名。姓と名の間は半角スペース1つ"),
        nameKana: extractedString("氏名のフリガナ。カタカナに統一する"),
        companyName: extractedString("会社名。株式会社などの法人格も含める"),
        department: extractedString("部署名"),
        jobTitle: extractedString("役職"),
        phone: extractedString("電話番号。携帯があれば携帯を優先する"),
        email: extractedString("メールアドレス"),
        address: extractedString("住所。郵便番号は含めない"),
      },
    },
  },
  required: ["fields"],
};

const PROMPT = `
あなたはオーダースーツ店の販売員です。接客中に受け取った名刺を読み取り、JSON にしてください。

# 読み取りの決まり
1. 表面と裏面のどちらが写っていても、読める項目を拾ってください。英語面しか無い場合は英語のまま入れます。
2. nameKana は名刺にフリガナの印字がある場合だけ入れてください。
   **氏名の読みを推測して書かないでください。** 人名の読みは外しやすく、間違ったまま登録されると次の接客で使えません。
3. 電話番号が複数あるときは携帯番号を優先し、raw には名刺での表記（「TEL」「携帯」などの見出しを含む行）を入れてください。
4. 住所に郵便番号は含めないでください（郵便番号は別項目として持ちません）。
5. 会社のロゴやキャッチコピー、URL、SNS のアカウントは読み取り対象外です。

${OMIT_RULE}

${CONFIDENCE_RULE}
`.trim();

export async function POST(request: Request) {
  const startedAt = performance.now();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ message: "ファイルが送られていません。" }, { status: 400 });
  }

  let raw: Pick<BusinessCardExtraction, "fields">;
  try {
    raw = await runExtraction<Pick<BusinessCardExtraction, "fields">>({
      file,
      prompt: PROMPT,
      schema: SCHEMA,
    });
  } catch (error) {
    const status = error instanceof ExtractionError ? error.status : 500;
    const message = error instanceof Error ? error.message : "読み取りに失敗しました。";
    return Response.json({ message }, { status });
  }

  const extraction: BusinessCardExtraction = {
    source: EXTRACTION_MODEL,
    elapsedMs: Math.round(performance.now() - startedAt),
    fields: raw.fields ?? {},
  };

  return Response.json(extraction);
}
