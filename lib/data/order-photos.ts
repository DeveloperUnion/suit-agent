import type { OrderPhoto, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";
import { shrinkImage } from "@/lib/utils/image";

/**
 * 着装写真。
 *
 * 実体は order-photos バケット（非公開）、行は public.order_photos。
 * 2 つ持つのは、並び順と「どの注文の写真か」を Storage の命名規約だけに
 * 乗せないため — そうすると RLS の判定経路が 2 系統になる。
 *
 * パスは {customerId}/{orderId}/{uuid}.jpg。先頭が顧客 id なのは、
 * storage.objects のポリシーが 1 セグメント目だけで判定できるようにするのと、
 * 顧客を消すときにプレフィックス 1 本で消せるようにするため。
 */

const BUCKET = "order-photos";

/** 署名 URL の寿命。カルテを開いている間だけ保てばよい */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type OrderPhotoView = OrderPhoto & {
  /** 表示用の署名 URL。期限付きなので保存も共有もしない */
  url: string;
};

const PHOTO_COLUMNS = "id, orderId:order_id, customerId:customer_id, storagePath:storage_path, createdAt:created_at";

/**
 * 1 注文ぶん。古い順に並べる（撮った順に読めるほうが経緯として自然）。
 *
 * 署名 URL は 1 件ずつ作らずまとめて作る。1 注文で数枚、カルテ 1 枚で
 * 十数枚になるので、往復の数がそのまま体感になる。
 */
export async function listOrderPhotos(orderId: Uuid): Promise<OrderPhotoView[]> {
  const { data, error } = await supabase()
    .from("order_photos")
    .select(PHOTO_COLUMNS)
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw error;

  const rows = (data ?? []) as unknown as OrderPhoto[];
  if (rows.length === 0) return [];

  const { data: signed, error: signError } = await supabase()
    .storage.from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storagePath), SIGNED_URL_TTL_SECONDS);
  if (signError) throw signError;

  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows
    // 署名できなかったものは出さない。壊れた画像枠が並ぶより無いほうがよい
    .filter((r) => urls.get(r.storagePath))
    .map((r) => ({ ...r, url: urls.get(r.storagePath) as string }));
}

/**
 * 1 枚上げる。
 *
 * Storage に置いてから行を入れる。行だけ先に入れると、アップロードが
 * 落ちたときに「あるはずの写真が開けない」状態が残る。逆順のときに起きる
 * 取り残し（実体だけある）は、行が無ければどの画面からも参照されない。
 */
export async function uploadOrderPhoto(
  order: { id: Uuid; customerId: Uuid },
  file: File,
): Promise<void> {
  const blob = await shrinkImage(file);
  const path = `${order.customerId}/${order.id}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (uploadError) throw uploadError;

  const { error } = await supabase()
    .from("order_photos")
    .insert({ order_id: order.id, customer_id: order.customerId, storage_path: path });
  if (error) {
    // 行が入らなかったなら実体も残さない。誰からも見えないゴミになる
    await supabase().storage.from(BUCKET).remove([path]);
    throw error;
  }

  bump();
}

/** 1 枚消す。実体 → 行の順。行が残って実体が無いほうが画面に出る分だけ悪い */
export async function deleteOrderPhoto(photo: Pick<OrderPhoto, "id" | "storagePath">): Promise<void> {
  const { error: removeError } = await supabase()
    .storage.from(BUCKET)
    .remove([photo.storagePath]);
  if (removeError) throw removeError;

  const { error } = await supabase().from("order_photos").delete().eq("id", photo.id);
  if (error) throw error;
  bump();
}

/**
 * 顧客 1 人ぶんの実体をすべて消す。deleteCustomer() が RPC の手前で呼ぶ。
 *
 * SQL 関数から Storage には手が届かないので、ここだけはクライアントの仕事。
 * list は 1 階層ずつしか返らないため、注文フォルダを引いてから中身を消す。
 */
export async function removeCustomerPhotos(customerId: Uuid): Promise<void> {
  const { data: folders, error } = await supabase()
    .storage.from(BUCKET)
    .list(customerId, { limit: 1000 });
  // バケットに 1 枚も無ければ list は空を返す。ここで落ちるのは権限か通信の問題
  if (error) throw error;

  const paths: string[] = [];
  for (const folder of folders ?? []) {
    const { data: files, error: listError } = await supabase()
      .storage.from(BUCKET)
      .list(`${customerId}/${folder.name}`, { limit: 1000 });
    if (listError) throw listError;
    for (const file of files ?? []) {
      paths.push(`${customerId}/${folder.name}/${file.name}`);
    }
  }

  if (paths.length === 0) return;

  const { error: removeError } = await supabase().storage.from(BUCKET).remove(paths);
  if (removeError) throw removeError;
}
