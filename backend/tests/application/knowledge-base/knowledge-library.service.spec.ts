import { KnowledgeLibraryService } from '../../../src/application/knowledge-base/knowledge-library.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sacn5-chapters-SACN5-37-p00149-1',
    documentId: 'sacn5-chapters-SACN5-37',
    sectionId: 'sacn5-chapters-SACN5-37-s014',
    text:
      'Key nutritional factors for dogs and cats with chronic kidney disease. Phosphorus 0.2 to 0.5% in foods for dogs. Sodium ≤0.3% in foods for dogs.',
    pageStart: 17,
    pageEnd: 17,
    charCount: 180,
    document: {
      id: 'sacn5-chapters-SACN5-37',
      title: 'SACN5_37.pdf',
      sourceId: 'SACN5',
    },
    section: {
      id: 'sacn5-chapters-SACN5-37-s014',
      title: '787 Chronic Kidney Disease',
      pageNo: 17,
    },
    ...overrides,
  };
}

describe('KnowledgeLibraryService（原文检索）', () => {
  it('空查询不打库', async () => {
    const findMany = jest.fn();
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any);

    await expect(service.search('   ')).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('按来源过滤，返回原文 + 来源/章节/页码', async () => {
    const findMany = jest.fn().mockResolvedValue([row()]);
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any);

    const result = await service.search('CKD phosphorus dog 0.2 0.5', {
      sourceIds: ['SACN5'],
      limit: 3,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          document: { sourceId: { in: ['SACN5'] } },
        }),
        take: 1000,
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'sacn5-chapters-SACN5-37-p00149-1',
      sourceId: 'SACN5',
      sourceName: '小动物临床营养学（第5版）',
      sectionTitle: '787 Chronic Kidney Disease',
      pageStart: 17,
      truncated: false,
    });
  });

  it('问范围/数字时，表格型段落排在机制段前面', async () => {
    const table = row();
    const mechanism = row({
      id: 'sacn5-chapters-SACN5-37-p00108',
      text:
        'Secondary renal hyperparathyroidism may be present based on increased PTH concentrations even if serum phosphorus concentrations are within the reference range. This paragraph explains the mechanism in detail without giving a recommended range.',
      pageStart: 12,
    });
    const findMany = jest.fn().mockResolvedValue([mechanism, table]);
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any);

    const result = await service.search('phosphorus recommendation range dogs CKD', {
      sourceIds: ['SACN5'],
      limit: 2,
    });

    expect(result[0].id).toBe('sacn5-chapters-SACN5-37-p00149-1');
  });

  it('limit 上限 10，长文截断', async () => {
    const long = row({
      text: 'phosphorus '.repeat(200),
      charCount: 2000,
    });
    const findMany = jest.fn().mockResolvedValue([long]);
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any);

    const result = await service.search('phosphorus', { limit: 99 });
    expect(result).toHaveLength(1);
    expect(result[0].truncated).toBe(true);
    expect(result[0].text.endsWith('…')).toBe(true);
  });
});
