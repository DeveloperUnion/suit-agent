"use client";

import { useCallback, useState } from "react";
import { ImageOff, X } from "lucide-react";
import { toast } from "sonner";

import { FileDrop } from "@/components/common/file-drop";
import { Button } from "@/components/ui/button";
import { deleteOrderPhoto, listOrderPhotos, uploadOrderPhoto } from "@/lib/data/order-photos";
import { useQuery } from "@/lib/hooks/use-query";
import type { Uuid } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 着装写真。
 *
 * 注文カードでは読むだけ、編集ダイアログでは足す・消す。同じ帯を 2 通りに
 * 使い回すのは、大きさと並びが 2 箇所でずれると「編集で見た並び」と
 * 「カルテで見る並び」が違って見えるため。
 *
 * 素の <img> を使う。署名 URL は期限付きで毎回変わるので、next/image の
 * 最適化キャッシュに載せる意味がない。
 */
export function OrderPhotos({
  orderId,
  customerId,
  readOnly,
  className,
}: {
  orderId: Uuid;
  /** アップロード先のパスに要る。読むだけなら渡さなくてよい */
  customerId?: Uuid;
  readOnly?: boolean;
  className?: string;
}) {
  const loader = useCallback(() => listOrderPhotos(orderId), [orderId]);
  const { data: photos } = useQuery(loader, [orderId]);
  const [pending, setPending] = useState(false);

  const rows = photos ?? [];

  const add = async (file: File) => {
    if (!customerId) return;
    setPending(true);
    try {
      await uploadOrderPhoto({ id: orderId, customerId }, file);
    } catch {
      toast.error("写真を上げられませんでした");
    } finally {
      setPending(false);
    }
  };

  const remove = async (photo: { id: Uuid; storagePath: string }) => {
    setPending(true);
    try {
      await deleteOrderPhoto(photo);
    } catch {
      toast.error("写真を消せませんでした");
    } finally {
      setPending(false);
    }
  };

  if (readOnly) {
    // 1 枚も無ければ枠だけ出しておく。空欄があること自体が
    // 「ここに写真が入る」という説明になっている。
    if (rows.length === 0) {
      return (
        <div
          className={cn(
            "flex h-24 w-full shrink-0 items-center justify-center rounded-sm border border-dashed border-border bg-muted/40 sm:h-28 sm:w-20",
            className,
          )}
        >
          <ImageOff className="size-4 text-muted-foreground/50" />
        </div>
      );
    }

    return (
      <div className={cn("flex shrink-0 gap-2 overflow-x-auto", className)}>
        {rows.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={photo.url}
            alt="着装写真"
            loading="lazy"
            className="h-24 w-[68px] shrink-0 rounded-sm border border-border object-cover sm:h-28 sm:w-20"
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rows.map((photo) => (
            <div key={photo.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt="着装写真"
                loading="lazy"
                className="h-28 w-20 rounded-sm border border-border object-cover"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute -right-1.5 -top-1.5 size-7 rounded-full border border-border bg-card"
                disabled={pending}
                onClick={() => void remove(photo)}
                aria-label="この写真を消す"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <FileDrop
        accept="image/*"
        multiple
        disabled={pending || !customerId}
        onFile={(file) => void add(file)}
        label="着装写真をここにドロップ、または撮る"
        hint="長辺 1600px に縮小して保存します。写真だけは保存ボタンを待たず、その場で反映されます。"
      />
    </div>
  );
}

/**
 * 注文を作る前に選んでおく版。取り込みの確認画面から使う。
 *
 * まだ orderId が無いのでアップロードできない。File のまま預かって、
 * 注文ができた直後に commitOrderSheetImport が上げる。
 */
export function OrderPhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (next: File[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="h-28 w-20 rounded-sm border border-border object-cover"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute -right-1.5 -top-1.5 size-7 rounded-full border border-border bg-card"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label="この写真を外す"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <FileDrop
        accept="image/*"
        multiple
        onFile={(file) => onChange([...files, file])}
        label="着装写真をここにドロップ、または撮る"
        hint="取り込みと一緒に保存します。あとから注文履歴の「編集」でも足せます。"
      />
    </div>
  );
}
