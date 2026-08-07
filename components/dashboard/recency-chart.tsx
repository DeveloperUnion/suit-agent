import type { RecencyBucket } from "@/lib/data/dashboard";
import { cn } from "@/lib/utils";

/**
 * 最終接触からの経過日数の分布。
 *
 * この画面の主題である「放置の可視化」（要件4.4）を担う唯一の図。
 * 色は順序の手がかりだけを持ち、良し悪しの判断は閾値の注記が文字で担う。
 * 色に判断を負わせると、色が見えない環境で意味が消えるため。
 */
const RAMP = ["var(--recency-1)", "var(--recency-2)", "var(--recency-3)", "var(--recency-4)"];

export function RecencyChart({
  threshold,
  distribution,
  total,
  neverContacted,
  overdueCount,
  overdueRatio,
}: {
  threshold: number;
  distribution: RecencyBucket[];
  total: number;
  neverContacted: number;
  overdueCount: number;
  overdueRatio: number;
}) {
  const max = Math.max(1, ...distribution.map((b) => b.count));
  const firstOverdueIndex = distribution.findIndex((b) => b.overdue);

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-heading text-sm font-medium tracking-wide">
          最終接触からの経過日数
        </h2>
        <span className="tnum font-mono text-xs text-muted-foreground">{total}名</span>
      </header>

      <div className="flex flex-col gap-1">
        {distribution.map((bucket, i) => (
          <div key={bucket.key}>
            {/* 閾値は色ではなく注記した破線で示す。色は順序だけを担う */}
            {i === firstOverdueIndex && (
              <div className="flex items-center gap-2 py-2">
                <span className="h-px flex-1 border-t border-dashed border-thread/50" />
                <span className="shrink-0 text-[0.6875rem] text-thread">
                  閾値 {threshold}日 — ここから下が放置
                </span>
                <span className="h-px w-4 border-t border-dashed border-thread/50" />
              </div>
            )}

            <div
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 py-1"
              title={`${bucket.label}：${bucket.count}名`}
            >
              <span className="font-label text-[0.8125rem] text-foreground">{bucket.label}</span>
              <span className="flex h-5 items-center">
                <span
                  className="h-2.5 rounded-r-[4px] transition-[width]"
                  style={{
                    width: `${Math.max(bucket.count === 0 ? 0 : 2, (bucket.count / max) * 100)}%`,
                    background: RAMP[i] ?? RAMP[RAMP.length - 1],
                  }}
                />
              </span>
              <span
                className={cn(
                  "tnum text-right font-mono text-sm",
                  bucket.count === 0 && "text-muted-foreground/50",
                )}
              >
                {bucket.count}
              </span>
            </div>
          </div>
        ))}
      </div>

      <footer className="flex flex-col gap-1 border-t border-border pt-3">
        <p className="text-sm">
          <span className="tnum font-mono font-medium text-thread">{overdueCount}名</span>
          <span className="text-muted-foreground">
            （{Math.round(overdueRatio * 100)}%）が{threshold}日を超えて連絡できていません。
          </span>
        </p>
        {neverContacted > 0 && (
          <p className="text-xs text-muted-foreground">
            ほかに、まだ一度も連絡していない顧客が {neverContacted}名います。
          </p>
        )}
      </footer>
    </section>
  );
}
