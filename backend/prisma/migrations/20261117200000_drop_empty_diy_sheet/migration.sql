-- 2026-11-17 清掉一张「空制作单」
--
-- 背景：合并重复食谱编号（20261117193000_merge_duplicate_recipe_ids）之后，
-- 一位顾客没关掉的旧页面仍带着已删除的旧编号触发了自动保存，存出一张
-- recipe_name 为空、采购清单 0 行的空单。空单会出现在「我的制作单」列表里，
-- 点进去也加载不了食谱，属于纯垃圾数据。
--
-- 删除条件按 id + 旧编号 + 空内容 + 未冻结 四重校验：
-- 换到没有这张单的库是空操作；万一同 id 被复用、或者后来填了内容，也不会误删。

DELETE FROM diy_sheet
 WHERE id = '489e856d-4e8f-46d6-bf1d-aa88766022e8'
   AND recipe_id = '0d049e33-a450-4300-b2fe-439089cdecef'
   AND recipe_name = ''
   AND coalesce(jsonb_array_length(purchase_list::jsonb), 0) = 0
   AND snapshot IS NULL;
