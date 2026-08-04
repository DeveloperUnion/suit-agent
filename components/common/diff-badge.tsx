import { cn } from "@/lib/utils";

/**
 * 前回採寸との差分。
 * 増減はチャコの色分けに寄せる（増＝しつけ糸の赤、減＝青チャコ）。
 * 良し悪しの判断ではなく、方向だけを示す。
 */
export function DiffBadge({ diff, className }: { diff: number | undefined; className?: string }) {
  if (diff === undefined || diff === 0) return null;
  const up = diff > 0;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 rounded-sm px-1 font-mono text-[0.6875rem] leading-5",
        up ? "bg-thread/10 text-thread" : "bg-chalk/10 text-chalk",
        className,
      )}
      title={`前回比 ${up ? "+" : ""}${diff}cm`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {up ? "+" : ""}
      {diff}
    </span>
  );
}
