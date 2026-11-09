import {
  HIT_DEPTH,
  judgeQuestion,
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

  it('表格题需要表格命中', () => {
    expect(
      judgeQuestion(
        { status: 'ok', sections: [], tables: [{ tableId: 'T0497' }] },
        {
          id: 't',
          query: 'CKD dog key nutritional factors phosphorus protein',
          expectedTables: ['T0497'],
          category: 'table',
        },
      ).passed,
    ).toBe(true);
  });

  it('表格题：期望表里任一张即可（37-9 / 37-11 / 37-12）', () => {
    const spec: QuestionSpec = {
      id: 'table-37-9',
      query: 'CKD dog key nutritional factors phosphorus protein',
      expectedTables: ['T0497', 'T0260', 'T0261'],
      category: 'table',
    };
    expect(
      judgeQuestion(
        { status: 'ok', sections: [], tables: [{ tableId: 'T0260' }] },
        spec,
      ).passed,
    ).toBe(true);
    expect(
      judgeQuestion(
        { status: 'ok', sections: [], tables: [{ tableId: 'T0025' }] },
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
