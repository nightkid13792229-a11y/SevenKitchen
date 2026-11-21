import {
  evaluateSupplementIssues,
  type SupplementIssueInput,
} from '../../../src/application/supplement-shop/supplement-catalog-issues';

/** 齐全的档案 + 已审核、两个成员的等价组：应当完全没有体检问题 */
const healthy: SupplementIssueInput = {
  price: 89.41,
  purchaseToBaseRatio: 2522,
  physicalForm: 'POWDER',
  baseUnit: 'PCS',
  unitDisplayLabel: '平勺',
  displayUnit: '平勺',
  propertiesDisplayUnit: '平勺',
  shelfLifeMonths: 24,
  storageCondition: '避光、密封、阴凉干燥处保存',
  sameNameCount: 1,
  equivalenceGroup: {
    name: '碘 · 天然',
    status: 'APPROVED',
    isActive: true,
    memberCount: 2,
    nutrientLabel: '碘',
    nutrientUnit: 'μg',
  },
  concentration: { status: 'OK' },
};

describe('evaluateSupplementIssues', () => {
  it('档案齐全且等价组已审核时没有问题', () => {
    expect(evaluateSupplementIssues(healthy)).toEqual([]);
  });

  it('NO_PRICE：进货价为 0 是阻断项', () => {
    const issues = evaluateSupplementIssues({ ...healthy, price: 0 });

    expect(issues).toEqual([
      {
        code: 'NO_PRICE',
        level: 'ERROR',
        message: '进货价为 0，无法计价，需先补价或不上架',
      },
    ]);
  });

  it('FORM_MISSING：缺物理形态是阻断项，且不再提示液体', () => {
    const issues = evaluateSupplementIssues({ ...healthy, physicalForm: null });

    expect(issues).toEqual([
      {
        code: 'FORM_MISSING',
        level: 'ERROR',
        message: '未填写物理形态，无法确定分装方式',
      },
    ]);
  });

  it('LIQUID_UNSUPPORTED：液体补剂不能上架', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      physicalForm: 'LIQUID',
    });

    expect(issues).toEqual([
      {
        code: 'LIQUID_UNSUPPORTED',
        level: 'ERROR',
        message: '液体补剂暂不支持分装，不应上架',
      },
    ]);
  });

  it('UNIT_INCOMPATIBLE：展示单位无法与基准单位 1:1 对应', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      displayUnit: '份',
    });

    expect(issues).toEqual([
      {
        code: 'UNIT_INCOMPATIBLE',
        level: 'ERROR',
        message:
          '展示单位「份」无法与库存基准单位 PCS 1:1 对应；请先修档案，禁止上架',
      },
    ]);
  });

  it('SHELF_LIFE_MISSING：缺原厂保质期是阻断项', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      shelfLifeMonths: null,
    });

    expect(issues).toEqual([
      {
        code: 'SHELF_LIFE_MISSING',
        level: 'ERROR',
        message: '未填写原厂保质期，无法计算分装后有效期',
      },
    ]);
  });

  it('缺储存条件不再提醒：订单标签会用默认值', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      storageCondition: null,
    });

    expect(issues).toEqual([]);
  });

  it('UNIT_INCONSISTENT：展示单位写了两份且不一致', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      unitDisplayLabel: '平勺',
      propertiesDisplayUnit: '瓶',
    });

    expect(issues).toEqual([
      {
        code: 'UNIT_INCONSISTENT',
        level: 'WARN',
        message:
          '单位口径不一致：properties.display_unit="瓶"，unit_display_label="平勺"',
      },
    ]);
  });

  it('UNIT_INCONSISTENT：只填了一边时不提示（保持原行为）', () => {
    expect(
      evaluateSupplementIssues({
        ...healthy,
        unitDisplayLabel: null,
        propertiesDisplayUnit: '瓶',
      }),
    ).toEqual([]);
  });

  it('DUPLICATE_NAME：同名档案多于 1 条', () => {
    const issues = evaluateSupplementIssues({ ...healthy, sameNameCount: 2 });

    expect(issues).toEqual([
      {
        code: 'DUPLICATE_NAME',
        level: 'WARN',
        message: '同名补剂档案有 2 条，需确认是否重复',
      },
    ]);
  });

  it('EQUIVALENCE_UNGROUPED：没归组是提醒项，且不再解析浓度', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      equivalenceGroup: null,
      concentration: { status: 'MISSING' },
    });

    expect(issues).toEqual([
      {
        code: 'EQUIVALENCE_UNGROUPED',
        level: 'WARN',
        message: '未归入等价组：缺货时无法推荐同营养替代原料',
      },
    ]);
  });

  it('EQUIVALENCE_GROUP_NOT_APPROVED：组未审核通过', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      equivalenceGroup: { ...healthy.equivalenceGroup!, status: 'DRAFT' },
    });

    expect(issues).toEqual([
      {
        code: 'EQUIVALENCE_GROUP_NOT_APPROVED',
        level: 'WARN',
        message: '所在等价组「碘 · 天然」还未审核通过，不参与替换',
      },
    ]);
  });

  it('EQUIVALENCE_GROUP_NOT_APPROVED：组被停用同样提示', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      equivalenceGroup: { ...healthy.equivalenceGroup!, isActive: false },
    });

    expect(issues).toEqual([
      {
        code: 'EQUIVALENCE_GROUP_NOT_APPROVED',
        level: 'WARN',
        message: '所在等价组「碘 · 天然」还未审核通过，不参与替换',
      },
    ]);
  });

  it('EQUIVALENCE_GROUP_SINGLETON：组里只有 1 个成员', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      equivalenceGroup: { ...healthy.equivalenceGroup!, memberCount: 1 },
    });

    expect(issues).toEqual([
      {
        code: 'EQUIVALENCE_GROUP_SINGLETON',
        level: 'WARN',
        message: '所在等价组「碘 · 天然」只有 1 个成员，等于不能替换',
      },
    ]);
  });

  it('EQUIVALENCE_NUTRIENT_MISSING：组要求的营养素浓度缺失', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      concentration: { status: 'MISSING' },
    });

    expect(issues).toEqual([
      {
        code: 'EQUIVALENCE_NUTRIENT_MISSING',
        level: 'WARN',
        message: '等价组「碘 · 天然」要求的 碘 浓度缺失，该原料不参与替换',
      },
    ]);
  });

  it('EQUIVALENCE_UNIT_MISMATCH：浓度单位与组要求不一致', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      concentration: { status: 'UNIT_MISMATCH', actualUnit: 'mg' },
    });

    expect(issues).toEqual([
      {
        code: 'EQUIVALENCE_UNIT_MISMATCH',
        level: 'WARN',
        message:
          '等价组「碘 · 天然」要求 碘（μg），档案浓度单位是 mg，该原料不参与替换',
      },
    ]);
  });

  it('EQUIVALENCE_UNIT_MISMATCH：读不到实际单位时写“未知”', () => {
    const issues = evaluateSupplementIssues({
      ...healthy,
      concentration: { status: 'UNIT_MISMATCH', actualUnit: '' },
    });

    expect(issues).toEqual([
      {
        code: 'EQUIVALENCE_UNIT_MISMATCH',
        level: 'WARN',
        message:
          '等价组「碘 · 天然」要求 碘（μg），档案浓度单位是 未知，该原料不参与替换',
      },
    ]);
  });

  it('保持抽取前的体检顺序与完整文案', () => {
    const issues = evaluateSupplementIssues({
      price: 0,
      purchaseToBaseRatio: 0,
      physicalForm: null,
      baseUnit: 'PCS',
      unitDisplayLabel: '片',
      displayUnit: '份',
      propertiesDisplayUnit: '粒',
      shelfLifeMonths: null,
      storageCondition: null,
      sameNameCount: 2,
      equivalenceGroup: {
        name: '锌 · 矿物盐',
        status: 'DRAFT',
        isActive: false,
        memberCount: 1,
        nutrientLabel: '锌',
        nutrientUnit: 'mg',
      },
      concentration: { status: 'MISSING' },
    });

    expect(issues).toEqual([
      {
        code: 'NO_PRICE',
        level: 'ERROR',
        message: '进货价为 0，无法计价，需先补价或不上架',
      },
      {
        code: 'FORM_MISSING',
        level: 'ERROR',
        message: '未填写物理形态，无法确定分装方式',
      },
      {
        code: 'UNIT_INCOMPATIBLE',
        level: 'ERROR',
        message:
          '展示单位「份」无法与库存基准单位 PCS 1:1 对应；请先修档案，禁止上架',
      },
      {
        code: 'SHELF_LIFE_MISSING',
        level: 'ERROR',
        message: '未填写原厂保质期，无法计算分装后有效期',
      },
      {
        code: 'UNIT_INCONSISTENT',
        level: 'WARN',
        message:
          '单位口径不一致：properties.display_unit="粒"，unit_display_label="片"',
      },
      {
        code: 'DUPLICATE_NAME',
        level: 'WARN',
        message: '同名补剂档案有 2 条，需确认是否重复',
      },
      {
        code: 'EQUIVALENCE_GROUP_NOT_APPROVED',
        level: 'WARN',
        message: '所在等价组「锌 · 矿物盐」还未审核通过，不参与替换',
      },
      {
        code: 'EQUIVALENCE_GROUP_SINGLETON',
        level: 'WARN',
        message: '所在等价组「锌 · 矿物盐」只有 1 个成员，等于不能替换',
      },
      {
        code: 'EQUIVALENCE_NUTRIENT_MISSING',
        level: 'WARN',
        message: '等价组「锌 · 矿物盐」要求的 锌 浓度缺失，该原料不参与替换',
      },
    ]);
  });
});
