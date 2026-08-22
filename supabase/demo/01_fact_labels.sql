-- 自動生成。直接編集しない。正は lib/mock/seed.ts と scripts/generate-demo-seed.ts。
--
-- **本番（torico-agent）の検証用データ。店舗に渡す前に 99_teardown.sql で消すこと。**
-- 既存の顧客 9 名と、手で入れた語（ワイン・サーフィンなど）には触れない。

-- normalized の UNIQUE で衝突を避ける。すでにある語（ワイン等）は既存行が勝つ。
-- id は入れない（default が振る）。dev-seed のように名前から計算した id を入れると、
-- 既存行と normalized で衝突して文ごと落ちる。
insert into public.fact_labels (name, category_key) values
  ('ゴルフ', 'hobby'),
  ('ワイン', 'hobby'),
  ('ネイビー', 'preference'),
  ('チャコール', 'preference'),
  ('無地', 'preference'),
  ('ストライプ', 'preference'),
  ('ブリティッシュ', 'preference'),
  ('商談', 'scene'),
  ('会食', 'scene'),
  ('式典', 'scene'),
  ('出張多い', 'lifestyle'),
  ('サーフィン', 'hobby'),
  ('チェック', 'preference'),
  ('ソフト', 'preference'),
  ('冠婚葬祭', 'scene'),
  ('サウナ', 'hobby'),
  ('ブラウン', 'preference'),
  ('スリム', 'preference'),
  ('登山', 'hobby'),
  ('釣り', 'hobby'),
  ('登壇', 'scene'),
  ('グレー', 'preference'),
  ('読書', 'hobby'),
  ('式典多め', 'scene'),
  ('写真', 'hobby'),
  ('日常業務', 'scene'),
  ('クラシック', 'preference'),
  ('ロードバイク', 'hobby'),
  ('クラシック音楽鑑賞', 'hobby')
on conflict (normalized) do nothing;
