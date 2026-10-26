import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDraftIngredientDto } from 'src/interfaces/dto/ingredient-creation/update-draft.dto';

/**
 * 草稿里「标准原料预填值」的校验口径。
 *
 * 这里钉住的是接口契约，不是页面：30 个公共字段里只有 4 个必填，其余都允许
 * 显式 `null`（人还没填完），`0` 是合法值而不是空值。可食部在草稿里存的是
 * 比例 `edibleYieldRate`（0–1）；公共名 `edibleYieldPercent`（0–100）只用于
 * 页面与 `manualFields`，绝不能作为草稿字段落库，否则会多除一次 100。
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
  procurementStrategy: '长期采购',
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
  addTiming: '冷却后',
  productionLossRate: 0.05,
  tags: ['水产'],
  shelfLifeMonths: 12,
  storageCondition: '-18℃ 冷冻',
  openedShelfLifeDays: 3,
  isOilBased: false,
  manualFields: ['edibleYieldPercent', 'name'],
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
  it('接受 30 项全量', async () => {
    expect(await errorsOf(fullFields)).toEqual([]);
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

  it('manualFields 只接受契约内的键', async () => {
    expect(await errorsOf({ manualFields: ['nope'] })).toContain(
      'manualFields',
    );
    expect(await errorsOf({ manualFields: ['edibleYieldPercent'] })).toEqual(
      [],
    );
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
        productionLossRate: 0,
        diyEnabled: false,
        tags: [],
      }),
    ).toEqual([]);
  });

  it('负数、小数形式的整数与错类型的布尔值被拒', async () => {
    expect(await errorsOf({ weightG: -1 })).toContain('weightG');
    expect(await errorsOf({ openedShelfLifeDays: 1.5 })).toContain(
      'openedShelfLifeDays',
    );
    expect(await errorsOf({ isOilBased: 'no' })).toContain('isOilBased');
    expect(await errorsOf({ tags: '水产' })).toContain('tags');
  });
});
