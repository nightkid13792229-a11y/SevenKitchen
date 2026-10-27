import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type {
  IngredientCreationCandidateService,
  RawSearchTerm,
} from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import type { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

const FIVE_TERMS: RawSearchTerm[] = [
  { term: '牛肉', language: 'zh-Hans' },
  { term: '牛肉', language: 'zh-Hant' },
  { term: 'beef', language: 'en' },
  { term: '牛肉', language: 'ja' },
  { term: '소고기', language: 'ko' },
];

function createTools() {
  const searchRawByLanguage = jest.fn(async (input: any) => ({
    groups: input.terms.map((entry: RawSearchTerm) => ({
      term: entry.term,
      language: entry.language,
      sourceTypes: [],
      total: 0,
      matches: [],
    })),
  }));
  const candidateService = {
    findCandidates: jest.fn(),
    listNutritionNames: jest.fn(),
    searchRawByLanguage,
  };
  const draftService = {
    get: jest.fn(async () => ({
      id: DRAFT_ID,
      name: '牛肉',
      type: 'FOOD',
      step: 'INTAKE',
      payload: { intake: { name: '牛肉' } },
      createdBy: 'admin-1',
      createdAt: new Date('2026-10-25T00:00:00.000Z'),
      updatedAt: new Date('2026-10-25T00:00:00.000Z'),
    })),
    patch: jest.fn(async () => ({})),
  };
  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    {} as unknown as PrismaService,
  );

  return { tools, candidateService, searchRawByLanguage, draftService };
}

async function executeTool(
  tools: IngredientCreationToolsService,
  name: string,
  args: Record<string, unknown>,
) {
  const execution = await tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name,
    args,
  });
  return {
    ...execution,
    body: JSON.parse(execution.content) as any,
  };
}

describe('IngredientCreationToolsService · searchLocalLibraries', () => {
  it('5 个语种的合法调用：原样返回各组与命中，带「自己判断」提示', async () => {
    const { tools, searchRawByLanguage } = createTools();
    const groups = [
      {
        term: '牛肉',
        language: 'zh-Hans',
        sourceTypes: ['CFCT'],
        total: 2,
        matches: [
          { id: 'cfct-beef', name: '牛肉', sourceType: 'CFCT' },
          { id: 'cfct-beef-2', name: '牛肉', sourceType: 'CFCT' },
        ],
      },
      {
        term: '牛肉',
        language: 'zh-Hant',
        sourceTypes: ['TFDA'],
        total: 0,
        matches: [],
      },
      {
        term: 'beef',
        language: 'en',
        sourceTypes: ['USDA', 'CNF', 'NZFCD'],
        total: 1,
        matches: [{ id: 'usda-beef', name: 'Beef, raw', sourceType: 'USDA' }],
      },
      {
        term: '牛肉',
        language: 'ja',
        sourceTypes: ['MEXT'],
        total: 0,
        matches: [],
      },
      {
        term: '소고기',
        language: 'ko',
        sourceTypes: ['KO_RDA'],
        total: 0,
        matches: [],
      },
    ];
    searchRawByLanguage.mockResolvedValueOnce({ groups });

    const result = await executeTool(tools, 'searchLocalLibraries', {
      terms: FIVE_TERMS,
    });

    expect(result.ok).toBe(true);
    expect(searchRawByLanguage).toHaveBeenCalledWith({ terms: FIVE_TERMS });
    expect(result.body.groups).toEqual(groups);
    expect(result.body.hint).toBe('原样返回，未去重；请自己判断');
    // 只列名字、没有读来源记录：不能上报 sourceRecordIds。
    expect(result.progress?.sourceRecordIds).toEqual([]);
  });

  it('全部组都没命中时提示换词 / 换语言 / 走在线库', async () => {
    const { tools } = createTools();

    const result = await executeTool(tools, 'searchLocalLibraries', {
      terms: FIVE_TERMS,
    });

    expect(result.ok).toBe(true);
    expect(result.body.groups.every((group: any) => group.total === 0)).toBe(
      true,
    );
    expect(result.body.hint).toBe(
      '本地 7 库没有命中，可换词/换语言，或走在线库',
    );
  });

  it('缺少语种时 ok=false，错误说清缺哪个语种，且不查库', async () => {
    const { tools, searchRawByLanguage } = createTools();

    const result = await executeTool(tools, 'searchLocalLibraries', {
      terms: FIVE_TERMS.filter((entry) => entry.language !== 'ko'),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('5 个语种');
    expect(result.error).toContain('ko');
    expect(searchRawByLanguage).not.toHaveBeenCalled();
  });

  it('term 为空时 ok=false，且不查库', async () => {
    const { tools, searchRawByLanguage } = createTools();
    const terms = [
      ...FIVE_TERMS.slice(0, 2),
      { term: '   ', language: 'en' },
      ...FIVE_TERMS.slice(3),
    ];

    const result = await executeTool(tools, 'searchLocalLibraries', { terms });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('terms[2].term');
    expect(searchRawByLanguage).not.toHaveBeenCalled();
  });

  it('工具定义列出 7 个本地库与语种，并声明不去重 / 不排序 / 不限量', () => {
    const { tools } = createTools();
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'searchLocalLibraries');

    expect(definition).toBeDefined();
    const description = definition?.function.description ?? '';
    for (const library of [
      'CFCT 简体中文（中国大陆）',
      'TFDA 繁体中文（台湾）',
      'USDA 英文（美国）',
      'CNF 英文（加拿大）',
      'NZFCD 英文（新西兰）',
      'MEXT 日文（日本）',
      'KO_RDA 韩文（韩国）',
    ]) {
      expect(description).toContain(library);
    }
    expect(description).toContain('5 个语种');
    expect(description).toContain(
      '查全部 7 个本地库；原样返回所有命中，不去重、不排序、不限量；由你判断哪些是同一个食物',
    );

    expect(definition?.function.parameters).toMatchObject({
      type: 'object',
      required: ['terms'],
      additionalProperties: false,
      properties: {
        terms: {
          type: 'array',
          minItems: 5,
          items: {
            type: 'object',
            required: ['term', 'language'],
            additionalProperties: false,
            properties: {
              term: { type: 'string' },
              language: {
                type: 'string',
                enum: ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'],
              },
            },
          },
        },
      },
    });
  });

  it('已注册到工具清单，并可通过 execute 分发', async () => {
    const { tools } = createTools();

    expect(tools.availableToolNames()).toContain('searchLocalLibraries');
    expect(
      tools
        .getDefinitions()
        .some((tool) => tool.function.name === 'searchLocalLibraries'),
    ).toBe(true);

    const result = await executeTool(tools, 'searchLocalLibraries', {
      terms: FIVE_TERMS,
    });
    expect(result.ok).toBe(true);
    expect(result.body.groups).toHaveLength(5);
  });
});
