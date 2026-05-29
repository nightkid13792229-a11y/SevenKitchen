# 标准原料营养档案最终复查报告

生成时间：2026/05/28 00:42:32

## 结论

- 当前数据库中食品类和补剂类标准原料均已具备至少一个营养档案映射，且均存在主档案。
- 食品类没有高风险项；补剂类没有缺主档案或空营养档案项。
- 食品类剩余中风险主要来自 USDA SR Legacy 来源定期复核、泛化档案提示、低完整性提示和少量合理共享档案提示；这些不是缺档案阻断项。

## 覆盖率汇总

| 范围 | 标准原料数 | 映射/档案数 | 高风险 | 中风险 | 低风险/通过 | 缺主档案 |
|---|---:|---:|---:|---:|---:|---:|
| 食品 | 111 | 183 映射 / 179 档案 | 0 | 97 | 最终通过 111 | 0 |
| 补剂 | 30 | 30 通过 | 0 | 0 | 30 | 0 |

## 契约审计摘要

- 扫描记录数：874
- 总体：PASS 852，WARN 0，FAIL 22
- 正式使用档案（Ingredient.nutritionProfile + NutritionFood.nutritionData）：FAIL 0，WARN 0
- 剩余失败位置：IngredientNutritionCandidate.normalizedNutrition 5；NutritionSourceRecord.normalizedNutrition 17

## 食品侧非阻断提示

- 低完整性提示：6 条。
- 泛化档案提示：9 条。
- 共享档案提示：4 个共享 NutritionFood。
- USDA SR Legacy 定期复核提示：97 条。

### 低完整性食品清单

| 标准原料 | 主档案 | 来源 | 主档案完整性 | 问题 |
| --- | --- | --- | --- | --- |
| 冬瓜 | 冬瓜（生） | CFCT:043221 | 65 | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 树莓 | 树莓（生） | USDA:167755 | 65 | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 鲜香菇 | 鲜香菇（生） | USDA:169242 | 65 | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 香菜 | 香菜叶（生） | USDA:169997 | 65 | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 亚麻籽油 | 亚麻籽油（冷榨） | USDA:167702 | 63 | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 羊肚菌 | 羊肚菌（生） | USDA:168423 | 57 | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |

### 合理共享档案清单

| 营养档案 | 来源 | 共享原料 |
| --- | --- | --- |
| 芹菜/西芹（生） | USDA:169988 | 芹菜 / 西芹 |
| 芹菜/西芹（水煮沥干，不加盐） | USDA:169989 | 芹菜 / 西芹 |
| 小白菜/上海青（生） | USDA:170390 | 上海青 / 小白菜 |
| 小白菜/上海青（水煮沥干，不加盐） | USDA:170391 | 上海青 / 小白菜 |

## 食品全量概览

| 标准原料 | 主档案 | 来源 | 映射数 | 主档案完整性 | 最终状态 | 提示 |
| --- | --- | --- | --- | --- | --- | --- |
| 鹌鹑蛋 | 鹌鹑蛋（去壳，生） | USDA:172191 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 巴旦木 | 巴旦木仁（生，未漂白） | USDA:170567 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 巴西坚果 | 巴西坚果（干，未去皮） | USDA:170569 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 白萝卜 | 白萝卜（生） | USDA:168451 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 白蘑菇 | 白蘑菇（生） | USDA:169251 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 白芝麻 | 白芝麻仁（去壳，干） | USDA:169412 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 比目鱼 | 比目鱼/鳎鱼类（生） | USDA:174196 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 菠菜 | 菠菜（生） | USDA:168462 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 糙米 | 糙米（长粒，生） | USDA:169703 | 2 | 90 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 大豆 | 大豆（成熟干豆，生） | USDA:174270 | 2 | 83 | PASS | USDA_SR_LEGACY_REVIEW |
| 大米 | 大米（长粒白米，生，未强化） | USDA:169756 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 丁香粉 | 丁香粉 | USDA:171321 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 冬瓜 | 冬瓜（生） | CFCT:043221 | 2 | 65 | PASS | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 豆腐 | 北豆腐/老豆腐/卤水豆腐 | CFCT:031306 | 3 | 70 | PASS | 无 |
| 鹅肉 | 鹅肉（仅肉，生） | USDA:172413 | 1 | 83 | PASS | USDA_SR_LEGACY_REVIEW |
| 橄榄油 | 橄榄油（通用，沙拉/烹调用） | USDA:171413 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 核桃 | 核桃仁（普通核桃，干，未加工） | USDA:170187 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 黑木耳 | 黑木耳（水发） | CFCT:051014 | 2 | 88 | PASS | 无 |
| 红薯 | 红薯/甘薯（生，未加工） | USDA:168482 | 2 | 90 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 红甜椒 | 红甜椒（生） | USDA:2258590 | 2 | 92 | PASS | USDA_SR_LEGACY_REVIEW |
| 红小豆 | 红小豆（全粒，干） | MEXT:04001 | 2 | 88 | PASS | 无 |
| 胡萝卜 | 胡萝卜（生） | USDA:170393 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 花椰菜 | 花椰菜（生） | USDA:169986 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 黄瓜 | 黄瓜（带皮，生） | USDA:168409 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 火鸡胸 | 火鸡胸肉（去皮，生） | USDA:171098 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 火麻籽 | 火麻仁（去壳） | USDA:170148 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸡蛋 | 全鸡蛋（鲜蛋，生） | USDA:171287 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸡肝 | 鸡肝（生） | USDA:171060 | 2 | 90 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 鸡腿肉 | 去皮鸡腿肉（生） | USDA:2646171 | 2 | 88 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸡心 | 鸡心（生） | USDA:171458 | 2 | 83 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 鸡胸 | 鸡胸肉（去皮去骨，仅肉，生） | USDA:171077 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸡胗 | 鸡胗（生） | USDA:171456 | 2 | 93 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 茄子 | 茄子（生） | USDA:169228 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 姜粉 | 姜粉 | USDA:170926 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 姜黄粉 | 姜黄粉 | USDA:172231 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 金针菇 | 金针菇（生） | USDA:169382 | 1 | 88 | PASS | USDA_SR_LEGACY_REVIEW |
| 卷心菜 | 卷心菜（生） | USDA:169975 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 咖喱粉 | 咖喱粉 | USDA:170924 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 葵花籽油 | 葵花籽油（普通亚油酸型，约65%亚油酸） | USDA:171025 | 1 | 88 | PASS | 无 |
| 蓝莓 | 蓝莓（生） | USDA:171711 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 梨（鲜） | 梨（生） | USDA:169118 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 藜麦 | 藜麦（未煮） | USDA:168874 | 2 | 88 | PASS | USDA_SR_LEGACY_REVIEW |
| 芦笋 | 芦笋（生） | USDA:168389 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 鹿肉 | 鹿肉（生） | USDA:173855 | 2 | 83 | PASS | USDA_SR_LEGACY_REVIEW |
| 绿豆 | 绿豆（成熟干豆，生） | USDA:174256 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 绿豆芽 | 绿豆芽（生） | USDA:169957 | 2 | 88 | PASS | USDA_SR_LEGACY_REVIEW |
| 罗非鱼 | 罗非鱼（生） | USDA:175176 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 马肉 | 马肉（生） | USDA:175086 | 1 | 93 | PASS | USDA_SR_LEGACY_REVIEW |
| 木瓜 | 木瓜（生） | USDA:169926 | 1 | 88 | PASS | USDA_SR_LEGACY_REVIEW |
| 南瓜 | 南瓜（生） | USDA:168448 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 牛肝 | 牛肝（生） | USDA:169451 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 牛里脊 | 牛里脊（牛柳，生） | USDA:171767 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 牛霖 | 牛霖（生） | USDA:168646 | 1 | 88 | PASS | USDA_SR_LEGACY_REVIEW |
| 牛脾 | 牛脾（生） | USDA:169454 | 2 | 83 | PASS | USDA_SR_LEGACY_REVIEW |
| 牛心 | 牛心（生） | USDA:168625 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 苹果 | 苹果（带皮，生） | USDA:171688 | 2 | 90 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 奇亚籽 | 奇亚籽（干） | USDA:170554 | 1 | 75 | PASS | USDA_SR_LEGACY_REVIEW |
| 芹菜 | 芹菜/西芹（生） | USDA:169988 | 2 | 90 | PASS | SHARED_PROFILE; USDA_SR_LEGACY_REVIEW |
| 青花鱼 | 青花鱼（生） | USDA:173672 | 2 | 90 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 青口贝 | 新西兰青口贝肉（生） | NZFCD:T1024 | 2 | 93 | PASS | 无 |
| 秋葵 | 秋葵（生） | USDA:169260 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 肉桂粉 | 肉桂粉 | USDA:171320 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 三文鱼 | 三文鱼（大西洋鲑，养殖，生） | USDA:175167 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 沙丁鱼 | 沙丁鱼（生） | MEXT:10047 | 2 | 95 | PASS | 无 |
| 山药 | 山药（生） | MEXT:02023 | 2 | 85 | PASS | 无 |
| 上海青 | 小白菜/上海青（生） | USDA:170390 | 2 | 90 | PASS | SHARED_PROFILE; USDA_SR_LEGACY_REVIEW |
| 生菜 | 绿叶生菜（生） | USDA:169249 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 生蚝 | 生蚝（太平洋养殖，生） | MEXT:10292 | 2 | 95 | PASS | 无 |
| 生葵花籽仁 | 葵花籽仁（干） | USDA:170562 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 生南瓜籽仁 | 南瓜籽/西葫芦籽仁（干） | USDA:170556 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 食用盐 | 食盐（精制食盐） | USDA:173468 | 1 | 92 | PASS | USDA_SR_LEGACY_REVIEW |
| 树莓 | 树莓（生） | USDA:167755 | 1 | 65 | PASS | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 四季豆 | 四季豆（生） | USDA:169961 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 土豆 | 土豆（去皮，生） | MEXT:02017 | 2 | 95 | PASS | 无 |
| 兔肉 | 家兔肉（综合部位，生） | USDA:172521 | 2 | 92 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 娃娃菜 | 大白菜/娃娃菜（生） | USDA:169979 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 豌豆 | 青豌豆（生） | USDA:170419 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 舞茸 | 舞茸（生） | USDA:169403 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 西红柿 | 西红柿（红熟，全年平均，生） | USDA:170457 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 西葫芦 | 西葫芦（带皮，生） | USDA:169291 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 西兰花 | 西兰花（生） | USDA:170379 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 西芹 | 芹菜/西芹（生） | USDA:169988 | 2 | 90 | PASS | SHARED_PROFILE; USDA_SR_LEGACY_REVIEW |
| 狭鳕鱼 | 狭鳕鱼（生） | USDA:333476 | 2 | 85 | PASS | 无 |
| 鲜香菇 | 鲜香菇（生） | USDA:169242 | 2 | 65 | PASS | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 香菜 | 香菜叶（生） | USDA:169997 | 1 | 65 | PASS | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 香蕉 | 香蕉（生） | USDA:173944 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 小白菜 | 小白菜/上海青（生） | USDA:170390 | 2 | 90 | PASS | SHARED_PROFILE; USDA_SR_LEGACY_REVIEW |
| 小麦胚芽油 | 小麦胚芽油 | USDA:171014 | 1 | 88 | PASS | USDA_SR_LEGACY_REVIEW |
| 小米 | 小米（未煮） | USDA:169702 | 2 | 82 | PASS | USDA_SR_LEGACY_REVIEW |
| 鳕鱼 | 大西洋鳕鱼（生） | USDA:171955 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸭蛋 | 全鸭蛋（鲜蛋，生） | USDA:172189 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸭肝 | 鸭肝（生） | USDA:174467 | 1 | 83 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸭肉 | 鸭肉（仅肉，生） | USDA:172410 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 鸭心 | 鸭心（生） | CFCT:092206 | 1 | 72 | PASS | 无 |
| 鸭胗 | 鸭胗（生） | CFCT:092211 | 1 | 72 | PASS | 无 |
| 亚麻籽 | 亚麻籽（整粒） | USDA:169414 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 亚麻籽油 | 亚麻籽油（冷榨） | USDA:167702 | 1 | 63 | PASS | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 燕麦 | 燕麦片（常规/快熟，干，未强化） | USDA:173904 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 羊肚菌 | 羊肚菌（生） | USDA:168423 | 2 | 57 | PASS | LOW_NUTRIENT_COMPLETENESS; USDA_SR_LEGACY_REVIEW |
| 羊里脊 | 羊里脊（纯瘦，1/4英寸修脂，生） | USDA:172491 | 1 | 80 | PASS | USDA_SR_LEGACY_REVIEW |
| 薏仁米 | 薏仁米（干） | CFCT:019008 | 1 | 73 | PASS | 无 |
| 羽衣甘蓝 | 羽衣甘蓝（生） | USDA:168421 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 玉米粒 | 甜玉米粒（黄色，生） | USDA:169998 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 玉米油 | 玉米油（通用烹调/沙拉） | USDA:171029 | 1 | 88 | PASS | GENERIC_PROFILE; USDA_SR_LEGACY_REVIEW |
| 芋头 | 芋头（生） | USDA:169308 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 猪肝 | 鲜猪肝（生） | USDA:167862 | 2 | 83 | PASS | USDA_SR_LEGACY_REVIEW |
| 猪里脊 | 鲜猪里脊（纯瘦，生） | USDA:168249 | 1 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 猪肾 | 鲜猪肾（生） | USDA:168270 | 2 | 83 | PASS | USDA_SR_LEGACY_REVIEW |
| 猪心 | 鲜猪心（生） | USDA:168267 | 2 | 85 | PASS | USDA_SR_LEGACY_REVIEW |
| 紫甘蓝 | 紫甘蓝（生） | USDA:169977 | 2 | 90 | PASS | USDA_SR_LEGACY_REVIEW |
| 紫薯 | 紫薯（去皮，生） | MEXT:02048 | 2 | 92 | PASS | 无 |

## 补剂全量概览

| 标准原料 | 主档案 | 来源 | 有效字段 | 自定义项 | 状态 |
| --- | --- | --- | --- | --- | --- |
| B族维生素胶囊 | B族维生素胶囊 · NOW FOODS · 50mgB族维生素/粒，100粒/瓶 | SUPPLEMENT_LABEL:3ddce500-b52e-48e0-a567-fbd6cd6bb367 | 6 | 0 | PASS |
| 双甘氨酸亚铁胶囊 | 双甘氨酸亚铁胶囊 · NOW FOODS · 18mg铁/粒，120粒/瓶 | SUPPLEMENT_LABEL:ade3cfbc-90a3-4111-9816-cbf728e3c334 | 1 | 0 | PASS |
| 双甘氨酸铜片 | 双甘氨酸铜片 · NOW FOODS · 3mg铜/片，120片/瓶 | SUPPLEMENT_LABEL:564636c7-6d6c-4b1a-8b18-5b24a898906a | 1 | 0 | PASS |
| 柠檬酸钙粉 | 柠檬酸钙粉 · NOW FOODS · 600mg钙/3克，227克/罐 | SUPPLEMENT_LABEL:0750524c-1a65-4fe9-b55a-dddf4d411f9a | 1 | 0 | PASS |
| 柠檬酸钾胶囊 | 柠檬酸钾胶囊 · NOW FOODS · 99mg钾/粒，180粒/瓶 | SUPPLEMENT_LABEL:3187ad98-6688-4daf-a6db-30e54ccf7f3b | 1 | 0 | PASS |
| 柠檬酸镁胶囊 | 柠檬酸镁胶囊 · NOW FOODS · 133.33mg镁/粒，120粒/瓶 | SUPPLEMENT_LABEL:15fdc850-ffb3-4a9b-bea5-741d7a545f9d | 1 | 0 | PASS |
| 柠檬酸镁胶囊 | 柠檬酸镁胶囊 · NOW FOODS · 133.33mg镁/粒，120粒/瓶 | SUPPLEMENT_LABEL:aaaa051a-d685-45de-8822-57f1f6e783f3 | 1 | 0 | PASS |
| 洋车前子壳粉 | 洋车前子壳粉 · NOW FOODS · 340g/瓶 | SUPPLEMENT_LABEL:b641d28d-107f-4a82-9fe5-fc0cefb67c0a | 1 | 0 | PASS |
| 海带片 | 海带片 · NOW FOODS · 150μg碘/片，200片/瓶 | SUPPLEMENT_LABEL:492314ae-da9f-4c32-9b59-9e58106f4773 | 1 | 0 | PASS |
| 海带粉胶囊 | 海带粉 海带粉胶囊，325mcg碘/粒，250粒/罐 · NOW FOODS · 海带粉胶囊，325mcg碘/粒，250粒/罐 | SUPPLEMENT_LABEL:e40acd37-fe46-4082-82dd-649696810554 | 1 | 0 | PASS |
| 海藻粉 | 海藻粉 · NOW FOODS · 227g/瓶，450mcg碘/平勺，2522平勺/瓶 | SUPPLEMENT_LABEL:b5cf5421-69a7-47fc-a926-8722d9b7bcc2 | 1 | 0 | PASS |
| 牛磺酸胶囊 | 牛磺酸胶囊 · NOW FOODS · 1000mg牛磺酸/粒 100粒/瓶 | SUPPLEMENT_LABEL:a2cd1e77-93d9-4b44-b460-84bcf27c0474 | 1 | 0 | PASS |
| 甘氨酸锰片 | 甘氨酸锰片 · SOLGAR · 8mg锰/片，100片/瓶 | SUPPLEMENT_LABEL:23e30732-e7af-4b44-8f5e-622d0ceacd00 | 1 | 0 | PASS |
| 碘钾片 | 碘钾片 · NOW FOODS · 180片/瓶，225mcg碘、99mg钾、5mg钠/片 | SUPPLEMENT_LABEL:dcc9ba4b-84f8-418b-95fc-fc667c44eb1f | 3 | 0 | PASS |
| 碳酸钙粉 | 碳酸钙粉 · NOW FOODS · 600mg钙/1.7克，340g/罐 | SUPPLEMENT_LABEL:a168de23-2687-464b-b93f-4b0bdeca496a | 1 | 0 | PASS |
| 纤维素粉 | 纤维素粉 · Nutricology · 250克/罐 | SUPPLEMENT_LABEL:25fad765-c33b-4550-90e2-63c739eb763c | 1 | 0 | PASS |
| 维生素D3胶囊 | 维生素D3胶囊 · NOW FOODS · 1000IU维D3/粒，180粒/瓶 | SUPPLEMENT_LABEL:c2a70c77-b0de-4168-acb5-1956c990a3ff | 1 | 0 | PASS |
| 维生素E胶囊 | 维生素E胶囊 · NOW FOODS · 200IU/粒，100粒/瓶 | SUPPLEMENT_LABEL:e5fd3256-a1a4-4a89-b486-6eaed63b5624 | 1 | 0 | PASS |
| 胆碱片 | 胆碱片 · NATURE'S WAY · 500mg胆碱/片 100 片/瓶 | SUPPLEMENT_LABEL:a086e0d6-2765-4376-afac-b05483ba9ae9 | 1 | 0 | PASS |
| 菊粉 | 菊粉 · NOW FOODS · 227 克（8 盎司）/瓶 | SUPPLEMENT_LABEL:2903e952-2b34-4b19-8910-c0d724e9980d | 1 | 0 | PASS |
| 营养酵母粉 | 营养酵母粉 · NOW FOODS · 284克/罐 | SUPPLEMENT_LABEL:81e48ef3-b0b8-4256-9299-534b730b48ab | 7 | 0 | PASS |
| 葡萄糖酸锌片 | 葡萄糖酸锌片 · NOW FOODS · 50mg锌/片 100片/瓶 | SUPPLEMENT_LABEL:b03403f5-e1ff-4551-9b16-b0d126a50afa | 1 | 0 | PASS |
| 骨粉 | 骨粉 · KAL · 450g/罐 | SUPPLEMENT_LABEL:89383e63-a9d4-4d8a-9c07-e706a4981a06 | 3 | 0 | PASS |
| 骨粉 | 骨粉 · NOW FOODS · 454g/瓶 | SUPPLEMENT_LABEL:ed1ed0a7-f91b-4adf-85e9-ccd10922bfa9 | 3 | 0 | PASS |
| 骨粉片 | 骨粉片 · KAL · 250片/瓶 | SUPPLEMENT_LABEL:8a6d64b8-26c6-4b47-a5ea-125406157096 | 9 | 0 | PASS |
| 鱼油胶囊 | 鱼油胶囊 · NOW FOODS · 200粒/瓶 180mgEPA+120mgDHA/粒 | SUPPLEMENT_LABEL:d3a6f6ec-3083-4d72-a06a-9baed242226c | 2 | 0 | PASS |
| 鱼油胶囊 | 鱼油胶囊 · NOW FOODS · 180粒/瓶 500mgEPA+250mgDHA/粒 | SUPPLEMENT_LABEL:b50a3852-61b3-43f7-a599-486c055bf806 | 2 | 0 | PASS |
| 鱼肝油 | 鱼肝油 · NOW FOODS · 250粒/瓶 | SUPPLEMENT_LABEL:1f9f866c-c1ca-4f92-8099-7af02d6b97aa | 2 | 0 | PASS |
| 鸡蛋壳粉 | 鸡蛋壳粉 · 无 · 散装 | SUPPLEMENT_LABEL:ede279bc-d6b8-4916-982e-8b4c28766fb6 | 1 | 0 | PASS |
| 鸡蛋壳粉 | 鸡蛋壳粉 · 西知堂 · 500g/罐 | SUPPLEMENT_LABEL:8a7da1d3-157b-4a87-9eb1-9b4275c8e3b8 | 1 | 0 | PASS |

## 输出文件

- JSON：`backend/reports/standard-ingredient-nutrition-final-audit-2026-05-28.json`
- 食品概览 CSV：`backend/reports/standard-ingredient-nutrition-final-audit-food-overview-2026-05-28.csv`
- 补剂概览 CSV：`backend/reports/standard-ingredient-nutrition-final-audit-supplements-2026-05-28.csv`
- 食品字段级明细仍以 `backend/reports/food-nutrition-mapping-audit-2026-05-28-goal-refresh.json` 为准。
