"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { EditableSection } from "@/components/common/editable-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listAllStaff,
  listMonthlyRevenue,
  listRevenueTargets,
  saveRevenueTargets,
} from "@/lib/data/settings";
import { useQuery } from "@/lib/hooks/use-query";
import { formatAmount, parseAmount } from "@/lib/utils/date";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 月次の売上目標。
 *
 * 顧客と違い、目標はスタッフごとに閉じない。週次の打ち合わせで全員の数字を
 * 並べて見るものなので、ここでは担当の境界を引かず他のスタッフ分も開ける。
 */
export function RevenueTargetSettings() {
  const [year, setYear] = useState(new Date().getFullYear());

  const staffLoader = useCallback(() => listAllStaff(), []);
  const { data: staff } = useQuery(staffLoader, []);

  // 誰の目標を編集するかは画面の選択。既定は自分だが、それは
  // 読み込み後に決まるので state に同期せず、その場で導出する。
  // （書き込みの主体は DB の default が決めるので、ここで要るのは表示だけ）
  const [picked, setPicked] = useState<string | null>(null);
  const me = staff?.find((s) => s.isCurrent);
  const staffId = picked ?? me?.id ?? "";
  const setStaffId = setPicked;

  /*
   * 閲覧は全員、書き込みは「自分のぶん or 管理者」。DB のポリシーと同じ条件を
   * ここにも書く（supabase/migrations/20260811083444_approach_and_targets.sql）。
   *
   * **通らない操作のボタンを出さない**ためで、権限の判定そのものではない。
   * 権限は RLS が持っている — ここを消しても他人の目標は書けないままになる。
   */
  const canEdit = staffId !== "" && (staffId === me?.id || me?.role === "admin");

  const targetsLoader = useCallback(
    () => listRevenueTargets(staffId, year),
    [staffId, year],
  );
  const { data: targets } = useQuery(targetsLoader, [staffId, year]);

  const revenueLoader = useCallback(
    () => listMonthlyRevenue(staffId, year),
    [staffId, year],
  );
  const { data: revenue } = useQuery(revenueLoader, [staffId, year]);

  const monthKey = (m: number) => `${year}-${String(m).padStart(2, "0")}`;
  /** 未設定は 0 で返す。画面が「未設定」と 0 円を区別しないため */
  const targetOfMonth = (month: string) =>
    targets?.find((t) => t.month === month)?.amount ?? 0;
  const targetOf = (m: number) => targetOfMonth(monthKey(m));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger className="h-11 w-56 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(staff ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.isCurrent && <span className="ml-2 text-xs text-muted-foreground">自分</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => setYear((y) => y - 1)}
            aria-label="前の年"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tnum font-mono text-sm font-medium">{year}年</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => setYear((y) => y + 1)}
            aria-label="次の年"
          >
            <ChevronRight className="size-4" />
          </Button>
        </span>
      </div>

      <EditableSection
        title="月次売上目標"
        initial={() =>
          Object.fromEntries(
            MONTHS.map((m) => [monthKey(m), targetOf(m) === 0 ? "" : String(targetOf(m))]),
          )
        }
        canEdit={canEdit}
        onSave={async (draft) => {
          /*
           * **変わった月だけ送る。**12 ヶ月ぶんを毎回送っていた頃は、
           * 触っていない空欄が「0 になった＝未設定に戻せ」と解釈されて
           * 削除に回り、1 つでも空欄があれば保存全体が落ちていた。
           */
          const changed = MONTHS.map((m) => ({
            month: monthKey(m),
            amount: parseAmount(draft[monthKey(m)] ?? ""),
          })).filter(({ month, amount }) => amount !== targetOfMonth(month));

          if (changed.length === 0) {
            toast.success("変更はありません");
            return;
          }
          await saveRevenueTargets(staffId, changed);
          toast.success(`${year}年の売上目標を保存しました`);
        }}
        view={
          <div className="grid gap-x-6 gap-y-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
            {MONTHS.map((m) => {
              const target = targetOf(m);
              const actual = revenue?.[monthKey(m)] ?? 0;
              return (
                <div key={m} className="flex flex-col gap-0.5">
                  <span className="field-label">{m}月</span>
                  <span className="tnum font-mono text-sm">
                    {target === 0 ? (
                      <span className="text-muted-foreground">未設定</span>
                    ) : (
                      `¥${formatAmount(target)}`
                    )}
                  </span>
                  <span className="tnum font-mono text-xs text-muted-foreground">
                    実績 ¥{formatAmount(actual)}
                  </span>
                </div>
              );
            })}
          </div>
        }
        edit={(draft, update) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {MONTHS.map((m) => (
                <label key={m} className="flex flex-col gap-1">
                  <span className="field-label">{m}月</span>
                  <Input
                    value={draft[monthKey(m)] ?? ""}
                    onChange={(e) => update({ [monthKey(m)]: e.target.value })}
                    inputMode="numeric"
                    placeholder="未設定"
                    className="h-11 bg-card text-right font-mono"
                  />
                </label>
              ))}
            </div>
            {/* 目標は年内でほぼ同額のことが多い。12回打たせない */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-10"
                onClick={() => {
                  const first = MONTHS.map((m) => draft[monthKey(m)]).find(
                    (v) => parseAmount(v ?? "") > 0,
                  );
                  if (!first) return;
                  update(Object.fromEntries(MONTHS.map((m) => [monthKey(m), first])));
                }}
              >
                最初に入れた額をすべての月に入れる
              </Button>
            </div>
          </div>
        )}
      />

      <p className="text-xs text-muted-foreground">
        売上は受注日で数えます。0 または空欄にすると「未設定」に戻り、
        ダッシュボードの目標線は引かれません。
      </p>
    </div>
  );
}
