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

describe('KnowledgeLibraryService（物种/分期/主题过滤）', () => {
  function filterRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'p1',
      documentId: 'd1',
      sectionId: 's1',
      text: 'Phosphorus target in chronic kidney disease.',
      pageStart: 10,
      document: { id: 'd1', title: 'd1', sourceId: 'IRIS-CKD-2026' },
      section: { id: 's1', title: 'Stage 2 Canine patients', pageNo: 10 },
      ...overrides,
    };
  }

  it('Stage 2 犬章节排在通用章节前面', async () => {
    const generic = filterRow({
      id: 'generic',
      sectionId: 's0',
      section: { id: 's0', title: '781 Chronic Kidney Disease', pageNo: 9 },
      text: 'Phosphorus restriction in chronic kidney disease.',
    });
    const stageDog = filterRow({
      id: 'stage-dog',
      sectionId: 's1',
      section: { id: 's1', title: 'Stage 2 Canine patients', pageNo: 10 },
      text: 'Phosphorus target for stage 2 dogs.',
    });
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany: jest.fn().mockResolvedValue([generic, stageDog]) },
    } as any);

    const result = await service.search('phosphorus', {
      species: 'dog',
      stage: 2,
      topics: ['phosphorus'],
      limit: 2,
    });

    expect(result[0].id).toBe('stage-dog');
  });

  it('按物种 + 分期 + 主题收窄到犬 Stage 2 磷段落', async () => {
    const rows = [
      filterRow(),
      filterRow({
        id: 'p2',
        sectionId: 's2',
        section: { id: 's2', title: 'Stage 2 Feline patients', pageNo: 11 },
      }),
      filterRow({
        id: 'p3',
        sectionId: 's3',
        section: { id: 's3', title: 'Stage 3 Canine patients', pageNo: 12 },
      }),
    ];
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany: jest.fn().mockResolvedValue(rows) },
    } as any);

    const result = await service.search('phosphorus', {
      species: 'dog',
      stage: 2,
      topics: ['phosphorus'],
      limit: 10,
    });

    expect(result.map((item) => item.id)).toEqual(['p1']);
  });
});

describe('KnowledgeLibraryService（章节目录路由）', () => {
  it('用目录元数据过滤并回传来源类型/权威性/主题', async () => {
    const documentId = 'iris-IRIS-DOG-Treatment-Recommendations-may-2026';
    const prisma = {
      sourceDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: documentId,
            sourceId: 'IRIS-CKD-2026',
            title: 'IRIS dog treatment',
            sections: [
              {
                id: 's2',
                title: 'Stage 2 Canine patients:',
                pageNo: 6,
                sortOrder: 2,
                paragraphs: [{ text: 'Dietary phosphate restriction for dogs with CKD.' }],
              },
            ],
          },
        ]),
      },
      sourceParagraph: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1',
            documentId,
            sectionId: 's2',
            text: 'Dietary phosphate restriction for dogs with CKD.',
            pageStart: 6,
            document: { id: documentId, title: 'IRIS dog treatment', sourceId: 'IRIS-CKD-2026' },
            section: { id: 's2', title: 'Stage 2 Canine patients:', pageNo: 6 },
          },
        ]),
      },
    };
    const service = new KnowledgeLibraryService(prisma as any);
    const result = await service.search('phosphorus', {
      documentIds: [documentId],
      species: 'dog',
      stage: 2,
      topics: ['phosphorus'],
      limit: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'p1',
      documentType: 'treatment_guideline',
      authority: 'guideline',
      sectionType: 'treatment',
      species: 'dog',
      stages: [2],
    });
    expect(result[0].topics).toContain('phosphorus');
    expect(result[0].sourceVersion).toBeTruthy();
  });
});
