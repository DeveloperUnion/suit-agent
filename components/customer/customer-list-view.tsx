"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FileUp, Search, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { CustomerCreateDialog } from "@/components/customer/customer-create-dialog";
import { OrderSheetImportDialog } from "@/components/measurement/order-sheet-import-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers, listIndustries, listResidencePrefectures } from "@/lib/data/customers";
import { useMockQuery } from "@/lib/hooks/use-mock-db";

/** 「すべて」を空文字で持つと Select の value と噛み合わないため番兵を置く */
const ALL = "__all__";

export function CustomerListView() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [prefecture, setPrefecture] = useState(ALL);
  const [industry, setIndustry] = useState(ALL);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const loader = useCallback(
    () =>
      listCustomers({
        keyword,
        residencePrefecture: prefecture === ALL ? undefined : prefecture,
        industry: industry === ALL ? undefined : industry,
      }),
    [keyword, prefecture, industry],
  );
  const { data: customers, loading } = useMockQuery(loader, [keyword, prefecture, industry]);

  const prefectureLoader = useCallback(() => listResidencePrefectures(), []);
  const { data: prefectures } = useMockQuery(prefectureLoader, []);

  const industryLoader = useCallback(() => listIndustries(), []);
  const { data: industries } = useMockQuery(industryLoader, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Customers"
        title="顧客一覧"
        actions={
          <>
            {!loading && customers && (
              <span className="tnum font-mono text-sm text-muted-foreground">
                {customers.length}名
              </span>
            )}
            {/* 溜まった紙をまとめて片付ける日は、顧客を先に開く順序のほうが不自然になる */}
            <Button
              variant="outline"
              className="h-11 gap-1.5 sm:h-10"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="size-4" />
              発注書を取り込む
            </Button>
            <Button className="h-11 gap-1.5 sm:h-10" onClick={() => setCreateOpen(true)}>
              <UserPlus className="size-4" />
              顧客を登録
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm sm:w-auto sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="氏名・会社名で検索"
            className="h-11 bg-card pl-9"
            aria-label="顧客を検索"
          />
        </div>

        {/* 災害が起きたとき、その地域の顧客をまとめて拾うための絞り込み */}
        <Select value={prefecture} onValueChange={setPrefecture}>
          <SelectTrigger className="h-11 w-44 bg-card" aria-label="居住地で絞り込む">
            <SelectValue placeholder="居住地" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>居住地 すべて</SelectItem>
            {prefectures?.map((p) => (
              <SelectItem key={p.prefecture} value={p.prefecture}>
                {p.prefecture}（{p.count}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 業界単位で連絡する理由ができたときの絞り込み。
            候補は担当顧客に実在する業種だけ — 自由記述で入れたものもここに出る */}
        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger className="h-11 w-52 bg-card" aria-label="業種で絞り込む">
            <SelectValue placeholder="業種" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>業種 すべて</SelectItem>
            {industries?.map((i) => (
              <SelectItem key={i.industry} value={i.industry}>
                {i.industry}（{i.count}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading || !customers ? (
        <ListSkeleton />
      ) : customers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          該当する顧客がいません。検索条件を変えてください。
        </p>
      ) : (
        <>
          {/* md 以上はテーブル */}
          <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="field-label">顧客</TableHead>
                  <TableHead className="field-label">勤務先</TableHead>
                  <TableHead className="field-label w-40">業種</TableHead>
                  <TableHead className="field-label w-28">居住地</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell>
                      <Link href={`/customers/${c.id}`} className="flex flex-col gap-0.5">
                        <span className="font-medium group-hover:underline">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.nameKana}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.industry ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.residencePrefecture ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* md 未満はカードリスト。一覧を横に振るUIは実用にならない */}
          <ul className="flex flex-col gap-2 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors active:bg-accent/40"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.nameKana}</span>
                    {/* 狭い画面では行を増やさず、勤務先・業種・居住地を1行に畳む。
                        会社名に「・」を含むものがあるため、区切りはスラッシュにする */}
                    {(c.companyName || c.industry || c.residencePrefecture) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {[c.companyName, c.industry, c.residencePrefecture]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <CustomerCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/*
        顧客を渡さずに開く。紙の氏名から確認画面の中で顧客を決めるので、
        取り込み終わったらそのお客様のカルテへ送る。
      */}
      <OrderSheetImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(_sheetId, importedCustomerId) =>
          router.push(`/customers/${importedCustomerId}?tab=measurement`)
        }
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
  );
}
