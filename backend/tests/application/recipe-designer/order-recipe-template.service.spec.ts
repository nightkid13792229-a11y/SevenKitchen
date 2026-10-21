import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DOG_STAGE_MISSING_WARNING,
  OrderRecipeTemplateService,
  RECIPE_TEMPLATE_SEARCH_LIMIT,
  TEMPLATE_STAGE_MISSING_WARNING,
} from '../../../src/application/recipe-designer/order-recipe-template.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

type AnyRow = Record<string, any>;

function buildVersionRow(overrides: AnyRow = {}): AnyRow {
  return {
    id: 'recipe-1',
    recipeId: 'chain-1',
    version: 1,
    status: 'PUBLIC',
    ...overrides,
  };
}

function buildRecipeRow(overrides: AnyRow = {}): AnyRow {
  return {
    id: 'recipe-1',
    recipeId: 'chain-1',
    version: 1,
    name: '鸡肉南瓜鲜食',
    description: '鸡肉为主蛋白的成犬鲜食',
    status: 'PUBLIC',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    nutritionDetailedData: {
      report: {
        macroRows: [
          {
            key: 'crudeProtein',
            name: '蛋白质',
            dryMatterLabel: '32%',
            energyPercentLabel: '28%',
            weightPercentLabel: '20%',
          },
          {
            key: 'crudeFat',
            name: '脂肪',
            dryMatterLabel: '18%',
            energyPercentLabel: '40%',
            weightPercentLabel: '10%',
          },
        ],
      },
    },
    updatedAt: new Date('2026-10-20T10:00:00.000Z'),
    items: [
      {
        ratioPercent: 40,
        exampleWeight: 400,
        ingredient: { name: '鸡胸肉', type: 'FOOD' },
      },
      {
        ratioPercent: 25,
        exampleWeight: 250,
        ingredient: { name: '南瓜', type: 'FOOD' },
      },
      {
        ratioPercent: 5,
        exampleWeight: 50,
        ingredient: { name: '鱼油', type: 'SUPPLEMENT' },
      },
    ],
    // 这些字段真实查询不会 select；即使 mock 里带出来也绝不能被返回。
    customerOwnerId: 'customer-secret',
    customerDogId: 'dog-secret',
    customOrder: {
      additionalNotes: '订单备注',
      customer: { phone: '13800138000' },
    },
    ...overrides,
  };
}

function mockRecipeQueries(versions: AnyRow[], recipes: AnyRow[]) {
  prisma.recipe.findMany.mockImplementation((args: any) => {
    // 第一步只取版本标量；第二步才读展示字段（含 updatedAt）。
    if (args?.select?.updatedAt) {
      return Promise.resolve(recipes);
    }
    return Promise.resolve(versions);
  });
}

const prisma = {
  recipe: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  dog: {
    findUnique: jest.fn(),
  },
  dogBreed: {
    findUnique: jest.fn(),
  },
  customRecipeOrder: {
    findUnique: jest.fn(),
  },
} as any;

const adultHighActivityDog = {
  birthday: new Date('2021-01-01T00:00:00.000Z'),
  gender: 'FEMALE',
  lifeStageOverride: 'ADULT',
  activityLevel: 'HIGH',
  sizeClassOverride: null,
  breedId: 'breed-1',
};

const adultLowActivityDog = {
  ...adultHighActivityDog,
  activityLevel: 'LOW',
};

const mediumBreed = {
  sizeCategory: 'MEDIUM',
  adultAgeMonths: 12,
  seniorAgeYears: 10,
};

describe('OrderRecipeTemplateService', () => {
  let service: OrderRecipeTemplateService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderRecipeTemplateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(OrderRecipeTemplateService);
    jest.clearAllMocks();
  });

  describe('searchTemplates', () => {
    it.each([
      ['ALL', ['PUBLIC', 'PRIVATE_CUSTOM']],
      ['CATALOG', ['PUBLIC']],
      ['CUSTOM', ['PRIVATE_CUSTOM']],
    ])('filters source recipes by kind %s', async (kind, expectedStatuses) => {
      const versions = [
        buildVersionRow({
          id: 'public-latest',
          recipeId: 'public-chain',
          version: 2,
          status: 'PUBLIC',
        }),
        buildVersionRow({
          id: 'custom-latest',
          recipeId: 'custom-chain',
          version: 1,
          status: 'PRIVATE_CUSTOM',
        }),
        buildVersionRow({
          id: 'draft-latest',
          recipeId: 'draft-chain',
          version: 1,
          status: 'DRAFT',
        }),
      ];
      const recipes = [
        buildRecipeRow({
          id: 'public-latest',
          recipeId: 'public-chain',
          version: 2,
          status: 'PUBLIC',
          name: '橱窗鸡肉餐',
          updatedAt: new Date('2026-10-20T10:00:00.000Z'),
        }),
        buildRecipeRow({
          id: 'custom-latest',
          recipeId: 'custom-chain',
          version: 1,
          status: 'PRIVATE_CUSTOM',
          name: '定制牛肉餐',
          updatedAt: new Date('2026-10-21T10:00:00.000Z'),
        }),
        buildRecipeRow({
          id: 'draft-latest',
          recipeId: 'draft-chain',
          version: 1,
          status: 'DRAFT',
          name: '草稿餐',
        }),
      ];
      mockRecipeQueries(versions, recipes);

      const result = await service.searchTemplates({ kind });

      expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { status: { in: expectedStatuses } },
        }),
      );

      const expectedIds =
        kind === 'CATALOG'
          ? ['public-latest']
          : kind === 'CUSTOM'
            ? ['custom-latest']
            : ['custom-latest', 'public-latest'];
      expect(result.map((template) => template.recipeId)).toEqual(expectedIds);
      expect(result.map((template) => template.sourceKind)).toEqual(
        expectedIds.map((id) =>
          id === 'custom-latest' ? 'CUSTOM' : 'CATALOG',
        ),
      );
      expect(result.map((template) => template.recipeId)).not.toContain(
        'draft-latest',
      );
    });

    it('keeps only the latest version of each recipe version chain', async () => {
      const versions = [
        buildVersionRow({ id: 'chain-1-v1', recipeId: 'chain-1', version: 1 }),
        buildVersionRow({ id: 'chain-1-v3', recipeId: 'chain-1', version: 3 }),
        buildVersionRow({ id: 'chain-1-v2', recipeId: 'chain-1', version: 2 }),
        buildVersionRow({ id: 'chain-2-v5', recipeId: 'chain-2', version: 5 }),
      ];
      const recipes = [
        buildRecipeRow({
          id: 'chain-1-v3',
          recipeId: 'chain-1',
          version: 3,
          updatedAt: new Date('2026-10-21T10:00:00.000Z'),
        }),
        // 即使查询层意外带出旧版本，也不能出现在结果里。
        buildRecipeRow({
          id: 'chain-1-v1',
          recipeId: 'chain-1',
          version: 1,
          updatedAt: new Date('2026-10-19T10:00:00.000Z'),
        }),
        buildRecipeRow({
          id: 'chain-2-v5',
          recipeId: 'chain-2',
          version: 5,
          updatedAt: new Date('2026-10-20T10:00:00.000Z'),
        }),
      ];
      mockRecipeQueries(versions, recipes);

      const result = await service.searchTemplates({ kind: 'ALL' });

      expect(result.map((template) => template.recipeId)).toEqual([
        'chain-1-v3',
        'chain-2-v5',
      ]);
      expect(result.map((template) => template.recipeVersion)).toEqual([3, 5]);
      expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            id: {
              in: expect.arrayContaining(['chain-1-v3', 'chain-2-v5']),
            },
          },
        }),
      );
      const detailWhere = prisma.recipe.findMany.mock.calls[1][0].where;
      expect(detailWhere.id.in).not.toContain('chain-1-v1');
    });

    it('matches keyword against name, description and ingredient names case-insensitively', async () => {
      const versions = [
        buildVersionRow({ id: 'match-name', recipeId: 'chain-name' }),
        buildVersionRow({
          id: 'match-description',
          recipeId: 'chain-description',
        }),
        buildVersionRow({
          id: 'match-ingredient',
          recipeId: 'chain-ingredient',
        }),
        buildVersionRow({ id: 'no-match', recipeId: 'chain-none' }),
      ];
      const recipes = [
        buildRecipeRow({
          id: 'match-name',
          recipeId: 'chain-name',
          name: 'Chicken Feast',
          description: '普通成犬餐',
          items: [
            {
              ratioPercent: 50,
              exampleWeight: 500,
              ingredient: { name: '南瓜', type: 'FOOD' },
            },
          ],
        }),
        buildRecipeRow({
          id: 'match-description',
          recipeId: 'chain-description',
          name: '牛肉餐',
          description: '适合 BEEF 敏感的狗狗',
          items: [
            {
              ratioPercent: 50,
              exampleWeight: 500,
              ingredient: { name: '南瓜', type: 'FOOD' },
            },
          ],
        }),
        buildRecipeRow({
          id: 'match-ingredient',
          recipeId: 'chain-ingredient',
          name: '南瓜鸡肉餐',
          description: '普通成犬餐',
          items: [
            {
              ratioPercent: 50,
              exampleWeight: 500,
              ingredient: { name: 'PUMPKIN', type: 'FOOD' },
            },
          ],
        }),
        buildRecipeRow({
          id: 'no-match',
          recipeId: 'chain-none',
          name: '鱼肉餐',
          description: '鱼类为主',
          items: [
            {
              ratioPercent: 50,
              exampleWeight: 500,
              ingredient: { name: '三文鱼', type: 'FOOD' },
            },
          ],
        }),
      ];

      const cases = [
        { keyword: 'chicken', expectedId: 'match-name' },
        { keyword: 'BEEF', expectedId: 'match-description' },
        { keyword: 'PUMPKIN', expectedId: 'match-ingredient' },
      ];

      for (const testCase of cases) {
        mockRecipeQueries(versions, recipes);
        prisma.recipe.findMany.mockClear();

        const result = await service.searchTemplates({
          kind: 'ALL',
          keyword: testCase.keyword,
        });

        expect(result.map((template) => template.recipeId)).toEqual([
          testCase.expectedId,
        ]);
      }

      mockRecipeQueries(versions, recipes);
      prisma.recipe.findMany.mockClear();
      await service.searchTemplates({ kind: 'ALL', keyword: 'Chicken' });
      const detailWhere = prisma.recipe.findMany.mock.calls[1][0].where;
      expect(detailWhere.OR).toEqual(
        expect.arrayContaining([
          { name: { contains: 'Chicken', mode: 'insensitive' } },
          { description: { contains: 'Chicken', mode: 'insensitive' } },
          {
            items: {
              some: {
                ingredient: {
                  name: { contains: 'Chicken', mode: 'insensitive' },
                },
              },
            },
          },
        ]),
      );
    });

    it('orders by updatedAt descending and caps the result at 50', async () => {
      const versions = Array.from({ length: 55 }, (_, index) =>
        buildVersionRow({
          id: `recipe-${index}`,
          recipeId: `chain-${index}`,
          version: 1,
        }),
      );
      const recipes = versions.map((version, index) =>
        buildRecipeRow({
          id: version.id,
          recipeId: version.recipeId,
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        }),
      );
      mockRecipeQueries(versions, recipes);

      const result = await service.searchTemplates({ kind: 'CATALOG' });

      expect(RECIPE_TEMPLATE_SEARCH_LIMIT).toBe(50);
      expect(result).toHaveLength(50);
      expect(result[0].recipeId).toBe('recipe-54');
      expect(result[49].recipeId).toBe('recipe-5');
      expect(prisma.recipe.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          orderBy: { updatedAt: 'desc' },
          take: RECIPE_TEMPLATE_SEARCH_LIMIT,
        }),
      );
    });

    it('builds life stage, primary protein, ingredient count and macro summary', async () => {
      const versions = [
        buildVersionRow({ id: 'summary-1', recipeId: 'chain-summary-1' }),
        buildVersionRow({ id: 'summary-2', recipeId: 'chain-summary-2' }),
        buildVersionRow({ id: 'summary-3', recipeId: 'chain-summary-3' }),
      ];
      const recipes = [
        buildRecipeRow({
          id: 'summary-1',
          recipeId: 'chain-summary-1',
          name: '牛肉鸡肉餐',
          seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
          applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
          updatedAt: new Date('2026-10-21T10:00:00.000Z'),
          items: [
            {
              ratioPercent: 30,
              exampleWeight: 300,
              ingredient: { name: '牛肉', type: 'FOOD' },
            },
            {
              ratioPercent: 45,
              exampleWeight: 450,
              ingredient: { name: '鸡胸肉', type: 'FOOD' },
            },
            {
              // 补剂占比更大，但不算主蛋白。
              ratioPercent: 60,
              exampleWeight: 600,
              ingredient: { name: '钙粉', type: 'SUPPLEMENT' },
            },
          ],
        }),
        buildRecipeRow({
          id: 'summary-2',
          recipeId: 'chain-summary-2',
          name: '老年犬鸭肉餐',
          seriesLifeStage: null,
          applicableLifeStages: [
            null,
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
            'HIGH_ACTIVITY_ADULT',
          ],
          nutritionDetailedData: null,
          updatedAt: new Date('2026-10-20T10:00:00.000Z'),
          items: [
            {
              ratioPercent: null,
              exampleWeight: 100,
              ingredient: { name: '鸭肉', type: 'FOOD' },
            },
            {
              ratioPercent: null,
              exampleWeight: 180,
              ingredient: { name: '南瓜', type: 'FOOD' },
            },
          ],
        }),
        buildRecipeRow({
          id: 'summary-3',
          recipeId: 'chain-summary-3',
          name: '标签缺失餐',
          nutritionDetailedData: {
            report: {
              macroRows: [
                { name: '蛋白质' },
                { name: '脂肪', dryMatterLabel: '18%' },
                { dryMatterLabel: '缺名字' },
                'invalid-row',
              ],
            },
          },
          updatedAt: new Date('2026-10-19T10:00:00.000Z'),
        }),
      ];
      mockRecipeQueries(versions, recipes);

      const result = await service.searchTemplates({ kind: 'ALL' });
      const [first, second, third] = result;

      expect(first).toMatchObject({
        recipeId: 'summary-1',
        recipeVersion: 1,
        name: '牛肉鸡肉餐',
        sourceKind: 'CATALOG',
        lifeStage: 'HIGH_ACTIVITY_ADULT',
        primaryProtein: '鸡胸肉',
        ingredientCount: 3,
        macroSummary: [
          {
            name: '蛋白质',
            dryMatterLabel: '32%',
            energyPercentLabel: '28%',
            weightPercentLabel: '20%',
          },
          {
            name: '脂肪',
            dryMatterLabel: '18%',
            energyPercentLabel: '40%',
            weightPercentLabel: '10%',
          },
        ],
      });
      expect(first.updatedAt).toEqual(new Date('2026-10-21T10:00:00.000Z'));

      expect(second).toMatchObject({
        lifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        primaryProtein: '南瓜',
        ingredientCount: 2,
        macroSummary: [],
      });

      expect(third.macroSummary).toEqual([
        {
          name: '蛋白质',
          dryMatterLabel: '-',
          energyPercentLabel: '-',
          weightPercentLabel: '-',
        },
        {
          name: '脂肪',
          dryMatterLabel: '18%',
          energyPercentLabel: '-',
          weightPercentLabel: '-',
        },
      ]);
    });

    it('never leaks customer or order privacy fields', async () => {
      const versions = [buildVersionRow({ id: 'private-template' })];
      const recipes = [
        buildRecipeRow({
          id: 'private-template',
          name: '其他狗狗的定制餐',
          customerOwnerId: 'customer-owner-secret',
          customerDogId: 'customer-dog-secret',
          customOrder: {
            additionalNotes: '订单备注不能外泄',
            customer: { phone: '13800138000', wechat: 'secret-wechat' },
          },
        }),
      ];
      mockRecipeQueries(versions, recipes);

      const result = await service.searchTemplates({ kind: 'ALL' });
      const serialized = JSON.stringify(result);

      expect(result).toHaveLength(1);
      for (const secret of [
        'customer-owner-secret',
        'customer-dog-secret',
        '13800138000',
        'secret-wechat',
        '订单备注不能外泄',
      ]) {
        expect(serialized).not.toContain(secret);
      }
      expect(result[0]).not.toHaveProperty('customerOwnerId');
      expect(result[0]).not.toHaveProperty('customerDogId');
      expect(result[0]).not.toHaveProperty('customOrder');
      expect(result[0]).not.toHaveProperty('description');
      expect(Object.keys(result[0]).sort()).toEqual(
        [
          'ingredientCount',
          'lifeStage',
          'macroSummary',
          'name',
          'primaryProtein',
          'recipeId',
          'recipeVersion',
          'sourceKind',
          'updatedAt',
        ].sort(),
      );
    });

    it('returns an empty list without a detail query when no templates exist', async () => {
      prisma.recipe.findMany.mockResolvedValueOnce([]);

      await expect(service.searchTemplates({ kind: 'ALL' })).resolves.toEqual(
        [],
      );
      expect(prisma.recipe.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('compareStage', () => {
    it('matches when the template stage equals the dog effective stage', async () => {
      prisma.dog.findUnique.mockResolvedValue(adultHighActivityDog);
      prisma.dogBreed.findUnique.mockResolvedValue(mediumBreed);

      await expect(
        service.compareStage('HIGH_ACTIVITY_ADULT', 'dog-1'),
      ).resolves.toEqual({
        matches: true,
        templateStage: 'HIGH_ACTIVITY_ADULT',
        dogStage: 'HIGH_ACTIVITY_ADULT',
        warning: null,
      });
      expect(prisma.dog.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dog-1' } }),
      );
      expect(prisma.dogBreed.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'breed-1' } }),
      );
    });

    it('warns but never throws when stages differ', async () => {
      prisma.dog.findUnique.mockResolvedValue(adultLowActivityDog);
      prisma.dogBreed.findUnique.mockResolvedValue(mediumBreed);

      const result = await service.compareStage('HIGH_ACTIVITY_ADULT', 'dog-1');

      expect(result.matches).toBe(false);
      expect(result.templateStage).toBe('HIGH_ACTIVITY_ADULT');
      expect(result.dogStage).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');
      expect(result.warning).toContain('普通成年犬');
      expect(result.warning).toContain('低能量成年犬 / 老年犬');
      expect(result.warning).toContain('原料比例可能需要按当前阶段重新评估');
    });

    it('warns but never throws when the template has no stage', async () => {
      prisma.dog.findUnique.mockResolvedValue(adultHighActivityDog);
      prisma.dogBreed.findUnique.mockResolvedValue(mediumBreed);

      await expect(service.compareStage(null, 'dog-1')).resolves.toEqual({
        matches: false,
        templateStage: null,
        dogStage: 'HIGH_ACTIVITY_ADULT',
        warning: TEMPLATE_STAGE_MISSING_WARNING,
      });
    });

    it('warns but never throws when the dog is missing', async () => {
      prisma.dog.findUnique.mockResolvedValue(null);

      await expect(
        service.compareStage('HIGH_ACTIVITY_ADULT', 'missing-dog'),
      ).resolves.toEqual({
        matches: false,
        templateStage: 'HIGH_ACTIVITY_ADULT',
        dogStage: null,
        warning: DOG_STAGE_MISSING_WARNING,
      });
      expect(prisma.dogBreed.findUnique).not.toHaveBeenCalled();
    });

    it('treats a blank dog id as a missing stage without querying', async () => {
      await expect(service.compareStage(null, '')).resolves.toEqual({
        matches: false,
        templateStage: null,
        dogStage: null,
        warning: TEMPLATE_STAGE_MISSING_WARNING,
      });
      expect(prisma.dog.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('compareOrderTemplateStage', () => {
    beforeEach(() => {
      prisma.customRecipeOrder.findUnique.mockResolvedValue({
        orderId: 'CR20261022001',
        dogId: 'dog-1',
      });
      prisma.recipe.findUnique.mockResolvedValue({
        id: 'recipe-1',
        name: '鸡肉南瓜鲜食',
        version: 3,
        status: 'PUBLIC',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      });
      prisma.dog.findUnique.mockResolvedValue(adultHighActivityDog);
      prisma.dogBreed.findUnique.mockResolvedValue(mediumBreed);
    });

    it('resolves the order dog and template stage for the confirmation panel', async () => {
      await expect(
        service.compareOrderTemplateStage('CR20261022001', 'recipe-1'),
      ).resolves.toEqual({
        orderId: 'CR20261022001',
        recipeId: 'recipe-1',
        recipeVersion: 3,
        templateName: '鸡肉南瓜鲜食',
        matches: true,
        templateStage: 'HIGH_ACTIVITY_ADULT',
        dogStage: 'HIGH_ACTIVITY_ADULT',
        warning: null,
      });
      expect(prisma.customRecipeOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId: 'CR20261022001' },
        }),
      );
      expect(prisma.recipe.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'recipe-1' } }),
      );
    });

    it('falls back to applicableLifeStages when seriesLifeStage is empty', async () => {
      prisma.recipe.findUnique.mockResolvedValue({
        id: 'recipe-2',
        name: '老年犬餐',
        version: 1,
        status: 'PRIVATE_CUSTOM',
        seriesLifeStage: null,
        applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
      });
      prisma.dog.findUnique.mockResolvedValue(adultLowActivityDog);

      await expect(
        service.compareOrderTemplateStage('CR20261022001', 'recipe-2'),
      ).resolves.toEqual(
        expect.objectContaining({
          templateStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          dogStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          matches: true,
          warning: null,
        }),
      );
    });

    it('rejects an unknown order', async () => {
      prisma.customRecipeOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.compareOrderTemplateStage('CR404', 'recipe-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a recipe that is not a visible template', async () => {
      prisma.recipe.findUnique.mockResolvedValue({
        id: 'draft-recipe',
        name: '草稿餐',
        version: 1,
        status: 'DRAFT',
        seriesLifeStage: null,
        applicableLifeStages: [],
      });

      await expect(
        service.compareOrderTemplateStage('CR20261022001', 'draft-recipe'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires both the order id and the template recipe id', async () => {
      await expect(
        service.compareOrderTemplateStage('', 'recipe-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.compareOrderTemplateStage('CR20261022001', ''),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.customRecipeOrder.findUnique).not.toHaveBeenCalled();
    });
  });
});
