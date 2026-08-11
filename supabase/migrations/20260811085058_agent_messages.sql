-- Phase 1: アシスタントとの会話
--
-- 本体は applied_at。
--
-- 「提案 → 人が適用を押してから書き込む」を採ったので、AI は承認なしに
-- 何も書けない。その結果:
--   ・customer_facts に「人間か AI か」の区別を持たなくてよくなった
--     （できた行はすべて人間が作った行）
--   ・agent_actions / revert_agent_action() の事後取り消し機構が丸ごと不要
--   ・AI が採寸値を書く事故も、適用ハンドラが実装していない種類の書き込みは
--     原理的に起こせない、という形で塞がる（GRANT より強い）
--
-- 後戻りの非対称性が決め手だった。この機構があれば「趣味だけ自動適用」は
-- applied_at を即座に入れるだけで実現できるが、逆（即時 + revert から
-- 提案 → 適用へ）は作り直しになる。

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),

  -- 会話も顧客と同じ境界を引く。他人の会話は覗けない。
  -- default で「自分の会話しか作れない」を宣言的に表す。
  staff_id uuid not null references public.staff (id) default app.current_staff_id(),

  role text not null check (role in ('user', 'assistant')),
  body text not null,

  -- AgentAction をそのまま。kind ごとに形が違ううえ、提案は
  -- 「そのとき何を提案したか」のスナップショットなので、後から
  -- 正規化して引き直す対象ではない。
  action jsonb,

  -- 適用済みなら日時。カードの適用ボタンはこれで消える。
  applied_at timestamptz,

  sent_at timestamptz not null default now()
);

comment on table public.agent_messages is
  '会話。接客の合間に開き直したり端末を持ち替えたりする使い方なので、揮発させない。';
comment on column public.agent_messages.applied_at is
  '人が「適用」を押した日時。これが NULL の間、提案は DB のどこにも反映されていない。';

create index agent_messages_staff_idx on public.agent_messages (staff_id, sent_at);

alter table public.agent_messages enable row level security;
alter table public.agent_messages force row level security;

create policy agent_messages_select on public.agent_messages
  for select to authenticated using (staff_id = app.current_staff_id());

create policy agent_messages_insert on public.agent_messages
  for insert to authenticated with check (staff_id = app.current_staff_id());

-- 適用済みにするための UPDATE。他人の会話は触れない。
create policy agent_messages_update on public.agent_messages
  for update to authenticated
  using (staff_id = app.current_staff_id())
  with check (staff_id = app.current_staff_id());

-- 会話は捨てられてよい（clearAgentMessages が既にある）。
-- customer_facts から FK を張っていないので、消しても事実は残る。
create policy agent_messages_delete on public.agent_messages
  for delete to authenticated using (staff_id = app.current_staff_id());

grant select, insert, update, delete on public.agent_messages to authenticated;
