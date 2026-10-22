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
 * `OTHER` 是保留值：本期分类器不会返回它；认不出做法时返回 `null`，
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
 * 一条做法关键词：日文按「包含」匹配；拉丁文一律用词边界匹配。
 */
type CookingMethodKeyword = string | RegExp;

/**
 * 否决项：烤 / 煎。必须先扫这一组——同一段原文里既提到水煮 / 蒸又提到烤 / 煎时，
 * 以烤 / 煎为准（如 `蒸し焼き`、`boiled & fried`），否则熟食来源会被误放行。
 *
 * 英文覆盖词干（`grill/grilling`、`pan-fry`、`baked`、`seared`、`sautéed` 等），
 * 中文 / 日文覆盖 `焼`、`烤`、`烘烤`、`炸`、`煎烤`、`フライ` 等写法；否决项宁多勿漏。
 */
const VETOED_COOKING_METHOD_KEYWORDS: ReadonlyArray<
  readonly [CookingMethod, readonly CookingMethodKeyword[]]
> = [
  [
    'GRILLED',
    [
      /\bgrill(?:ed|ing|s)?\b/,
      /\bbroil(?:ed|ing|s)?\b/,
      /\broast(?:ed|ing)?\b/,
      /\bbak(?:e|ed|ing)\b/,
      /\bbarbecue(?:d)?\b/,
      /\bbbq\b/,
      /\bchar[-\s]?grill(?:ed)?\b/,
      '焼き',
      '焼',
      '烤',
      '烘烤',
      '烘焙',
      '焙烤',
    ],
  ],
  [
    'FRIED',
    [
      /\bpan[-\s]?fr(?:y|ied|ying)\b/,
      /\bdeep[-\s]?fr(?:y|ied|ying)\b/,
      /\bfr(?:y|ied|ying)\b/,
      /\bsear(?:ed|ing)\b/,
      /\bsaut[eé](?:ed|ing)?\b/,
      /\bgriddl(?:e|ed|ing)\b/,
      '炸',
      'フライ',
      '揚げ',
      '煎',
      '煎烤',
    ],
  ],
];

/**
 * 温和做法：水煮 / 蒸，只有否决项都没命中时才看这一组。
 *
 * 拉丁关键词用词边界匹配（`parboiled`、`unfried` 不算）；
 * `par-boiled` 的 `par-` 是「半煮」，用负向断言排除，`hard-boiled` 仍能命中。
 * 中文 / 日文补单字 `煮`、`蒸`（覆盖 `煮鸡胸`、`清蒸鱼` 这类来源原文）。
 */
const GENTLE_COOKING_METHOD_KEYWORDS: ReadonlyArray<
  readonly [CookingMethod, readonly CookingMethodKeyword[]]
> = [
  ['BOILED', [/(?<!par[-\s])\bboiled\b/, '煮', '水煮', 'ゆで', '茹で']],
  ['STEAMED', [/\bsteam(?:ed)?\b/, '蒸', '蒸し']],
];

function containsCookingKeyword(
  value: string,
  keyword: CookingMethodKeyword,
): boolean {
  return typeof keyword === 'string'
    ? value.includes(keyword)
    : keyword.test(value);
}

function findFirstCookingMethod(
  value: string,
  rules: ReadonlyArray<
    readonly [CookingMethod, readonly CookingMethodKeyword[]]
  >,
): CookingMethod | null {
  for (const [method, keywords] of rules) {
    if (keywords.some((keyword) => containsCookingKeyword(value, keyword))) {
      return method;
    }
  }

  return null;
}

/**
 * 从来源原文识别做法；认不出返回 `null`，不猜。
 *
 * 全角 / 大小写先归一；否决项（烤 / 煎）优先于温和做法（水煮 / 蒸），
 * 所以 `蒸し焼き`、`boiled & fried` 这类混合描述一律判为烤 / 煎。
 */
export function classifyCookingMethod(
  value: string | null | undefined,
): CookingMethod | null {
  const keyword = normalizeKeyword(value);
  if (!keyword) return null;

  const vetoed = findFirstCookingMethod(
    keyword,
    VETOED_COOKING_METHOD_KEYWORDS,
  );
  if (vetoed) return vetoed;

  return findFirstCookingMethod(keyword, GENTLE_COOKING_METHOD_KEYWORDS);
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
