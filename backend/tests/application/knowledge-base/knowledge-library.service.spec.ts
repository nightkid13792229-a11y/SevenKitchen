import { KnowledgeLibraryService } from '../../../src/application/knowledge-base/knowledge-library.service';
import {
  expandQuery,
  extractQueryFocus,
} from '../../../src/application/knowledge-base/query-expansion';
import {
  deriveDisplayTitle,
  detectStageHints,
  extractSubheading,
} from '../../../src/application/knowledge-base/section-display';

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

/**
 * 段落候选 fixture（模块级）：新增用例都复用同一份，避免各 describe 里重复定义。
 */
function filterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    documentId: 'd1',
    sectionId: 's1',
    text: 'Phosphorus target in chronic kidney disease.',
    pageStart: 10,
    pageEnd: 10,
    charCount: 45,
    document: { id: 'd1', title: 'd1', sourceId: 'IRIS-CKD-2026' },
    section: { id: 's1', title: 'Stage 2 Canine patients', pageNo: 10 },
    ...overrides,
  };
}

function serviceWith(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return {
    findMany,
    service: new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any),
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
        take: 20000,
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

  it('宽召回同时匹配正文与节标题', async () => {
    const { findMany, service } = serviceWith([row()]);
    await service.search('phosphorus');

    const call = findMany.mock.calls[0][0];
    // 正文与节标题都要进 OR，避免“标题写 blood pressure、正文只写 BP”漏召回
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { text: { contains: expect.any(String), mode: 'insensitive' } },
        { section: { title: { contains: expect.any(String), mode: 'insensitive' } } },
      ]),
    );
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

  it('内部 limit 上限 200，长文截断', async () => {
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

describe('查询扩展与焦点（query-expansion）', () => {
  it('中文单字术语也能展开', () => {
    expect(expandQuery('犬 CKD 钠 上限')).toEqual(expect.arrayContaining(['sodium']));
    expect(expandQuery('犬 CKD 3期 血磷 目标')).toEqual(
      expect.arrayContaining(['phosphorus', 'stage 3']),
    );
  });

  it('中文单字术语逐个覆盖：磷/钠/钾/氯/镁/碘/钙', () => {
    const cases: Array<[string, string]> = [
      ['磷', 'phosphorus'],
      ['钠', 'sodium'],
      ['钾', 'potassium'],
      ['氯', 'chloride'],
      ['镁', 'magnesium'],
      ['碘', 'iodine'],
      ['钙', 'calcium'],
    ];
    for (const [zh, en] of cases) {
      expect(expandQuery(`犬 CKD ${zh} 上限`)).toEqual(expect.arrayContaining([en]));
    }
  });

  it('中文词条按长词优先展开', () => {
    // 蛋白尿不能被当作“蛋白 + 尿”拆开
    expect(expandQuery('犬 CKD 蛋白尿 UPC')).toEqual(
      expect.arrayContaining(['proteinuria', 'upc']),
    );
    expect(expandQuery('犬 CKD 鱼油')).toEqual(
      expect.arrayContaining(['omega-3', 'fish oil']),
    );
    expect(expandQuery('犬 CKD 高血压')).toEqual(
      expect.arrayContaining(['hypertension', 'blood pressure']),
    );
  });

  it('英文同义词互相扩展', () => {
    expect(expandQuery('phosphate')).toEqual(expect.arrayContaining(['phosphorus']));
    expect(expandQuery('phosphorus')).toEqual(expect.arrayContaining(['phosphate']));
    expect(expandQuery('UPC')).toEqual(expect.arrayContaining(['proteinuria']));
    expect(expandQuery('BP')).toEqual(expect.arrayContaining(['blood pressure']));
    expect(expandQuery('CKD')).toEqual(
      expect.arrayContaining(['chronic kidney disease']),
    );
    expect(expandQuery('omega-3')).toEqual(expect.arrayContaining(['omega 3']));
    expect(expandQuery('omega 3')).toEqual(expect.arrayContaining(['omega-3']));
  });

  it('焦点 = 内容词减背景词；未知营养素不会回退', () => {
    const neg = extractQueryFocus('CKD dog biotin requirement');
    expect(neg.focusTerms).toContain('biotin');
    expect(neg.focusTerms).not.toContain('ckd');
    expect(neg.focusTerms).not.toContain('dog');
    expect(extractQueryFocus('CKD dog vitamin K target').topicPhrases).toContain(
      'vitamin k',
    );
    expect(
      extractQueryFocus('CKD dog stage 3 phosphate target').stagePhrases,
    ).toContain('stage 3');
  });

  it('topicPhrases 只在 query 里出现时返回，blood pressure 不当短语门禁', () => {
    expect(extractQueryFocus('CKD dog phosphorus target').topicPhrases).toEqual([]);
    expect(extractQueryFocus('CKD dog blood pressure substaging').topicPhrases).toEqual(
      [],
    );
    expect(extractQueryFocus('CKD dog fish oil').topicPhrases).toContain('fish oil');
    expect(extractQueryFocus('CKD dog omega 3').topicPhrases).toContain('omega 3');
    expect(extractQueryFocus('CKD dog 维生素 D').topicPhrases).toContain('vitamin d');
  });

  it('stagePhrases 覆盖英文与中文分期，且不进 focusTerms', () => {
    expect(extractQueryFocus('stage 4 canine patients').stagePhrases).toContain(
      'stage 4',
    );
    expect(extractQueryFocus('犬 CKD 2期').stagePhrases).toContain('stage 2');
    const focus = extractQueryFocus('CKD dog stage 3 phosphate target');
    expect(focus.focusTerms).toContain('phosphate');
    expect(focus.focusTerms).not.toContain('stage 3');
  });
});

describe('显示标题与子标题（section-display）', () => {
  it('页眉标题降级，书内页从标题取', () => {
    const display = deriveDisplayTitle({
      title: '787 Chronic Kidney Disease',
      sourceName: '小动物临床营养学（第5版）',
      pageNo: 17,
    });
    expect(display).toContain('p787');
    expect(display).toContain('第37章');
    expect(display).toContain('小动物临床营养学（第5版）');
  });

  it('病例标题 → 病例号 + 书内页', () => {
    expect(
      deriveDisplayTitle({
        title: 'CASE 37-1 801 Chronic Kidney Disease',
        sourceName: '小动物临床营养学（第5版）',
        pageNo: 37,
      }),
    ).toBe('病例 37-1 · p801');
  });

  it('文档开头 → 卷首，其他标题原样', () => {
    expect(
      deriveDisplayTitle({ title: '(文档开头)', sourceName: 'SACN5', pageNo: 1 }),
    ).toContain('卷首');
    expect(
      deriveDisplayTitle({
        title: '2a. Substaging by Proteinuria',
        sourceName: 'IRIS',
        pageNo: 4,
      }),
    ).toBe('2a. Substaging by Proteinuria');
  });

  it('子标题取命中段的第一行结构行', () => {
    expect(
      extractSubheading(
        'Stage 3 Canine patients: The range of presentations for dogs in Stage 3 is wide.',
      ),
    ).toContain('Stage 3 Canine patients');
    expect(extractSubheading('plain prose without a structural heading')).toBeNull();
  });

  it('分期提示从正文识别 Stage 1–4 与中文 3 期', () => {
    expect(detectStageHints('A more realistic post-treatment target for dogs at Stage 3 is <1.6 mmol/l.')).toEqual([3]);
    expect(detectStageHints('犬 CKD 3期 血磷')).toEqual([3]);
    expect(detectStageHints('no staging hint here')).toEqual([]);
  });
});

describe('KnowledgeLibraryService（门禁/排序/分组）', () => {
  it('分期短语通过门禁，但不排除其他分期', async () => {
    const rows = [
      filterRow({
        id: 's005-3',
        sectionId: 's005',
        section: {
          id: 's005',
          title: 'Additional recommendations for Stage 2 patients aimed at improving quality of life:',
          pageNo: 10,
        },
        text: 'Stage 3 Canine patients: target <1.6 mmol/l.',
      }),
      filterRow({
        id: 's017-p',
        documentId: 'sacn5-chapters-SACN5-37',
        sectionId: 's017',
        document: {
          id: 'sacn5-chapters-SACN5-37',
          title: 'SACN5_37.pdf',
          sourceId: 'SACN5',
        },
        section: { id: 's017', title: '787 Chronic Kidney Disease', pageNo: 23 },
        text: 'Dietary phosphorus 0.2 to 0.5% in foods for dogs.',
      }),
    ];
    const { service } = serviceWith(rows);
    const result = await service.search('stage 3 canine patients phosphate target', {
      stage: 3,
      limit: 10,
    });

    // s005 那 6 段不含 phosphate/phosphorus，靠 stage 3 通过门禁；
    // SACN5 那段靠 phosphorus 通过门禁 —— 两者都不被分期排除。
    expect(result.map((item) => item.id)).toEqual(
      expect.arrayContaining(['s005-3', 's017-p']),
    );
  });

  it('负样本：topic 短语必须命中，vitamin D 不算 vitamin K', async () => {
    const { service } = serviceWith([
      filterRow({ id: 'vd', text: 'Vitamin D supplementation in CKD.' }),
    ]);
    await expect(service.search('CKD dog vitamin K target')).resolves.toEqual([]);
  });

  it('正样本：vitamin D 短语能命中', async () => {
    const { service } = serviceWith([
      filterRow({ id: 'vd', text: 'Vitamin D supplementation in CKD.' }),
    ]);
    await expect(service.search('CKD dog vitamin D target')).resolves.toHaveLength(1);
  });

  it('负样本：未知营养素 0 命中返回空', async () => {
    const { service } = serviceWith([
      filterRow({ text: 'Minimum protein requirements for CKD.' }),
    ]);
    await expect(service.search('CKD dog biotin requirement')).resolves.toEqual([]);
  });

  it('不再按 1000 段截断候选', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new KnowledgeLibraryService({ sourceParagraph: { findMany } } as any);
    await service.search('phosphorus');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20000 }));
  });

  it('不硬过滤：不排除其他期，Stage 2 排前', async () => {
    const rows = [
      filterRow({
        id: 'p1',
        sectionId: 's1',
        section: { id: 's1', title: 'Stage 2 Canine patients', pageNo: 10 },
        text: 'Phosphorus target for dogs in Stage 2 CKD.',
      }),
      filterRow({
        id: 'p2',
        sectionId: 's2',
        section: { id: 's2', title: 'Stage 2 Feline patients', pageNo: 11 },
        text: 'Phosphorus target for cats in Stage 2 CKD.',
      }),
      filterRow({
        id: 'p3',
        sectionId: 's3',
        section: { id: 's3', title: 'Stage 3 Canine patients', pageNo: 12 },
        text: 'Phosphorus target for dogs in Stage 3 CKD.',
      }),
    ];
    const { service } = serviceWith(rows);

    const result = await service.search('phosphorus', {
      species: 'dog',
      stage: 2,
      topics: ['phosphorus'],
      limit: 10,
    });

    expect(result[0].id).toBe('p1');
    // 其他分期只降权、不排除
    expect(result.map((item) => item.id)).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']));
  });

  it('按节分组：≤5 节、每节 ≤2 段、同一文档 ≤2 节', async () => {
    const docId = 'sacn5-chapters-SACN5-37';
    const rows = [
      ...Array.from({ length: 3 }, (_, i) =>
        filterRow({
          id: `s1-${i}`,
          documentId: docId,
          sectionId: 's1',
          section: { id: 's1', title: '781 Chronic Kidney Disease', pageNo: 17 },
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        filterRow({
          id: `s2-${i}`,
          documentId: docId,
          sectionId: 's2',
          section: { id: 's2', title: '783 Chronic Kidney Disease', pageNo: 19 },
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        filterRow({
          id: `s3-${i}`,
          documentId: docId,
          sectionId: 's3',
          section: { id: 's3', title: '785 Chronic Kidney Disease', pageNo: 21 },
        }),
      ),
      filterRow({
        id: 'i1',
        documentId: 'iris-doc',
        sectionId: 'i1',
        document: { id: 'iris-doc', title: 'iris', sourceId: 'IRIS-CKD-2026' },
        section: { id: 'i1', title: '2a. Substaging by Proteinuria', pageNo: 4 },
      }),
    ];
    const { service } = serviceWith(rows);

    const sections = await service.searchSections('phosphorus', { limit: 5 });

    expect(sections.length).toBeLessThanOrEqual(5);
    for (const section of sections) {
      expect(section.passages.length).toBeLessThanOrEqual(2);
    }
    expect(sections.filter((section) => section.documentId === docId)).toHaveLength(2);
  });

  it('SectionHit 带 displayTitle/subheading', async () => {
    const rows = [
      filterRow({
        id: 'p1',
        documentId: 'sacn5-chapters-SACN5-37',
        sectionId: 's1',
        document: {
          id: 'sacn5-chapters-SACN5-37',
          title: 'SACN5_37.pdf',
          sourceId: 'SACN5',
        },
        section: { id: 's1', title: '787 Chronic Kidney Disease', pageNo: 23 },
        text: 'Stage 3 Canine patients: target <1.6 mmol/l phosphorus.',
      }),
    ];
    const { service } = serviceWith(rows);

    const sections = await service.searchSections('phosphorus');
    expect(sections).toHaveLength(1);
    expect(sections[0].displayTitle).toContain('p787');
    expect(sections[0].subheading).toContain('Stage 3 Canine patients');
    expect(sections[0].sectionTitle).toBe('787 Chronic Kidney Disease');
    expect(sections[0].passages[0].id).toBe('p1');
  });
});

describe('KnowledgeLibraryService（章节目录元数据）', () => {
  it('回传来源类型/权威性/主题，但不做硬过滤', async () => {
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
            pageEnd: 6,
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
