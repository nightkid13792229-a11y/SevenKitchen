import {
  executeSupplementTool,
  SUPPLEMENT_TOOLS,
  type ToolContext
} from '../../../src/application/ingredient-creation/supplement-tools';

/**
 * 工具是模型的手脚，所以这里钉两件事：
 * **每个工具都真的能被调用并返回东西**，以及**失败要如实返回**（不能装作成功）。
 * 至于模型什么时候用哪个——那是它的事，这里不测。
 */
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    knowledge: {
      isAvailable: () => true,
      search: jest.fn(() => [
        { chunkId: 'C1', docId: 'nrc', text: 'zinc sulfate is bioavailable', score: 9 }
      ])
    },
    preview: {
      searchCandidates: jest.fn(async () => [
        { url: 'https://www.iherb.com/pr/x/1', name: 'NOW Zinc', priceUsd: null, pricePerServingUsd: null }
      ]),
      preview: jest.fn(async (url: string) => ({
        productUrl: url,
        pagePriceCny: 92.79,
        productName: 'NOW Zinc',
        servingUnitsPerDose: 1,
        nutrients: [{ fieldPath: 'minerals.zinc', value: 50, unit: 'mg', rawName: 'Zinc' }],
        unrecognized: [],
        labelText: 'Serving Size: 1 Capsule'
      }))
    },
    catalog: {
      lookup: jest.fn(() => [
        { name: '甘氨酸锌', category: '矿物元素', scope: '犬、猫', dogAllowed: true, exact: true }
      ]),
      getSummary: jest.fn(() => ({
        total: 454,
        dogAllowed: 107,
        generatedAt: '2026-11-07',
        source: '目录',
        sourceUrl: 'https://www.nahs.org.cn/x'
      }))
    },
    draft: { name: '' },
    allowedUrls: new Set(['https://www.iherb.com/pr/x/1']),
    ...overrides
  };
}

describe('工具箱', () => {
  it('六个工具都在，且都有描述与参数', () => {
    expect(SUPPLEMENT_TOOLS.map((tool) => tool.name).sort()).toEqual([
      'ask_user',
      'fetch_product',
      'lookup_feed_catalog',
      'search_knowledge',
      'search_products',
      'write_draft'
    ]);
    for (const tool of SUPPLEMENT_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters).toBeTruthy();
    }
  });
});

describe('执行工具', () => {
  it('查知识库返回带出处的段落', async () => {
    const result = await executeSupplementTool('search_knowledge', { query: 'zinc' }, context());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        expect.objectContaining({ chunkId: 'C1', docId: 'nrc' })
      ]);
    }
  });

  it('知识库不可用时如实报错，不装作查过', async () => {
    const ctx = context({
      knowledge: { isAvailable: () => false, search: jest.fn(() => []) }
    });
    const result = await executeSupplementTool('search_knowledge', { query: 'zinc' }, ctx);
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining('不可用') })
    );
  });

  it('搜商品返回候选', async () => {
    const result = await executeSupplementTool('search_products', { keyword: '甘氨酸锌' }, context());
    expect(result.ok).toBe(true);
  });

  it('读商品页带出人民币标价与标签字段', async () => {
    const result = await executeSupplementTool(
      'fetch_product',
      { url: 'https://www.iherb.com/pr/x/1' },
      context()
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(expect.objectContaining({ pagePriceCny: 92.79 }));
    }
  });

  it('查目录带回适用范围', async () => {
    const result = await executeSupplementTool('lookup_feed_catalog', { name: '甘氨酸锌' }, context());
    expect(result.ok).toBe(true);
  });

  it('写草稿：能写的写进去，写不了的逐条说明', async () => {
    const result = await executeSupplementTool(
      'write_draft',
      { patch: { brand: 'NOW', servingUnitsPerDose: 99 } },
      context()
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { applied: string[]; rejected: { field: string }[] };
      expect(data.applied).toContain('brand');
      expect(data.rejected[0].field).toBe('servingUnitsPerDose');
    }
  });

  it('问人：带回问题与选项', async () => {
    const result = await executeSupplementTool(
      'ask_user',
      { question: '选哪个形态？', options: ['甘氨酸锌', '葡萄糖酸锌'] },
      context()
    );
    expect(result).toEqual({
      ok: true,
      data: { question: '选哪个形态？', options: ['甘氨酸锌', '葡萄糖酸锌'] }
    });
  });

  it('参数缺失时说清是哪个参数，不是崩掉', async () => {
    const result = await executeSupplementTool('search_products', {}, context());
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining('keyword') })
    );
  });

  it('工具名不存在时明确拒绝', async () => {
    const result = await executeSupplementTool('delete_everything', {}, context());
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining('没有这个工具') })
    );
  });

  it('工具内部抛错也被翻译成 ok:false，不让流程崩', async () => {
    const ctx = context({
      preview: {
        searchCandidates: jest.fn(async () => {
          throw new Error('搜索超时');
        }),
        preview: jest.fn()
      } as unknown as ToolContext['preview']
    });
    const result = await executeSupplementTool('search_products', { keyword: '锌' }, ctx);
    expect(result).toEqual({ ok: false, error: '搜索超时' });
  });
});
