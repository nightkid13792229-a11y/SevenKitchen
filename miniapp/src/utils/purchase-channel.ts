/**
 * 采购渠道比较（2026-11-06）。
 *
 * 渠道的唯一来源是后台字典 `purchase_channel`（码 = 原文，别名存在 extra.aliases）。
 * 员工端拿到的只有一组标签，拿不到别名，所以在小程序这边按同一个口径做粗归一：
 *   去空格标点 + 忽略大小写，然后「全等」或「互相包含」就算同一家。
 *
 * 为什么不是精确比较：字典里的码是「山姆会员店」「盒马鲜生」，
 * 但历史商品上还留着「山姆」「盒马」这类写法；精确比较会把这些商品藏起来，
 * 员工会以为商品没了。
 *
 * 为什么不做「一个字也算包含」：「马」会把「盒马鲜生」吃掉，
 * 反而把别的渠道的商品混进来，所以包含匹配要求两边都至少两个字。
 *
 * 真正严格的判断（带字典别名的）在后端 channel-catalog 里，匹配与写记录都走那边；
 * 这里只用于「选商品抽屉显示哪些候选」。
 */

/** 比较键：小写 + 去空格标点 */
export function channelKey(value: string | null = null): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) return '';
  return text.replace(/[\s·•,，。.、:：;；!！?？'"“”‘’*×/\\|（）()【】[\]{}<>《》_\-—–~～]+/g, '');
}

/** 两个渠道写法是不是同一家 */
export function isSameChannel(
  a: string | null = null,
  b: string | null = null,
): boolean {
  const left = channelKey(a);
  const right = channelKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 2 || right.length < 2) return false;
  return left.includes(right) || right.includes(left);
}

/**
 * 这笔订单的渠道下，这道原料真正能选的采购商品。
 *
 * - 订单还没确认渠道：不筛（页面另有渠道门禁，这里不替员工猜）。
 * - 订单有渠道：只留同渠道的商品，顺序保持商品档案里的顺序。
 * - 商品没填渠道：不算这个渠道，不显示 —— 在别家买的正确做法是去那个渠道下新建商品。
 */
export function keepSkuForChannel<T extends { purchaseChannel?: string | null }>(
  options: T[],
  channel: string | null = null,
): T[] {
  if (!channelKey(channel)) return options.slice();
  return options.filter((option) => isSameChannel(option.purchaseChannel, channel));
}

/**
 * 从识别结果页跳到「新建采购商品」时，把订单渠道带过去预选。
 *
 * 只在这一项确实在字典里的时候预选：订单上可能还留着停用渠道，
 * 预选一个字典里没有的值会让人以为选好了，保存时才报错。
 */
export function prefillChannel(
  channel: string | null = null,
  options: string[] = [],
): string {
  if (!channelKey(channel) || !Array.isArray(options)) return '';
  return options.find((option) => isSameChannel(option, channel)) || '';
}
