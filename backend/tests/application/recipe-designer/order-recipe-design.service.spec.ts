import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderRecipeDesignService } from '../../../src/application/recipe-designer/order-recipe-design.service';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { OrderRecipeTemplateService } from '../../../src/application/recipe-designer/order-recipe-template.service';
import { AiDesignSuggestionService } from '../../../src/application/recipe-designer/ai-design-suggestion.service';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { SearchGovernanceService } from '../../../src/application/search-governance/search-governance.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

type AnyRow = Record<string, any>;

const STAGE_WARNING =
  '模板阶段「低能量成年犬 / 老年犬」与当前爱犬阶段「普通成年犬」不一致，原料比例可能需要按当前阶段重新评估';

function buildOrder(overrides: AnyRow = {}): AnyRow {
  return {
    id: 'order-uuid',
    orderId: 'CR202610220001',
    customerId: 'customer-1',
    dogId: 'dog-1',
    status: 'IN_PROGRESS',
    recipeQuantity: 2,
    dog: { id: 'dog-1', name: 'Foxy' },
    ...overrides,
  };
}

function buildSlot(overrides: AnyRow = {}): AnyRow {
  return {
    id: 'design-1',
    orderId: 'order-uuid',
    dogId: 'dog-1',
    seriesId: 'series-1',
    designDraftId: 'draft-1',
    recipeId: null,
    sourceRecipeId: 'recipe-source',
    status: 'EDITING',
    stageWarning: STAGE_WARNING,
    createdAt: new Date('2026-10-22T01:00:00.000Z'),
    updatedAt: new Date('2026-10-22T02:00:00.000Z'),
    series: { name: 'Foxy定制 · 鸡肉南瓜' },
    designDraft: {
      name: 'Foxy定制 · 鸡肉南瓜',
      updatedAt: new Date('2026-10-22T01:30:00.000Z'),
    },
    ...overrides,
  };
}

describe('OrderRecipeDesignService', () => {
  let service: OrderRecipeDesignService;

  const prisma = {
    customRecipeOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderRecipeDesign: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    recipe: {
      deleteMany: jest.fn(),
    },
    designRecipeItem: {
      deleteMany: jest.fn(),
    },
    designRecipe: {
      deleteMany: jest.fn(),
    },
    recipeSeries: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const customRecipeService = {
    resolveOrderRef: jest.fn(),
  };
  const recipeDesignerService = {
    createOrderBoundSeriesDesign: jest.fn(),
    deleteOrderBoundSeriesDesign: jest.fn(),
    publishOrderDesignSlot: jest.fn(),
  };
  const orderRecipeTemplateService = {
    compareOrderTemplateStage: jest.fn(),
    compareStage: jest.fn(),
  };

  let activeSlotCount = 0;
  let readySlotCount = 0;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderRecipeDesignService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomRecipeService, useValue: customRecipeService },
        { provide: RecipeDesignerService, useValue: recipeDesignerService },
        {
          provide: OrderRecipeTemplateService,
          useValue: orderRecipeTemplateService,
        },
      ],
    }).compile();

    service = moduleRef.get(OrderRecipeDesignService);
    jest.clearAllMocks();

    activeSlotCount = 0;
    readySlotCount = 0;
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    prisma.customRecipeOrder.findUnique.mockResolvedValue(buildOrder());
    prisma.orderRecipeDesign.count.mockImplementation(async (args: any) => {
      const status = args?.where?.status;
      if (status === 'READY') {
        return readySlotCount;
      }
      return activeSlotCount;
    });
    prisma.orderRecipeDesign.findMany.mockResolvedValue([]);
    prisma.orderRecipeDesign.create.mockImplementation(async ({ data }: any) => ({
      id: 'design-new',
      ...data,
    }));
    prisma.orderRecipeDesign.update.mockImplementation(async ({ data }: any) => ({
      id: 'design-1',
      ...data,
    }));
    prisma.orderRecipeDesign.delete.mockResolvedValue({});
    prisma.recipe.deleteMany.mockResolvedValue({ count: 1 });
    prisma.designRecipeItem.deleteMany.mockResolvedValue({ count: 1 });
    prisma.designRecipe.deleteMany.mockResolvedValue({ count: 1 });
    prisma.recipeSeries.deleteMany.mockResolvedValue({ count: 1 });
    customRecipeService.resolveOrderRef.mockResolvedValue({
      id: 'order-uuid',
      orderId: 'CR202610220001',
    });
    recipeDesignerService.deleteOrderBoundSeriesDesign.mockResolvedValue(
      undefined,
    );
  });

  describe('getWorkspace', () => {
    it('returns the order context, progress and slot list', async () => {
      prisma.orderRecipeDesign.findMany.mockResolvedValue([
        buildSlot(),
        buildSlot({
          id: 'design-2',
          seriesId: 'series-2',
          designDraftId: 'draft-2',
          status: 'READY',
          recipeId: 'recipe-row-2',
          sourceRecipeId: null,
          stageWarning: null,
          designDraft: {
            name: 'Foxy定制 · 第二份',
            updatedAt: new Date('2026-10-22T03:00:00.000Z'),
          },
        }),
      ]);

      const workspace = await service.getWorkspace('CR202610220001');

      expect(workspace).toEqual({
        orderId: 'CR202610220001',
        dogId: 'dog-1',
        dogName: 'Foxy',
        quantity: 2,
        readyCount: 1,
        slots: [
          {
            designId: 'design-1',
            seriesId: 'series-1',
            draftId: 'draft-1',
            name: 'Foxy定制 · 鸡肉南瓜',
            status: 'EDITING',
            recipeId: null,
            sourceRecipeId: 'recipe-source',
            stageWarning: STAGE_WARNING,
            updatedAt: new Date('2026-10-22T01:30:00.000Z'),
          },
          {
            designId: 'design-2',
            seriesId: 'series-2',
            draftId: 'draft-2',
            name: 'Foxy定制 · 第二份',
            status: 'READY',
            recipeId: 'recipe-row-2',
            sourceRecipeId: null,
            stageWarning: null,
            updatedAt: new Date('2026-10-22T03:00:00.000Z'),
          },
        ],
      });

      // REMOVED 槽位不进入工作台
      expect(prisma.orderRecipeDesign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orderId: 'order-uuid',
            status: { not: 'REMOVED' },
          },
        }),
      );
      expect(customRecipeService.resolveOrderRef).toHaveBeenCalledWith(
        'CR202610220001',
      );
      expect(prisma.customRecipeOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-uuid' } }),
      );
    });
  });

  describe('createFromTemplate', () => {
    it('creates a slot with locked dog/order context and a persisted stage warning', async () => {
      orderRecipeTemplateService.compareOrderTemplateStage.mockResolvedValue({
        orderId: 'CR202610220001',
        recipeId: 'recipe-source',
        recipeVersion: 3,
        templateName: '鸡肉南瓜',
        matches: false,
        templateStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        dogStage: 'HIGH_ACTIVITY_ADULT',
        warning: STAGE_WARNING,
      });
      recipeDesignerService.createOrderBoundSeriesDesign.mockResolvedValue({
        seriesId: 'series-new',
        draftId: 'draft-new',
        name: 'Foxy定制 · 鸡肉南瓜',
        sourceRecipeId: 'recipe-source',
        sourceRecipeVersion: 3,
        sourceKind: 'CATALOG',
      });

      const result = await service.createFromTemplate(
        'CR202610220001',
        { sourceRecipeId: 'recipe-source' },
        'staff-1',
      );

      expect(result).toEqual({
        seriesId: 'series-new',
        draftId: 'draft-new',
        stageWarning: STAGE_WARNING,
      });

      // 订单上下文与狗狗只来自订单，调用方不能自带 dogId / orderId
      expect(
        recipeDesignerService.createOrderBoundSeriesDesign,
      ).toHaveBeenCalledWith({
        customOrderId: 'order-uuid',
        dogId: 'dog-1',
        dogName: 'Foxy',
        orderQuantity: 2,
        createdBy: 'staff-1',
        name: undefined,
        sourceRecipeId: 'recipe-source',
        defaultLifeStage: 'HIGH_ACTIVITY_ADULT',
      });

      expect(prisma.orderRecipeDesign.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-uuid',
          dogId: 'dog-1',
          seriesId: 'series-new',
          designDraftId: 'draft-new',
          sourceRecipeId: 'recipe-source',
          sourceRecipeVersion: 3,
          sourceKind: 'CATALOG',
          status: 'EDITING',
          stageWarning: STAGE_WARNING,
          createdBy: 'staff-1',
        },
      });
      // 阶段不一致只提示，绝不阻断
      expect(prisma.customRecipeOrder.update).not.toHaveBeenCalled();
    });

    it('keeps a custom name when provided', async () => {
      orderRecipeTemplateService.compareOrderTemplateStage.mockResolvedValue({
        templateName: '鸡肉南瓜',
        matches: true,
        templateStage: 'HIGH_ACTIVITY_ADULT',
        dogStage: 'HIGH_ACTIVITY_ADULT',
        warning: null,
      });
      recipeDesignerService.createOrderBoundSeriesDesign.mockResolvedValue({
        seriesId: 'series-new',
        draftId: 'draft-new',
        name: '低脂鸡肉版',
        sourceRecipeId: 'recipe-source',
        sourceRecipeVersion: 3,
        sourceKind: 'CATALOG',
      });

      await service.createFromTemplate(
        'CR202610220001',
        { sourceRecipeId: 'recipe-source', name: '低脂鸡肉版' },
        'staff-1',
      );

      expect(
        recipeDesignerService.createOrderBoundSeriesDesign,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ name: '低脂鸡肉版' }),
      );
      expect(prisma.orderRecipeDesign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stageWarning: null }),
      });
    });

    it('allows the same template to be reused for multiple slots', async () => {
      orderRecipeTemplateService.compareOrderTemplateStage.mockResolvedValue({
        templateName: '鸡肉南瓜',
        matches: true,
        templateStage: 'HIGH_ACTIVITY_ADULT',
        dogStage: 'HIGH_ACTIVITY_ADULT',
        warning: null,
      });
      recipeDesignerService.createOrderBoundSeriesDesign
        .mockResolvedValueOnce({
          seriesId: 'series-a',
          draftId: 'draft-a',
          name: 'Foxy定制 · 鸡肉南瓜',
          sourceRecipeId: 'recipe-source',
          sourceRecipeVersion: 3,
          sourceKind: 'CATALOG',
        })
        .mockResolvedValueOnce({
          seriesId: 'series-b',
          draftId: 'draft-b',
          name: 'Foxy定制 · 鸡肉南瓜',
          sourceRecipeId: 'recipe-source',
          sourceRecipeVersion: 3,
          sourceKind: 'CATALOG',
        });

      const first = await service.createFromTemplate(
        'CR202610220001',
        { sourceRecipeId: 'recipe-source' },
        'staff-1',
      );
      activeSlotCount = 1;
      const second = await service.createFromTemplate(
        'CR202610220001',
        { sourceRecipeId: 'recipe-source' },
        'staff-1',
      );

      expect(first.draftId).toBe('draft-a');
      expect(second.draftId).toBe('draft-b');
      expect(
        recipeDesignerService.createOrderBoundSeriesDesign,
      ).toHaveBeenCalledTimes(2);
      expect(prisma.orderRecipeDesign.create).toHaveBeenCalledTimes(2);
    });

    it('rejects creation when the order already has all slots', async () => {
      activeSlotCount = 2;

      await expect(
        service.createFromTemplate(
          'CR202610220001',
          { sourceRecipeId: 'recipe-source' },
          'staff-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(
        recipeDesignerService.createOrderBoundSeriesDesign,
      ).not.toHaveBeenCalled();
    });

    it('rolls back the series/draft when the slot row cannot be created', async () => {
      orderRecipeTemplateService.compareOrderTemplateStage.mockResolvedValue({
        templateName: '鸡肉南瓜',
        matches: true,
        templateStage: 'HIGH_ACTIVITY_ADULT',
        dogStage: 'HIGH_ACTIVITY_ADULT',
        warning: null,
      });
      recipeDesignerService.createOrderBoundSeriesDesign.mockResolvedValue({
        seriesId: 'series-new',
        draftId: 'draft-new',
        name: 'Foxy定制 · 鸡肉南瓜',
        sourceRecipeId: 'recipe-source',
        sourceRecipeVersion: 3,
        sourceKind: 'CATALOG',
      });
      prisma.orderRecipeDesign.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.createFromTemplate(
          'CR202610220001',
          { sourceRecipeId: 'recipe-source' },
          'staff-1',
        ),
      ).rejects.toThrow('db down');

      expect(
        recipeDesignerService.deleteOrderBoundSeriesDesign,
      ).toHaveBeenCalledWith('series-new', 'draft-new');
    });
  });

  describe('createBlank', () => {
    it('creates a blank order-bound draft without a template', async () => {
      orderRecipeTemplateService.compareStage.mockResolvedValue({
        matches: false,
        templateStage: null,
        dogStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        warning: '模板未标注阶段，请自行核对',
      });
      recipeDesignerService.createOrderBoundSeriesDesign.mockResolvedValue({
        seriesId: 'series-blank',
        draftId: 'draft-blank',
        name: 'Foxy定制 · 新食谱',
        sourceRecipeId: null,
        sourceRecipeVersion: null,
        sourceKind: null,
      });

      const result = await service.createBlank(
        'CR202610220001',
        'staff-1',
      );

      expect(result).toEqual({
        seriesId: 'series-blank',
        draftId: 'draft-blank',
      });
      expect(
        recipeDesignerService.createOrderBoundSeriesDesign,
      ).toHaveBeenCalledWith({
        customOrderId: 'order-uuid',
        dogId: 'dog-1',
        dogName: 'Foxy',
        orderQuantity: 2,
        createdBy: 'staff-1',
        defaultLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      });
      expect(prisma.orderRecipeDesign.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-uuid',
          dogId: 'dog-1',
          seriesId: 'series-blank',
          designDraftId: 'draft-blank',
          status: 'EDITING',
          createdBy: 'staff-1',
        },
      });
    });
  });

  describe('order state and capacity guards', () => {
    it.each(['PENDING_PAYMENT', 'CANCELLED', 'DELIVERED', 'COMPLETED'])(
      'rejects creating a design when order status is %s',
      async (status) => {
        prisma.customRecipeOrder.findUnique.mockResolvedValue(
          buildOrder({ status }),
        );

        await expect(
          service.createBlank('CR202610220001', 'staff-1'),
        ).rejects.toThrow(BadRequestException);
        expect(
          recipeDesignerService.createOrderBoundSeriesDesign,
        ).not.toHaveBeenCalled();
      },
    );

    it('rejects staging once ready count reaches the order quantity', async () => {
      readySlotCount = 2;
      prisma.orderRecipeDesign.findUnique.mockResolvedValue(buildSlot());

      await expect(
        service.stageDraft('CR202610220001', 'design-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(
        recipeDesignerService.publishOrderDesignSlot,
      ).not.toHaveBeenCalled();
    });
  });

  describe('stageDraft', () => {
    it('publishes a private recipe, marks the slot READY and does not deliver/notify', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue(buildSlot());
      recipeDesignerService.publishOrderDesignSlot.mockResolvedValue({
        recipeRowId: 'recipe-row-9',
        recipeId: 'draft-1',
      });

      const result = await service.stageDraft(
        'CR202610220001',
        'design-1',
        'admin-1',
      );

      expect(result).toEqual({
        status: 'READY',
        recipeId: 'recipe-row-9',
        readyCount: 1,
      });
      expect(
        recipeDesignerService.publishOrderDesignSlot,
      ).toHaveBeenCalledWith({
        draftId: 'draft-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        operatorId: 'admin-1',
      });
      expect(prisma.orderRecipeDesign.update).toHaveBeenCalledWith({
        where: { id: 'design-1' },
        data: { status: 'READY', recipeId: 'recipe-row-9' },
      });
      // 加入待提交只生成私密食谱：订单状态不变、不交付、不发通知
      expect(prisma.customRecipeOrder.update).not.toHaveBeenCalled();
      expect(recipeDesignerService.publishOrderDesignSlot).toHaveBeenCalledTimes(
        1,
      );
    });

    it('is idempotent when the slot is already READY and the draft is unchanged', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue(
        buildSlot({
          status: 'READY',
          recipeId: 'recipe-row-9',
          updatedAt: new Date('2026-10-22T02:00:00.000Z'),
          designDraft: {
            name: 'Foxy定制 · 鸡肉南瓜',
            updatedAt: new Date('2026-10-22T01:30:00.000Z'),
          },
        }),
      );
      readySlotCount = 1;

      const result = await service.stageDraft(
        'CR202610220001',
        'design-1',
        'admin-1',
      );

      expect(result).toEqual({
        status: 'READY',
        recipeId: 'recipe-row-9',
        readyCount: 1,
      });
      expect(
        recipeDesignerService.publishOrderDesignSlot,
      ).not.toHaveBeenCalled();
      expect(prisma.orderRecipeDesign.update).not.toHaveBeenCalled();
    });

    it('does not publish twice when staging is repeated after READY', async () => {
      prisma.orderRecipeDesign.findUnique
        .mockResolvedValueOnce(buildSlot())
        .mockResolvedValueOnce(
          buildSlot({
            status: 'READY',
            recipeId: 'recipe-row-9',
            updatedAt: new Date('2026-10-22T02:00:00.000Z'),
            designDraft: {
              name: 'Foxy定制 · 鸡肉南瓜',
              updatedAt: new Date('2026-10-22T01:30:00.000Z'),
            },
          }),
        );
      recipeDesignerService.publishOrderDesignSlot.mockResolvedValue({
        recipeRowId: 'recipe-row-9',
        recipeId: 'draft-1',
      });

      const first = await service.stageDraft(
        'CR202610220001',
        'design-1',
        'admin-1',
      );
      readySlotCount = 1;
      const second = await service.stageDraft(
        'CR202610220001',
        'design-1',
        'admin-1',
      );

      expect(first).toEqual({
        status: 'READY',
        recipeId: 'recipe-row-9',
        readyCount: 1,
      });
      expect(second).toEqual(first);
      expect(
        recipeDesignerService.publishOrderDesignSlot,
      ).toHaveBeenCalledTimes(1);
      expect(prisma.orderRecipeDesign.update).toHaveBeenCalledTimes(1);
    });

    it('regenerates the private recipe when the draft changed after READY', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue(
        buildSlot({
          status: 'READY',
          recipeId: 'recipe-row-9',
          updatedAt: new Date('2026-10-22T02:00:00.000Z'),
          designDraft: {
            name: 'Foxy定制 · 鸡肉南瓜',
            updatedAt: new Date('2026-10-22T04:00:00.000Z'),
          },
        }),
      );
      readySlotCount = 1;
      recipeDesignerService.publishOrderDesignSlot.mockResolvedValue({
        recipeRowId: 'recipe-row-9',
        recipeId: 'draft-1',
      });

      const result = await service.stageDraft(
        'CR202610220001',
        'design-1',
        'admin-1',
      );

      expect(result.readyCount).toBe(1);
      expect(
        recipeDesignerService.publishOrderDesignSlot,
      ).toHaveBeenCalledTimes(1);
      expect(prisma.orderRecipeDesign.update).toHaveBeenCalledWith({
        where: { id: 'design-1' },
        data: { status: 'READY', recipeId: 'recipe-row-9' },
      });
    });

    it('rejects a slot that belongs to another order', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue(
        buildSlot({ orderId: 'another-order' }),
      );

      await expect(
        service.stageDraft('CR202610220001', 'design-1', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a DELIVERED slot', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue(
        buildSlot({ status: 'DELIVERED', recipeId: 'recipe-row-9' }),
      );

      await expect(
        service.stageDraft('CR202610220001', 'design-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeSlot', () => {
    it('removes an EDITING slot together with draft and series', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue({
        id: 'design-1',
        orderId: 'order-uuid',
        seriesId: 'series-1',
        designDraftId: 'draft-1',
        recipeId: null,
        status: 'EDITING',
      });
      prisma.orderRecipeDesign.delete.mockResolvedValue({});

      await service.removeSlot('CR202610220001', 'design-1', 'staff-1');

      expect(prisma.orderRecipeDesign.delete).toHaveBeenCalledWith({
        where: { id: 'design-1' },
      });
      expect(prisma.recipe.deleteMany).not.toHaveBeenCalled();
      expect(prisma.designRecipe.deleteMany).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
      });
      expect(prisma.recipeSeries.deleteMany).toHaveBeenCalledWith({
        where: { id: 'series-1' },
      });
      expect(prisma.customRecipeOrder.update).not.toHaveBeenCalled();
    });

    it('also cleans the staged private recipe for a READY slot', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue({
        id: 'design-1',
        orderId: 'order-uuid',
        seriesId: 'series-1',
        designDraftId: 'draft-1',
        recipeId: 'recipe-row-9',
        status: 'READY',
      });

      await service.removeSlot('CR202610220001', 'design-1', 'staff-1');

      expect(prisma.recipe.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'recipe-row-9',
          sourceDesignRecipeId: 'draft-1',
        },
      });
    });

    it('rejects removing a DELIVERED slot', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue({
        id: 'design-1',
        orderId: 'order-uuid',
        seriesId: 'series-1',
        designDraftId: 'draft-1',
        recipeId: 'recipe-row-9',
        status: 'DELIVERED',
      });

      await expect(
        service.removeSlot('CR202610220001', 'design-1', 'staff-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.orderRecipeDesign.delete).not.toHaveBeenCalled();
    });

    it('rejects removing a slot from another order', async () => {
      prisma.orderRecipeDesign.findUnique.mockResolvedValue({
        id: 'design-1',
        orderId: 'another-order',
        seriesId: 'series-1',
        designDraftId: 'draft-1',
        recipeId: null,
        status: 'EDITING',
      });

      await expect(
        service.removeSlot('CR202610220001', 'design-1', 'staff-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe('RecipeDesignerService · order-bound clone', () => {
  let service: RecipeDesignerService;

  const prisma = {
    designRecipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    designRecipeItem: {
      deleteMany: jest.fn(),
    },
    recipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    recipeSeries: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    nutritionFoodMapping: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const targetProvider = {
    getTargets: jest.fn(),
  };
  const searchGovernance = {
    expandQuery: jest.fn(),
    recordSearchEvent: jest.fn(),
  };
  const aiDesignSuggestion = {
    isAvailable: jest.fn(),
    generate: jest.fn(),
  };

  function buildSourceRecipe(overrides: AnyRow = {}): AnyRow {
    return {
      id: 'recipe-source',
      recipeId: 'REC0001',
      version: 3,
      name: '鸡肉南瓜',
      description: '鸡肉为主蛋白',
      status: 'PUBLIC',
      seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      nutritionStandard: 'FEDIAF_2025',
      targetHealthTags: ['SKIN'],
      items: [
        {
          id: 'ri-1',
          ingredientId: 'ing-1',
          nutritionFoodId: 'nf-1',
          exampleWeight: 400,
          ratioPercent: 40,
          preparationMethod: '蒸熟',
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          sortOrder: 0,
        },
        {
          id: 'ri-2',
          ingredientId: 'ing-2',
          nutritionFoodId: 'nf-2',
          exampleWeight: 250,
          ratioPercent: 25,
          preparationMethod: null,
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          sortOrder: 1,
        },
      ],
      ...overrides,
    };
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeDesignerService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'FediafTargetProvider', useValue: targetProvider },
        { provide: SearchGovernanceService, useValue: searchGovernance },
        { provide: AiDesignSuggestionService, useValue: aiDesignSuggestion },
      ],
    }).compile();

    service = moduleRef.get(RecipeDesignerService);
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    prisma.designRecipe.aggregate.mockResolvedValue({
      _max: { version: null },
    });
    prisma.designRecipe.create.mockImplementation(async ({ data }: any) => ({
      id: 'draft-new',
      ...data,
    }));
    prisma.recipeSeries.create.mockImplementation(async ({ data }: any) => ({
      id: 'series-new',
      ...data,
    }));
    prisma.recipe.findUnique.mockResolvedValue(buildSourceRecipe());
  });

  it('copies template items into a new ORDER series/draft and leaves the source untouched', async () => {
    const source = buildSourceRecipe();
    const sourceSnapshot = JSON.parse(JSON.stringify(source));
    prisma.recipe.findUnique.mockResolvedValue(source);

    const result = await service.createOrderBoundSeriesDesign({
      customOrderId: 'order-uuid',
      dogId: 'dog-1',
      dogName: 'Foxy',
      orderQuantity: 2,
      createdBy: 'staff-1',
      sourceRecipeId: 'recipe-source',
    });

    expect(result).toEqual({
      seriesId: 'series-new',
      draftId: 'draft-new',
      name: 'Foxy定制 · 鸡肉南瓜',
      sourceRecipeId: 'recipe-source',
      sourceRecipeVersion: 3,
      sourceKind: 'CATALOG',
    });

    // 系列上下文：订单绑定 + 参考爱犬/顾客狗狗都锁定为订单狗狗
    expect(prisma.recipeSeries.create).toHaveBeenCalledWith({
      data: {
        name: 'Foxy定制 · 鸡肉南瓜',
        status: 'ACTIVE',
        createdBy: 'staff-1',
        designMode: 'ORDER',
        orderId: 'order-uuid',
        orderQuantity: 2,
        customerDogId: 'dog-1',
        referenceDogId: 'dog-1',
      },
    });

    // 草稿内容：原料、比例、用量、制备方式逐项复制
    const designCreate = prisma.designRecipe.create.mock.calls[0][0];
    expect(designCreate.data).toEqual(
      expect.objectContaining({
        name: 'Foxy定制 · 鸡肉南瓜',
        version: 1,
        status: 'DRAFT',
        fediafDogScenario: 'ADULT_MER_110',
        nutritionStandard: 'FEDIAF_2025',
        targetHealthTags: ['SKIN'],
        applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
        notes: '鸡肉为主蛋白',
        createdBy: 'staff-1',
        seriesId: 'series-new',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        customerDogId: 'dog-1',
        totalWeightG: 650,
      }),
    );
    expect(designCreate.data.items.create).toEqual([
      {
        ingredientId: 'ing-1',
        nutritionFoodId: 'nf-1',
        weightG: 400,
        includeInAssessment: true,
        ratioPercent: 40,
        preparationMethod: '蒸熟',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 0,
      },
      {
        ingredientId: 'ing-2',
        nutritionFoodId: 'nf-2',
        weightG: 250,
        includeInAssessment: true,
        ratioPercent: 25,
        preparationMethod: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        sortOrder: 1,
      },
    ]);

    // 原食谱不变：没有 update / delete，对象本身也没有被改写
    expect(prisma.recipe.update).not.toHaveBeenCalled();
    expect(prisma.recipe.findFirst).not.toHaveBeenCalled();
    expect(source).toEqual(sourceSnapshot);
  });

  it('copies a PRIVATE_CUSTOM template and records CUSTOM as source kind', async () => {
    prisma.recipe.findUnique.mockResolvedValue(
      buildSourceRecipe({ status: 'PRIVATE_CUSTOM' }),
    );

    const result = await service.createOrderBoundSeriesDesign({
      customOrderId: 'order-uuid',
      dogId: 'dog-1',
      dogName: 'Foxy',
      orderQuantity: 1,
      createdBy: 'staff-1',
      sourceRecipeId: 'recipe-source',
    });

    expect(result.sourceKind).toBe('CUSTOM');
  });

  it('falls back to the order dog life stage when the template has no stage', async () => {
    prisma.recipe.findUnique.mockResolvedValue(
      buildSourceRecipe({
        seriesLifeStage: null,
        applicableLifeStages: [],
      }),
    );

    await service.createOrderBoundSeriesDesign({
      customOrderId: 'order-uuid',
      dogId: 'dog-1',
      dogName: 'Foxy',
      orderQuantity: 2,
      createdBy: 'staff-1',
      sourceRecipeId: 'recipe-source',
      defaultLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
    });

    const designCreate = prisma.designRecipe.create.mock.calls[0][0];
    expect(designCreate.data.seriesLifeStage).toBe(
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
    );
    expect(designCreate.data.applicableLifeStages).toEqual([
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
    ]);
  });

  it('creates an empty ORDER draft for a blank slot', async () => {
    const result = await service.createOrderBoundSeriesDesign({
      customOrderId: 'order-uuid',
      dogId: 'dog-1',
      dogName: 'Foxy',
      orderQuantity: 1,
      createdBy: 'staff-1',
      defaultLifeStage: 'HIGH_ACTIVITY_ADULT',
    });

    expect(result.sourceRecipeId).toBeNull();
    expect(result.sourceRecipeVersion).toBeNull();
    expect(result.sourceKind).toBeNull();
    expect(prisma.recipe.findUnique).not.toHaveBeenCalled();

    const designCreate = prisma.designRecipe.create.mock.calls[0][0];
    expect(designCreate.data).toEqual(
      expect.objectContaining({
        name: 'Foxy定制 · 新食谱',
        status: 'DRAFT',
        customerDogId: 'dog-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      }),
    );
    expect(designCreate.data.items).toBeUndefined();
  });

  it('rejects recipes that are not PUBLIC or PRIVATE_CUSTOM', async () => {
    prisma.recipe.findUnique.mockResolvedValue(
      buildSourceRecipe({ status: 'DRAFT' }),
    );

    await expect(
      service.createOrderBoundSeriesDesign({
        customOrderId: 'order-uuid',
        dogId: 'dog-1',
        dogName: 'Foxy',
        orderQuantity: 1,
        createdBy: 'staff-1',
        sourceRecipeId: 'recipe-source',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.designRecipe.create).not.toHaveBeenCalled();
  });

  it('locks the reference dog of an ORDER-bound series', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'staff-1' },
      { id: 'staff-2' },
      { id: 'admin-1' },
    ]);
    prisma.recipeSeries.findUnique.mockResolvedValue({
      id: 'series-1',
      createdBy: 'staff-1',
      designMode: 'ORDER',
    });

    await expect(
      service.setSeriesReferenceDog('series-1', 'dog-2', {
        userId: 'staff-1',
        role: 'STAFF',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
  });
});

describe('RecipeDesignerService · publishOrderDesignSlot', () => {
  let service: RecipeDesignerService;

  const prisma = {
    designRecipe: {
      findUnique: jest.fn(),
    },
    recipe: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const targetProvider = { getTargets: jest.fn() };
  const searchGovernance = {
    expandQuery: jest.fn(),
    recordSearchEvent: jest.fn(),
  };
  const aiDesignSuggestion = {
    isAvailable: jest.fn(),
    generate: jest.fn(),
  };

  function buildDraft(overrides: AnyRow = {}): AnyRow {
    return {
      id: 'draft-1',
      name: 'Foxy定制 · 鸡肉南瓜',
      version: 1,
      contentRevision: 0,
      status: 'DRAFT',
      fediafDogScenario: 'ADULT_MER_110',
      nutritionStandard: 'FEDIAF_2025',
      energyDensityKcalPerKg: 1200,
      totalWeightG: 1000,
      targetHealthTags: [],
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      notes: null,
      createdBy: 'staff-1',
      publishedAt: null,
      publishedRecipeId: null,
      publishedRecipeVersion: null,
      revisionOfDesignRecipeId: null,
      revisionBaseRecipeId: null,
      customerDogId: 'dog-1',
      seriesId: 'series-1',
      seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      series: {
        id: 'series-1',
        name: 'Foxy定制 · 鸡肉南瓜',
        referenceDogId: 'dog-1',
      },
      isCompliant: true,
      reviewStatus: 'NONE',
      reviewNote: null,
      calculatedNutrition: {},
      complianceStatus: {},
      assessmentSummary: { overallStatus: 'COMPLIANT' },
      missingDataReport: [],
      items: [
        {
          id: 'item-1',
          ingredientId: 'ing-1',
          nutritionFoodId: 'nf-1',
          weightG: 1000,
          includeInAssessment: true,
          ratioPercent: 100,
          preparationMethod: '蒸熟',
          nutrientTargetKey: null,
          nutrientTargetValue: null,
          sortOrder: 0,
          ingredient: { id: 'ing-1', name: '鸡胸肉', type: 'FOOD' },
          nutritionFood: {
            id: 'nf-1',
            name: '鸡胸肉',
            nutritionData: {},
            mappings: [],
          },
        },
      ],
      ...overrides,
    };
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeDesignerService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'FediafTargetProvider', useValue: targetProvider },
        { provide: SearchGovernanceService, useValue: searchGovernance },
        { provide: AiDesignSuggestionService, useValue: aiDesignSuggestion },
      ],
    }).compile();

    service = moduleRef.get(RecipeDesignerService);
    jest.clearAllMocks();

    prisma.designRecipe.findUnique.mockResolvedValue(buildDraft());
    prisma.recipe.findFirst.mockResolvedValue(null);
    prisma.recipe.create.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'draft-1',
      version: 1,
    });
  });

  it('creates a PRIVATE_CUSTOM recipe for the order customer without attaching customOrderId', async () => {
    const result = await service.publishOrderDesignSlot({
      draftId: 'draft-1',
      customerId: 'customer-1',
      dogId: 'dog-1',
      operatorId: 'admin-1',
    });

    expect(result).toEqual({
      recipeRowId: 'recipe-row-1',
      recipeId: 'draft-1',
    });

    const createCall = prisma.recipe.create.mock.calls[0][0];
    expect(createCall.data).toEqual(
      expect.objectContaining({
        recipeId: 'draft-1',
        version: 1,
        name: 'Foxy定制 · 鸡肉南瓜',
        status: 'PRIVATE_CUSTOM',
        isCustomRecipe: true,
        customerOwnerId: 'customer-1',
        customerDogId: 'dog-1',
        sourceDesignRecipeId: 'draft-1',
        seriesId: 'series-1',
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      }),
    );
    // 一张订单有 N 份：加入待提交时绝不能把食谱挂到 customOrderId 上
    expect(createCall.data.customOrderId).toBeUndefined();
    expect(createCall.data.items.create).toEqual([
      expect.objectContaining({
        ingredientId: 'ing-1',
        nutritionFoodId: 'nf-1',
        exampleWeight: 1000,
        ratioPercent: 100,
        preparationMethod: '蒸熟',
        sortOrder: 0,
      }),
    ]);
    // 不交付、不通知（本服务没有交付/通知依赖）
    expect(prisma.recipe.update).not.toHaveBeenCalled();
  });

  it('updates the existing snapshot instead of creating a duplicate version', async () => {
    prisma.recipe.findFirst.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'draft-1',
      version: 1,
    });
    prisma.recipe.update.mockResolvedValue({
      id: 'recipe-row-1',
      recipeId: 'draft-1',
      version: 1,
    });

    const result = await service.publishOrderDesignSlot({
      draftId: 'draft-1',
      customerId: 'customer-1',
      dogId: 'dog-1',
      operatorId: 'admin-1',
    });

    expect(result.recipeRowId).toBe('recipe-row-1');
    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.recipe.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'recipe-row-1' } }),
    );
  });

  it('refuses a draft bound to another dog', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      buildDraft({ customerDogId: 'dog-other' }),
    );

    await expect(
      service.publishOrderDesignSlot({
        draftId: 'draft-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        operatorId: 'admin-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  it('refuses a draft without usable items (not ready to stage)', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      buildDraft({ totalWeightG: 0, items: [] }),
    );

    await expect(
      service.publishOrderDesignSlot({
        draftId: 'draft-1',
        customerId: 'customer-1',
        dogId: 'dog-1',
        operatorId: 'admin-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });
});
