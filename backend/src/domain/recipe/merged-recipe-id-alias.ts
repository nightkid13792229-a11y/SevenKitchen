/**
 * 已合并的重复食谱编号 → 正式编号（2026-11-17）。
 *
 * 背景：同一道橱窗食谱历史上被导入 / 重建过多次，一个系列的一个生命阶段挂着两个
 * recipe_id。数据库迁移 `20261117193000_merge_duplicate_recipe_ids` 已经把重复编号
 * 的引用改指向正式编号、并删掉了旧行。
 *
 * 但旧行的编号还活在这些地方：顾客以前分享出去的链接、缓存的页面、客服发过的地址。
 * 直接 404 对顾客太硬，所以在**入口处**静默换成正式编号：老链接继续能打开，
 * 只是看到的是合并后的那一版。
 *
 * 约定：这张表只增不减地保留到 **2027-05**（合并后半年），届时按访问日志确认
 * 已无人使用再删除；不要在业务代码里直接引用这里的键。
 */
const MERGED_RECIPE_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // 十字花科全谷物三文鱼鸡肉 · 成犬版（v17, 2026-03-07 → v9, 2026-06-15）
  '0644e096-2074-4c67-8764-a7e8580023fd': '30f83406-d2e9-44f7-aebf-7d5c438c72d8',
  // 十字花科全谷物三文鱼鸡肉 · 低活动/老年（v13, 2026-03-07 → v9, 2026-06-21）
  '99184a28-a297-4279-b7df-138fcc3826e3': '403c4d60-51a5-4f51-80e8-2e6471dc553d',
  // 小米鳕鱼鸡胸 · 低活动/老年（v4, 2026-01-22 → v1, 2026-06-09）
  '0d049e33-a450-4300-b2fe-439089cdecef': 'ce128379-de56-4416-99e1-1e48dd5a1956',
  // 燕麦鳕鱼猪肉 · 低活动/老年（v5, 2026-01-23 → v3, 2026-06-09）
  '1d802350-3bcb-4c42-b40f-38185e539d52': '0fdc6d24-fddc-4ec6-9790-3e05f724587b',
  // 糙米三文鱼鸭胸鹿腿 · 低活动/老年（v4, 2026-01-21 → v6, 2026-06-10）
  'a149634a-ead1-4a25-98ea-ee2b423b3175': '1bd86ee4-fef9-40a5-8c5f-dd867eab5c56',
});

/** 旧编号换成正式编号；不是旧编号就原样返回。 */
export function resolveMergedRecipeId(recipeId: string): string {
  const id = String(recipeId ?? '').trim();
  if (!id) return id;
  return MERGED_RECIPE_ID_ALIASES[id] ?? id;
}

/** 供测试与排查用：是否有过合并（不要拿它做业务判断）。 */
export function isMergedRecipeId(recipeId: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    MERGED_RECIPE_ID_ALIASES,
    String(recipeId ?? '').trim(),
  );
}
