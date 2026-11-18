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
      execute: jest.fn(async (name: string) => {
        if (name === 'kb_read') {
          return {
            ok: true,
            data: {
              documentId: 'nrc-NRC-2006',
              pages: [{ pageNo: 339, text: 'Iron oxide and carbonate demonstrate negligible bioavailability.' }]
            }
          };
        }
        return {
          ok: true,
          data: { hits: [{ documentId: 'nrc-NRC-2006', pageNo: 339, snippet: 'Iron oxide…' }] }
        };
      })
    } as unknown as ToolContext['knowledge'],
    labelReader: {
      read: jest.fn(async () => ({
        text: 'SUPPLEMENT FACTS\nServing Size: One Capsule\nIron (as Ferrous Bisglycinate) 25 mg 139%',
        imageUrl: 'https://cos/x.jpg',
        model: 'glm-4v-flash'
      }))
    } as unknown as ToolContext['labelReader'],
    preview: {
      searchCandidates: jest.fn(async () => [
        { url: 'https://www.iherb.com/pr/x/1', name: 'NOW Zinc', priceUsd: null, pricePerServingUsd: null }
      ]),
      readLabelText: jest.fn(async (url: string) => ({
        productUrl: url,
        matchedUrl: 'https://www.iherb.com/pr/x/1',
        labelText: 'Supplement facts\nServing Size: One Capsule\nIron (as Ferrous Bisglycinate) | 25 mg'
      })),
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
  it('五个工具都在，且都有描述与参数', () => {
    expect(SUPPLEMENT_TOOLS.map((tool) => tool.name).sort()).toEqual([
      'ask_user',
      'fetch_product',
      'lookup_feed_catalog',
      'read_label_image',
      'read_product_label',
      'search_products',
      'write_draft'
    ]);
    for (const tool of SUPPLEMENT_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters).toBeTruthy();
    }
  });

  it('知识库走 kb_* 三个只读动作，不再有一个"检索并总结"的 search_knowledge', () => {
    expect(SUPPLEMENT_TOOLS.map((tool) => tool.name)).not.toContain('search_knowledge');
    // 目录的描述必须写清"只用于填表"，它不再是选品门禁。
    const catalog = SUPPLEMENT_TOOLS.find((tool) => tool.name === 'lookup_feed_catalog');
    expect(catalog?.description).toContain('只用于填');
    expect(catalog?.description).toContain('不是选品依据');
  });
});

describe('执行工具', () => {
  it('kb_find / kb_read 直接转给知识库网关，原样返回原文', async () => {
    const ctx = context();
    const found = await executeSupplementTool('kb_find', { query: 'iron absorption' }, ctx);
    expect(found.ok).toBe(true);

    const read = await executeSupplementTool('kb_read', { documentId: 'nrc-NRC-2006', pageFrom: 339 }, ctx);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(JSON.stringify(read.data)).toContain('negligible bioavailability');
    }
    // 页图会把 base64 塞爆上下文：补剂 Agent 强制关掉，并把读页预算压小。
    const [, readArgs] = (ctx.knowledge.execute as jest.Mock).mock.calls.find(
      ([name]) => name === 'kb_read'
    );
    expect(readArgs).toEqual(expect.objectContaining({ includeImages: false }));
    expect(readArgs.budgetTokens).toBeLessThanOrEqual(6000);
  });

  it('知识库报错时如实返回，不崩', async () => {
    const ctx = context({
      knowledge: {
        execute: jest.fn(async () => ({
          ok: false as const,
          error: { code: 'KB_UNAVAILABLE', message: '知识库不可用' }
        }))
      } as unknown as ToolContext['knowledge']
    });
    const result = await executeSupplementTool('kb_find', { query: 'iron' }, ctx);
    expect(result).toEqual({ ok: false, error: '知识库不可用' });
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

  it('读营养标签：把标签正文带回来（页面抽取漏掉表的时候用）', async () => {
    const ctx = context();
    const result = await executeSupplementTool(
      'read_product_label',
      { url: 'https://www.iherb.com/pr/x/1' },
      ctx
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.data)).toContain('25 mg');
    }
  });

  it('标签读不到时给的是"读不到"的说明，不是编一个数', async () => {
    const ctx = context({
      preview: {
        ...context().preview,
        readLabelText: jest.fn(async () => ({
          productUrl: 'https://www.iherb.com/pr/x/1',
          matchedUrl: null,
          labelText: null
        }))
      } as unknown as ToolContext['preview']
    });
    const result = await executeSupplementTool(
      'read_product_label',
      { url: 'https://www.iherb.com/pr/x/1' },
      ctx
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.data)).toContain('读不到');
    }
  });

  it('读标签图：用草稿里的图片地址去 OCR，把原文带回来', async () => {
    const ctx = context({ draft: { name: '', evidence: { labelImageUrl: 'https://cos/x.jpg' } } });
    const result = await executeSupplementTool('read_label_image', {}, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.data)).toContain('25 mg');
    }
    expect(ctx.labelReader.read).toHaveBeenCalledWith('https://cos/x.jpg');
  });

  it('没上传标签图时说清楚该做什么，不是直接报错', async () => {
    const result = await executeSupplementTool('read_label_image', {}, context());
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringContaining('标签图片地址') })
    );
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
