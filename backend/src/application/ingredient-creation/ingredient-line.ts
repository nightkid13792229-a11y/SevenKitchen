/**
 * 起草请求的线路判定。
 *
 * 只做判定，不发请求、不落库：控制器在 `flushHeaders()` 之前用它决定
 * 「按草稿跑 / 按某条线新建 / 直接拒绝」。判定放在这里的理由只有一个——
 * 流式接口一旦发出响应头，就再也没法返回 400 了。
 */
export const INGREDIENT_LINES = ['FOOD', 'SUPPLEMENT'] as const;

export type IngredientLine = (typeof INGREDIENT_LINES)[number];

/** 补剂线还没开放：对外一律用这一句，前端原样展示。 */
export const LINE_NOT_OPEN_MESSAGE =
  '补剂线还没开放：补剂和食材的字段、计量口径、核验规则都不一样，这条线正在单独做。';

export interface RequestedLineInput {
  draftId?: string;
  line?: IngredientLine;
}

export type RequestedLineDecision =
  | { action: 'USE_DRAFT' }
  | { action: 'CREATE'; line: IngredientLine; compatDefault: boolean }
  | { action: 'REJECT'; message: string };

export function decideRequestedLine(
  input: RequestedLineInput,
): RequestedLineDecision {
  // 有草稿就以草稿为准：请求里带什么线都不能改已经建好的那份。
  if (input.draftId) {
    return { action: 'USE_DRAFT' };
  }

  if (input.line === 'SUPPLEMENT') {
    return { action: 'REJECT', message: LINE_NOT_OPEN_MESSAGE };
  }

  if (input.line === 'FOOD') {
    return { action: 'CREATE', line: 'FOOD', compatDefault: false };
  }

  // 过渡期兼容：老页面不带线路，按食材跑并记一条 warn；下个版本收紧为必填。
  return { action: 'CREATE', line: 'FOOD', compatDefault: true };
}
