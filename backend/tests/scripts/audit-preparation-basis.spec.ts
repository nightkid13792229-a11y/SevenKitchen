import {
  auditPreparationBasisItems,
  parseArgs,
  type PrepBasisAuditItem,
} from '../../scripts/audit-preparation-basis';

const item = (
  overrides: Partial<PrepBasisAuditItem> = {},
): PrepBasisAuditItem => ({
  source: '正式食谱',
  recipe: '测试食谱',
  status: 'PUBLIC',
  ingredient: '南瓜',
  preparationState: 'COOKED',
  preparationStateLabel: '熟',
  preparationMethod: '熟重、打碎、充分搅拌',
  ...overrides,
});

describe('audit-preparation-basis', () => {
  it('passes when the basis matches the profile state', () => {
    expect(auditPreparationBasisItems([item()])).toHaveLength(0);
    expect(
      auditPreparationBasisItems([
        item({
          preparationState: 'COOKED',
          preparationMethod: '煮熟后称重、打碎',
        }),
      ]),
    ).toHaveLength(0);
  });

  it('flags a cooked profile whose text says 生重, with a suggested fix', () => {
    const issues = auditPreparationBasisItems([
      item({ preparationMethod: '去皮、生重、打碎、充分搅拌' }),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('口径不一致');
    expect(issues[0].suggestion).toContain('去皮、熟重、打碎、充分搅拌');
  });

  it('flags a raw profile whose text says 煮熟后称重', () => {
    const issues = auditPreparationBasisItems([
      item({
        preparationState: 'RAW',
        preparationStateLabel: '生',
        preparationMethod: '煮熟后称重、充分搅拌',
      }),
    ]);

    expect(issues.map((issue) => issue.kind)).toEqual(['口径不一致']);
  });

  it('flags basis words on oil profiles', () => {
    const issues = auditPreparationBasisItems([
      item({
        preparationState: 'OIL',
        preparationStateLabel: '油脂',
        preparationMethod: '生重、充分搅拌',
      }),
    ]);

    expect(issues.map((issue) => issue.kind)).toEqual(['口径不一致']);
  });

  it('warns when the suggested fix would drop a cooking step', () => {
    const issues = auditPreparationBasisItems([
      item({
        ingredient: '红小豆',
        preparationState: 'DRIED',
        preparationStateLabel: '干',
        preparationMethod: '浸泡12小时、煮熟后称重、打碎、充分搅拌',
      }),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toContain('⚠');
    expect(issues[0].suggestion).toContain('营养档案是否选错');
  });

  it('flags structural problems', () => {
    const issues = auditPreparationBasisItems([
      item({ preparationMethod: '' }),
      item({
        preparationMethod: 'af4c8a9c-98bf-4f91-ab07-4927aae2c4c2、充分搅拌',
        preparationState: null,
      }),
      item({ preparationMethod: '去皮, 生重', preparationState: null }),
      item({ preparationMethod: '充分搅拌。', preparationState: null }),
    ]);

    expect(issues.map((issue) => issue.kind).sort()).toEqual([
      '半角逗号',
      '句尾标点',
      '文案为空',
      '机器码残留',
    ]);
  });

  it('ignores items without a nutrition profile when checking the basis', () => {
    const issues = auditPreparationBasisItems([
      item({ preparationState: null, preparationMethod: '生重、打碎' }),
    ]);

    expect(issues).toHaveLength(0);
  });

  it('parses CLI arguments', () => {
    expect(parseArgs([])).toEqual({
      envFile: null,
      outDir: null,
      failOnIssues: false,
    });
    expect(
      parseArgs([
        '--env-file=.env.production.readonly',
        '--out=../docs/reports',
        '--fail-on-issues',
      ]),
    ).toEqual({
      envFile: '.env.production.readonly',
      outDir: '../docs/reports',
      failOnIssues: true,
    });
  });
});
