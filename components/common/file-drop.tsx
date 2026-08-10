"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 名刺・発注書を渡すための入口。
 *
 * accept に capture を添えるのは、店頭の iPad でその場で撮る使い方が主になるため。
 * PC ではドラッグ＆ドロップ、iPad ではカメラ、どちらも同じ入口で受ける。
 */
export function FileDrop({
  onFile,
  accept,
  label,
  hint,
  disabled,
  className,
}: {
  onFile: (file: File) => void;
  accept: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

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
        const file = e.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
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
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 同じファイルを続けて選べるよう、毎回クリアする
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
