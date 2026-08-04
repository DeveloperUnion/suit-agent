"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Search, Star } from "lucide-react";

import { ElapsedDays } from "@/components/common/elapsed-days";
import { PageHeader } from "@/components/common/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers } from "@/lib/data/customers";
import { useMockQuery } from "@/lib/hooks/use-mock-db";

export function CustomerListView() {
  const [keyword, setKeyword] = useState("");
  const loader = useCallback(() => listCustomers({ keyword }), [keyword]);
  const { data: customers, loading } = useMockQuery(loader, [keyword]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Customers"
        title="顧客一覧"
        actions={
          !loading && customers ? (
            <span className="tnum font-mono text-sm text-muted-foreground">{customers.length}名</span>
          ) : null
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・カナ・会社名で検索"
          className="h-11 bg-card pl-9"
          aria-label="顧客を検索"
        />
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
                  <TableHead className="field-label">担当</TableHead>
                  <TableHead className="field-label w-32 text-right">最終接触</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell>
                      <Link href={`/customers/${c.id}`} className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 font-medium group-hover:underline">
                          {c.name}
                          {c.isKeyAccount && (
                            <Star className="size-3.5 fill-thread text-thread" aria-label="重要顧客" />
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.nameKana}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{c.staffName}</TableCell>
                    <TableCell className="text-right">
                      <ElapsedDays days={c.elapsedDays} />
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
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{c.name}</span>
                      {c.isKeyAccount && (
                        <Star className="size-3.5 shrink-0 fill-thread text-thread" aria-label="重要顧客" />
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.companyName ?? c.nameKana}
                    </span>
                    <span className="text-xs text-muted-foreground">担当 {c.staffName}</span>
                  </div>
                  <div className="shrink-0">
                    <ElapsedDays days={c.elapsedDays} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
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
