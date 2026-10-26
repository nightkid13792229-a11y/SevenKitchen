import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { INGREDIENT_CARD_FIELD_KEYS } from 'src/domain/ingredient-creation/ingredient-card-fields';
import { UpdateDraftIngredientDto } from 'src/interfaces/dto/ingredient-creation/update-draft.dto';

/**
 * 草稿里「标准原料预填值」的校验口径。
 *
 * 这里钉住的是接口契约，不是页面：30 个公共字段里只有 4 个必填，其余都允许
 * 显式 `null`（人还没填完），`0` 是合法值而不是空值。可食部在草稿里存的是
 * 比例 `edibleYieldRate`（0–1）；公共名 `edibleYieldPercent`（0–100）只用于
 * 页面与 `manualFields`，绝不能作为草稿字段落库，否则会多除一次 100。
 *
 * 注意：只断言「没有校验错误」是不够的 —— whitelist 会把 DTO 没声明的键
 * 静默剥掉，字段全丢光也照样零错误。所以全量用例还要逐个确认字段真的在
 * 实例上，并确认拼错的键确实被剥掉。
 */

// jest 以 ts-jest 的 isolatedModules 跑（只转译、不做类型检查）：导出不存在时
// import 会静默变成 undefined，后面的用例会对着 plain object 校验而“假通过”。
// 这里显式兜底，保证缺实现时这条测试是真失败，而不是一堆看不出原因的通过。
if (typeof UpdateDraftIngredientDto !== 'function') {
  throw new Error(
    'UpdateDraftIngredientDto 未导出：草稿原料 DTO 还没实现（Task 2 Step 3）。',
  );
}

const base = {
  name: '冷冻三文鱼',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克',
};

/** 30 个公共字段各给一个合法值（storage 名与公共名不同的只有可食部）。 */
const fullFields = {
  ...base,
  nameEn: 'Atlantic Salmon',
  category: 'MEAT_ORGAN',
  notes: '切块分装，一次一袋',
  weightG: 150,
  maxCapacityG: 2000,
  cfctClass: '鱼虾蟹贝类',
  edibleYieldRate: 0.75,
  mainNutrientsDesc: '高蛋白、低脂',
  procurementStrategy: 'DAILY_PURCHASE',
  purchaseUnit: '袋',
  purchaseToBaseRatio: 1000,
  currentPricePerPurchaseUnit: 128,
  brand: '××水产',
  productModel: '1kg/袋',
  purchaseChannel: '京东',
  safetyStock: 5,
  reorderPoint: 3,
  targetStock: 10,
  diyEnabled: true,
  addTiming: 'BEFORE_MEAL',
  // 生产损耗率是倍数（1.05 = 5%），不是 0–1 的比率。
  productionLossRate: 1.05,
  tags: ['水产'],
  shelfLifeMonths: 12,
  storageCondition: '-18℃ 冷冻',
  openedShelfLifeDays: 3,
  isOilBased: false,
  manualFields: ['edibleYieldPercent', 'name'],
  // 故意的拼写错误：契约外的键必须被 whitelist 剥掉，不能原样落进 payload
  storagCondition: '-18℃ 冷冻',
};

async function errorsOf(extra: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(UpdateDraftIngredientDto, { ...base, ...extra });
  return (await validate(dto, { whitelist: true })).map(
    (error) => error.property,
  );
}

/** 过一遍与控制器相同的 whitelist，拿回真正会被服务层看到的字段。 */
async function validated(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const dto = plainToInstance(UpdateDraftIngredientDto, payload);
  await validate(dto, { whitelist: true });
  return dto as unknown as Record<string, unknown>;
}

describe('UpdateDraftIngredientDto', () => {
  it('接受 30 项全量，且每一项都真的落在实例上', async () => {
    expect(await errorsOf(fullFields)).toEqual([]);

    const payload = await validated(fullFields);
    for (const key of INGREDIENT_CARD_FIELD_KEYS) {
      // 可食部的公共名只出现在 manualFields；草稿里存的是比例 edibleYieldRate
      if (key === 'edibleYieldPercent') continue;
      // 用带键名的对象断言：字段被 whitelist 剥掉时会直接指出是哪一个
      expect({ [key]: payload[key] }).toEqual({ [key]: expect.anything() });
    }
    expect(payload.manualFields).toEqual(['edibleYieldPercent', 'name']);
    // 拼错的契约外键必须被剥掉，而不是原样落进服务层的 payload
    expect(payload.storagCondition).toBeUndefined();
  });

  it('可食部比例越界被拒', async () => {
    expect(await errorsOf({ edibleYieldRate: 1.5 })).toContain(
      'edibleYieldRate',
    );
    expect(await errorsOf({ edibleYieldRate: -0.1 })).toContain(
      'edibleYieldRate',
    );
  });

  it('可食部在草稿里只认比例 edibleYieldRate，百分数公共名会被剥掉', async () => {
    const payload = await validated({
      ...base,
      edibleYieldRate: 0.75,
      edibleYieldPercent: 75,
    });
    expect(payload.edibleYieldRate).toBe(0.75);
    expect(payload.edibleYieldPercent).toBeUndefined();
  });

  it('未知键被 whitelist 剥掉，不进 payload', async () => {
    const payload = await validated({ ...base, evil: 'x' });
    expect(payload.evil).toBeUndefined();
  });

  it('manualFields 收下契约内全部 30 个键，契约外的键被拒', async () => {
    expect(await errorsOf({ manualFields: ['nope'] })).toContain(
      'manualFields',
    );

    // 逐个键都要通过：只钉 2 个键拦不住「只认旧 7 键」的白名单回退，
    // 也拦不住误用 AI 可写 26 键（漏掉 safetyStock / tags 等 4 项）。
    const rejected: string[] = [];
    for (const field of INGREDIENT_CARD_FIELD_KEYS) {
      const errors = await errorsOf({ manualFields: [field] });
      if (errors.length > 0) {
        rejected.push(`${field} → ${errors.join(', ')}`);
      }
    }
    expect(rejected).toEqual([]);

    // 一次全给也必须通过（真实页面就是整份回传）
    expect(
      await errorsOf({ manualFields: [...INGREDIENT_CARD_FIELD_KEYS] }),
    ).toEqual([]);
  });

  it('四个必填字段仍然必填', async () => {
    const dto = plainToInstance(UpdateDraftIngredientDto, {});
    const errors = (await validate(dto, { whitelist: true })).map(
      (error) => error.property,
    );
    expect(errors).toEqual(
      expect.arrayContaining(['name', 'type', 'baseUnit', 'unitDisplayLabel']),
    );
  });

  it('可选字段允许显式 null，0 是合法值', async () => {
    expect(
      await errorsOf({
        nameEn: null,
        category: null,
        notes: null,
        weightG: null,
        cfctClass: null,
        edibleYieldRate: null,
        brand: null,
        safetyStock: null,
        shelfLifeMonths: null,
        isOilBased: null,
        currentPricePerPurchaseUnit: 0,
        productionLossRate: 1.05,
        procurementStrategy: null,
        addTiming: null,
        diyEnabled: false,
        tags: [],
      }),
    ).toEqual([]);
  });

  it('采购策略 / 添加时机只收受控词表', async () => {
    expect(await errorsOf({ procurementStrategy: '长期采购' })).toContain(
      'procurementStrategy',
    );
    expect(await errorsOf({ procurementStrategy: 'HYBRID' })).toEqual([]);
    expect(await errorsOf({ addTiming: '冷却后' })).toContain('addTiming');
    expect(await errorsOf({ addTiming: 'BEFORE_MIXING' })).toEqual([]);
  });

  it('生产损耗率是 1–2 的倍数，不是 0–1 的比率', async () => {
    expect(await errorsOf({ productionLossRate: 0.05 })).toContain(
      'productionLossRate',
    );
    expect(await errorsOf({ productionLossRate: 1.05 })).toEqual([]);
    expect(await errorsOf({ productionLossRate: 2.1 })).toContain(
      'productionLossRate',
    );
  });

  it('采购字段长度与除数约束对齐数据库', async () => {
    expect(await errorsOf({ brand: 'x'.repeat(101) })).toContain('brand');
    expect(await errorsOf({ productModel: 'x'.repeat(101) })).toContain(
      'productModel',
    );
    expect(await errorsOf({ purchaseUnit: 'x'.repeat(51) })).toContain(
      'purchaseUnit',
    );
    expect(await errorsOf({ purchaseToBaseRatio: 0 })).toContain(
      'purchaseToBaseRatio',
    );
    expect(await errorsOf({ purchaseToBaseRatio: 1000 })).toEqual([]);
  });

  it('负数、小数形式的整数与错类型的布尔值被拒', async () => {
    expect(await errorsOf({ weightG: -1 })).toContain('weightG');
    expect(await errorsOf({ openedShelfLifeDays: 1.5 })).toContain(
      'openedShelfLifeDays',
    );
    expect(await errorsOf({ isOilBased: 'no' })).toContain('isOilBased');
    expect(await errorsOf({ tags: '水产' })).toContain('tags');
  });

  it('库存数值边界：safetyStock 为负被拒，0 是合法值', async () => {
    expect(await errorsOf({ safetyStock: -1 })).toContain('safetyStock');
    expect(await errorsOf({ safetyStock: 0 })).toEqual([]);
  });
});
