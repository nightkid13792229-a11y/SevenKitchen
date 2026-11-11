/**
 * 采购单位字典（2026-11-11）。
 *
 * ## 为什么要有这份文件
 *
 * 同一个"单位"以前在四处各写一份：后端白名单、后台常量、后台原料弹窗内联、
 * 小程序识别结果页。四份内容"现在恰好一致"，但注释里已经写着"必须与后端保持一致"——
 * 那就是"迟早漂移"的同义词。更糟的是四份的内容并不相同：识别结果页有「组」（谁都没有），
 * 员工端把「提/件」当整件单位用，而后端白名单里根本没有这两个字。
 *
 * 现在只有一份：平台选项字典 `purchase_unit`。这份文件负责三件事：
 *   1. 给全新库/测试提供兜底数据（字典为空时用，行为与改造前一致）；
 *   2. 按原料基准单位过滤（按克记账的原料不能选「毫升」）；
 *   3. 别名归一（公斤/千克 → kg，升 → L）。
 *
 * 为什么兜底数据也要留：单测、全新库、migration 之前的老环境都不该因为"字典还没灌"
 * 而让员工端变成空白选项。这和渠道目录的做法一致。
 */

export type PurchaseUnitKind = 'PACKAGING' | 'MEASUREMENT';

export type PurchaseUnitBaseUnit = 'G' | 'ML' | 'PCS';

export interface PurchaseUnitOption {
  /** 写进业务表的值，也是字典项的 code */
  code: string;
  /** 这道单位适用于哪些基准单位 */
  baseUnits: PurchaseUnitBaseUnit[];
  /** 别名（比较时忽略大小写与首尾空格） */
  aliases: string[];
  /** PACKAGING = 包装单位（袋/盒/箱…）；MEASUREMENT = 计量单位（g/kg/斤/两/ml/L） */
  kind: PurchaseUnitKind;
  /** 整件单位：一层都没填时要提醒补一层（箱/桶/提/件/组） */
  multipack: boolean;
  /** 员工端展示顺序，小的在前 */
  sortOrder: number;
}

/** 平台选项字典里这个选项集的 code */
export const PURCHASE_UNIT_SET = 'purchase_unit';

const ALL: PurchaseUnitBaseUnit[] = ['G', 'ML', 'PCS'];

/**
 * 兜底清单 = 改造前四份清单的**并集**。
 *
 * 并集而不是取某一份：字典比历史数据窄会让老商品在编辑时吃到 400
 * （`normalizeOptionalPurchaseUnit` 对字典外值直接抛错），所以宁可多、不可少；
 * 运营后续可以在后台停用不想要的项，停用不删除。
 */
export const PURCHASE_UNIT_SEED: PurchaseUnitOption[] = [
  // —— 包装单位：员工最常选，排在前面 ——
  { code: '袋', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 10 },
  { code: '箱', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: true, sortOrder: 20 },
  { code: '包', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 30 },
  { code: '瓶', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 40 },
  { code: '盒', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 50 },
  { code: '桶', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: true, sortOrder: 60 },
  { code: '罐', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 70 },
  { code: '份', baseUnits: ALL, aliases: ['serving'], kind: 'PACKAGING', multipack: false, sortOrder: 80 },
  { code: '提', baseUnits: ['G', 'PCS'], aliases: [], kind: 'PACKAGING', multipack: true, sortOrder: 90 },
  { code: '件', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: true, sortOrder: 100 },
  { code: '组', baseUnits: ALL, aliases: [], kind: 'PACKAGING', multipack: true, sortOrder: 110 },
  { code: '卷', baseUnits: ['PCS', 'ML'], aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 120 },
  { code: '个', baseUnits: ['G', 'PCS'], aliases: ['只'], kind: 'PACKAGING', multipack: false, sortOrder: 130 },
  { code: '条', baseUnits: ['G', 'PCS'], aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 140 },
  { code: '块', baseUnits: ['G', 'PCS'], aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 150 },
  { code: '片', baseUnits: ['G', 'PCS'], aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 160 },
  { code: '颗', baseUnits: ['G', 'PCS'], aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 170 },
  { code: '粒', baseUnits: ['G', 'PCS'], aliases: [], kind: 'PACKAGING', multipack: false, sortOrder: 180 },

  // —— 计量单位：散装称重才用，收在「更多」的第二组 ——
  { code: '斤', baseUnits: ['G'], aliases: ['市斤'], kind: 'MEASUREMENT', multipack: false, sortOrder: 200 },
  { code: '两', baseUnits: ['G'], aliases: [], kind: 'MEASUREMENT', multipack: false, sortOrder: 210 },
  { code: 'kg', baseUnits: ['G'], aliases: ['公斤', '千克', 'KG', 'Kg', 'kilogram'], kind: 'MEASUREMENT', multipack: false, sortOrder: 220 },
  { code: 'g', baseUnits: ['G'], aliases: ['克', 'G', 'gram'], kind: 'MEASUREMENT', multipack: false, sortOrder: 230 },
  { code: '吨', baseUnits: ['G'], aliases: ['t', 'ton'], kind: 'MEASUREMENT', multipack: false, sortOrder: 240 },
  { code: 'L', baseUnits: ['ML'], aliases: ['升', 'l', 'liter', 'litre'], kind: 'MEASUREMENT', multipack: false, sortOrder: 250 },
  { code: 'ml', baseUnits: ['ML'], aliases: ['毫升', 'ML', 'mL'], kind: 'MEASUREMENT', multipack: false, sortOrder: 260 },
];

/** 按基准单位过滤 + 排序；未知基准单位返回空数组 */
export function unitsForBaseUnit(
  options: PurchaseUnitOption[],
  baseUnit: string,
): PurchaseUnitOption[] {
  const normalized = String(baseUnit ?? '').toUpperCase();
  return (Array.isArray(options) ? options : [])
    .filter((option) => option.baseUnits.includes(normalized as PurchaseUnitBaseUnit))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeToken(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
}

/**
 * 把一个"员工/AI 写出来的单位"归一成字典里的 code。
 *
 * 认不出来就返回 `null` —— 绝不猜、绝不替换成别的单位：
 * 单位是记账口径，猜错就是整倍数错账，宁可让员工选一次。
 */
export function resolvePurchaseUnitCode(
  options: PurchaseUnitOption[],
  value: string | null | undefined,
  baseUnit: string,
): string | null {
  const token = normalizeToken(String(value ?? ''));
  if (!token) return null;

  const candidates = unitsForBaseUnit(options, baseUnit);
  for (const option of candidates) {
    if (normalizeToken(option.code) === token) return option.code;
  }
  for (const option of candidates) {
    if (option.aliases.some((alias) => normalizeToken(alias) === token)) {
      return option.code;
    }
  }
  return null;
}

/** 这道单位是不是"整件"（决定要不要逼员工补一层） */
export function isMultipackUnit(
  options: PurchaseUnitOption[],
  unit: string | null | undefined,
): boolean {
  const token = normalizeToken(String(unit ?? ''));
  if (!token) return false;
  return (Array.isArray(options) ? options : []).some(
    (option) => normalizeToken(option.code) === token && option.multipack,
  );
}

/** 兜底清单按基准单位分组（改造前的行为） */
export const PURCHASE_UNIT_FALLBACK: Record<PurchaseUnitBaseUnit, PurchaseUnitOption[]> = {
  G: unitsForBaseUnit(PURCHASE_UNIT_SEED, 'G'),
  ML: unitsForBaseUnit(PURCHASE_UNIT_SEED, 'ML'),
  PCS: unitsForBaseUnit(PURCHASE_UNIT_SEED, 'PCS'),
};

/** 把字典项（数据库 `extra` 是 unknown）解析成强类型，坏数据跳过而不是崩 */
export function parsePurchaseUnitOption(raw: {
  code: string;
  sortOrder?: number | null;
  extra?: unknown;
}): PurchaseUnitOption | null {
  const code = String(raw?.code ?? '').trim();
  if (!code) return null;

  const extra = (raw.extra ?? {}) as {
    baseUnits?: unknown;
    aliases?: unknown;
    kind?: unknown;
    multipack?: unknown;
  };

  const baseUnits = Array.isArray(extra.baseUnits)
    ? extra.baseUnits
        .map((item) => String(item ?? '').toUpperCase())
        .filter((item): item is PurchaseUnitBaseUnit =>
          item === 'G' || item === 'ML' || item === 'PCS',
        )
    : [];
  if (baseUnits.length === 0) return null;

  const aliases = Array.isArray(extra.aliases)
    ? extra.aliases.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];

  return {
    code,
    baseUnits,
    aliases,
    kind: extra.kind === 'MEASUREMENT' ? 'MEASUREMENT' : 'PACKAGING',
    multipack: extra.multipack === true,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 100,
  };
}

/** 把兜底清单转成字典种子（写进 `platform_option_item.extra`） */
export function toPurchaseUnitSeedItem(option: PurchaseUnitOption) {
  return {
    code: option.code,
    label: option.code,
    sortOrder: option.sortOrder,
    extra: {
      baseUnits: option.baseUnits,
      aliases: option.aliases,
      kind: option.kind,
      multipack: option.multipack,
    },
  };
}

/**
 * 读字典（唯一读入口）。
 *
 * 传一个只带 `platformOptionItem.findMany` 的客户端即可（PrismaService 或事务客户端），
 * 这样"服务层 / AI 建档 / 原料导入"三个写入点用的是同一份清单，不会再出现
 * "一个入口认提、另一个不认"的旧问题。
 *
 * 字典为空或表还没建时退回 `PURCHASE_UNIT_SEED`，不让员工端变成空白选项。
 */
export async function loadPurchaseUnitOptions(
  prisma: {
    platformOptionItem: {
      findMany: (args: unknown) => Promise<
        Array<{ code: string; sortOrder?: number | null; extra?: unknown }>
      >;
    };
  },
  options: { includeDisabled?: boolean } = {},
): Promise<PurchaseUnitOption[]> {
  try {
    const items = await prisma.platformOptionItem.findMany({
      where: {
        setId: PURCHASE_UNIT_SET,
        // 校验历史数据时要连停用项一起认，否则老商品保存即 400
        ...(options.includeDisabled ? {} : { enabled: true }),
      },
      select: { code: true, sortOrder: true, extra: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    const parsed = items
      .map((item) => parsePurchaseUnitOption(item))
      .filter((item): item is PurchaseUnitOption => item !== null);
    if (parsed.length > 0) {
      return parsed;
    }
  } catch {
    // 表还没建 / 连接异常：退回兜底
  }
  return PURCHASE_UNIT_SEED;
}
