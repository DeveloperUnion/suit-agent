import { cn } from "@/lib/utils";

/** 画面上部の見出し。帳票の表題にあたる */
export function PageHeader({
  eyebrow,
  title,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="field-label">{eyebrow}</span>}
        <h1 className="font-heading text-xl font-medium tracking-tight sm:text-2xl">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
