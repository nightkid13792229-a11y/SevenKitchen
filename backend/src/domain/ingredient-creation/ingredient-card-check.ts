import type {
  CheckItem,
  IngredientDraft,
} from '../../application/ingredient-creation/ingredient-creation.types';
import type { IngredientCardFieldKey } from './ingredient-card-fields';

/**
 * 原料域核验：只看原料卡本身，不查营养档案、不查库、不落报告。
 *
 * 为什么单独拆出来：
 * - 规则要能被 AI 自检和「核验此页」按钮共用，还要能对着草稿单测，
 *   所以这里只收一份草稿与一份已有名字，不碰 Prisma；
 * - 每条规则的门槛写死在 `INGREDIENT_CARD_RULES` 里，报告落库时按它生成
 *   规则版本号，改规则就必须同步改表，不允许悄悄多一条或少一条。
 *
 * 注意可食部：草稿里存的是比例 `edibleYieldRate`（0–1），但页面与 AI 都以
 * 百分数公共名 `edibleYieldPercent`（0–100）交流。这里的判据用比例，
 * `fieldPath` 用公共名，方便前端直接定位到那一格；不做任何 ÷100 / ×100。
 */

export interface IngredientCardCheckInput {
  /** 草稿里的原料卡；还没走到这一步时为 null。 */
  ingredient: IngredientDraft | null;
  /** 已有原料名，由服务层查库后传入——本函数不做 IO，保证可单测。 */
  existingNames: readonly string[];
}

/** 本域规则的固定顺序与档位；供报告版本号、分组展示与前端取级别。 */
export const INGREDIENT_CARD_RULES: readonly {
  code: string;
  level: 'blocking' | 'exceptionable' | 'warning';
}[] = [
  { code: 'NAME_REQUIRED', level: 'blocking' },
  { code: 'NAME_DUPLICATE', level: 'blocking' },
  { code: 'BASE_UNIT_INVALID', level: 'blocking' },
  { code: 'UNIT_LABEL_REQUIRED', level: 'blocking' },
  { code: 'PURCHASE_RATIO_INVALID', level: 'blocking' },
  { code: 'PURCHASE_PRICE_NEGATIVE', level: 'blocking' },
  { code: 'EDIBLE_RANGE', level: 'exceptionable' },
  { code: 'SHELF_LIFE_RANGE', level: 'exceptionable' },
  { code: 'STORAGE_EMPTY', level: 'warning' },
];

/** 基本单位白名单；原料只能按重量 / 体积 / 个数计量。 */
const BASE_UNITS: readonly IngredientDraft['baseUnit'][] = ['G', 'ML', 'PCS'];

/** 所有空白段（`\s` 在 JS 里也包含全角空格 U+3000）压成一个半角空格。 */
const WHITESPACE_RUN = /\s+/gu;

/**
 * 名字归一：去首尾空白、空白段压成一个空格、转小写。
 *
 * 只用于「是不是同一个名字」的比较，不改草稿里存的值——人写的名字保留原样。
 */
function normalizeName(value: string): string {
  return value.trim().replace(WHITESPACE_RUN, ' ').toLowerCase();
}

/**
 * 与已有名字比较。空名字不算重名：那是 `NAME_REQUIRED` 的事，
 * 同一格不重复报两条。
 */
function isDuplicateName(
  name: string,
  existingNames: readonly string[],
): boolean {
  const normalized = normalizeName(name);
  if (!normalized) {
    return false;
  }

  return existingNames.some(
    (existing) => normalizeName(existing) === normalized,
  );
}

/** `null` / `undefined` / 纯空白字符串都算空；数字 0 是有值。 */
function isBlank(value: string | null | undefined): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/** 采购单位这种「字符串有没有填」的判断：纯空白等于没填。 */
function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** 数字字段有没有值：0 是合法值，不能当空。 */
function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * 前端定位用的 `fieldPath`：一律用公共字段名（`ingredient.<key>`），
 * 包括可食部这种存储名与公共名不同的字段。
 */
function cell(key: IngredientCardFieldKey): string {
  return `ingredient.${key}`;
}

function nameRequiredItem(): CheckItem {
  return {
    code: 'NAME_REQUIRED',
    message: '原料名称为空：这一格是新建原料与查重的入口，空着无法继续。',
    fieldPath: cell('name'),
    suggestion: '填写一个能唯一识别的名称，例如「冷冻三文鱼」。',
  };
}

/**
 * 跑一遍原料域核验，按 `INGREDIENT_CARD_RULES` 的固定顺序返回所有问题。
 *
 * - 干净草稿返回空数组；
 * - 草稿为 null 时只报 `NAME_REQUIRED`；
 * - 纯函数：同一份输入永远得到同一份输出，不读写任何外部状态。
 */
export function runIngredientCardCheck(
  input: IngredientCardCheckInput,
): CheckItem[] {
  const { ingredient, existingNames } = input;

  if (!ingredient) {
    return [nameRequiredItem()];
  }

  const items: CheckItem[] = [];

  if (isBlank(ingredient.name)) {
    items.push(nameRequiredItem());
  } else if (isDuplicateName(ingredient.name, existingNames)) {
    items.push({
      code: 'NAME_DUPLICATE',
      message: `名称「${ingredient.name.trim()}」与已有原料重名（忽略首尾空白、连续空白与大小写），后续采购和配方会分不清是哪一种。`,
      fieldPath: cell('name'),
      suggestion: '在名称里加上部位或规格（如「冷冻三文鱼 带皮」）以便区分。',
    });
  }

  if (!BASE_UNITS.includes(ingredient.baseUnit)) {
    items.push({
      code: 'BASE_UNIT_INVALID',
      message: `基本单位「${String(ingredient.baseUnit)}」不可用：原料只能以 G（克）、ML（毫升）或 PCS（个）计。`,
      fieldPath: cell('baseUnit'),
      suggestion:
        '改选克、毫升或个；采购单位与基本单位的换算填在采购换算比例那一格。',
    });
  }

  if (isBlank(ingredient.unitDisplayLabel)) {
    items.push({
      code: 'UNIT_LABEL_REQUIRED',
      message:
        '单位展示名称为空：采购单、库存和配方上都会显示这一格，空着看不出单位是什么。',
      fieldPath: cell('unitDisplayLabel'),
      suggestion: '填写人看得懂的单位名，例如「克」「袋」。',
    });
  }

  const ratio = ingredient.purchaseToBaseRatio;
  if (isSet(ratio) && ratio <= 0) {
    items.push({
      code: 'PURCHASE_RATIO_INVALID',
      message: `采购换算比例必须大于 0（当前为 ${ratio}），否则 1 个采购单位换不出基本单位数量。`,
      fieldPath: cell('purchaseToBaseRatio'),
      suggestion:
        '填写 1 个采购单位包含多少基本单位，例如 1 袋 500 克就填 500。',
    });
  }

  const price = ingredient.currentPricePerPurchaseUnit;
  if (isSet(price) && price < 0) {
    items.push({
      code: 'PURCHASE_PRICE_NEGATIVE',
      message: `采购价不能为负数（当前为 ${price}），负价会污染成本与毛利计算。`,
      fieldPath: cell('currentPricePerPurchaseUnit'),
      suggestion: '改成 0 或正数；价格未知时留空，不要用负数占位。',
    });
  }

  // 草稿存的是 0–1 的比例，判据也按比例；不要拿它去和 100 比。
  const edibleYieldRate = ingredient.edibleYieldRate;
  if (isSet(edibleYieldRate) && (edibleYieldRate <= 0 || edibleYieldRate > 1)) {
    items.push({
      code: 'EDIBLE_RANGE',
      message: `可食部比例 ${edibleYieldRate} 超出范围：这一格按比例存 0–1（对应 0%–100%），必须大于 0 且不超过 1。`,
      fieldPath: cell('edibleYieldPercent'),
      suggestion: '按实际可食比例填写，例如整条鱼可食部约 60% 时填 0.6。',
    });
  }

  const shelfLifeMonths = ingredient.shelfLifeMonths;
  if (
    isSet(shelfLifeMonths) &&
    (!Number.isInteger(shelfLifeMonths) ||
      shelfLifeMonths < 1 ||
      shelfLifeMonths > 120)
  ) {
    items.push({
      code: 'SHELF_LIFE_RANGE',
      message: `保质期必须是 1–120 之间的整数月（当前为 ${shelfLifeMonths}），否则库存到期日算不出来。`,
      fieldPath: cell('shelfLifeMonths'),
      suggestion: '按「月」填整数，例如冷冻保存 12 个月就填 12。',
    });
  }

  if (
    (hasText(ingredient.purchaseUnit) || isSet(price)) &&
    isBlank(ingredient.storageCondition)
  ) {
    items.push({
      code: 'STORAGE_EMPTY',
      message:
        '已经填了采购单位或采购价，但贮存条件为空，收货后不知道该怎么存。',
      fieldPath: cell('storageCondition'),
      suggestion: '补一句贮存条件，例如「-18℃ 冷冻」「常温避光」。',
    });
  }

  return items;
}
