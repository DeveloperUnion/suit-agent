import { getAccessToken } from "@/lib/auth/current-staff";

/**
 * ブラウザから app/api/* を叩く口。
 *
 * サーバー側は認証が要る（lib/api/auth.ts）ので、トークンを載せるのはここ 1 箇所に
 * まとめる。呼び出し側ごとに書くと、必ずどれかが忘れられて 401 になる。
 *
 * lib/ai/extraction.ts に置かないのは、あちらが**サーバーからも読まれる**ため
 * （gemini.ts が MAX_UPLOAD_BYTES を見ている）。ここは lib/auth 経由で
 * lib/supabase/client.ts に触るので、サーバーの束に入ってはいけない。
 */

export type ApiRequest = {
  /** FormData なら Content-Type はブラウザに決めさせる（boundary が要るため） */
  body: FormData | unknown;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error("サインインが切れています。もう一度サインインしてください。");
  return { Authorization: `Bearer ${token}` };
}

/**
 * 失敗はここで例外にする。呼び出し側は「できたかできなかったか」だけを扱えばよく、
 * 半端な結果を画面へ流さない。
 */
export async function postApi<T>(endpoint: string, { body }: ApiRequest): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
      ...(isForm ? {} : { "Content-Type": "application/json" }),
    },
    body: isForm ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((data: { message?: string }) => data.message)
      .catch(() => undefined);
    throw new Error(detail ?? "処理に失敗しました。");
  }
  return (await response.json()) as T;
}

/** 読み取り（OCR）。ファイルを 1 枚送って、確認画面の材料を受け取る */
export async function postExtraction<T>(endpoint: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  return postApi<T>(endpoint, { body });
}
