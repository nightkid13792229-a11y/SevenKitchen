import { buildDogDesignInsight } from '../../../src/domain/recipe-designer/dog-design-insight';

/**
 * 设计器要看得到「顾客的定制需求」（2026-09-28，老板确认的第 4 条）
 *
 * 真实缺陷：设计器此前**完全看不到**这笔定制订单 ——
 * 顾客选的是减重还是增重、勾没勾健康管理、备注里说了什么、
 * 订单里单独填的过敏与忌口，营养师和 AI 一个都读不到。
 * 于是"在食谱设计器里参考用户填写的信息来设计"这件事根本不成立。
 */
describe('DogDesignInsight · 顾客的定制需求', () => {
  const baseDog = {
    id: 'dog-1',
    name: '面包',
    currentWeightKg: 15,
    bcsScore: 6,
    allergyRecords: [{ allergen: '鸡肉' }],
    preferredFoods: '南瓜',
    pickyFoods: null,
  };

  const customOrder = {
    orderId: 'CR202609280001',
    status: 'PAID',
    targetGoal: 'LOSE_WEIGHT',
    needsHealthManagement: true,
    additionalNotes: '它最近在换粮，请把鸡肉换成别的',
    allergies: ['牛肉'],
    medicalConditions: ['肠胃敏感'],
    preferredIngredients: ['三文鱼'],
    dislikedIngredients: ['胡萝卜'],
    recipeQuantity: 3,
    requestedProteinCodes: ['BEEF', 'CHICKEN'],
    createdAt: '2026-09-28T00:00:00.000Z',
  };

  const build = (customRecipeOrder?: any) =>
    buildDogDesignInsight({
      dog: baseDog,
      seriesList: [],
      orderItems: [],
      lifeStageLabel: '成犬期',
      customRecipeOrder,
    });

  it('把定制订单原样带给设计器', () => {
    const insight = build(customOrder);

    expect(insight.customRecipeOrder).not.toBeNull();
    expect(insight.customRecipeOrder?.orderId).toBe('CR202609280001');
    // 顾客选的体重目标 —— 这是"减重/增重以顾客选的为准"的落地依据
    expect(insight.customRecipeOrder?.targetGoal).toBe('LOSE_WEIGHT');
    expect(insight.customRecipeOrder?.needsHealthManagement).toBe(true);
    // 顾客原话要原样给出，不能改写
    expect(insight.customRecipeOrder?.additionalNotes).toBe(
      '它最近在换粮，请把鸡肉换成别的',
    );
    // 订单里单独填的过敏/疾病/喜好/忌口
    expect(insight.customRecipeOrder?.allergies).toEqual(['牛肉']);
    expect(insight.customRecipeOrder?.medicalConditions).toEqual(['肠胃敏感']);
    expect(insight.customRecipeOrder?.preferredIngredients).toEqual(['三文鱼']);
    expect(insight.customRecipeOrder?.dislikedIngredients).toEqual(['胡萝卜']);
    // 多份购买 / 主蛋白偏好：营养师要按份数与顾客选的蛋白来设计
    expect(insight.customRecipeOrder?.recipeQuantity).toBe(3);
    expect(insight.customRecipeOrder?.requestedProteinCodes).toEqual([
      'BEEF',
      'CHICKEN',
    ]);
  });

  it('把定制单附件归一化为字符串数组（签名交给服务层）', () => {
    const insight = build({
      ...customOrder,
      // 库里是 JSON 列：历史数据可能混入空串 / null / 非字符串
      attachments: [
        'custom-recipe-attachments/order-a.jpg',
        ' https://cdn.example.com/custom-recipe-attachments/order-b.pdf ',
        '',
        null,
        42,
      ],
    });

    expect(insight.customRecipeOrder?.attachments).toEqual([
      'custom-recipe-attachments/order-a.jpg',
      'https://cdn.example.com/custom-recipe-attachments/order-b.pdf',
    ]);
  });

  it('定制单没有附件时返回空数组', () => {
    expect(build(customOrder).customRecipeOrder?.attachments).toEqual([]);
    expect(
      build({ ...customOrder, attachments: null }).customRecipeOrder
        ?.attachments,
    ).toEqual([]);
  });

  it('没有定制单时是 null，而不是空对象（前端据此决定要不要渲染）', () => {
    expect(build(undefined).customRecipeOrder).toBeNull();
    expect(build(null).customRecipeOrder).toBeNull();
  });

  it('不影响原有的档案 / 设计历史 / 订单汇总', () => {
    const insight = build(customOrder);

    expect(insight.dog.name).toBe('面包');
    expect(insight.dog.structuredAllergies).toEqual(['鸡肉']);
    expect(insight.designHistory).toBeDefined();
    expect(insight.orderSummary).toBeDefined();
  });
});
