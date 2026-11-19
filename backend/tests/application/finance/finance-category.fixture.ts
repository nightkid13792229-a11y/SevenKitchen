/**
 * 类别字典测试夹具（2026-11-19 账户化 + 可编辑类别）。
 *
 * 种子与 `prisma/migrations/20261119182000_finance_category_and_accounts`、
 * `20261119190000_finance_category_tools_sundries` 保持一致：
 * 系统类别 5 个（code 用于自动来源映射），普通类别 11 个 + 报销杂费补的
 * 「工具 / 杂物」两个。单测里 id 直接按 code 生成，断言比 uuid 好读。
 */

export type FinanceCategoryRow = {
  id: string;
  name: string;
  code: string | null;
  isSystem: boolean;
  isActive: boolean;
};

const SEED: Array<[string, string, boolean]> = [
  ['RAW_MATERIAL', '食材', true],
  ['SUPPLEMENT', '补剂', true],
  ['PACKAGING_SUPPLIES', '包材', true],
  ['LOGISTICS_DELIVERY', '快递', true],
  ['PAYMENT_FEE', '支付手续费', true],
  ['RENT', '房租', false],
  ['UTILITIES', '水电', false],
  ['NETWORK_COMMUNICATION', '宽带', false],
  ['TECHNICAL_SERVICES', '服务器/域名', false],
  ['PAYROLL', '工资', false],
  ['SOCIAL_INSURANCE', '社保', false],
  ['TAX', '税费', false],
  ['EQUIPMENT', '设备工具', false],
  ['ADMINISTRATIVE', '行政费用', false],
  ['AFTERSALE_LOSS', '售后退款', false],
  ['OTHER', '其它', false],
  ['TOOLS', '工具', false],
  ['SUNDRIES', '杂物', false],
];

/** 按 code 取稳定的类别 id；测试断言里用 `catId('RAW_MATERIAL')` 比 uuid 可读 */
export const catId = (code: string): string => `cat-${code}`;

/** 种子类别行；可传 overrides 模拟「老板把系统类别改名」 */
export const categoryRows = (
  overrides: Record<string, Partial<FinanceCategoryRow>> = {},
): FinanceCategoryRow[] =>
  SEED.map(([code, name, isSystem]) => ({
    id: catId(code),
    name,
    code,
    isSystem,
    isActive: true,
    ...(overrides[code] ?? {}),
  }));

/**
 * `prisma.financeCategory` 的最小 mock：报表只读整张表（findMany），
 * 报销类别缺失时才走 findFirst/create（正常种子齐全时不会走到写）。
 */
export const financeCategoryMock = (
  rows: FinanceCategoryRow[] = categoryRows(),
) => ({
  findMany: jest.fn().mockResolvedValue(rows),
  findUnique: jest.fn((args: any) => {
    const where = args?.where ?? {};
    return Promise.resolve(
      rows.find(
        (row) =>
          (where.id != null && row.id === where.id) ||
          (where.code != null && row.code === where.code),
      ) ?? null,
    );
  }),
  findFirst: jest.fn((args: any) => {
    const name = args?.where?.name?.equals;
    const wanted = typeof name === 'string' ? name.toLowerCase() : null;
    return Promise.resolve(
      rows.find((row) => row.name.toLowerCase() === wanted) ?? null,
    );
  }),
  create: jest.fn((args: any) =>
    Promise.resolve({
      id: catId(args.data.code ?? args.data.name),
      name: args.data.name,
      code: args.data.code ?? null,
    }),
  ),
});
