import {
  HIT_DEPTH,
  LIBRARY_THRESHOLDS,
  buildGateChecks,
  exitCodeFor,
  judgeQuestion,
  tableQuestionTargets,
  type LibraryGateSummary,
  type QuestionResult,
  type QuestionSpec,
} from '../../../src/application/knowledge-base/library-eval';

/**
 * 26 题判分（spec v1.1 附录 A）。
 *
 * 用例用真实节 ID（Q10/Q21 的形状），保证判分口径和评估脚本一致：
 * 前 3 节命中、禁止节、负样本、表格题。
 */

const STAGE3 = 'iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005';
const STAGE2 = 'iris-IRIS-DOG-Treatment-Recommendations-may-2026-s004';
const STAGE4 = 'iris-IRIS-DOG-Treatment-Recommendations-may-2026-s006';
const PHOSPHORUS = 'sacn5-chapters-SACN5-37-s014';
const UPC = 'iris-IRIS-staging-guidelines-2026-s004';

function result(
  sectionIds: string[],
  overrides: Partial<QuestionResult> = {},
): QuestionResult {
  return {
    status: sectionIds.length > 0 ? 'ok' : 'no_match',
    sections: sectionIds.map((sectionId) => ({ sectionId })),
    tables: [],
    ...overrides,
  };
}

describe('judgeQuestion（26 题判分）', () => {
  it('前 3 节命中即通过', () => {
    expect(
      judgeQuestion(result([STAGE3]), {
        id: 'stage3',
        query: 'stage 3 canine patients phosphate target',
        expectedSections: [STAGE3],
        category: 'staging',
        stage: 3,
      }).passed,
    ).toBe(true);
  });

  it('期望节排在第 3 位仍通过，第 4 位就不通过', () => {
    const spec: QuestionSpec = {
      id: 'synonym',
      query: 'CKD dog dietary phosphate target',
      expectedSections: [PHOSPHORUS],
      category: 'adversarial',
    };
    const fillers = [UPC, STAGE2];
    expect(
      judgeQuestion(result([...fillers, PHOSPHORUS]), spec).passed,
    ).toBe(true);
    expect(
      judgeQuestion(result([...fillers, PHOSPHORUS, UPC]), spec).passed,
    ).toBe(true);
    expect(
      judgeQuestion(result([...fillers, STAGE4, PHOSPHORUS]), spec).passed,
    ).toBe(false);
    // 前 3 节是 3 个非期望节：第 4 位的期望节不算命中
    expect(
      judgeQuestion(result([UPC, STAGE2, STAGE4, PHOSPHORUS]), spec).passed,
    ).toBe(false);
    expect(HIT_DEPTH).toBe(3);
  });

  it('出现禁止节即不通过', () => {
    expect(
      judgeQuestion(result([STAGE4]), {
        id: 'stage2',
        query: 'CKD dog stage 2 serum phosphate target',
        expectedSections: [STAGE2],
        forbiddenSections: [STAGE4],
        category: 'adversarial',
        stage: 2,
      }).passed,
    ).toBe(false);
  });

  it('禁止节只在前 3 节生效：排到第 4 位不拦', () => {
    const spec: QuestionSpec = {
      id: 'stage2-vs4',
      query: 'CKD dog stage 2 serum phosphate target',
      expectedSections: [STAGE2],
      forbiddenSections: [STAGE4],
      category: 'adversarial',
      stage: 2,
    };
    const verdict = judgeQuestion(result([STAGE2, UPC, STAGE3, STAGE4]), spec);
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toContain('命中');
  });

  it('负样本需要 no_match', () => {
    expect(
      judgeQuestion(result([PHOSPHORUS]), {
        id: 'neg',
        query: 'CKD dog biotin requirement',
        expectNoSource: true,
        category: 'negative',
      }).passed,
    ).toBe(false);
  });

  it('负样本：0 节但有表 → 不通过（表也是证据）', () => {
    const verdict = judgeQuestion(
      { status: 'ok', sections: [], tables: [{ tableId: 'T0497' }] },
      {
        id: 'no-biotin',
        query: 'CKD dog biotin requirement',
        expectNoSource: true,
        category: 'negative',
      },
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain('0 节 1 表');
  });

  it('负样本返回 no_match 且 0 节 → 通过', () => {
    const verdict = judgeQuestion(
      { status: 'no_match', sections: [], tables: [] },
      {
        id: 'no-biotin',
        query: 'CKD dog biotin requirement',
        expectNoSource: true,
        category: 'negative',
      },
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.reason).toContain('0 节');
  });

  it('表格题需要表格命中，且命中的表能打开', () => {
    expect(
      judgeQuestion(
        {
          status: 'ok',
          sections: [],
          tables: [{ tableId: 'T0497', citationId: 'K3' }],
          openedTables: [{ tableId: 'T0497', ok: true, citationId: 'K3' }],
        },
        {
          id: 't',
          query: 'CKD dog key nutritional factors phosphorus protein',
          expectedTables: ['T0497'],
          category: 'table',
        },
      ).passed,
    ).toBe(true);
  });

  it('表格题：命中但 open 失败 → 不通过（只命中不算）', () => {
    const verdict = judgeQuestion(
      {
        status: 'ok',
        sections: [],
        tables: [{ tableId: 'T0497', citationId: 'K3' }],
        openedTables: [{ tableId: 'T0497', ok: false, citationId: 'K3' }],
      },
      {
        id: 'table-37-9',
        query: 'CKD dog key nutritional factors phosphorus protein',
        expectedTables: ['T0497'],
        category: 'table',
      },
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain('打不开');
  });

  it('表格题：命中但没有 open 记录 → 不通过（不能默认可打开）', () => {
    expect(
      judgeQuestion(
        { status: 'ok', sections: [], tables: [{ tableId: 'T0497' }] },
        {
          id: 'table-37-9',
          query: 'CKD dog key nutritional factors phosphorus protein',
          expectedTables: ['T0497'],
          category: 'table',
        },
      ).passed,
    ).toBe(false);
  });

  it('表格题：open 成功的是非期望表 → 不通过（只认命中的表）', () => {
    expect(
      judgeQuestion(
        {
          status: 'ok',
          sections: [],
          tables: [{ tableId: 'T0025', citationId: 'K1' }],
          openedTables: [{ tableId: 'T0025', ok: true, citationId: 'K1' }],
        },
        {
          id: 'table-37-9',
          query: 'CKD dog key nutritional factors phosphorus protein',
          expectedTables: ['T0497', 'T0260', 'T0261'],
          category: 'table',
        },
      ).passed,
    ).toBe(false);
  });

  it('表格题：期望表里任一张命中且可打开即可（37-9 / 37-11 / 37-12）', () => {
    const spec: QuestionSpec = {
      id: 'table-37-9',
      query: 'CKD dog key nutritional factors phosphorus protein',
      expectedTables: ['T0497', 'T0260', 'T0261'],
      category: 'table',
    };
    expect(
      judgeQuestion(
        {
          status: 'ok',
          sections: [],
          tables: [{ tableId: 'T0260', citationId: 'K9' }],
          openedTables: [{ tableId: 'T0260', ok: true, citationId: 'K9' }],
        },
        spec,
      ).passed,
    ).toBe(true);
    // 命中了 T0260，但真正打开的是 T0253（非期望表）：不算
    expect(
      judgeQuestion(
        {
          status: 'ok',
          sections: [],
          tables: [{ tableId: 'T0260', citationId: 'K9' }],
          openedTables: [{ tableId: 'T0253', ok: true, citationId: 'K1' }],
        },
        spec,
      ).passed,
    ).toBe(false);
  });

  it('表格题不因为命中节就算过', () => {
    expect(
      judgeQuestion(result([PHOSPHORUS], { tables: [] }), {
        id: 'table-37-1',
        query: 'IRIS staging creatinine SDMA table',
        expectedTables: ['T0253'],
        category: 'table',
      }).passed,
    ).toBe(false);
  });

  it('题目没写期望时报不通过（防止空壳题混进评估）', () => {
    const verdict = judgeQuestion(result([UPC]), {
      id: 'broken',
      query: 'CKD dog something',
      category: 'numeric',
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain('没有期望');
  });

  it('不通过的解释里带实际命中的节（报告可直接读）', () => {
    const verdict = judgeQuestion(result([UPC]), {
      id: 'zh-protein',
      query: '犬 CKD 蛋白 推荐范围',
      expectedSections: [PHOSPHORUS],
      category: 'zh',
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain(UPC);
  });
});

describe('tableQuestionTargets（表格题只打开检索命中的表）', () => {
  const spec: QuestionSpec = {
    id: 'table-37-9',
    query: 'CKD dog key nutritional factors phosphorus protein',
    expectedTables: ['T0497', 'T0260', 'T0261'],
    category: 'table',
  };

  it('只取命中且带 citationId 的表（K 号原样带出）', () => {
    const targets = tableQuestionTargets(spec, [
      { tableId: 'T0253', citationId: 'K2' },
      { tableId: 'T0260', citationId: 'K9' },
      { tableId: 'T0261', citationId: 'K10' },
    ]);
    expect(targets).toEqual([
      { tableId: 'T0260', citationId: 'K9' },
      { tableId: 'T0261', citationId: 'K10' },
    ]);
  });

  it('没有命中时返回空（不用 expectedTables 兜底）', () => {
    expect(tableQuestionTargets(spec, [{ tableId: 'T0253' }])).toEqual([]);
    expect(tableQuestionTargets(spec, [])).toEqual([]);
  });

  it('同一张表重复返回只打开一次', () => {
    const targets = tableQuestionTargets(spec, [
      { tableId: 'T0497', citationId: 'K1' },
      { tableId: 'T0497', citationId: 'K1' },
    ]);
    expect(targets).toEqual([{ tableId: 'T0497', citationId: 'K1' }]);
  });
});

describe('buildGateChecks / exitCodeFor（阶段出口）', () => {
  function summary(
    overrides: Partial<LibraryGateSummary> = {},
  ): LibraryGateSummary {
    return {
      overall: 26,
      total: 26,
      stage3: { passed: 1, total: 1 },
      table: { passed: 2, total: 2 },
      zh: { passed: 6, total: 6 },
      negative: { passed: 4, total: 4 },
      adversarial: { passed: 4, total: 4 },
      coreTables: { passed: 6, total: 6 },
      timing: { p50: 60, p95: 82, max: 190 },
      ...overrides,
    };
  }

  it('全绿时 9 条指标全过、exit 0', () => {
    const checks = buildGateChecks(summary());
    expect(checks).toHaveLength(9);
    expect(checks.every((check) => check.passed)).toBe(true);
    expect(exitCodeFor(checks)).toBe(0);
  });

  it('核心表 5/6 就 exit 1（不只看覆盖率）', () => {
    const checks = buildGateChecks(
      summary({ coreTables: { passed: 5, total: 6 } }),
    );
    const core = checks.find((check) => check.name === '核心表可打开');
    expect(core?.passed).toBe(false);
    expect(core?.actual).toBe('5/6');
    expect(exitCodeFor(checks)).toBe(1);
  });

  it('p95 ≥300ms 或 max ≥1s 都 exit 1', () => {
    expect(
      exitCodeFor(
        buildGateChecks(
          summary({ timing: { p50: 90, p95: 300, max: 400 } }),
        ),
      ),
    ).toBe(1);
    expect(
      exitCodeFor(
        buildGateChecks(
          summary({ timing: { p50: 90, p95: 200, max: 1000 } }),
        ),
      ),
    ).toBe(1);
  });

  it('整体 20/26、负样本/对抗/表格/Stage 3 不满也 exit 1', () => {
    const cases: Array<Partial<LibraryGateSummary>> = [
      { overall: 20 },
      { stage3: { passed: 0, total: 1 } },
      { stage3: { passed: 0, total: 0 } },
      { table: { passed: 1, total: 2 } },
      { zh: { passed: 4, total: 6 } },
      { negative: { passed: 3, total: 4 } },
      { adversarial: { passed: 3, total: 4 } },
    ];
    for (const item of cases) {
      expect(exitCodeFor(buildGateChecks(summary(item)))).toBe(1);
    }
    // 中文 5/6 不达标（门槛 6）
    expect(exitCodeFor(buildGateChecks(summary({ zh: { passed: 5, total: 6 } })))).toBe(1);
  });

  it('阈值常量是 26/6，25/26 必须判失败', () => {
    expect(LIBRARY_THRESHOLDS.overall).toBe(26);
    expect(LIBRARY_THRESHOLDS.zh).toBe(6);
    expect(exitCodeFor(buildGateChecks(summary({ overall: 25 })))).toBe(1);
  });
});
