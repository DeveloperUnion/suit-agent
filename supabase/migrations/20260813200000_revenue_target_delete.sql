-- 売上目標を消せるようにする
--
-- **20260811083444_approach_and_targets.sql の `revoke delete` を 1 本外す。**
--
-- 元の revoke は「顧客・採寸票・スタッフ・注文は物理削除できない」という原則を
-- そのまま横に広げたものだが、**revenue_targets はその原則の対象ではない。**
-- あれは PITR を入れない代わりに顧客の記録が消えないことを構造で担保するための
-- もので、月次の目標額は記録ではなく設定に近い。間違えて入れた額を直せない
-- ほうが害が大きい。
--
-- 実害も出ていた。画面は「未設定」を **行が無いこと**で表しているので
-- （lib/data/dashboard.ts:111 と components/dashboard/goal-panel.tsx:29 が
-- target === null で「未設定です」に分岐する）、目標を消す唯一の方法が
-- 行の削除だった。それが塞がっていたため、目標の保存そのものが
-- permission denied で落ちていた（docs/todo.md に「0 クリアが権限エラーで落ちる」）。
--
-- 「未設定」を amount = 0 の行で表す案は採らない。上の 2 箇所が 0 を
-- 「目標 0 円」として受け取り、達成率がゼロ除算になる。
--
-- **境界は INSERT / UPDATE とまったく同じにする。**3 つのポリシーの形が
-- 揃っていないと、片方だけ直したときに差が事故になる。
--   自分の目標は自分で。他人の目標は管理者だけ。
--
-- これは「管理者は閲覧のみ」から外れない。あれは**顧客データ**の原則で、
-- revenue_targets は最初からその外にある（docs/database-design.md の
-- 「書き込みポリシーで app.is_admin() を呼ぶのは店舗共通ルールだけ」）。

create policy revenue_targets_delete on public.revenue_targets
  for delete to authenticated
  using (staff_id = app.current_staff_id() or app.is_admin());

-- anon には戻さない。20260812120000_revoke_anon.sql が剥がした状態のまま。
grant delete on public.revenue_targets to authenticated;
