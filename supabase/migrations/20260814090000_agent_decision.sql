-- 提案に対する「人の判断」を、適用だけでなく却下まで残す。
--
-- これまでカードにあったのは「適用する」だけで、**違うと思ったときの口が無かった**。
-- 押されないまま流れていくので、外した提案がどれだったかを後から数えられない。
--
-- 承認の型としては LangChain の現行スキーマが
-- `allowed_decisions: ("approve" | "edit" | "reject" | "respond")[]` を持っていて、
-- 却下も一級の決定として扱う。こちらもそれに揃える。
--
-- **却下は精度改善の一次データ**でもある。「AI が何を出したか」だけでは何も分からず、
-- 「人が何を直したか・何を捨てたか」で初めて改善の向きが決まる。
--
--   applied_action … 実際に適用された内容。提案そのものではなく**人が見て押した形**。
--                    カード上でラベルを外したり宛先を差し替えたりできるので、
--                    提案と食い違いうる。その差分が、注釈をつける手間ゼロで得られる
--                    正しくラベル付けされた教師データになる。

alter table public.agent_messages
  add column rejected_at    timestamptz,
  add column applied_action jsonb;

comment on column public.agent_messages.rejected_at is
  '人が「違う」を押した日時。適用と同じく一度きり。';
comment on column public.agent_messages.applied_action is
  '実際に適用された内容。提案（action）との差分が、人が直したところ。';


-- 追記のみの守りを、新しい 2 列まで広げる。
--
-- 20260813090000 のトリガーは「適用済みなら一律に弾く」形だった。決定が 2 つに
-- 増えたので、**どちらか一方が済んでいたら、もう一方も含めて受け付けない**に直す。
-- 「適用したあとで却下」「却下したあとで適用」はどちらも意味を持たない。

create or replace function app.guard_agent_message_append_only() returns trigger
  language plpgsql
as $$
begin
  if new.id      is distinct from old.id
  or new.staff_id is distinct from old.staff_id
  or new.role    is distinct from old.role
  or new.body    is distinct from old.body
  or new.action  is distinct from old.action
  or new.sent_at is distinct from old.sent_at
  then
    raise exception '会話は追記のみです。提案の中身は後から変えられません'
      using errcode = 'restrict_violation';
  end if;

  -- 決定は一度だけ。取り消しは applied_at を戻すのではなく、書き込まれた側
  -- （customer_facts.invalidated_at など）で行う。
  --
  -- 「値が変わったら」ではなく「決定済みなら一律に」弾く。now() は 1 トランザクション
  -- 内で同じ値を返すので、同じ時刻で押し直すと変化なしと判定されて素通りする。
  if old.applied_at is not null or old.rejected_at is not null then
    raise exception 'この提案はすでに %されています',
      case when old.applied_at is not null then '適用' else '却下' end
      using errcode = 'restrict_violation';
  end if;

  -- 日時は DB が決める。画面から渡させると「いつ判断したか」に嘘を書ける。
  if new.applied_at  is not null then new.applied_at  = now(); end if;
  if new.rejected_at is not null then new.rejected_at = now(); end if;

  -- 適用していないのに「適用した内容」だけが残る、を作らない
  if new.applied_action is not null and new.applied_at is null then
    raise exception '適用していない提案に applied_action は入れられません'
      using errcode = 'restrict_violation';
  end if;

  return new;
end
$$;

comment on function app.guard_agent_message_append_only() is
  '会話は追記のみ。提案の中身は変えられず、適用も却下も一度だけ。';
