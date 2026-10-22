-- 2026-10-22: 按新公式统一重算已发布食谱的补剂添加浓度。
-- 目标定义、label、unit、fieldPath 保持不变，只更新 targetValuePerKg 和兼容单项值。
-- 已交付订单的 delivery snapshot 不修改。

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":799.29}]'::jsonb, nutrient_target_value = 799.29, nutrient_target_key = 'iodine' WHERE id = '277b7f57-7a5e-4f74-ac50-e7d6b9d54fb1';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":296.03}]'::jsonb, nutrient_target_value = 296.03, nutrient_target_key = 'choline' WHERE id = '0c558c47-229c-40d0-aaa1-b603c7bc5ac8';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.18}]'::jsonb, nutrient_target_value = 1.18, nutrient_target_key = 'copper' WHERE id = 'b32d8a0d-d03b-4260-8a9b-175b6e04036b';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":29.6}]'::jsonb, nutrient_target_value = 29.6, nutrient_target_key = 'zinc' WHERE id = 'ae96897c-72f9-4df9-8062-3ec1d84a4244';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3211.96},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1080.52}]'::jsonb, nutrient_target_value = 3211.96, nutrient_target_key = 'calcium' WHERE id = 'e914aa40-2b18-450c-b47c-878f8a980087';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":799.29}]'::jsonb, nutrient_target_value = 799.29, nutrient_target_key = 'iodine' WHERE id = '1dcb120c-e111-4f29-80b7-f2dfb32688b3';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":296.03}]'::jsonb, nutrient_target_value = 296.03, nutrient_target_key = 'choline' WHERE id = '6fcfc34f-3a00-4f89-b8c1-97fd0f18e2d0';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.18}]'::jsonb, nutrient_target_value = 1.18, nutrient_target_key = 'copper' WHERE id = 'e76a9fce-db12-45a1-ba9e-d1a408640388';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":29.6}]'::jsonb, nutrient_target_value = 29.6, nutrient_target_key = 'zinc' WHERE id = '8ddf9ccb-07ac-4c82-b8f9-3cb77bfc77cf';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3211.96},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1080.52}]'::jsonb, nutrient_target_value = 3211.96, nutrient_target_key = 'calcium' WHERE id = '0e8d3b47-e37c-47ba-84cc-b2855aed5b11';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":799.29}]'::jsonb, nutrient_target_value = 799.29, nutrient_target_key = 'iodine' WHERE id = '7961b7c7-70c3-4153-9c33-8afd882cb210';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":296.03}]'::jsonb, nutrient_target_value = 296.03, nutrient_target_key = 'choline' WHERE id = '3e446985-ddc1-4092-a045-56e78c9c670f';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.18}]'::jsonb, nutrient_target_value = 1.18, nutrient_target_key = 'copper' WHERE id = 'b221de4e-4ca1-4275-b65f-2bcc2620e03d';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":29.6}]'::jsonb, nutrient_target_value = 29.6, nutrient_target_key = 'zinc' WHERE id = 'cf216ec8-bb5b-4a5b-b6a4-1b14ceb8c522';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3211.96},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1080.52}]'::jsonb, nutrient_target_value = 3211.96, nutrient_target_key = 'calcium' WHERE id = 'd4f8bc97-7ac4-498b-9f7e-c245bd74babc';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":1658.99}]'::jsonb, nutrient_target_value = 1658.99, nutrient_target_key = 'calcium' WHERE id = 'a9657fb1-fc46-4350-ac2b-e84ba4554d00';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":592.5}]'::jsonb, nutrient_target_value = 592.5, nutrient_target_key = 'iodine' WHERE id = '143e37e6-28ac-4f35-bc59-46524e36878b';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":16.46}]'::jsonb, nutrient_target_value = 16.46, nutrient_target_key = 'zinc' WHERE id = 'cc4f9e1b-1198-4150-85d5-5cca045edb9c';

UPDATE recipe_item SET supplement_targets = '[{"unit":"IU","label":"维生素 D","fieldPath":"vitamins.vitaminD","targetValuePerKg":177.75}]'::jsonb, nutrient_target_value = 177.75, nutrient_target_key = 'vitaminD' WHERE id = '8c0824c2-6f05-41cf-8820-a1e992684ada';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":1870.13}]'::jsonb, nutrient_target_value = 1870.13, nutrient_target_key = 'calcium' WHERE id = '038586dd-ae97-4835-9d9e-a13b5f83d270';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":876.62}]'::jsonb, nutrient_target_value = 876.62, nutrient_target_key = 'iodine' WHERE id = 'bf749387-ab0f-476b-be1e-75c4a93731e6';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.3}]'::jsonb, nutrient_target_value = 1.3, nutrient_target_key = 'copper' WHERE id = 'd16aa7e8-ce0e-4fa9-bf61-8c4b8e960a08';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":16.23}]'::jsonb, nutrient_target_value = 16.23, nutrient_target_key = 'zinc' WHERE id = 'dc9942b4-f9a0-45e6-8c46-0f83528987f4';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":324.68}]'::jsonb, nutrient_target_value = 324.68, nutrient_target_key = 'choline' WHERE id = 'bd901e08-e3f1-4d78-b111-0afd7fc78af3';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":1071.85}]'::jsonb, nutrient_target_value = 1071.85, nutrient_target_key = 'iodine' WHERE id = 'a474a012-1ce7-46bf-bd3c-3f4c47287bb1';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.59}]'::jsonb, nutrient_target_value = 1.59, nutrient_target_key = 'copper' WHERE id = '1422f5a1-0713-4fe3-aa2b-7c9cc9c6f781';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":19.85}]'::jsonb, nutrient_target_value = 19.85, nutrient_target_key = 'zinc' WHERE id = 'd252fca8-ecec-4dc0-a50d-8d4d28ff34b8';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":2928.94},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":985.31}]'::jsonb, nutrient_target_value = 2928.94, nutrient_target_key = 'calcium' WHERE id = '8a25d58a-ab47-4274-9cc3-8396b5acde9b';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":396.98}]'::jsonb, nutrient_target_value = 396.98, nutrient_target_key = 'choline' WHERE id = '06efda2a-8baa-4bc0-be93-ee013aa67a48';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":21.44}]'::jsonb, nutrient_target_value = 21.44, nutrient_target_key = 'iron' WHERE id = 'a8062fdf-9e04-4c7a-95cb-3d658f7add48';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":868.17}]'::jsonb, nutrient_target_value = 868.17, nutrient_target_key = 'iodine' WHERE id = 'a0a6c0f9-a006-45f8-aee8-7442a82f330a';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.29}]'::jsonb, nutrient_target_value = 1.29, nutrient_target_key = 'copper' WHERE id = '5eacfa6f-89ce-42ef-a179-9d1df66d5303';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":16.08}]'::jsonb, nutrient_target_value = 16.08, nutrient_target_key = 'zinc' WHERE id = 'ca0f1cca-719f-4c88-a5a3-2a5aea17ac91';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":321.54}]'::jsonb, nutrient_target_value = 321.54, nutrient_target_key = 'choline' WHERE id = '43d5ff98-1cc3-44e1-8f7b-e60ed8e527bd';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3070.1},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1032.8}]'::jsonb, nutrient_target_value = 3070.1, nutrient_target_key = 'calcium' WHERE id = 'fa78901e-de42-47bd-a6ba-c711b17afa50';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":11.58}]'::jsonb, nutrient_target_value = 11.58, nutrient_target_key = 'iron' WHERE id = '44911d24-6f5e-4027-b088-2f6cd5e01180';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":1870.13}]'::jsonb, nutrient_target_value = 1870.13, nutrient_target_key = 'calcium' WHERE id = 'f542bd68-369d-4b60-aa41-0f5e86a0b9da';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":876.62}]'::jsonb, nutrient_target_value = 876.62, nutrient_target_key = 'iodine' WHERE id = '98c4753a-f318-4ad2-bd56-dc1639dd2c23';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.3}]'::jsonb, nutrient_target_value = 1.3, nutrient_target_key = 'copper' WHERE id = '82a61c40-acc0-41ae-afc2-90c2e0a3dcc2';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":16.23}]'::jsonb, nutrient_target_value = 16.23, nutrient_target_key = 'zinc' WHERE id = '98168cb8-dfe8-4d61-9e61-d8b4ac440395';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":324.68}]'::jsonb, nutrient_target_value = 324.68, nutrient_target_key = 'choline' WHERE id = '28257834-c5ba-40eb-9bd9-5476a8243860';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":1071.85}]'::jsonb, nutrient_target_value = 1071.85, nutrient_target_key = 'iodine' WHERE id = '653d481b-54b6-4bb8-b2e6-23ad7d2e5c64';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.59}]'::jsonb, nutrient_target_value = 1.59, nutrient_target_key = 'copper' WHERE id = '8ab46304-be92-4f57-96b8-2be54c3f47b9';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":19.85}]'::jsonb, nutrient_target_value = 19.85, nutrient_target_key = 'zinc' WHERE id = '5e788bb4-578c-4525-b4cf-2636ad8b2b59';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":2928.94},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":985.31}]'::jsonb, nutrient_target_value = 2928.94, nutrient_target_key = 'calcium' WHERE id = 'd6573438-8444-4c7e-96c3-962068f8da51';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":396.98}]'::jsonb, nutrient_target_value = 396.98, nutrient_target_key = 'choline' WHERE id = '268788b4-6e3f-4985-b809-8d1eb95cbf39';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":21.44}]'::jsonb, nutrient_target_value = 21.44, nutrient_target_key = 'iron' WHERE id = '619eb01f-5b76-4f5f-8e4a-d5c76a71c4e1';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":0.94}]'::jsonb, nutrient_target_value = 0.94, nutrient_target_key = 'copper' WHERE id = 'b753037f-d075-4d8b-ab98-aeda8e1632c4';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":2050.34}]'::jsonb, nutrient_target_value = 2050.34, nutrient_target_key = 'calcium' WHERE id = '81d9c029-c080-426b-bf82-d766f95387a7';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":871.25}]'::jsonb, nutrient_target_value = 871.25, nutrient_target_key = 'iodine' WHERE id = '1f9885ec-fc90-40e6-9225-d061da75a7ae';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":24.2}]'::jsonb, nutrient_target_value = 24.2, nutrient_target_key = 'zinc' WHERE id = '9f3943ab-139d-4604-a0ff-0343b60f34ae';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":726.04}]'::jsonb, nutrient_target_value = 726.04, nutrient_target_key = 'choline' WHERE id = '704827fa-76b1-4658-9aa3-56522e5fb308';

UPDATE recipe_item SET supplement_targets = '[{"unit":"IU","label":"维生素 E","fieldPath":"vitamins.vitaminE","targetValuePerKg":96.81}]'::jsonb, nutrient_target_value = 96.81, nutrient_target_key = 'vitaminE' WHERE id = '31cc17ce-ecc2-48c2-b2ae-11a1b9f1eac5';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"维生素 B2","fieldPath":"vitamins.vitaminB2","targetValuePerKg":2.9}]'::jsonb, nutrient_target_value = 2.9, nutrient_target_key = 'vitaminB2' WHERE id = 'd8ced4d0-8c85-4f53-ae97-3030613517a4';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":1397.55}]'::jsonb, nutrient_target_value = 1397.55, nutrient_target_key = 'calcium' WHERE id = 'ef4a7ab9-e68b-4a25-a53e-8772cc14f753';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.28}]'::jsonb, nutrient_target_value = 1.28, nutrient_target_key = 'copper' WHERE id = 'b69fc5d9-f3c6-4e45-b6a1-77348ff8e7a3';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":411.13}]'::jsonb, nutrient_target_value = 411.13, nutrient_target_key = 'iodine' WHERE id = '5c41deb5-855f-4e19-9209-fa5d0ccd49c2';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":10.96}]'::jsonb, nutrient_target_value = 10.96, nutrient_target_key = 'iron' WHERE id = '76f0aa36-54fb-40e6-afa5-606ac3c2eb58';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":15.23}]'::jsonb, nutrient_target_value = 15.23, nutrient_target_key = 'zinc' WHERE id = '3dc1ab24-71ba-4ed3-8260-886da54d20cf';

UPDATE recipe_item SET supplement_targets = '[{"unit":"IU","label":"维生素 D","fieldPath":"vitamins.vitaminD","targetValuePerKg":182.73}]'::jsonb, nutrient_target_value = 182.73, nutrient_target_key = 'vitaminD' WHERE id = '025e3422-a853-498e-8ded-5e96222f69f3';

UPDATE recipe_item SET supplement_targets = '[{"unit":"IU","label":"维生素 E","fieldPath":"vitamins.vitaminE","targetValuePerKg":30.45}]'::jsonb, nutrient_target_value = 30.45, nutrient_target_key = 'vitaminE' WHERE id = '786dd612-279c-4676-bd59-28f5089fe405';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"维生素 B2","fieldPath":"vitamins.vitaminB2","targetValuePerKg":12.18}]'::jsonb, nutrient_target_value = 12.18, nutrient_target_key = 'vitaminB2' WHERE id = 'c545fb9c-335c-4d0d-8a71-95687bd96cd9';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"胆碱","fieldPath":"vitamins.choline","targetValuePerKg":456.82}]'::jsonb, nutrient_target_value = 456.82, nutrient_target_key = 'choline' WHERE id = '15312123-ae1f-4cbc-aced-e4233eb01d4b';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3410.61},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1147.35},{"unit":"ratio","label":"钙磷比","fieldPath":"derived.caP","targetValuePerKg":46.72}]'::jsonb, nutrient_target_value = 3410.61, nutrient_target_key = 'calcium' WHERE id = 'bbf8b45b-1e2a-465a-9692-387d1b31593c';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.96}]'::jsonb, nutrient_target_value = 1.96, nutrient_target_key = 'copper' WHERE id = 'c7179689-5ace-496a-9b6b-a7b864b393ff';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":530.45}]'::jsonb, nutrient_target_value = 530.45, nutrient_target_key = 'iodine' WHERE id = '0dc8e8d0-6068-4b7c-96db-06d9028f350f';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":14.15}]'::jsonb, nutrient_target_value = 14.15, nutrient_target_key = 'iron' WHERE id = 'b2d47fe2-124b-4507-b059-b190f6c971a2';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":23.58}]'::jsonb, nutrient_target_value = 23.58, nutrient_target_key = 'zinc' WHERE id = 'c2889650-58a3-4d13-aef1-9b2ca3d052da';

UPDATE recipe_item SET supplement_targets = '[{"unit":"IU","label":"维生素 E","fieldPath":"vitamins.vitaminE","targetValuePerKg":78.59}]'::jsonb, nutrient_target_value = 78.59, nutrient_target_key = 'vitaminE' WHERE id = '6a91c7db-5b0d-42d5-94b3-d94ef7873b25';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3410.61},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1147.35},{"unit":"ratio","label":"钙磷比","fieldPath":"derived.caP","targetValuePerKg":46.72}]'::jsonb, nutrient_target_value = 3410.61, nutrient_target_key = 'calcium' WHERE id = 'f000b086-5045-4106-ade5-92e207a6c4fb';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铜","fieldPath":"minerals.copper","targetValuePerKg":1.96}]'::jsonb, nutrient_target_value = 1.96, nutrient_target_key = 'copper' WHERE id = 'dfd98d5b-d5cd-4dc9-a307-b7508fee9c14';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":530.45}]'::jsonb, nutrient_target_value = 530.45, nutrient_target_key = 'iodine' WHERE id = 'bf2c9b8f-9afd-424a-83c9-9fe063ee7c63';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":14.15}]'::jsonb, nutrient_target_value = 14.15, nutrient_target_key = 'iron' WHERE id = '621d2a32-8dbb-4a78-b2ed-ee90ef9ff53d';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":23.58}]'::jsonb, nutrient_target_value = 23.58, nutrient_target_key = 'zinc' WHERE id = 'c397075f-7b21-42d8-9b57-6639f0d75185';

UPDATE recipe_item SET supplement_targets = '[{"unit":"IU","label":"维生素 E","fieldPath":"vitamins.vitaminE","targetValuePerKg":78.59}]'::jsonb, nutrient_target_value = 78.59, nutrient_target_key = 'vitaminE' WHERE id = '5b6e9ea0-577a-495b-92a3-10e21a0e7f5a';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3993.87},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1343.56},{"unit":"ratio","label":"钙磷比","fieldPath":"derived.caP","targetValuePerKg":54.71}]'::jsonb, nutrient_target_value = 3993.87, nutrient_target_key = 'calcium' WHERE id = '3879c285-faf6-4829-a2dd-65073cf05114';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":22.09}]'::jsonb, nutrient_target_value = 22.09, nutrient_target_key = 'iron' WHERE id = '62f1425d-8dd8-49c5-9bdf-2a064854ad05';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":552.15}]'::jsonb, nutrient_target_value = 552.15, nutrient_target_key = 'iodine' WHERE id = '958dd0b0-e2fa-4d83-972b-5558ad078663';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":18.4}]'::jsonb, nutrient_target_value = 18.4, nutrient_target_key = 'zinc' WHERE id = '85cdaa42-6d85-4f14-87df-9c5861948c85';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3993.87},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1343.56},{"unit":"ratio","label":"钙磷比","fieldPath":"derived.caP","targetValuePerKg":54.71}]'::jsonb, nutrient_target_value = 3993.87, nutrient_target_key = 'calcium' WHERE id = 'a1e7f57b-3e51-408f-8136-46873a7d2147';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":22.09}]'::jsonb, nutrient_target_value = 22.09, nutrient_target_key = 'iron' WHERE id = '57198f1a-2cb4-4204-af75-02cc8f574cd6';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":552.15}]'::jsonb, nutrient_target_value = 552.15, nutrient_target_key = 'iodine' WHERE id = '7606f549-c455-4727-a054-6ee06be12929';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":18.4}]'::jsonb, nutrient_target_value = 18.4, nutrient_target_key = 'zinc' WHERE id = 'bdab6282-ee6b-46e7-a4f5-aa6c2410fb32';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"钙","fieldPath":"minerals.calcium","targetValuePerKg":3993.87},{"unit":"mg","label":"磷","fieldPath":"minerals.phosphorus","targetValuePerKg":1343.56},{"unit":"ratio","label":"钙磷比","fieldPath":"derived.caP","targetValuePerKg":54.71}]'::jsonb, nutrient_target_value = 3993.87, nutrient_target_key = 'calcium' WHERE id = '24037e43-f7b4-4615-af36-033532a44ef5';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"铁","fieldPath":"minerals.iron","targetValuePerKg":22.09}]'::jsonb, nutrient_target_value = 22.09, nutrient_target_key = 'iron' WHERE id = 'ae7be5f0-89ae-4f5f-88f0-68f27b2bcc18';

UPDATE recipe_item SET supplement_targets = '[{"unit":"μg","label":"碘","fieldPath":"minerals.iodine","targetValuePerKg":552.15}]'::jsonb, nutrient_target_value = 552.15, nutrient_target_key = 'iodine' WHERE id = '18b52057-5874-4f5b-a7bd-30aa4649ac92';

UPDATE recipe_item SET supplement_targets = '[{"unit":"mg","label":"锌","fieldPath":"minerals.zinc","targetValuePerKg":27.61}]'::jsonb, nutrient_target_value = 27.61, nutrient_target_key = 'zinc' WHERE id = 'ef7eaf03-8576-4c92-91e2-97063bd6a8dc';

