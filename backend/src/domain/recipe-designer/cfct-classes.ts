/**
 * 原料库的 CFCT 固定 15 类（WS/T 464-2015）。
 * 选材的 foodCategory 必须用这 15 个原词，不能用“肉类/蔬菜”这种简化分组。
 */
export const CFCT_CLASSES = [
  '谷类及制品',
  '薯类及制品',
  '干豆类及制品',
  '蔬菜类及制品',
  '菌藻类',
  '水果类及制品',
  '坚果种子类',
  '畜肉类及制品',
  '禽肉类及制品',
  '乳类及制品',
  '蛋类及制品',
  '水产类',
  '油脂类',
  '调味品类',
  '其他',
] as const;

export const CFCT_CLASS_SET: ReadonlySet<string> = new Set(CFCT_CLASSES);

export const CFCT_CLASS_PROMPT = CFCT_CLASSES.join('、');
