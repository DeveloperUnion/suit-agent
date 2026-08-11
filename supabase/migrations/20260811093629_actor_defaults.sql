-- 「誰が操作したか」を DB の既定値にする。
--
-- customers.staff_id に default app.current_staff_id() を置いたのと同じ考え方を
-- 操作者の列にも広げる。
--
-- 狙いは 2 つ。
--
-- 1. アプリが「自分が誰か」を知らずに書けるようになる。
--    RLS が絞り込みを引き受けた結果、lib/data/* に残っていた
--    getCurrentStaffId() の用途は「操作者として記録する」だけになっていた。
--    それも既定値に寄せると、データ層から主体の概念が完全に消える。
--
-- 2. 詐称が構造的に難しくなる。
--    明示的に渡す経路が無くなるので、他人の名前で記録するには
--    わざわざ値を書く必要がある。
--
-- 顧客の担当（customers.staff_id）とは別物であることに注意。
-- あちらはアクセス境界、こちらは記録。同僚が代理で受けた注文を RLS に使うと
-- 担当者から自分の顧客の注文が消える。

alter table public.orders
  alter column taken_by_staff_id set default app.current_staff_id();

alter table public.measurement_sheets
  alter column recorded_by_staff_id set default app.current_staff_id();

alter table public.approach_resolutions
  alter column resolved_by_staff_id set default app.current_staff_id();

-- revenue_targets.staff_id には既定値を置かない。
-- 管理者が他人の目標を編集する経路があるので、「省略したら自分」が
-- 常に正しいとは限らない。誰の目標かは呼び出し側が必ず明示する。
