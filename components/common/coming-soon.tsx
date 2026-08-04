import { PageHeader } from "@/components/common/page-header";

/** 後続の壁打ちで作る画面のプレースホルダ。導線だけ通しておく */
export function ComingSoon({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow={eyebrow} title={title} />
      <div className="rounded-md border border-dashed border-border bg-card/50 p-8">
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
