/**
 * 定制订单提交的幂等键（2026-10-25）。
 *
 * 之前每次进确认页都生成新 key：同一页面内重试是幂等的，但网络超时后
 * 顾客退出/刷新再进，就会用新 key 再建一张单。
 *
 * 现在按「顾客 + 狗」把 key 存在本地：
 *   · 下单前一直复用同一个 key；
 *   · 订单创建成功后清掉，下一次是新单；
 *   · 响应丢失/页面刷新时继续复用，后端返回同一张订单。
 */

const STORAGE_KEY = 'custom_recipe_submit_keys';

type KeyMap = Record<string, string>;

function buildKey(customerId: string, dogId: string): string {
  return `${customerId}:${dogId}`;
}

function readMap(): KeyMap {
  try {
    const value = uni.getStorageSync(STORAGE_KEY);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as KeyMap)
      : {};
  } catch (error) {
    console.warn('[CustomRecipeSubmitKey] 读取失败:', error);
    return {};
  }
}

function writeMap(value: KeyMap): void {
  try {
    uni.setStorageSync(STORAGE_KEY, value);
  } catch (error) {
    console.warn('[CustomRecipeSubmitKey] 保存失败:', error);
  }
}

function createKey(): string {
  return `cr-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function getOrCreateCustomRecipeSubmitKey(
  customerId: string,
  dogId: string,
): string {
  if (!customerId || !dogId) return createKey();
  const map = readMap();
  const storageKey = buildKey(customerId, dogId);
  const existing = String(map[storageKey] || '').trim();
  if (existing) return existing;

  const created = createKey();
  map[storageKey] = created;
  writeMap(map);
  return created;
}

/**
 * 订单创建成功后清掉；传 key 时只清“当前这一把”，避免并发时误清新 key。
 */
export function clearCustomRecipeSubmitKey(
  customerId: string,
  dogId: string,
  key?: string,
): void {
  if (!customerId || !dogId) return;
  const map = readMap();
  const storageKey = buildKey(customerId, dogId);
  if (!(storageKey in map)) return;
  if (key && String(map[storageKey]) !== String(key)) return;
  delete map[storageKey];
  writeMap(map);
}
