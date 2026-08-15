-- 答えの根拠を、会話と一緒に残す。
--
-- 「時枝さんってどんな人だっけ」の答えが、どの記録から来たかを出す。
-- 出典を「カルテより」で終わらせず、**その行まで飛ばす**のが要点で、
-- NotebookLM が信用を作っているのもそこ（引用をクリックすると原文の該当箇所へ行く）。
--
-- 揮発させないのは action と同じ理由。接客の合間に開き直したときに、
-- 「さっきの話は何を根拠にしていたか」が消えていると辿れない。
--
-- **モデルが書いた id をそのまま入れない。**サーバがそのターンに実際に返した
-- 記録の id と突き合わせ、無いものを捨てたあとの値だけがここに来る
-- （quote を発話と突き合わせているのと同じ考え方）。

alter table public.agent_messages
  add column citations jsonb;

comment on column public.agent_messages.citations is
  '答えの根拠になった customer_facts。実在する id だけがサーバ側の照合を通って入る。';


-- 追記のみの守りを広げる。提案と同じく、根拠も後から書き換えられない。
-- 「見せた根拠」と「実際に見た記録」が別になると、出典が出典でなくなる。

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
