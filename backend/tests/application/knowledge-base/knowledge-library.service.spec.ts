import { KnowledgeLibraryService } from '../../../src/application/knowledge-base/knowledge-library.service';
import {
  expandQuery,
  extractQueryFocus,
  matchesNeedle,
  matchesNormalized,
  normalizeForMatch,
} from '../../../src/application/knowledge-base/query-expansion';
import {
  TOPIC_KEYS,
  normalizeTopic,
} from '../../../src/domain/knowledge/topic-aliases';
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

/**
 * 目录 + 段落 mock：验证依赖 `meta`（sectionType / documentType）的软排序。
 * documentIds 必须是 CKD 文档，目录才会被构建。
 */
function serviceWithCatalog(
  documents: Array<Record<string, unknown>>,
  rows: unknown[],
) {
  const findManyParagraphs = jest.fn().mockResolvedValue(rows);
  return {
    findManyParagraphs,
    service: new KnowledgeLibraryService({
      sourceDocument: { findMany: jest.fn().mockResolvedValue(documents) },
      sourceParagraph: { findMany: findManyParagraphs },
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

  it('显式 limit=999 被夹到 200（内部上限）', async () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      filterRow({
        id: `p${String(i).padStart(3, '0')}`,
        documentId: `doc-${i}`,
        sectionId: `s-${i}`,
        document: { id: `doc-${i}`, title: `doc-${i}`, sourceId: 'IRIS-CKD-2026' },
        section: { id: `s-${i}`, title: 'Stage 2 Canine patients', pageNo: 10 },
      }),
    );
    const { service } = serviceWith(rows);

    const result = await service.search('phosphorus', { limit: 999 });
    expect(result).toHaveLength(200);
    expect(result.length).toBeLessThanOrEqual(200);
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

  it('单字「水」不映射 water，也不误伤「血磷 水平」', () => {
    const expanded = expandQuery('犬 CKD 血磷 水平');
    expect(expanded).not.toContain('water');
    expect(expanded).toContain('phosphorus');
    const focus = extractQueryFocus('犬 CKD 血磷 水平');
    expect(focus.focusTerms).not.toContain('water');
    expect(focus.focusTerms).not.toContain('水平');
  });

  it('staging 归入背景词，不进 focusTerms', () => {
    const focus = extractQueryFocus('CKD dog staging creatinine SDMA');
    expect(focus.backgroundTerms).toContain('staging');
    expect(focus.focusTerms).not.toContain('staging');
    expect(focus.focusTerms).toContain('creatinine');
  });
});

describe('词边界匹配（matchesNeedle）', () => {
  it('protein 不命中 proteinuria，proteinuria 仍命中', () => {
    expect(matchesNeedle('2a. Substaging by Proteinuria', 'protein')).toBe(false);
    expect(matchesNeedle('Dietary protein 14 to 20 % DM', 'protein')).toBe(true);
    expect(matchesNeedle('2a. Substaging by Proteinuria', 'proteinuria')).toBe(true);
    expect(matchesNeedle('UPC >0.5 is proteinuric', 'proteinuria')).toBe(false);
  });

  it('中文没有词边界，继续用 includes', () => {
    expect(matchesNeedle('犬 CKD 蛋白尿', '蛋白')).toBe(true);
    expect(matchesNeedle('犬 CKD 血磷', '血磷')).toBe(true);
    expect(matchesNeedle('犬 CKD 血磷', '水平')).toBe(false);
  });

  it('分期短语与数字按词边界', () => {
    expect(matchesNeedle('Stage 3 Canine patients', 'stage 3')).toBe(true);
    expect(matchesNeedle('Stage 30 Canine patients', 'stage 3')).toBe(false);
    expect(matchesNeedle('phosphorus 0.2 to 0.5% DM', '0.2')).toBe(true);
    expect(matchesNeedle('phosphorus 0.25% DM', '0.2')).toBe(false);
  });

  it('连字符归一后再比（omega-3 / omega 3）', () => {
    expect(matchesNeedle('omega-3 fatty acids', 'omega 3')).toBe(true);
    expect(matchesNeedle('omega 3 fatty acids', 'omega-3')).toBe(true);
  });
});

describe('主题词表（topic-aliases）', () => {
  it('normalizeTopic 归一中文/别名，未知返回 null', () => {
    expect(normalizeTopic('磷')).toBe('phosphorus');
    expect(normalizeTopic('Phosph')).toBe('phosphorus');
    expect(normalizeTopic('UPC')).toBe('proteinuria');
    expect(normalizeTopic('血压')).toBe('bloodpressure');
    expect(normalizeTopic('blood pressure')).toBe('bloodpressure');
    expect(normalizeTopic('staging')).toBe('staging');
    expect(normalizeTopic('foo')).toBeNull();
    expect(normalizeTopic('')).toBeNull();
  });

  it('TOPIC_KEYS 是合并后的唯一真源（含单字术语主题）', () => {
    expect(TOPIC_KEYS).toEqual(
      expect.arrayContaining([
        'phosphorus',
        'chloride',
        'magnesium',
        'iodine',
        'calcium',
        'proteinuria',
        'bloodpressure',
      ]),
    );
    expect(new Set(TOPIC_KEYS).size).toBe(TOPIC_KEYS.length);
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

  it('负样本：未知营养素（biotin / manganese / chromium）0 命中返回空', async () => {
    const { service } = serviceWith([
      filterRow({ text: 'Minimum protein requirements for CKD.' }),
    ]);
    for (const query of [
      'CKD dog biotin requirement',
      'CKD dog manganese requirement',
      'CKD dog chromium requirement',
    ]) {
      await expect(service.search(query)).resolves.toEqual([]);
    }
  });

  it('门禁：protein 不因 proteinuria 命中（词边界）', async () => {
    const rows = [
      filterRow({
        id: 'protein',
        sectionId: 'p',
        section: { id: 'p', title: '783 Chronic Kidney Disease', pageNo: 19 },
        text: 'Dietary protein 14 to 20 % DM for dogs with CKD.',
      }),
      filterRow({
        id: 'proteinuria',
        sectionId: 'u',
        section: { id: 'u', title: '2a. Substaging by Proteinuria', pageNo: 4 },
        text: 'UPC 0.5 indicates proteinuria in dogs.',
      }),
    ];
    const { service } = serviceWith(rows);

    const result = await service.search('CKD dog protein 14 20 % DM', { limit: 10 });
    expect(result.map((item) => item.id)).toEqual(['protein']);
  });

  it('门禁：proteinuria 查询仍能命中蛋白尿节（反向）', async () => {
    const rows = [
      filterRow({
        id: 'protein',
        sectionId: 'p',
        section: { id: 'p', title: '783 Chronic Kidney Disease', pageNo: 19 },
        text: 'Dietary protein 14 to 20 % DM for dogs with CKD.',
      }),
      filterRow({
        id: 'proteinuria',
        sectionId: 'u',
        section: { id: 'u', title: '2a. Substaging by Proteinuria', pageNo: 4 },
        text: 'UPC 0.5 indicates proteinuria in dogs.',
      }),
    ];
    const { service } = serviceWith(rows);

    const result = await service.search('CKD dog proteinuria', { limit: 10 });
    expect(result.map((item) => item.id)).toEqual(['proteinuria']);
  });

  it('背景词不得压过焦点词（BACKGROUND_TERM_WEIGHT 已登记）', async () => {
    const rows = [
      filterRow({
        id: 'background-heavy',
        sectionId: 'bg',
        section: { id: 'bg', title: '781 Chronic Kidney Disease', pageNo: 17 },
        text: 'CKD chronic kidney disease dogs canine phosphorus.',
      }),
      filterRow({
        id: 'focus-dense',
        sectionId: 'fd',
        section: { id: 'fd', title: '783 Chronic Kidney Disease', pageNo: 19 },
        text: 'Phosphorus phosphorus phosphorus phosphate phosphate phosphate.',
      }),
    ];
    const { service } = serviceWith(rows);

    const result = await service.search('CKD dog phosphorus', { limit: 5 });
    // 背景词（CKD/犬/慢性肾病）只按 0.25 权重打分：堆背景词不能盖过重复讲磷的段落。
    expect(result.map((item) => item.id)).toEqual([
      'focus-dense',
      'background-heavy',
    ]);
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

  it('通用 nutrition-section 加成：问范围/推荐时，首段是营养因素的节排前面（不加不减节）', async () => {
    const docId = 'sacn5-chapters-SACN5-37';
    const rows = [
      ...Array.from({ length: 2 }, (_, i) =>
        filterRow({
          id: `prose-${i}`,
          documentId: docId,
          sectionId: 'prose',
          text: 'Phosphorus phosphorus dietary phosphorus chronic kidney disease dogs range.',
          section: { id: 'prose', title: '781 Chronic Kidney Disease', pageNo: 17 },
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        filterRow({
          id: `nutri-${i}`,
          documentId: docId,
          sectionId: 'nutri',
          text: 'Phosphorus dietary phosphorus chronic kidney disease dogs range.',
          section: { id: 'nutri', title: '787 Chronic Kidney Disease', pageNo: 17 },
        }),
      ),
    ];
    const findMany = jest.fn(async (args: any) => {
      const where = args?.where ?? {};
      // 第 1 次：捞含短语的段 → 候选节；第 2 次：捞这些节的段，按 id 升序取首段。
      if (where.sectionId?.in && where.OR) return [{ sectionId: 'nutri' }];
      if (where.sectionId?.in) {
        return [
          {
            id: 'p0',
            sectionId: 'nutri',
            text: 'Key nutritional factors for dogs and cats with chronic kidney disease.',
          },
        ];
      }
      return rows;
    });
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any);

    // nutri 的段内命中次数比 prose 少（原始分更低），靠营养节加成排到前面。
    const sections = await service.searchSections(
      'CKD dog dietary phosphorus range',
      { limit: 5 },
    );

    expect(sections.map((section) => section.sectionId)).toEqual([
      'nutri',
      'prose',
    ]);
    // 只影响排序：两节都还在，没有被排除。
    expect(sections).toHaveLength(2);
  });

  it('nutrition-section 加成只在「膳食/范围/推荐」类查询上触发', async () => {
    const docId = 'sacn5-chapters-SACN5-37';
    const rows = [
      filterRow({
        id: 'p1',
        documentId: docId,
        sectionId: 's1',
        section: { id: 's1', title: '781 Chronic Kidney Disease', pageNo: 17 },
      }),
    ];
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any);

    await service.searchSections('phosphorus', { limit: 5 });

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('nutrition-section 加成认表格 caption：首段不是营养因素、但命中的段里有营养因素表题', async () => {
    const docId = 'sacn5-chapters-SACN5-37';
    const rows = [
      ...Array.from({ length: 2 }, (_, i) =>
        filterRow({
          id: `prose-${i}`,
          documentId: docId,
          sectionId: 'prose',
          text: 'Phosphorus phosphorus dietary phosphorus chronic kidney disease dogs range.',
          section: { id: 'prose', title: '781 Chronic Kidney Disease', pageNo: 17 },
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        filterRow({
          id: `caption-${i}`,
          documentId: docId,
          sectionId: 'caption',
          text: 'Phosphorus dietary phosphorus chronic kidney disease dogs range. Table 37-9. Key nutritional factors for dogs and cats.',
          section: { id: 'caption', title: '787 Chronic Kidney Disease', pageNo: 17 },
        }),
      ),
    ];
    const findMany = jest.fn(async (args: any) => {
      const where = args?.where ?? {};
      // 首段信号：这一节首段是正文，不含短语 → 只靠 caption 信号。
      if (where.sectionId?.in && where.OR) return [];
      if (where.sectionId?.in) return [];
      return rows;
    });
    const service = new KnowledgeLibraryService({
      sourceParagraph: { findMany },
    } as any);

    const sections = await service.searchSections(
      'CKD dog dietary phosphorus range',
      { limit: 5 },
    );

    expect(sections.map((section) => section.sectionId)).toEqual([
      'caption',
      'prose',
    ]);
  });

  it('staging 意图：staging 节 ×1.25 排在通用节前（只加分，不排除）', async () => {
    const docId = 'sacn5-chapters-SACN5-37';
    const text = 'Staging creatinine SDMA reference range for dogs.';
    const documents = [
      {
        id: docId,
        sourceId: 'SACN5',
        title: 'SACN5_37.pdf',
        sections: [
          {
            id: 'staging-section',
            title: 'Staging of Chronic Kidney Disease',
            pageNo: 1,
            sortOrder: 1,
            paragraphs: [{ text }],
          },
          {
            id: 'generic-section',
            title: 'Introduction',
            pageNo: 2,
            sortOrder: 2,
            paragraphs: [{ text }],
          },
        ],
      },
    ];
    const rows = ['staging-section', 'generic-section'].map((sectionId) =>
      filterRow({
        id: `p-${sectionId}`,
        documentId: docId,
        sectionId,
        document: { id: docId, title: 'SACN5_37.pdf', sourceId: 'SACN5' },
        section: {
          id: sectionId,
          title:
            sectionId === 'staging-section'
              ? 'Staging of Chronic Kidney Disease'
              : 'Introduction',
          pageNo: 1,
        },
        text,
      }),
    );
    const { service } = serviceWithCatalog(documents, rows);

    const result = await service.search('CKD dog staging creatinine SDMA', {
      documentIds: [docId],
      limit: 5,
    });

    expect(result.map((item) => item.id)[0]).toBe('p-staging-section');
    // 其他节只降权/不排除
    expect(result.map((item) => item.id)).toContain('p-generic-section');
    // 段分相同，只差 staging ×1.25
    expect(result[0].score).toBeCloseTo(result[1].score * 1.25, 1);
  });

  it('组级「标题点名查询主题」加成：同名段落按节标题排序', async () => {
    const text = 'UPC 0.5 borderline proteinuria in dogs.';
    const rows = [
      filterRow({
        id: 'a',
        sectionId: 'a',
        section: { id: 'a', title: '2a. Substaging by Proteinuria', pageNo: 4 },
        text,
      }),
      filterRow({
        id: 'b',
        sectionId: 'b',
        section: { id: 'b', title: '771 Chronic Kidney Disease', pageNo: 9 },
        text,
      }),
    ];
    const { service } = serviceWith(rows);

    const sections = await service.searchSections('CKD dog UPC proteinuria substaging', {
      limit: 5,
    });

    expect(sections.map((section) => section.sectionId)).toEqual(['a', 'b']);
    // 段内标题命中 ×1.3，组级“标题点名主题”再 ×2 → 合计约 ×2.6
    expect(sections[0].score / sections[1].score).toBeCloseTo(2.6, 0);
  });

  it('分组：6 组候选只取前 5 节', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => {
      const sectionId = `s${i + 1}`;
      const documentId = `doc-${i + 1}`;
      return filterRow({
        id: `p${i + 1}`,
        documentId,
        sectionId,
        document: { id: documentId, title: documentId, sourceId: 'IRIS-CKD-2026' },
        section: { id: sectionId, title: '781 Chronic Kidney Disease', pageNo: 10 + i },
      });
    });
    const { service } = serviceWith(rows);

    const sections = await service.searchSections('phosphorus', { limit: 5 });

    expect(sections).toHaveLength(5);
    expect(new Set(sections.map((section) => section.documentId)).size).toBe(5);
    expect(sections.map((section) => section.sectionId)).toEqual([
      's1',
      's2',
      's3',
      's4',
      's5',
    ]);
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

describe('ensureCatalogs（全库目录懒加载）', () => {
  function withCatalog() {
    const prisma = {
      sourceDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new KnowledgeLibraryService(prisma as any);
    const build = jest.spyOn((service as any).catalog, 'build');
    return { service, build };
  }

  it('同一文档第二次不重建', async () => {
    const { service, build } = withCatalog();
    await service.ensureCatalogs(['d1']);
    await service.ensureCatalogs(['d1']);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('非 CKD 文档也能建目录', async () => {
    const { service, build } = withCatalog();
    await service.ensureCatalogs([
      'aaha-AAHA-2010-Nutritional-Assessment-Guidelines',
    ]);
    expect(build).toHaveBeenCalledWith([
      'aaha-AAHA-2010-Nutritional-Assessment-Guidelines',
    ]);
  });

  it('没有 sourceDocument 的测试桩直接跳过', async () => {
    const service = new KnowledgeLibraryService({} as any);
    await expect(service.ensureCatalogs(['d1'])).resolves.toBeUndefined();
  });
});


describe('matchesNormalized（热路径）', () => {
  it('已归一化的 haystack 与 matchesNeedle 结果一致', () => {
    const hay = normalizeForMatch('Stage 3 Canine patients: phosphorus 0.2-0.5%');
    for (const needle of ['phosphorus', 'kidney', 'stage 3', '0.2']) {
      expect(matchesNormalized(hay, needle)).toBe(matchesNeedle(hay, needle));
    }
  });
});
