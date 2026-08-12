-- 自動生成。直接編集しない。
-- 正は lib/constants/ の measurement-fields.ts / adjustments.ts / facts.ts。
-- 直すときはそちらを編集して `npm run db:masters` を実行する。
--
-- 冪等なので何度流してもよい。delete は書かない — 使われている項目を
-- 消すと measurement_values の FK が壊れるため、廃止は人が判断する。

begin;

insert into public.item_types (id, name, sheet_label, body_part, requires_measurement, display_order)
values
  ('jacket', 'ジャケット', 'JACKET', 'upper', true, 1),
  ('pants', 'パンツ', 'PANTS', 'lower', true, 2),
  ('vest', 'ベスト', 'VEST', 'upper', true, 3),
  ('shirt', 'シャツ', 'SHIRT', 'upper', true, 4),
  ('coat', 'コート', 'COAT', 'upper', true, 5)
on conflict (id) do update set
  name = excluded.name,
  sheet_label = excluded.sheet_label,
  body_part = excluded.body_part,
  requires_measurement = excluded.requires_measurement,
  display_order = excluded.display_order;

insert into public.measurement_fields (item_type_id, key, label, unit, body_part, has_actual, has_finished, display_order)
values
  ('jacket', 'total_length', '総丈', 'cm', 'upper', true, true, 1),
  ('jacket', 'bust', 'バスト', 'cm', 'upper', true, true, 2),
  ('jacket', 'jacket_length', '上衣丈', 'cm', 'upper', true, true, 3),
  ('jacket', 'shoulder_width', '肩巾', 'cm', 'upper', true, true, 4),
  ('jacket', 'ef_half_chest', 'EF(半胸)', 'cm', 'upper', true, true, 5),
  ('jacket', 'sleeve_right', '袖丈右', 'cm', 'upper', true, true, 6),
  ('jacket', 'sleeve_left', '袖丈左', 'cm', 'upper', true, true, 7),
  ('jacket', 'collar_width', '衿巾', 'cm', 'upper', false, true, 8),
  ('jacket', 'vent_length', 'ベント又', 'cm', 'upper', false, true, 9),
  ('pants', 'waist', 'ウエスト', 'cm', 'lower', true, true, 1),
  ('pants', 'hip', 'ヒップ', 'cm', 'lower', true, true, 2),
  ('pants', 'thigh_width', '渡り巾', 'cm', 'lower', true, true, 3),
  ('pants', 'knee_width', 'ヒザ巾', 'cm', 'lower', true, true, 4),
  ('pants', 'hem_width', '裾巾', 'cm', 'lower', false, true, 5),
  ('pants', 'rise', '股上', 'cm', 'lower', true, true, 6),
  ('pants', 'inseam', '股下', 'cm', 'lower', true, true, 7),
  ('vest', 'bust', 'バスト', 'cm', 'upper', true, true, 1),
  ('vest', 'vest_length', 'ベスト丈', 'cm', 'upper', true, true, 2),
  ('vest', 'ef_half_chest', 'EF(半胸)', 'cm', 'upper', true, true, 3),
  ('shirt', 'neck', '首回り', 'cm', 'upper', true, true, 1),
  ('shirt', 'shoulder_width', '肩幅', 'cm', 'upper', true, true, 2),
  ('shirt', 'bust', '胸囲', 'cm', 'upper', true, true, 3),
  ('shirt', 'waist', '胴囲', 'cm', 'upper', true, true, 4),
  ('shirt', 'hem', '裾囲', 'cm', 'upper', true, true, 5),
  ('shirt', 'yuki', '裄丈', 'cm', 'upper', true, true, 6),
  ('shirt', 'cuff', '袖口', 'cm', 'upper', false, true, 7),
  ('shirt', 'shirt_length', '着丈', 'cm', 'upper', true, true, 8),
  ('coat', 'coat_length', '着丈', 'cm', 'upper', true, true, 1),
  ('coat', 'shoulder_width', '肩幅', 'cm', 'upper', true, true, 2),
  ('coat', 'bust', '胸囲', 'cm', 'upper', true, true, 3),
  ('coat', 'waist', '胴囲', 'cm', 'upper', true, true, 4),
  ('coat', 'hem', '裾囲', 'cm', 'upper', true, true, 5),
  ('coat', 'sleeve', '袖丈', 'cm', 'upper', true, true, 6)
on conflict (item_type_id, key) do update set
  label = excluded.label,
  unit = excluded.unit,
  body_part = excluded.body_part,
  has_actual = excluded.has_actual,
  has_finished = excluded.has_finished,
  display_order = excluded.display_order;

insert into public.adjustment_masters (code, name, strength, default_value, body_part)
values
  (11, '反身', '弱', 0.7, 'upper'),
  (13, '屈身', '弱', 0.7, 'upper'),
  (15, '衿ミツ入れ', null, 0.5, 'upper'),
  (17, '突き取り', null, 0.5, 'upper'),
  (18, '猫背', null, 0.7, 'upper'),
  (21, '怒り肩', '弱', 0.5, 'upper'),
  (23, '撫で肩', '弱', 0.5, 'upper'),
  (26, '前肩', '弱', 1, 'upper'),
  (28, '鎌浅く', null, 0.5, 'upper'),
  (29, 'AHマエクル', null, 1, 'upper'),
  (31, 'ハト胸', null, 1.2, 'upper'),
  (34, '前巾出し', '弱', 0.7, 'upper'),
  (36, 'ケマワシ入', '強', 2, 'upper'),
  (37, '前下り', '強', 1, 'upper'),
  (39, '背巾出し', null, 0.7, 'upper'),
  (40, 'ケマワシ出', null, 2, 'upper'),
  (52, '前釦（下げ）', null, -1.5, 'upper'),
  (53, '前釦（上げ）', null, 1.5, 'upper'),
  (5, '出尻', null, 1, 'lower'),
  (32, '脇尾錠（帯上）', null, 0, 'lower'),
  (72, '平尻', null, 1, 'lower'),
  (73, 'ライン抜け', null, 2, 'lower')
on conflict (code) do update set
  name = excluded.name,
  strength = excluded.strength,
  default_value = excluded.default_value,
  body_part = excluded.body_part;

insert into public.fact_categories (key, label, sort_order)
values
  ('hobby', '趣味', 1),
  ('preference', '好み', 2),
  ('scene', '着用シーン', 3),
  ('work', '仕事', 4),
  ('lifestyle', '暮らし', 5),
  ('other', 'その他', 6)
on conflict (key) do update set
  label = excluded.label,
  sort_order = excluded.sort_order;

commit;
