-- 「直前に話していた相手」を、会話の行に残す。
--
-- これが無かったとき、直前の相手は**最後に提案を出した相手**から逆算していた
-- （クライアントが history を後ろから見て action.customer を拾う）。だから
-- カルテを読んだだけ・聞き返しただけのターンは足跡を残さず、こうなった:
--
--   1. 山岸さんへの提案を出す        → 直前の相手 = 山岸さん
--   2.「天野さんの広背筋は」と聞く   → カルテを読むだけなので足跡が残らない
--   3.「日本一の背中って言われてる」 → 名前が無い。直前の相手は？ → 山岸さん
--
-- **サーバの検算も同じ値を見ている**ので、ここが狂うとモデルと門が仲良く同じ
-- 間違いをする。狂いようのある値を 1 つ減らすのが要点で、
-- 「そのターンが誰の話だったか」はサーバが道具の呼び方から知っているのだから、
-- 推測させずにそのまま残す。
--
-- 顧客が消えても会話は残る（on delete set null）。相手を失った過去の発言は、
-- 相手の分からない発言として扱えばよい。

alter table public.agent_messages
  add column subject_customer_id uuid references public.customers (id) on delete set null;

comment on column public.agent_messages.subject_customer_id is
  'そのターンが誰の話だったか。1 人に定まったときだけ入る（検索や、同姓が複数出た聞き返しは NULL）。';


-- 追記のみの守りを広げる。相手を後から書き換えられると、
-- 「あのとき誰の話だったか」が動いてしまい、次のターンの宛先も一緒に動く。

create or replace function app.guard_agent_message_append_only() returns trigger
  language plpgsql
as $$
begin
  if new.id        is distinct from old.id
  or new.staff_id  is distinct from old.staff_id
  or new.role      is distinct from old.role
  or new.body      is distinct from old.body
  or new.action    is distinct from old.action
  or new.citations is distinct from old.citations
  or new.subject_customer_id is distinct from old.subject_customer_id
  or new.sent_at   is distinct from old.sent_at
  then
    raise exception '会話は追記のみです。提案と根拠は後から変えられません'
      using errcode = 'restrict_violation';
  end if;

  if old.applied_at is not null or old.rejected_at is not null then
    raise exception 'この提案はすでに %されています',
      case when old.applied_at is not null then '適用' else '却下' end
      using errcode = 'restrict_violation';
  end if;

  if new.applied_at  is not null then new.applied_at  = now(); end if;
  if new.rejected_at is not null then new.rejected_at = now(); end if;

  if new.applied_action is not null and new.applied_at is null then
    raise exception '適用していない提案に applied_action は入れられません'
      using errcode = 'restrict_violation';
  end if;

  return new;
end
$$;
