import {
  MAX_ITEM_WEIGHT_G,
  MIN_ITEM_WEIGHT_G,
  createWriteTools,
} from 'src/application/recipe-designer/agent/write-tools';
import {
  createFakeRecipeAgentPort,
  fakeDraftSnapshot,
} from '../../../helpers/fake-recipe-agent-port';

const tagPolicy = {
  isAllowedTag: (name: string) =>
    ['低脂', '易消化', '单一动物蛋白'].includes(name),
};

function setup() {
  const port = createFakeRecipeAgentPort();
  return {
    port,
    tools: createWriteTools({ port, draftId: 'draft-1', tagPolicy }),
  };
}

describe('write tools', () => {
  it.each([0, -1, Number.NaN])('克数 %s 被拒绝', async (weightG) => {
    const { tools, port } = setup();
    const result = await tools.add_ingredient({
      nutritionFoodId: 'nf-1',
      weightG,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_WEIGHT');
    expect(port.addItem).not.toHaveBeenCalled();
  });

  it.each([MIN_ITEM_WEIGHT_G - 0.01, MAX_ITEM_WEIGHT_G + 0.01, Infinity])(
    '超出范围的克数 %s 被拒绝',
    async (weightG) => {
      const { tools, port } = setup();
      const result = await tools.update_weight({ itemId: 'item-1', weightG });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INVALID_WEIGHT');
      expect(port.updateWeight).not.toHaveBeenCalled();
    },
  );

  it('克数边界 0.1 / 10000 接受', async () => {
    const { tools, port } = setup();
    const low = await tools.update_weight({
      itemId: 'item-1',
      weightG: MIN_ITEM_WEIGHT_G,
    });
    const high = await tools.update_weight({
      itemId: 'item-1',
      weightG: MAX_ITEM_WEIGHT_G,
    });
    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
    expect(port.updateWeight).toHaveBeenNthCalledWith(
      1,
      'item-1',
      MIN_ITEM_WEIGHT_G,
    );
    expect(port.updateWeight).toHaveBeenNthCalledWith(
      2,
      'item-1',
      MAX_ITEM_WEIGHT_G,
    );
  });

  it('字符串克数（运行时绕过类型）同样是 INVALID_WEIGHT', async () => {
    const { tools, port } = setup();
    const result = await tools.add_ingredient({
      nutritionFoodId: 'nf-1',
      weightG: '50',
    } as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_WEIGHT');
    expect(port.addItem).not.toHaveBeenCalled();
  });

  it('缺 nutritionFoodId 先报 INVALID_ARGUMENT，不调端口', async () => {
    const { tools, port } = setup();
    const result = await tools.add_ingredient({ weightG: 50 } as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.addItem).not.toHaveBeenCalled();
  });

  it('加原料成功，只传传入的字段并标记评估过期', async () => {
    const { tools, port } = setup();
    const result = await tools.add_ingredient({
      nutritionFoodId: 'nf-1',
      ingredientId: 'ing-1',
      weightG: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.addItem).toHaveBeenCalledWith('draft-1', {
      nutritionFoodId: 'nf-1',
      ingredientId: 'ing-1',
      weightG: 50,
    });
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('加原料不传可选字段时端口参数不多带 undefined', async () => {
    const { tools, port } = setup();
    const result = await tools.add_ingredient({
      nutritionFoodId: 'nf-8',
      weightG: 30,
    });
    expect(result.ok).toBe(true);
    expect(port.addItem).toHaveBeenCalledWith('draft-1', {
      nutritionFoodId: 'nf-8',
      weightG: 30,
    });
  });

  it('卖点命中禁用词被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ sellingPoint: '护肝好吸收' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COPY_FORBIDDEN_CLAIM');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('描述命中禁用词被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({
      description: '这款粮可以治疗肠胃炎',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COPY_FORBIDDEN_CLAIM');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('非白名单健康标签被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ targetHealthTags: ['体重管理'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TAG_NOT_ALLOWED');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('健康标签 trim、去重、保序后落库', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({
      targetHealthTags: [' 低脂 ', '易消化', '低脂', ' 单一动物蛋白 '],
    });
    expect(result.ok).toBe(true);
    expect(port.setCopy).toHaveBeenCalledWith('draft-1', {
      targetHealthTags: ['低脂', '易消化', '单一动物蛋白'],
    });
  });

  it('空健康标签被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ targetHealthTags: ['  '] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TAG_NOT_ALLOWED');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('空健康标签数组允许清空', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ targetHealthTags: [] });
    expect(result.ok).toBe(true);
    expect(port.setCopy).toHaveBeenCalledWith('draft-1', {
      targetHealthTags: [],
    });
  });

  it('系列名命中禁用词被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ name: '护肝鸭肉餐' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COPY_FORBIDDEN_CLAIM');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('封面标题超过 20 字被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ coverTitle: '一'.repeat(21) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('name 为空或超过 200 字被拒绝', async () => {
    const { tools } = setup();
    const blank = await tools.set_copy({ name: '   ' });
    expect(blank.ok).toBe(false);
    if (blank.ok) return;
    expect(blank.error.code).toBe('INVALID_ARGUMENT');

    const tooLong = await tools.set_copy({ name: '一'.repeat(201) });
    expect(tooLong.ok).toBe(false);
    if (tooLong.ok) return;
    expect(tooLong.error.code).toBe('INVALID_ARGUMENT');
  });

  it('卖点 / 描述超过上限被拒绝', async () => {
    const { tools } = setup();
    const sellingPoint = await tools.set_copy({
      sellingPoint: '一'.repeat(201),
    });
    expect(sellingPoint.ok).toBe(false);
    if (sellingPoint.ok) return;
    expect(sellingPoint.error.code).toBe('INVALID_ARGUMENT');

    const description = await tools.set_copy({
      description: '一'.repeat(4001),
    });
    expect(description.ok).toBe(false);
    if (description.ok) return;
    expect(description.error.code).toBe('INVALID_ARGUMENT');
  });

  it('文案字段统一 trim 后落库', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({
      name: '  鸭肉南瓜餐  ',
      coverTitle: '  鲜鸭南瓜  ',
      sellingPoint: '  鲜鸭配南瓜  ',
      description: '  好吸收  ',
    });
    expect(result.ok).toBe(true);
    expect(port.setCopy).toHaveBeenCalledWith('draft-1', {
      name: '鸭肉南瓜餐',
      coverTitle: '鲜鸭南瓜',
      sellingPoint: '鲜鸭配南瓜',
      description: '好吸收',
    });
  });

  it('空白封面 / 卖点 / 描述被拒绝', async () => {
    const { tools, port } = setup();
    for (const args of [
      { coverTitle: '   ' },
      { sellingPoint: '   ' },
      { description: '   ' },
    ]) {
      const result = await tools.set_copy(args);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('INVALID_ARGUMENT');
    }
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('文案长度边界（trim 后 20 / 200 / 4000）接受', async () => {
    const { tools, port } = setup();
    const coverTitle = '一'.repeat(20);
    const sellingPoint = '二'.repeat(200);
    const description = '三'.repeat(4000);
    const result = await tools.set_copy({
      coverTitle: ` ${coverTitle} `,
      sellingPoint: ` ${sellingPoint} `,
      description: ` ${description} `,
    });
    expect(result.ok).toBe(true);
    expect(port.setCopy).toHaveBeenCalledWith('draft-1', {
      coverTitle,
      sellingPoint,
      description,
    });
  });

  it('set_copy 空对象被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('set_copy 传 null（运行时绕过类型）不抛 TypeError', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy(null as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('只有 coverTitle 时也扫禁用词', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ coverTitle: '护肝' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COPY_FORBIDDEN_CLAIM');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('文案合法时写进端口，只带传入的字段', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({
      name: '鸭肉南瓜餐',
      coverTitle: '鲜鸭南瓜',
      sellingPoint: '鲜鸭配南瓜',
      targetHealthTags: ['低脂'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.setCopy).toHaveBeenCalledWith('draft-1', {
      name: '鸭肉南瓜餐',
      coverTitle: '鲜鸭南瓜',
      sellingPoint: '鲜鸭配南瓜',
      targetHealthTags: ['低脂'],
    });
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('制作步骤为空或超过 30 步被拒绝', async () => {
    const { tools, port } = setup();
    const empty = await tools.set_production_steps({ steps: [] });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.code).toBe('INVALID_ARGUMENT');

    const tooMany = await tools.set_production_steps({
      steps: Array.from({ length: 31 }, (_, i) => ({
        sortOrder: i + 1,
        instruction: '切块',
      })),
    });
    expect(tooMany.ok).toBe(false);
    if (tooMany.ok) return;
    expect(tooMany.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setProductionSteps).not.toHaveBeenCalled();
  });

  it('制作步骤 30 步边界接受', async () => {
    const { tools, port } = setup();
    const steps = Array.from({ length: 30 }, (_, i) => ({
      sortOrder: i + 1,
      instruction: `第 ${i + 1} 步`,
    }));
    const result = await tools.set_production_steps({ steps });
    expect(result.ok).toBe(true);
    expect(port.setProductionSteps).toHaveBeenCalledWith('draft-1', steps);
  });

  it('从草稿读出的步骤（含 null 温度）能原样写回', async () => {
    const draft = fakeDraftSnapshot();
    const steps = draft.productionSteps.map((step, index) =>
      index === 0 ? { ...step, instruction: '鸭腿肉切块后焯水' } : { ...step },
    );
    expect(steps[1].temperature).toBeNull();

    const { tools, port } = setup();
    const result = await tools.set_production_steps({ steps });
    expect(result.ok).toBe(true);
    expect(port.setProductionSteps).toHaveBeenCalledWith('draft-1', steps);
  });

  it('制作步骤 sortOrder 不连续被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_production_steps({
      steps: [
        { sortOrder: 1, instruction: '切块' },
        { sortOrder: 3, instruction: '慢煮' },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setProductionSteps).not.toHaveBeenCalled();
  });

  it('制作步骤 instruction 为空被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_production_steps({
      steps: [{ sortOrder: 1, instruction: '  ' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setProductionSteps).not.toHaveBeenCalled();
  });

  it('制作步骤可选字段类型不对被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_production_steps({
      steps: [{ sortOrder: 1, instruction: '切块', duration: 8 }],
    } as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setProductionSteps).not.toHaveBeenCalled();
  });

  it('合法两步制作步骤写进端口', async () => {
    const { tools, port } = setup();
    const steps = [
      {
        sortOrder: 1,
        instruction: '鸭腿肉切块焯水',
        duration: '8 分钟',
        temperature: '100°C',
        equipment: '汤锅',
      },
      { sortOrder: 2, instruction: '所有原料入锅慢煮' },
    ];
    const result = await tools.set_production_steps({ steps });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.setProductionSteps).toHaveBeenCalledWith('draft-1', steps);
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('预处理方式不能为空', async () => {
    const { tools, port } = setup();
    const result = await tools.set_preparation({
      itemId: 'item-1',
      method: '  ',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setPreparation).not.toHaveBeenCalled();
  });

  it('预处理备注超过 500 字被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_preparation({
      itemId: 'item-1',
      method: '切块',
      note: '一'.repeat(501),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.setPreparation).not.toHaveBeenCalled();
  });

  it('预处理备注 500 字边界接受', async () => {
    const { tools, port } = setup();
    const note = '一'.repeat(500);
    const result = await tools.set_preparation({
      itemId: 'item-1',
      method: '切块',
      note,
    });
    expect(result.ok).toBe(true);
    expect(port.setPreparation).toHaveBeenCalledWith('item-1', {
      method: '切块',
      note,
    });
  });

  it('预处理合法时写进端口，不带多余的 note', async () => {
    const { tools, port } = setup();
    const result = await tools.set_preparation({
      itemId: 'item-1',
      method: '切块',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.setPreparation).toHaveBeenCalledWith('item-1', {
      method: '切块',
    });
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('换原料 0 克被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.replace_ingredient({
      itemId: 'item-1',
      nutritionFoodId: 'nf-8',
      weightG: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_WEIGHT');
    expect(port.replaceItem).not.toHaveBeenCalled();
  });

  it('换原料成功并标记评估过期', async () => {
    const { tools, port } = setup();
    const result = await tools.replace_ingredient({
      itemId: 'item-5',
      nutritionFoodId: 'nf-8',
      ingredientId: 'ing-8',
      weightG: 40,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.replaceItem).toHaveBeenCalledWith('item-5', {
      nutritionFoodId: 'nf-8',
      ingredientId: 'ing-8',
      weightG: 40,
    });
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('改克数成功并标记评估过期', async () => {
    const { tools, port } = setup();
    const result = await tools.update_weight({
      itemId: 'item-1',
      weightG: 400,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.updateWeight).toHaveBeenCalledWith('item-1', 400);
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('删原料成功，返回名字和剩余总重', async () => {
    const { tools, port } = setup();
    const result = await tools.remove_ingredient({ itemId: 'item-7' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.removeItem).toHaveBeenCalledWith('item-7');
    expect(result.data).toEqual({
      itemId: 'item-7',
      name: '鱼油',
      totalWeightG: 860,
    });
    expect(result.summary).toContain('鱼油');
    expect(result.summary).not.toContain('item-7');
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('删到总重 ≤ 0 时返回 DRAFT_EMPTY，端口不调用', async () => {
    const draft = fakeDraftSnapshot();
    const onlyItem = draft.items[0];
    const port = createFakeRecipeAgentPort({
      draft: fakeDraftSnapshot({
        items: [onlyItem],
        totalWeightG: onlyItem.weightG,
      }),
    });
    const tools = createWriteTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.remove_ingredient({ itemId: onlyItem.id });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('DRAFT_EMPTY');
    expect(port.removeItem).not.toHaveBeenCalled();
  });

  it('找不到要删的原料返回 INVALID_ARGUMENT，端口不调用', async () => {
    const { tools, port } = setup();
    const result = await tools.remove_ingredient({ itemId: 'missing' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.removeItem).not.toHaveBeenCalled();
  });

  it('端口抛错（未知 itemId）转成 INVALID_ARGUMENT 数据', async () => {
    const { tools } = setup();
    const result = await tools.update_weight({
      itemId: 'missing',
      weightG: 50,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(result.error.message).toContain('找不到');
  });

  it('缺 itemId 的写工具都返回 INVALID_ARGUMENT', async () => {
    const { tools, port } = setup();
    for (const result of [
      await tools.remove_ingredient({} as any),
      await tools.update_weight({ weightG: 50 } as any),
      await tools.set_preparation({ method: '切块' } as any),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('INVALID_ARGUMENT');
    }
    expect(port.removeItem).not.toHaveBeenCalled();
    expect(port.updateWeight).not.toHaveBeenCalled();
    expect(port.setPreparation).not.toHaveBeenCalled();
  });
});
