-- 提案が「一度だけ適用される」ことを構造で守る。
--
-- applied_at は「提案 → 適用」機構の本体だが、これまでその列を守るものが
-- 何も無かった。UPDATE ポリシーは行を選べても列を選べないので、
-- 20260811085058_agent_messages.sql のポリシーだけだと次の 2 つが通る。
--
--   1. 適用済みの提案をもう一度適用する（applied_at を上書きする）
--      lib/data/agent-chat.ts の markAgentActionApplied() は無条件の UPDATE で、
--      画面側にも再適用のガードが無い。会話は残り続けるので、
--      何ヶ月も前のカードを押し直せてしまう。しかも書き込みは本当に起きる
--   2. action jsonb を書き換える
--      カードに出したものと、適用ハンドラが読むものが別になる。
--      「見せた提案と実行される提案を束ねる」が壊れ、承認が演劇になる
--
-- どちらも無音。customer_facts / customer_ng_notes と同じく
-- BEFORE UPDATE のトリガーで止める（app.guard_fact_append_only の兄弟）。

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

  -- 適用は一度だけ。取り消しは applied_at を戻すのではなく、
  -- 書き込まれた側（customer_facts.invalidated_at など）で行う。
  --
  -- 「値が変わったら」ではなく「適用済みなら一律に」弾く。上で他の列を全部
  -- 凍らせてあるので、適用済みの行への UPDATE はそもそも意味を持たない。
  -- 値の変化で判定すると、**同じ時刻で押し直したときに素通りする** —
  -- now() は 1 トランザクション内で同じ値を返すので、二重送信や
  -- 「押したか分からず もう一度押す」がちょうどこの形になる。
  if old.applied_at is not null then
    raise exception 'この提案はすでに適用されています'
      using errcode = 'restrict_violation';
  end if;

  -- 適用した日時は DB が決める。画面から渡させると、
  -- 「いつ適用したか」に嘘を書ける。
  if new.applied_at is not null and old.applied_at is null then
    new.applied_at = now();
  end if;

  return new;
end
$$;

create trigger agent_messages_append_only
  before update on public.agent_messages
  for each row execute function app.guard_agent_message_append_only();

comment on function app.guard_agent_message_append_only() is
  '会話は追記のみ。提案の中身は変えられず、適用は一度だけ。';
