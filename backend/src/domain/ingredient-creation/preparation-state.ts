/**
 * 营养档案的「生 / 熟」状态。
 *
 * 状态只有两档：RAW（生）、COOKED（熟）—— 做法（水煮 / 蒸 / 烤 / 煎）
 * **不进入状态字段**，只在「找数据」时用于筛选候选。做法原文保留在来源记录上，
 * 只作溯源，不作状态（老板 2026-10-22 定）。
 */
export type PreparationState = 'RAW' | 'COOKED';

/**
 * 来源给的做法。只在「找数据」时用于筛选熟食候选：
 * 水煮 / 蒸是温和烹饪，可进候选；烤 / 煎不进（老板 2026-10-22 定）。
 *
 * `OTHER` 表示「认得出、但不在上面四种里」；分类器认不出时返回 `null`，
 * **不猜成 `OTHER`**，两者含义不同。
 */
export type CookingMethod =
  | 'BOILED'
  | 'STEAMED'
  | 'GRILLED'
  | 'FRIED'
  | 'OTHER';

/** 匹配前统一：全角转半角（NFKC）、去首尾空白、转小写；空值统一成空串。 */
function normalizeKeyword(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().toLowerCase();
}

/**
 * 把来源给的生熟原文归一成受控词表。
 *
 * 只认「生 / 熟」两档；做法（水煮 / 蒸 / 烤 / 煎）不进入状态。
 * 认不出返回 `null`，不猜。
 */
export function normalizePreparationState(
  value: string | null | undefined,
): PreparationState | null {
  const keyword = normalizeKeyword(value);
  if (keyword === 'raw' || keyword === '生') return 'RAW';
  if (keyword === 'cooked' || keyword === '熟') return 'COOKED';
  return null;
}

/**
 * 做法关键词表；命中顺序即优先级，来源原文按「包含」匹配
 * （如 `boiled, drained`）。
 */
const COOKING_METHOD_KEYWORDS: ReadonlyArray<
  readonly [CookingMethod, readonly string[]]
> = [
  ['BOILED', ['boiled', 'ゆで', '茹で', '水煮']],
  ['STEAMED', ['steamed', 'steam', '蒸し']],
  ['GRILLED', ['broiled', 'grilled', 'roasted', '焼き', '烤']],
  ['FRIED', ['fried', 'pan-fried', 'deep-fried', '揚げ', '煎']],
];

/**
 * 从来源原文识别做法；认不出返回 `null`，不猜。
 * 全角 / 大小写先归一，再按关键词包含匹配。
 */
export function classifyCookingMethod(
  value: string | null | undefined,
): CookingMethod | null {
  const keyword = normalizeKeyword(value);
  if (!keyword) return null;

  for (const [method, keywords] of COOKING_METHOD_KEYWORDS) {
    if (keywords.some((candidate) => keyword.includes(candidate))) {
      return method;
    }
  }

  return null;
}

/**
 * 熟的档案能不能用这份来源：只有水煮、蒸（温和烹饪）可以；
 * 烤、煎、其它、认不出（`null`）一律不能。
 */
export function isCookedSourceAcceptable(
  method: CookingMethod | null,
): boolean {
  return method === 'BOILED' || method === 'STEAMED';
}
