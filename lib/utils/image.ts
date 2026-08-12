/**
 * アップロード前の縮小。
 *
 * 店頭の iPad で撮ると 1 枚 3〜5MB になる。着装写真の使い道は
 * 「前回どう仕上げたかを見返す」ことなので、原寸で持つ意味がない。
 * 長辺 1600px あれば全身を写した 1 枚として十分に読める。
 *
 * 入口のサイズ上限（MAX_UPLOAD_BYTES）は FileDrop が縮小前に見ている。
 * こちらは通したあとの保存サイズを揃えるためのもので、目的が違う。
 */

const MAX_EDGE = 1600;
const QUALITY = 0.8;

/**
 * 画像を長辺 MAX_EDGE / JPEG に落とす。
 *
 * 読めなかったファイルは縮小せずそのまま返す。ここで throw すると
 * 「撮った写真が上がらない」だけが起きて、原因が画面から分からない。
 * バケット側で MIME と容量を弾くので、通してしまっても壊れはしない。
 */
export async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  // すでに小さいものは触らない。再エンコードで劣化させるだけになる
  if (scale === 1 && file.type === "image/jpeg") {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  return blob ?? file;
}
