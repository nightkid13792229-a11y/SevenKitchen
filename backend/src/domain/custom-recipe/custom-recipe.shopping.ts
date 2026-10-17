import type { SnapshotShoppingLine } from './custom-recipe.delivery';

/**
 * 采购清单计算（2026-10-16，批次 2.2）
 *
 * ## 从哪搬来的
 *
 * 这套算法原先在**小程序页面里**（`pages/diy-sheet/index.vue` 的
 * `buildPurchaseListItem` + `pages/diy-sheet/fallback.ts`），
 * 也就是说"买多少"这个数字是**顾客手机上算出来的**。
 *
 * 老板的要求是「所有的计算交给后端，前端只负责渲染」——
 * 所以搬到这里，前端只管显示。
 *
 * ## 口径（照搬原有算法，一个字没改）
 *
 * ```
 * 总食材净重   = 每天吃多少克 × 做几天
 * 某种食材净用量 = 总净重 × 占比%
 * 采购量       = 净用量 × 损耗系数
 * ```
 *
 * ⚠️ **损耗率在库里是「系数」（1.07），不是「比率」（0.07）。**
 * 这一点很容易搞错：`1.07` 直接当成比率用会算出"采购量是净用量的 1.07 倍"，
 * 也就是**只多买 7%，而不是多买 107%** —— 数字看着不离谱，但全错了。
 * 所以这里统一收「系数」，转换只在一处做。
 *
 * ## 两条刻意的"算不出来就不算"
 *
 * **一、没有喂食量就不给清单。** 总净重取决于"每天吃多少克"，而那个
 * 要看狗狗档案。档案取不到时，清单应当**整块不给**，而不是按猜测的
 * 体重凑一个 —— 顾客会照着买，买错是我们造成的。
 *
 * **二、占比之和明显不是 100 时要出声。** 占比是营养师填的，
 * 填成 90 或 110 都发生过。不报错（那会让交付卡住），但要给出提示，
 * 让人知道"这份清单少了/多了 10%"。
 */

/** 采购清单里的一行 */
export interface ShoppingLine {
  name: string;
  /** 净用量（克） */
  netG: number;
  /**
   * ⚠️ 2026-10-18 起**不再展示**（老板定：只给净用量，买多少顾客自己判断）。
   *
   * 仍保留的原因：交付快照是**冻结契约**，删字段会动到已交付数据的结构；
   * 而且它跟 `netG` 一起被几个守卫测试引用。**当前没有任何界面消费它。**
   * 若将来清理，记得连 `foodLossRate` / `supplementLossRate` 一起看。
   */
  purchaseG: number;
  /** 是不是营养补充剂（补剂与食材的损耗率不同） */
  isSupplement: boolean;
  /** 制备方法（"切丁煮熟"）—— 采购页也显示它，省得来回翻 */
  preparation?: string | null;
}

export interface ShoppingListResult {
  lines: ShoppingLine[];
  /** 食材净用量合计（克） */
  totalNetG: number;
  /** 建议采购量合计（克） */
  /** @deprecated 2026-10-18 起不再展示，见 purchaseG */
  totalPurchaseG: number;
  /** 实际用到的食材损耗系数（1.07 = 多买 7%） */
  foodLossRate: number;
  /** 实际用到的补剂损耗系数 */
  supplementLossRate: number;
  /** 算不出来时的原因（`lines` 为空时才有值） */
  unavailableReason?: string | null;
  /** 能算、但有地方需要人看一眼 */
  warnings: string[];
}

/** 补剂默认损耗系数（与小程序一致：多备 5%） */
export const DEFAULT_SUPPLEMENT_LOSS_RATE = 1.05;

/** 占比之和偏离 100 超过这个值就提示 */
const RATIO_SUM_TOLERANCE = 0.5;

export interface ShoppingInputItem {
  name: string;
  /** 占比（百分数，如 32 表示 32%） */
  ratioPercent: number | null;
  isSupplement?: boolean;
  preparation?: string | null;
}

export interface BuildShoppingListInput {
  items: ShoppingInputItem[];
  /** 每天吃多少克；取不到时传 null */
  dailyIntakeG: number | null;
  /** 做几天；取不到时传 null */
  cycleDays: number | null;
  /** 食材损耗**系数**（1.07），不是比率（0.07） */
  foodLossRate: number | null;
  /** 补剂损耗**系数**；不传用 1.05 */
  supplementLossRate?: number | null;
}

/**
 * 把「系数」转成「比率」。
 *
 * 单独一个函数 + 一条测试盯着它，因为这是最容易搞反的一步。
 * 传进来的值 < 1 说明调用方已经当成比率了（0.07），这里**认它**并
 * 记一条提示 —— 与其崩掉，不如按它给的意思算，同时告诉人"你传的是比率"。
 */
export function lossRateToRatio(
  lossRate: number | null | undefined,
  fallbackRatio: number,
): { ratio: number; interpretedAs: 'coefficient' | 'ratio' | 'fallback' } {
  if (lossRate === null || lossRate === undefined) {
    return { ratio: fallbackRatio, interpretedAs: 'fallback' };
  }
  const value = Number(lossRate);
  if (!Number.isFinite(value) || value < 0) {
    return { ratio: fallbackRatio, interpretedAs: 'fallback' };
  }
  if (value < 1) {
    // 已经是比率
    return { ratio: value, interpretedAs: 'ratio' };
  }
  return { ratio: value - 1, interpretedAs: 'coefficient' };
}

/**
 * 算采购清单。
 *
 * 纯函数：不碰数据库、不依赖时间，可以穷举各种边界。
 */
export function buildShoppingList(
  input: BuildShoppingListInput,
): ShoppingListResult {
  const warnings: string[] = [];
  const empty = (reason: string): ShoppingListResult => ({
    lines: [],
    totalNetG: 0,
    totalPurchaseG: 0,
    foodLossRate: 1,
    supplementLossRate: DEFAULT_SUPPLEMENT_LOSS_RATE,
    unavailableReason: reason,
    warnings,
  });

  const dailyIntakeG = toPositive(input.dailyIntakeG);
  const cycleDays = toPositive(input.cycleDays);

  /**
   * 第一条"算不出来就不算"：没有喂食量就没有清单。
   * 硬凑一个体重猜出来的数字，顾客会照着买。
   */
  if (dailyIntakeG === null) {
    return empty('还没有这只狗的喂食量，暂时算不出要买多少');
  }
  if (cycleDays === null) {
    return empty('还没有确定做几天，暂时算不出要买多少');
  }

  const totalNetG = dailyIntakeG * cycleDays;

  const food = lossRateToRatio(input.foodLossRate, 0.07);
  const supplement = lossRateToRatio(
    input.supplementLossRate,
    DEFAULT_SUPPLEMENT_LOSS_RATE - 1,
  );

  if (food.interpretedAs === 'fallback') {
    warnings.push('没有拿到食材损耗率，按 7% 估算');
  }
  if (food.interpretedAs === 'ratio') {
    warnings.push(
      `食材损耗率收到的是 ${input.foodLossRate}（比率），已按此计算；` +
        '若是从数据库直接读的，它应当是系数（如 1.07）',
    );
  }

  const usable = input.items.filter((item) => item.ratioPercent !== null);

  /**
   * 第二条：占比之和明显不是 100 就出声。
   * 不报错 —— 报错会让交付卡住；但必须让人看见。
   */
  const ratioSum = usable.reduce(
    (sum, item) => sum + Number(item.ratioPercent),
    0,
  );
  if (usable.length > 0 && Math.abs(ratioSum - 100) > RATIO_SUM_TOLERANCE) {
    warnings.push(
      `各原料占比之和是 ${round1(ratioSum)}%，不是 100% —— ` +
        `这份采购清单${ratioSum < 100 ? '偏少' : '偏多'}了 ${round1(Math.abs(100 - ratioSum))}%`,
    );
  }

  const lines: ShoppingLine[] = usable.map((item) => {
    /** 补剂与食材的损耗率不同：食材按配方损耗，补剂按分装损耗 */
    const appliedRatio = item.isSupplement ? supplement.ratio : food.ratio;
    const netG = (totalNetG * Number(item.ratioPercent)) / 100;
    return {
      name: item.name,
      netG: round1(netG),
      purchaseG: round1(netG * (1 + appliedRatio)),
      isSupplement: Boolean(item.isSupplement),
      preparation: item.preparation ?? null,
    };
  });

  return {
    lines,
    totalNetG: round1(lines.reduce((sum, line) => sum + line.netG, 0)),
    totalPurchaseG: round1(
      lines.reduce((sum, line) => sum + line.purchaseG, 0),
    ),
    /** 对外给的是**系数**（与库里一致），前端直接显示"多买 X%" */
    foodLossRate: 1 + food.ratio,
    supplementLossRate: 1 + supplement.ratio,
    unavailableReason: null,
    warnings,
  };
}

/**
 * 把采购清单塞进交付快照的形状。
 *
 * 单独一步是因为快照结构要求"算不出来时也得有个空壳"
 * （读取端不用到处判 undefined），而 `buildShoppingList` 的返回更丰富。
 */
export function toSnapshotShopping(result: ShoppingListResult): {
  lines: SnapshotShoppingLine[];
  totalNetG: number;
  totalPurchaseG: number;
  lossRate: number;
} {
  return {
    lines: result.lines.map((line) => ({
      name: line.name,
      netG: line.netG,
      purchaseG: line.purchaseG,
    })),
    totalNetG: result.totalNetG,
    totalPurchaseG: result.totalPurchaseG,
    lossRate: result.foodLossRate,
  };
}

function toPositive(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
