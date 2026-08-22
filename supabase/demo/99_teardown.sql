-- 自動生成。直接編集しない。
--
-- **本番へ入れた検証用データを消す。店舗に渡す前に必ず流すこと。**
--
--     supabase db query --linked -f supabase/demo/99_teardown.sql
--
-- ## このファイルは git に入れる。作り直さないこと
--
-- 下の id 一覧は **lib/mock/seed.ts が生成した顧客そのもの**で、本番に実際に
-- 入っている行と 1 件ずつ対応している。seed.ts を触ったあとに db:demo-seed を
-- 流し直すと、**一覧が入れ替わって本番の行を指さなくなり、消し漏れる**。
-- 投入したときのものをそのまま残しておくこと。
--
-- 消すのはこの投入で作った顧客 600 名と、その従属行だけ。
-- 既存の顧客 9 名（山岸秀匡さん・横川尚隆さんなど手で入れたもの）と、
-- 手で入れた語（カレー・サーフィン・サッカー観戦・ビジネス・ワイン・
-- 保険の営業・野球観戦）には触れない。
--
-- ## なぜ public.delete_customer() を呼ばないのか
--
-- あの関数は app.can_write_customer() で**担当者かどうか**を見る。ここは
-- postgres から流すので auth.uid() が無く、current_staff_id() が NULL になって
-- 42501 で落ちる。担当者を偽装するより、同じ順序を集合演算で書くほうが素直。
--
-- ## 順序は写しであって、思いつきではない
--
-- 20260813190000_drop_order_photos.sql の public.delete_customer() と**同じ順序**。
-- 向こうを直したらこちらも直すこと。要点は 2 つ:
--
--   1. FK に cascade のある表と無い表が混在している。任せると
--      customer_facts / customer_ng_notes / search_chunks で FK 違反になる
--      （実際にここで一度落ちた）
--   2. **measurement_values を票より先に消す。**change_log のトリガーは
--      via_sheet モードで measurement_sheets を引いて customer_id を決めるので、
--      票を先に消すとログの customer_id が NULL になり、最後の掃除から漏れて
--      寸法が残る

begin;

create temporary table demo_customer_ids (id uuid primary key) on commit drop;

insert into demo_customer_ids (id) values
  ('2b90d6b6-7d2d-5236-bc8b-2d4c7b6aa586'), ('8bb2e4b2-21dc-5be2-9c44-88d0cc4178ad'), ('a941d901-4b45-5325-b65b-306589074ad8'), ('92feb1cd-26cd-5084-abbd-0f3e247f899b'),
  ('6b1936d3-b8bf-5fc4-a36d-c804b568ab51'), ('aa8e691d-08db-5d26-a9c8-a0b6ee3ef3ed'), ('ada56063-9088-5abd-9ae8-28bdb2e3a7e1'), ('ca8d3e07-5bea-5ef0-8f3b-2f50a3a4fad1'),
  ('6761c336-41b4-524e-b969-d33f80bfc0f8'), ('ba979021-ca25-5efc-8947-1f2e505e7e53'), ('0ecd8310-9210-5e62-8386-8048dedc412b'), ('7ae64b26-e124-51ea-9089-7a37e53b02fb'),
  ('8a6fcc3b-4189-5395-a88d-370ae4012caf'), ('6bd72de5-47c4-56db-a413-d67d363c6dc5'), ('da0e5e52-bc88-5900-8b01-3bdc16c0c429'), ('3b248ee6-8f6f-551f-afad-f4b04b9a9a13'),
  ('99c102cd-6094-553c-9c90-9dd692dad132'), ('96665802-2ed6-5080-a4d3-68d620e36eae'), ('cd9f2ad5-dfc7-5b71-97e2-31381cfa0db8'), ('de523443-96e0-5a37-b9a7-b2de025c06fe'),
  ('534a3e54-d5a1-5987-bf7d-9691bd56077e'), ('5748d382-4b62-5d68-b6e5-7fdfc298c24c'), ('c061c5dd-0a9d-5265-89ad-df59e01baf0d'), ('814b6e3b-5fdb-5d3c-923c-8f762c627f8f'),
  ('6b834b2d-565e-5b87-9bb1-b34311a50980'), ('4f1469d4-7aeb-5773-90a7-4a66849c88c8'), ('bc23656f-aa70-5111-920d-67dad38efbd8'), ('186c8fd7-11ab-591f-8e0c-dbac8b172075'),
  ('d9d35897-5b28-59c5-8a58-b31d40385bd6'), ('eb69ce7f-ff2c-521f-be08-cec05dad99e3'), ('4d82cfbe-2217-55fc-9373-f343b07c682e'), ('8f089f86-9871-5f55-a6cb-5291c3869bde'),
  ('35234ed0-dab5-592b-9805-df4fdea8f606'), ('5bfa571f-5e29-57cb-85fc-6370c4f54cf4'), ('b17380de-b22c-54f9-b6ca-29fdb44c428e'), ('664aaee8-935d-5aab-85cf-0f972924c4ea'),
  ('1d77ee38-0d6d-57a5-aef7-4f3ad540a202'), ('8cb355c3-876d-59f9-9e87-bc1120bc796d'), ('3a2e1ea3-f627-5fbf-9c39-bd3b61650cb2'), ('b37a225a-254a-59aa-a4ca-5e1907c7eb3f'),
  ('dab28bd8-b5cf-5981-945b-ee0f7ac4e331'), ('6de50e5a-c69d-5453-95f5-fd5c102a4fa1'), ('e38008c2-8aa4-5c43-9c3e-c9a295a54575'), ('728a6082-8c02-5963-ad9c-e85108b755a4'),
  ('59c0bde5-7534-5659-8c9d-fa686813fafa'), ('3f0aa57c-efab-5eaf-bc09-fc383f5bae36'), ('6fe5630c-bd90-517c-adec-96a17de53bab'), ('2033886e-f971-5810-b54f-4d7c0b90020e'),
  ('1aff251c-e860-514e-aded-5b59f941e3fc'), ('0dd503ec-d87f-59dd-806a-0e095ebdb365'), ('665da0f8-9c1d-5aa7-b004-27d27dc9c446'), ('295231af-a972-59e2-a1f7-67af454da359'),
  ('8176fb7c-6c81-57a8-9d30-f151684903db'), ('db9cfbdd-abff-5bd5-9817-0e4d2d497dc6'), ('e2bf05ae-5e70-55e2-994e-ede6b4d4dd07'), ('37aadafb-fcb9-5f3c-aa13-a747a49d9d3f'),
  ('02f9f87d-825a-5527-b2c6-bbfa7f3ab196'), ('a623a824-74d5-515d-a402-aaac7b709f04'), ('96534828-e12b-5f51-b675-a18f2f82c3bc'), ('aa601a65-1bb3-5b79-a3d5-2967e0fb1245'),
  ('e8f73371-fbe2-5c6c-a344-747fb2fe375d'), ('d680e625-43e3-56aa-b04e-8632887776d1'), ('275b5cab-4194-53d0-ad36-cb0ef4b9c301'), ('f334b544-de02-5a86-8305-760bc868c6b5'),
  ('cdcad61e-6dc6-5916-b37d-9a1021ca5c1e'), ('375f2b0e-e140-5023-a8cc-18f0ba2b528f'), ('f29e83e0-feb7-578c-855a-b0fe10640551'), ('72c5f5c1-3f9b-5f60-83f1-62789ca0c832'),
  ('05eae791-fb5d-56ad-b633-97f267828033'), ('761baf7c-8800-519b-969f-d1c78cbe9ccd'), ('cbaeb7d2-a86d-583e-9b0c-1e699e4e4242'), ('9dd5f688-9dce-5726-948f-12cbd8e9065b'),
  ('0635165d-e1d6-504f-a2b7-0588a43f818a'), ('7115d97c-bd75-5ce2-b433-c6bac92c73ab'), ('3463bcf3-643f-5f42-93cd-d29cf2ae0867'), ('441d74a4-5057-530b-ae08-ab4c1b9368b5'),
  ('ccceb4d1-ad70-5e7a-aeb4-2fe23f1a0ffe'), ('df802c76-e089-50a3-a799-f70d8d2665d6'), ('da89a7f8-f85d-5517-bddf-99bee95e83fe'), ('19bc6308-bea1-5e86-88fe-ff1b107e97ea'),
  ('fb883abc-ec74-5db3-bfd6-f4ab4755ec0d'), ('866b9ca4-fd6d-5c7a-903e-9c1694cc20cc'), ('6e153c51-b071-5a8f-8765-837ff0e03533'), ('bb7d5dfd-1706-5961-ad59-7b1f69c516b0'),
  ('c905dbd9-373b-5897-b5a2-56c341304d61'), ('6e323bf8-236d-59a6-b7c8-19aab38c1ab0'), ('1bc41e1e-5890-508c-9af0-743bb3133385'), ('1b373bc7-9501-537f-bd7c-b234c9150294'),
  ('99b77cdd-c87c-5db9-a853-a95e43ff6600'), ('48f14bb6-3337-5534-929b-34629584f505'), ('95325373-473f-5710-9f64-d5753e1c9583'), ('358d5546-9d32-53d1-bf4a-da7aebb6345b'),
  ('39b4f017-e914-582c-a76a-481c19e3e594'), ('7ee9e1c0-05d1-5947-b65b-5ac50cc79b43'), ('1d7a233c-2c92-51f7-8e36-458bfab1906c'), ('4ef2a350-a906-5ed7-afaf-79bef36a29b2'),
  ('a2196eba-391d-5f3c-a62b-a2913a6ff7e9'), ('a78f1e27-18dd-5ca1-a378-b6fdd33b3a32'), ('7090106a-5831-5c74-b229-fc212b363a7d'), ('31db02b5-8f04-574e-853a-c15e38d63dfc'),
  ('4913fd95-6f93-5520-91bb-4c2cfb8e179a'), ('f33a4718-afec-5d14-939b-0e2728e977f8'), ('7ff9400e-1bac-5ca5-8689-abddc2bd7813'), ('9ccea6d5-95d3-5ab1-9137-e01b368a70dc'),
  ('a9f7b6e8-ac15-5277-99e6-422b8f920841'), ('8e51f8db-cf37-5191-a3ad-1d4179913385'), ('e791ccfb-94b6-5879-abfd-abbe5c206ae0'), ('ccfeb92f-cd9e-5817-aa97-ff97fe54b6e0'),
  ('19551ecf-f6b1-5ad7-9e17-6635cd507bfb'), ('b900b8c2-5348-5435-b14e-a18b732eba4a'), ('5abc321a-25e5-53da-921f-a43f7a4c1786'), ('e0ce0b7b-1f3e-5499-832d-f97dfe0bb091'),
  ('c6594141-7c2f-5947-8d2e-e8ea1b97a7be'), ('049b1283-eeb8-59cb-ac9f-f2d1c2977fdf'), ('a94a6917-e143-55b9-87b5-a3262d91030b'), ('b1fbe671-2261-5b34-a1ec-8ae4eda73180'),
  ('f8cd7bca-008c-5bbb-9a18-41a6d894c432'), ('9cd801b8-93ae-562b-878f-91251c4ab940'), ('94f39c29-2fc3-59d6-88fe-b8e31c726f6f'), ('eadb1500-d361-5409-b340-2bb2d62ae504'),
  ('ce4b3611-36bd-5789-a0e7-975a15ab3d3c'), ('fb2299ce-cb61-5a45-8b49-3c80121be909'), ('bf02fb80-6537-5ff9-b17f-380ee279c1f9'), ('511c239b-f904-5218-8388-2b626dd9bc57'),
  ('7e193e65-1fdc-5ff7-808d-dfe741ea3c27'), ('64487ae5-112f-5451-bf6a-2749a5ccb4cf'), ('c174fe7a-2979-5ae9-91d6-50ce430e5025'), ('619c19b2-66bb-54e5-ad1e-4126f9ae18a7'),
  ('cab575ef-bfea-5730-a705-9f095803b7fc'), ('21a3be68-b041-5868-beae-89cb37814c54'), ('e47637f6-ca7f-50eb-8645-8d7bc5f77a3b'), ('5661fc85-35f8-59f4-af38-769c6ac4b98d'),
  ('8c73c3e3-e81f-59bc-b31f-79889a543e4e'), ('78a3c604-7574-5a91-b138-d4508c8655c6'), ('29a37684-b26c-5b26-9d2d-92329d1c1d75'), ('d4689e0f-bb7c-5411-a6b9-03e3ba807392'),
  ('f9b90e36-ad83-5af7-8bbc-a4bcb9fb2954'), ('ab5f840f-5c8c-59fa-abb3-cd258563ac85'), ('e08e69e0-0521-540b-bbe5-716cc4a6be48'), ('e4d751c3-bf02-5b69-80c8-44ae7143aa5f'),
  ('a836aba8-dca9-5f56-bb63-18bebdcbac93'), ('9d2bccad-256f-5f99-aa6a-fef6e2bd2887'), ('a1309346-7648-5976-92d7-95e4f31d0c79'), ('fa23f20b-da38-59fc-9d6d-53c04706438f'),
  ('9e2efb85-a004-5cab-851a-3af2017a47f8'), ('c2ed4921-194d-5a94-8fb6-9b5e847f3241'), ('f517a13e-0fcf-50c7-89c7-872e5fc56cb9'), ('9d99faea-0024-59d2-924e-522b03a54783'),
  ('4ae7e148-e533-57eb-a770-9a32fec8d83a'), ('537c9cff-7a37-5c63-b252-626d9f2b1537'), ('4b0508ae-e7e6-5d9f-8f42-4aea6faf6de8'), ('20082aa3-c046-5e8b-97c1-bfa161fa9077'),
  ('cd45cfd2-eba2-50ac-8149-4f26e550d9a1'), ('3767c7db-7f91-5d85-a989-fe546d9eb94f'), ('0016d101-5e84-53b8-85c7-da15de4e1d2e'), ('79cea983-fa30-5abd-93fd-af63c160fae1'),
  ('2f514324-ce77-53b8-af5a-27edc35fa194'), ('b556d926-86bf-5bc2-a0a8-0a1ead4d9c11'), ('4f91b356-79ed-5f05-8f86-4d8f0642f9cc'), ('b2bca3e0-1649-563f-a852-c8e7ff81abb5'),
  ('873463e3-0fd5-53e7-96c8-2adf503db2f0'), ('b3ae6090-5543-537f-98ef-1e63302efab6'), ('e38eb0b8-5f16-5b6b-b6bf-222a0d69915d'), ('d5512dca-8a84-5ad2-a422-c64e769738ff'),
  ('f382bb10-d186-53d2-a1da-666dff2425cf'), ('58847814-9848-5b29-be5f-83f18dc2c6a8'), ('6723ad0d-e04d-579a-8ac3-88b0e6f90a2b'), ('85e6ba35-4596-51bb-b988-68d1a604583c'),
  ('3068bfa1-3902-5e94-8ef4-24ad5089b47c'), ('931ab58a-f4a3-581c-b609-4fd192ec1723'), ('2b4688b1-fd4e-5b1b-a2b9-2696416370f4'), ('5084f5d6-6c64-5cf2-b62b-915d62843730'),
  ('38ecc148-ddda-5b8d-8784-7f68f27531ce'), ('c1681ce8-d44a-540b-a7bd-574999e339af'), ('60bdb035-e292-5619-9e04-849a9a969ebd'), ('7184f4ec-6531-5bc1-b92c-8f0081ff4273'),
  ('3bc55633-367f-517d-b6b3-13874e3b529b'), ('441da5dd-f9e0-5fc8-a6a8-42e79f269a74'), ('d2546466-0988-5329-977a-9b459c425b6f'), ('b525e88f-b8f1-5fe0-907a-e7b79d83e21e'),
  ('b0d02e84-16c1-59c9-98ca-98ce5b4a1db0'), ('b2c9fd9c-61f4-5df0-aceb-235d4c247365'), ('31469275-53b6-574b-84cb-14dd19d7994f'), ('7084d876-9aad-59b4-889a-677592af3beb'),
  ('9ee40bfe-57e4-5699-80aa-5764e6321d7a'), ('2ef907f2-adf0-5b24-bcc7-4fcc973b5d30'), ('e9e50d63-2b0c-5152-991c-6fba02288185'), ('1a7703db-316f-5905-a780-0b146b2be0ca'),
  ('992e1e43-7eee-5e1f-818e-6370e14b230a'), ('a57dfbcf-ff3e-51bc-8cd0-bf9356908e17'), ('938f13b2-19b4-5c2f-9345-189f8790aab1'), ('6482c636-5cb2-5eed-9b1a-5a7bd481b8c0'),
  ('5e407caf-a1c6-5b21-9abe-f59c98be6f23'), ('b3371e13-dd1a-5682-943d-abf403c95302'), ('92df4cb6-4629-5a74-9fa6-5e97d3d5951a'), ('bc50583e-f5b5-5107-b1ee-472f8d08242c'),
  ('50a7180c-7638-5249-bd76-b533c053ecb9'), ('e33361c6-88b5-5cf6-ab4e-2003d23a7baf'), ('bb0318a2-e2d8-5ee3-b964-1130ff784bf4'), ('3996cd64-9d35-5f41-8184-928ec6e61d70'),
  ('7f841885-868a-5cbe-aa0b-ff3911a336f5'), ('6f4e8592-0e5c-59de-89be-38d661925b74'), ('9e1cc2d9-0663-58db-bf0f-38c040326129'), ('5bc4a6fb-40e2-5cb4-af06-a3240342779b'),
  ('30febc89-0089-5c08-b4ed-7951c077249c'), ('8817ae73-8744-5107-95c2-6dda769bf1a0'), ('c75001ad-b4bb-5eb1-94e9-2a18def747a7'), ('2e22beab-3a48-53ff-b083-cef86335ce96'),
  ('08274b8b-1f1b-5073-a619-f64539a729b9'), ('769db984-9f00-5910-801a-d9a9bfa1c803'), ('8890fc09-3649-5799-88bb-45123d68b02c'), ('93fa39c8-d931-5135-b899-281956bd9a9d'),
  ('1433b542-8e24-581c-82e8-6a87469f1668'), ('5a038685-c422-507a-914f-ca9adb745442'), ('4de353a2-97ce-5e13-b031-a86f9daf95b1'), ('13ce6bbb-3b16-5bba-8e88-106eb2eec985'),
  ('6d35d127-0b24-5fbd-afba-cebaf124e639'), ('26cafb11-5a9b-5703-a816-e1389fbdcda0'), ('93a14e30-9681-5e0a-b00a-251ef3db34ce'), ('cdf5952e-fb58-5f6a-a6fa-d47b183aa562'),
  ('36ec5dab-13e4-578a-80ca-b717aa4466fa'), ('bc42f8c8-d3aa-5b80-ae17-ae33d5210d59'), ('285b2cec-13c2-5ff5-b882-dd7395b4d7bf'), ('4b62b1e9-ac8e-5fa7-bc64-04877f0e4147'),
  ('9b90f1b4-3e6f-546d-83ed-0f7bd94ae6a0'), ('4df8025a-bd76-5450-8bb3-84451731c7b0'), ('c114d50b-def3-57b8-b98f-a49af9731b9a'), ('cabf9141-6b13-5999-8454-131151a0cfb5'),
  ('1d8f20c8-5d76-5761-8151-4b866efe5ab6'), ('4d3dcbb4-7caa-5ffb-a20e-4283a9c41999'), ('3ff3e37e-31f4-5f9e-9668-af09e94ae701'), ('d78c1999-10be-516b-bc50-7dfba0c3bd39'),
  ('16f3e7f2-fcf5-5821-9549-e68808e0d7aa'), ('7c2ec15a-9e01-55bd-a763-c119004c32a7'), ('4a415e10-c5e4-50e2-8cc7-9d759e94d16b'), ('c8bff4ed-9c8e-574c-884a-6aeaafcb3553'),
  ('c7ddaf92-d174-5249-8e16-48f8c67b47af'), ('b5505fc9-11f6-549f-a285-c82b2a78700b'), ('a4c360d1-085c-59ed-8915-f6f3a780a615'), ('230ede35-46aa-56ad-b1a0-866852bc75bb'),
  ('50086a35-3bc5-52de-98c7-68bef9fccb85'), ('1ffbf0f7-026b-5f68-bbd4-89ba4eaa4ed2'), ('ee6f2e54-1cc6-5c12-9564-359a11f14a58'), ('449bf57f-008f-5474-b990-588837319fde'),
  ('339c0549-c186-56af-b2fc-375ea1ee7fb7'), ('260447ba-2040-5601-bf95-3cca86609048'), ('d2f9ca2a-92d0-59ba-afdf-e5eb157a958e'), ('ceb27386-f117-5c55-8bb1-b7171dcfe502'),
  ('71a83ce4-09a1-5bc5-82ec-342e34650f99'), ('56269bea-66c7-52b5-b096-627a73fc5eae'), ('8c9a9bfd-f709-53e0-b3ec-bc9d891eb39e'), ('1557942b-e33f-5c91-b3c2-602d7c51dea5'),
  ('cb3b69fc-f09b-5057-a5f4-f6f2613680f4'), ('58bba9ca-8678-58cb-aba4-3e79e59b9bda'), ('ef300144-7f9f-538a-a6f1-3f31ab9eb1b9'), ('237d41d9-5d72-53e2-a3d0-e68295c8c7cc'),
  ('ed3e2645-b1c1-5566-a206-7aef92427d46'), ('e7371195-e9a7-501c-a608-950bdbb8aaa8'), ('bc1bdb4c-ceee-5baa-9740-97ee2fb634af'), ('b9e4d155-0045-54fe-8214-1b5c2ad1b0c7'),
  ('ebf70000-f796-5034-8d05-a5a524151118'), ('8e1791cc-8d5c-5129-8301-d27eb8036f6e'), ('78497782-bcb8-546f-a3f0-55088279937d'), ('9f45e9f6-beea-5bdb-816a-2269f71ee7ca'),
  ('706ad207-471b-50b0-8a69-b6cfdc73f7a2'), ('4be75843-c149-5a37-a6fb-e8659dae6c32'), ('c3dbf1e0-d075-529a-9803-f9586ffb61ff'), ('4e49bab9-1f58-573e-8c68-2a31bc41e991'),
  ('3001b6bc-1eb8-576a-8a4e-b31549af24f9'), ('48339b55-c01e-5adf-9795-9e4e5688ca95'), ('9d5e5918-c208-5be5-92a1-bc3754a7c824'), ('89c534d3-6f57-52e1-9c62-cccf65bad9c1'),
  ('08ddff98-3db6-5b7c-8830-443bbe663f12'), ('2e056b68-f9c0-5bb1-add2-18cb6c9cfb71'), ('e4a96e02-8944-5439-b7c9-5f60803156f9'), ('17767f2a-de30-57ab-a467-5ebc425319ba'),
  ('0dbb742d-1676-508e-8b09-1e19cc2b79cb'), ('588e77d5-63df-51e5-bb51-9eff5c81d734'), ('33ddae8f-49bc-5777-9c03-64588fd28257'), ('2db4c655-be2d-52f4-a5ae-60c8152bca10'),
  ('9172deb7-ccad-53e0-8cc6-1941fa677792'), ('aaf33f3e-fa51-519d-adb8-4d19123e0eb4'), ('be91ef61-86bf-5fe9-b711-afd978ff9ab8'), ('bbc733ba-5c52-5c86-a0a8-67323d688107'),
  ('a9437161-cd53-577e-b22d-36024bc8a99b'), ('3402089a-490a-5e53-b327-f2123c997da5'), ('375f8f27-4657-5891-8619-1821b964160e'), ('a0ca9add-5422-58bf-8850-6611090f1c44'),
  ('0dcdd7b5-3379-5d6e-9eed-fe0806792ee1'), ('f898dab7-7068-5894-aa26-81506de5e698'), ('2fa1d790-cb7c-5357-b928-20f63f4e6136'), ('e5dc893c-b5cb-5c8a-a12e-c64648e2704d'),
  ('5a86483b-3bfa-574b-9c17-20c6ec3890f0'), ('5e046e76-2d86-5e29-aeb4-c4cf9d32afe9'), ('79d9752b-e0c4-5855-b8bf-1d56b85ea44e'), ('9aba95f9-47cb-5e7a-a6ba-7d749a66a291'),
  ('0cdf21f4-122d-598d-9c19-82f979361ec3'), ('6f71cacc-b36d-53fd-bd13-45b8e8bcb500'), ('0fecac85-50f3-5e73-a0e1-d7ec4db99ef2'), ('ed3b2e08-9dbf-5dcd-b7ea-ebf792572c64'),
  ('1a201bef-8903-5e1b-9544-2c5c632c76e6'), ('1dbf508e-eacd-5edd-a7e1-1cd22397b03d'), ('b41b75ec-5fe2-5321-9dc6-b63298e23954'), ('a7ddf9e3-7f5b-5f2d-ac95-3f1ae46a7cdc'),
  ('e9f59026-5137-58a2-900f-069f749f8631'), ('a0b7bcb1-0c97-5e49-ba8a-179f8a3ba55e'), ('aea1775e-ab78-546d-9f74-06183570c201'), ('329e2e45-d511-56d0-8013-b21a1bac7969'),
  ('66cdfe87-101c-53df-8a3c-9bd690a9aed3'), ('193e0f5c-633e-59b1-8d11-8632fe9f7b36'), ('7570d873-de17-566b-841a-ad7f03082a97'), ('3ae8e5c4-3b39-5483-a03a-e921d5d78420'),
  ('8afef402-2d26-5ab8-82e0-393d1009107b'), ('b55738f9-ae63-5028-8d74-30eb17b5772b'), ('bb05774d-db38-526a-8eda-377b8de313b8'), ('d5ccd9f5-fbfa-5f9a-9044-45b9358b46c1'),
  ('ae72da57-8034-545b-964c-07bfc66e352a'), ('45d32bc2-8eac-5d02-86a7-ac5e41b241eb'), ('3279cb8e-b501-5bf3-ad90-a44c7371206a'), ('94e5509c-cba3-5e43-a47a-c7497d124a98'),
  ('e6fac9b5-6d66-50ff-8a4d-faf91b13e15c'), ('134eec76-a1dc-5f08-b8a1-b479d2138f1f'), ('f230b08f-acbd-5335-ac07-c578c8bfd647'), ('f3dee860-e177-5b9a-a8e3-25cadaf48607'),
  ('1a34331a-3f48-5848-9923-ddb020943300'), ('1bd11522-b99d-573c-a122-f4a78e29c240'), ('c8da4545-c5c4-5846-b34a-51c523e86a80'), ('9302165d-0551-55e7-910b-c5e89b7ab148'),
  ('48400d6d-e642-5619-a147-aa9d8da1f9f1'), ('f623844f-8faa-57a2-ae1c-e735f48b0377'), ('2334f84b-5114-5e0a-87fc-70d8d8a5bc5b'), ('56c8390c-2e35-5223-bd0c-6da036749d5a'),
  ('08bf437d-32a2-548a-a4df-5e64862ae25e'), ('331c5b95-8321-539b-b5b9-c6f439f0bd8e'), ('5bb547ef-a178-5daa-b67d-e8f04fcb78e4'), ('d348df7e-78e1-5e2d-8e91-06dcd1db9d9f'),
  ('bf669c84-aa1d-5a2c-941c-aa42a1fdb154'), ('a7648994-977f-52f6-8cd0-921d2b86ae6d'), ('d1f2b434-e5e5-58dc-a462-7c48f480b6b9'), ('ed099c3c-1bbb-5ed3-883f-84417c45e086'),
  ('744d96d8-0328-56c1-9931-0fb8b5562a20'), ('97afb21f-3ed3-584b-9ed3-5cbee8dce3c6'), ('61452f5d-95ef-519e-8528-4c574b17f821'), ('ec037f04-fb8e-53ba-aa4e-7d0006787003'),
  ('3684bf72-a88b-58ab-b5e6-4f2c672c5ec4'), ('e9dbb00a-63cf-57a0-a111-c6d109d3a149'), ('1be28969-a13b-5f7b-bb93-b7538f11f183'), ('73997825-30ff-5246-a302-df046bf7c787'),
  ('c213d8f1-4dc7-5cfb-9233-d70a760bee34'), ('1e933391-f6c4-5c3a-a515-ff198f1a28e7'), ('53c2f39e-f701-5e1b-8616-247003e22344'), ('76b97664-8121-56c4-8785-45d340f38719'),
  ('f7fda4e7-596e-5aa5-a6a3-d8058daec454'), ('25985ab6-c8cd-55a1-9ba1-ac4d60e8bb5c'), ('55198d47-725c-53ab-8c46-c7da52a66f27'), ('7e272241-fd67-5055-bfef-5f5c2c7a6225'),
  ('d57d87e1-6a48-575f-86eb-41c690dcd2aa'), ('f726781e-b0b5-5fa0-baef-8d90e4ea6d8c'), ('d8266618-73ae-5f23-bb81-8e3f5a20683f'), ('11d67334-a108-555c-bc93-1d922ff739f0'),
  ('393230dd-9b71-5e65-b6b4-32f6032f0d4a'), ('77d3ad7d-385d-50f1-986a-5b0cef443420'), ('66e1519c-781c-5db7-847b-7e12629e60b1'), ('4fe66944-0770-5c3d-879e-ac2fe3504aae'),
  ('9b2f6e82-1e94-5aaf-9e75-b0f67adf7e05'), ('6dea3ca0-8ef9-5d29-8482-95aa74d9bd25'), ('6b2bd16b-430e-5e69-8bb9-06a9dfb82266'), ('18e79e08-dfcd-5b86-abb9-007b68369841'),
  ('accc736d-4bd1-5116-bb6d-a3610b5d4b14'), ('7582034a-5771-5555-a827-24d0f40abc72'), ('82af5ce8-f289-5b3e-ae0f-b9421af4cee8'), ('4b3dfb7b-fc10-53d4-9fea-9ef95c050014'),
  ('90c3347b-917a-53d8-b6e5-00c066a12759'), ('90b4dba0-3f47-521f-ba59-6690c6724fd2'), ('f2c47d68-bc33-5263-9205-021939cd88dc'), ('108f9c46-bf0f-5974-bcfa-928923f6f6bc'),
  ('e93bfc45-5d8b-5d8b-b63c-115141d2d295'), ('19038110-3f0a-5697-8f83-ba444bd02685'), ('891661f0-70cb-5d99-ba0c-91ab985601e4'), ('b80206a4-2c24-5adf-9a8f-90423ba650cb'),
  ('f8b0b5ac-d38f-5663-b38c-0bd3b01512e3'), ('92d4f127-b012-5ef9-b51b-bab8d35634d5'), ('49530b64-c8fe-5683-8c41-0dc567ae3d61'), ('4256cafe-7149-526d-9453-5ced46094ca0'),
  ('da680901-d16f-5d9a-8fcc-6f68a9fd3aa3'), ('60e76a84-9ce2-5a52-ad56-1d6013ce16f5'), ('297f1a78-a627-5ec8-b934-e01aff5b738f'), ('2aac21f3-260f-5be0-bd8b-2c3104cbd18a'),
  ('347a6292-f936-5735-9891-9e97154b1459'), ('8c626cc2-a4f4-5367-943b-3b53ff476024'), ('79bf032b-48d3-5f29-a5ce-40bef53743d5'), ('9fb29793-6d60-56b0-b4a7-3df4777cbc78'),
  ('b5e6988c-cfaa-5476-a355-07a822e96165'), ('3f2efe7c-cbf1-5644-ac3c-7fe8c13135ec'), ('3228255e-18e8-571d-80b4-dc3efde35517'), ('f449375c-7c5c-511f-9c8f-d544b5e62f76'),
  ('3bc46a93-b8ed-5062-b2a5-6a2d201198c7'), ('6c425c7d-b5f7-5f4b-82a1-cb0087b35ca4'), ('c3ec4e17-c391-5657-b437-6d20635d8a2d'), ('1f99f73e-4af5-5973-b5e8-b99228fc087a'),
  ('aeea45f4-c8d9-5227-9e0a-44bd035554af'), ('705df1e7-c6ca-5a6a-93c2-fa245cd766f0'), ('3b5c17a5-cca4-5ae6-b379-4186b5d005cc'), ('cf0a4ec2-4609-51bc-b612-5a7f3608d1e1'),
  ('9be874ba-1fb5-5f02-ba8f-7c25643d94a9'), ('898bdaad-2ecb-5f29-b0d4-7c467cba1faf'), ('fa84776f-143a-5e4f-804e-8faad14316b6'), ('047ceb25-0a48-5a9f-a4f3-0001c5546258'),
  ('a045c91a-6642-54f1-956d-d017c028fabc'), ('f5710290-e273-5e42-8e74-3902a9d5abcc'), ('c5869623-e047-55a6-9706-af1cc0f45d34'), ('248b5797-6d2b-5df3-8ccf-69aa4b89eab1'),
  ('bc956e2e-3437-5571-8af2-e3ee6fce660e'), ('74c57e5f-3760-537f-a675-1c299e931b52'), ('6ac81c6a-70c3-5275-b065-5b45ebd28b4c'), ('7e93564c-4a04-505f-839c-57da7e83f0fe'),
  ('9967f860-19f8-5895-a7b4-e200f929c413'), ('739bab05-fb7a-50fe-b235-fce30668d4cf'), ('82860edb-b1ac-53b5-b602-cd1a64ca9860'), ('9144118d-7031-5d3f-91fe-98245e3349bc'),
  ('e051b6c7-07a3-59c5-99e8-48417c408ae0'), ('37210719-4577-56f0-8a24-e4072e9d42b0'), ('40d96c44-73c0-5a1a-9ee7-39bcaa687564'), ('cb734f21-becb-5000-8917-43a63d318eea'),
  ('c322dacf-3e11-5b10-afee-34197fc5ea07'), ('f3d9176b-ad8e-5ac8-8e2f-1c90d7329bea'), ('70ef20a5-9aff-5618-aec0-f5200ab216e9'), ('49ecd1e1-e91c-5a58-8ce1-1a0a7f862867'),
  ('b0a1817f-b96c-5112-b7ec-fcb5746bb19c'), ('43e5216f-2f68-5bd7-bc69-aa6cae5a0af0'), ('171ae0ff-c157-53e4-a561-8a9b4fd59a52'), ('a5dd8bf5-94e1-5ea9-858c-470a7d6da755'),
  ('4c641868-0e40-5ce3-8489-2d612e75fed1'), ('75ee0607-59dd-56e9-b532-79d98ac1bee6'), ('1500be9c-0517-5df5-bd40-0c29ed784729'), ('30b3c61b-b4fd-5e12-ba1c-ce0f20c20cea'),
  ('94a072cb-e8c0-5dbf-9e32-3c710fc7c04b'), ('b74ea3e7-a536-5199-a7b8-55bd2a3867e7'), ('99eb4dac-5043-575b-a7e6-ecd7c0256c37'), ('3c8c815c-7f58-5df0-bb9a-bf802b560abd'),
  ('f055ff62-89e6-5d04-9962-953aa801c066'), ('ecdba961-a341-5b48-b1cf-dcac02f670d7'), ('bcf0145d-3aac-5649-8305-12463761866a'), ('6469ccbf-c1c3-5f25-9866-29991b39595a'),
  ('c5213d91-44dc-5115-912e-9e6f9f00a171'), ('4d6f0daa-0600-575f-8596-3a49cd2f60da'), ('a8647201-ac6e-52b8-85b4-8a4310911879'), ('5ea03fcb-432b-5d78-99e0-86d11cfd7b8f'),
  ('71d00bb2-01b8-55a1-86b8-684200776a46'), ('51b383cb-a0bd-51eb-8b63-ddd1fb493dc5'), ('9daca946-7c9f-5b93-9962-26d744b596e5'), ('93a82921-651f-528a-9ccf-2084b58f3b67'),
  ('714cbb8f-6c6b-5dd8-b500-12ddf0c22cc6'), ('459dc893-634c-5930-9ff5-ba3204aef774'), ('8bc86fe6-dd75-5b20-9690-7569dd380c2b'), ('94c8b78d-df7f-56cc-b790-500c3cbeb2c6'),
  ('797546d6-a3b8-54ba-b940-5100c4cbe722'), ('3223ae0b-8868-59d5-8d8a-0b1c5f359412'), ('42829183-f6e1-5009-b91f-6de93280bcbe'), ('81affdf8-47ba-5843-bb86-0353c6146886'),
  ('b9ad78ef-d4de-5e92-96ff-bc3154d5ced8'), ('69d9ac27-60d8-5857-a160-563ae399d42e'), ('9f6104f9-1d3e-52dd-808e-9d0c19980019'), ('61b1da36-3e36-538f-8938-d3f9a18893fc'),
  ('50cedea9-c4b2-53bf-a089-34fc1b582ead'), ('9b8ec788-c3d2-5c3c-b401-ec0cffebdb89'), ('e9636ef7-28d6-565d-8a7e-3b8da4cd12cf'), ('dec71a99-643f-54b3-8200-d9ba34e217b9'),
  ('297412b0-12d6-56c6-ab45-085bd7d9f687'), ('1f9add62-a724-52c1-b5f2-f8326bf2126e'), ('089b6ce0-2148-5042-b508-cd16dd35b094'), ('91b627e0-379d-5932-acd9-7e7d1bb17866'),
  ('4d626c2c-9472-512f-a315-4c2d93cb6956'), ('f3e94082-95d5-59d1-b485-c37baf61e3d0'), ('3d7771a1-ba7c-5446-98a6-a748076d0492'), ('ca980eec-12b8-53bc-9bec-c3280aab53be'),
  ('78a086e1-abd7-5125-a67f-b117fb014fef'), ('e2757ebc-37a4-5e16-933b-d86df5c826d1'), ('04029b57-5b27-567c-86f0-523639530c92'), ('938de334-f177-598c-b3d9-42eddb3095d7'),
  ('5266d985-2ef1-5d8d-b7be-14928d4b95b5'), ('c2273571-eea0-5430-9b06-b22dc4f64433'), ('3c4df388-b472-5938-9f55-183c6cd87e5c'), ('1d3b7a0b-0675-58ba-bb37-3b9dbba00883'),
  ('69e56414-d927-5508-8ab3-a7d1c65cc513'), ('c0fdb84f-444f-5928-96f1-f26ca84e3c2a'), ('a0c348a5-049e-512d-9cd3-385628a66f4a'), ('ef558327-ec4c-5824-a015-ab87a41ac1ff'),
  ('ec6756fe-d517-5be8-8049-10d34b812425'), ('2f868942-dc06-5281-84a3-cd771cdb5c05'), ('ddb16abc-a20a-5d7b-80d4-455b748845c3'), ('04c9c86c-7d98-56b5-b2e7-ded511723e73'),
  ('95a7cc8d-b194-570b-bc53-f13d68fab1b9'), ('41a0017e-7f8f-5790-9929-f97814977472'), ('0124c246-dd54-5f59-8673-046121a30188'), ('56183277-c714-509b-91e5-8d518d8d5a06'),
  ('1715479d-87be-50a9-abdb-882f1cefdb43'), ('b711a5ac-ef1a-5726-b297-3970d572b588'), ('60776fdc-998b-5b3c-9c32-6a494a0e4c4a'), ('20c2b7b4-d6e8-55f9-963c-3d5a16cd2787'),
  ('72a88cc0-29ee-5212-bfcb-066722df8b59'), ('3abb20d2-c27c-57bb-a9ee-7d4e014e1af2'), ('292fbc75-d1ee-5664-a76f-79ee98411384'), ('4a0cc709-b70e-5949-b296-836e51b153fa'),
  ('7cff1309-05fe-50c0-8204-7e0f21ab1871'), ('ff2968c8-7652-5a7a-be9e-14209c08488e'), ('f5d0e95b-8238-53bb-b451-3e5cc29a9ee6'), ('67250ad9-58c1-588e-9d7d-e73614ae0d58'),
  ('29baf948-d2c5-5992-bb78-1795720227e5'), ('6ffdde64-22bf-563a-9d49-8becbe0b657c'), ('772deec5-9fde-5f58-8b08-f63aa1dd8310'), ('70749b9a-0f74-54a3-85d2-f964246e3064'),
  ('5229ec14-8bc7-5bfd-a373-3da8b4819881'), ('cbd0f2d2-6068-53da-83c7-2fe749be1e0e'), ('48a1e98c-eb4e-5b63-acb3-145bc75f19bf'), ('e2a0c426-3530-58cd-8ad8-cee3f1339e88'),
  ('9dfde0e7-e9dc-58c3-9818-6c85275c3e35'), ('9a9e5aa3-6e35-5448-b2df-e318af706a3b'), ('dfa81a28-39c8-50e8-aa3b-94f178149e89'), ('6f8f8168-d346-5427-a1a7-db00862caad1'),
  ('3568bacb-b3d5-59e8-a1fc-aa80c54c4147'), ('fef1ab3f-29a6-549f-9938-dbade02deaff'), ('c5a50511-2e52-5cd2-905f-143e4233bd39'), ('3c519768-1a6a-5015-8a8c-4940fc694669'),
  ('1b3a7e97-ca2f-5d1f-bb44-f4e3d537aee9'), ('589c08a0-ec80-55f5-b1ea-fb62b290e8e5'), ('a9af04b4-a5a8-5017-99c1-ea058d87868c'), ('07562935-84de-5bb9-8030-4e6011c84582'),
  ('738fd337-80d2-508d-ada1-e4013e62abbf'), ('2c0c14b3-bbf4-57fc-a0d8-f650ae21892e'), ('c522ed32-9707-52d4-b640-dcab139de3b7'), ('26a158e0-370e-5c1f-8e3f-555a23d20d94'),
  ('e937007a-2f0d-5a5d-abe7-4545d3ef4c37'), ('c6e5104e-94cd-5b67-a78d-a4a10e0ac43a'), ('9929a31d-45ad-5c46-b12d-5a6cfd39ef17'), ('1369c88f-a4fe-5132-8d93-be316facdd54'),
  ('ca7ff92b-43a8-584b-8d02-95151e291df9'), ('875bdc34-4afd-55f4-96e0-9e0c8217d866'), ('1373ed64-8c68-546a-b282-837ceaf88a7c'), ('f266af84-1f92-54e8-a287-75aa7360360e'),
  ('e6fc5c20-ab1b-543b-967b-d6ad506d242b'), ('c1b3781a-b95e-51a7-bf86-158283fb92ab'), ('0b9d890d-d984-55c5-978e-aea641019eba'), ('4925cadb-bf9b-5cf0-bb29-bc0f7d8dd1c9'),
  ('92c49b43-cdaf-520e-8199-2f1a1798d3c5'), ('59d85a5a-e87d-5711-bc49-5b37e232310f'), ('57ff0fdf-93a7-557e-a6f7-d8a2cfca7b76'), ('f8e6aba7-4868-530e-8d0c-93f3ef34c4c2'),
  ('f94146a0-21d8-5131-b186-8fb89534c8d2'), ('f4e0f64e-0ead-566a-8e64-7ec83adc46d6'), ('c3b9a69d-0713-575b-b26a-8be6c80622c6'), ('adb8cee6-ae67-58a9-9ab2-5862865ebec4'),
  ('35450a37-b1e7-506f-b968-01f7a78d7a4f'), ('3a6b8e53-b491-55e0-bba1-43e7f749160f'), ('1da9fca4-5c3c-5d6e-b4f2-a44413e35362'), ('30ff816e-c769-5666-9bb8-6f60df9c7b95'),
  ('44fac87e-3d54-5533-be46-284279ae44ec'), ('51f9fa08-13c4-52a8-8382-68fe114e1543'), ('7741ec00-e5d9-5033-937e-3538ce780402'), ('2ac4db2a-2ded-579d-9aef-6d7899995f8b'),
  ('449e5946-f6b3-530f-9408-93aabbbaf576'), ('cfa74a94-af4a-55e0-9ae4-060ff1d08735'), ('84e543e6-61ed-57a0-b20b-6fccb7e9228f'), ('9c1ec67f-f3cd-5a0e-99e8-78b5dec13ae7'),
  ('071be258-fe88-55f4-b689-25ddb03cea92'), ('a6c2e356-cb6b-58d2-b267-9dae20fd10e5'), ('b27c0658-8be8-5244-a055-e87099845f5f'), ('43a97eab-9317-5ca9-9f01-e56ab52481d1'),
  ('161186c1-9089-5abd-b7f0-d4c4807cda29'), ('ac5f1ab9-6828-5791-bb40-f612439bc5d6'), ('017cf7da-4003-5350-8f6b-0492e2e35e45'), ('a934d1b3-5d5e-5349-9e02-b73e13dec69e'),
  ('8c3959b1-bd54-5a22-8b41-0bd0eba5a5b0'), ('d4f9eeba-d203-5fe2-8d78-ea90a9d51251'), ('1a015023-2d7d-5b8e-9d2c-687c8d126239'), ('9c246c2c-c725-507a-88c1-233151735119'),
  ('68e0b969-f182-511f-9582-e88097ac4566'), ('a5760a73-8d3d-5553-ba6d-b83d23ef062a'), ('71d58b10-b46f-5626-a3d6-f69605634cee'), ('857db9b9-1370-5174-b6c5-7fad872398b7'),
  ('0f774bbd-50a8-5fdf-ab7e-7d2e9b7ce6ef'), ('89171ce2-cb4d-547f-a66c-ef5f40c3b512'), ('09847737-e351-59bf-bc32-3a9c4f1a6e2e'), ('191685b2-2b25-57ff-879a-97eafc4e5eb2'),
  ('aaee60b6-d8ec-55d8-8358-ec4571e781c5'), ('05ddcec0-2c7b-55bb-b341-19167e6e4b61'), ('edaf8cdf-6a3b-5101-bc03-e2ad63514a7b'), ('e12e5fd5-8dbf-5a9f-a02b-b63a0ec6e649'),
  ('9660aeb5-c3ce-5dff-a1d1-6c7c50575548'), ('80a9af72-01b2-5e6d-ad2b-f315391a8bd3'), ('72f998ec-c98c-5fbc-85e8-66a53eee1b45'), ('c3e1aee7-5f90-5891-9ea4-484bcfa72922'),
  ('6766fcff-94d1-545c-8806-cd509f22e5d2'), ('18cab369-a7c6-57b2-8ef7-e514a52e6795'), ('60206c79-650c-5d1f-a6b2-f70e60ddb7b9'), ('9224b33f-e6f4-5743-9961-60f23775ee4f'),
  ('6fe2e249-11a6-52db-aee2-0f23a411431a'), ('6be2ba40-25a2-5a57-8b8a-81c3dd529f91'), ('3ebfc042-3f74-5c70-a347-14ad4b65000e'), ('ac1b7fb6-e0a5-5f3a-9469-c43798424799');

-- 意味検索の索引 → 事実 → 注意事項。ここは FK が no action
delete from public.search_chunks     where customer_id in (select id from demo_customer_ids);
delete from public.customer_facts    where customer_id in (select id from demo_customer_ids);
delete from public.customer_ng_notes where customer_id in (select id from demo_customer_ids);

-- ★ 採寸値を票より先に（上の 2 を見よ）
delete from public.measurement_values mv
 using public.measurement_sheets ms
 where mv.sheet_id = ms.id and ms.customer_id in (select id from demo_customer_ids);

delete from public.measurement_sections sec
 using public.measurement_sheets ms
 where sec.sheet_id = ms.id and ms.customer_id in (select id from demo_customer_ids);

delete from public.measurement_adjustments adj
 using public.measurement_sheets ms
 where adj.sheet_id = ms.id and ms.customer_id in (select id from demo_customer_ids);

delete from public.measurement_sheets where customer_id in (select id from demo_customer_ids);

delete from public.order_items oi
 using public.orders o
 where oi.order_id = o.id and o.customer_id in (select id from demo_customer_ids);

delete from public.orders                 where customer_id in (select id from demo_customer_ids);
delete from public.approach_resolutions   where customer_id in (select id from demo_customer_ids);
delete from public.customer_anniversaries where customer_id in (select id from demo_customer_ids);
delete from public.customers              where id          in (select id from demo_customer_ids);

-- 会話。agent_messages は顧客への FK を持たないが、action jsonb に
-- AgentCustomerRef（id と氏名）が入る。uuid の一致で十分に絞れる
delete from public.agent_messages m
 where exists (
   select 1 from demo_customer_ids d where m.action::text like '%' || d.id::text || '%'
 );

-- 監査ログ。ここまでの delete が DELETE 行を積んでおり、customers のぶんは
-- before に氏名・電話・住所が丸ごと入っている。**最後に消す**
delete from public.change_log where customer_id in (select id from demo_customer_ids);

-- 消え残りが無いか数える。**すべて 0 でなければ commit しないこと**
select
  (select count(*) from public.customers c      join demo_customer_ids d on d.id = c.id)          as customers,
  (select count(*) from public.orders o         join demo_customer_ids d on d.id = o.customer_id) as orders,
  (select count(*) from public.customer_facts f join demo_customer_ids d on d.id = f.customer_id) as facts,
  (select count(*) from public.change_log g     join demo_customer_ids d on d.id = g.customer_id) as change_log;

commit;
