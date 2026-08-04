import { cn } from "@/lib/utils";

/** 帳票の 1 項目。ラベルと値の対 */
export function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className={cn("flex flex-col gap-0.5 py-1.5", className)}>
      <span className="field-label">{label}</span>
      <span
        className={cn(
          "text-sm leading-snug",
          mono && "tnum font-mono",
          empty && "text-muted-foreground/50",
        )}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}

/** 区分の見出し。細い縦罫を伴う */
export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 border-b border-border pb-1.5", className)}>
      <span className="h-3 w-0.5 shrink-0 bg-navy" />
      <h3 className="font-heading text-sm font-medium tracking-wide">{children}</h3>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
