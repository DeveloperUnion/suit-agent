"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_BYTES } from "@/lib/ai/extraction";
import { cn } from "@/lib/utils";

/**
 * 名刺・発注書を渡すための入口。
 *
 * accept に capture を添えるのは、店頭の iPad でその場で撮る使い方が主になるため。
 * PC ではドラッグ＆ドロップ、iPad ではカメラ、どちらも同じ入口で受ける。
 *
 * 大きすぎるファイルはここで止める。サーバまで運んでから断ると、
 * 読み取り中の表示を見せたあとで失敗することになり、待たせただけになる。
 */
export function FileDrop({
  onFile,
  accept,
  label,
  hint,
  disabled,
  multiple,
  className,
}: {
  /** 複数渡されたときは 1 件ずつ呼ばれる */
  onFile: (file: File) => void;
  accept: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** 着装写真のように、まとめて選べたほうが早いもの */
  multiple?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accept_ = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("ファイルが大きすぎます", {
        description: `${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB までにしてください。`,
      });
      return;
    }
    onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const files = multiple ? Array.from(e.dataTransfer.files) : e.dataTransfer.files[0] ? [e.dataTransfer.files[0]] : [];
        for (const file of files) accept_(file);
      }}
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-dashed p-5 text-center transition-colors",
        over ? "border-brand bg-accent/40" : "border-border",
        className,
      )}
    >
      <Upload className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button
        variant="outline"
        className="h-11"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        ファイルを選ぶ
      </Button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture="environment"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // 同じファイルを続けて選べるよう、毎回クリアする
          e.target.value = "";
          for (const file of files) accept_(file);
        }}
      />
    </div>
  );
}
