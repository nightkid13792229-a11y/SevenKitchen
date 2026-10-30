import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validate } from 'class-validator';
import { OrderRecipeDesignService } from '../../src/application/recipe-designer/order-recipe-design.service';
import { OrderRecipeTemplateService } from '../../src/application/recipe-designer/order-recipe-template.service';
import { RecipeDesignerService } from '../../src/application/recipe-designer/recipe-designer.service';
import { SupplementLabelExtractionService } from '../../src/application/recipe-designer/supplement-label-extraction.service';
import { TencentCosService } from '../../src/infrastructure/services/tencent-cos.service';
import { AuthGuard, JwtAuthService } from '../../src/interfaces/auth';
import { RecipeDesignerController } from '../../src/interfaces/controllers/recipe-designer.controller';
import {
  CreateOrderDesignFromTemplateDto,
  SwitchOrderDesignStageDto,
} from '../../src/interfaces/dto/recipe-designer/recipe-designer.dto';
import {
  ROLES_KEY,
  StaffGuard,
} from '../../src/interfaces/guards/role.guard';

const CONTROLLER_SOURCE = resolve(
  process.cwd(),
  'src/interfaces/controllers/recipe-designer.controller.ts',
);

function controllerSource(): string {
  return readFileSync(CONTROLLER_SOURCE, 'utf8');
}

describe('Order recipe design routes', () => {
  it('keeps the workspace and drafting routes behind StaffGuard', () => {
    const source = controllerSource();

    expect(source).toMatch(
      /@Get\('orders\/:orderId\/workspace'\)\s+@UseGuards\(StaffGuard\)/,
    );
    expect(source).toMatch(
      /@Post\('orders\/:orderId\/designs\/from-template'\)\s+@UseGuards\(StaffGuard\)/,
    );
    expect(source).toMatch(
      /@Post\('orders\/:orderId\/designs\/blank'\)\s+@UseGuards\(StaffGuard\)/,
    );
    expect(source).toMatch(
      /@Delete\('orders\/:orderId\/designs\/:designId'\)\s+@UseGuards\(StaffGuard\)/,
    );
  });

  it('keeps staging behind StaffGuard plus admin role metadata (publish governance)', () => {
    const source = controllerSource();

    expect(source).toMatch(
      /@Post\('orders\/:orderId\/designs\/:designId\/ready'\)\s+@UseGuards\(StaffGuard\)\s+@Roles\('ADMIN'\)/,
    );
    expect(source).not.toMatch(
      /@Post\('orders\/:orderId\/designs\/:designId\/ready'\)[\s\S]{0,80}@UseGuards\(AuthGuard\)/,
    );
  });

  it('exposes the stage switch behind StaffGuard (same permission level as editing)', () => {
    const source = controllerSource();

    expect(source).toMatch(
      /@Patch\('orders\/:orderId\/designs\/:designId\/stage'\)\s+@UseGuards\(StaffGuard\)/,
    );
    // 换阶段只改这份草稿，不涉及上架 / 交付，不额外要求管理员
    expect(source).not.toMatch(
      /@Patch\('orders\/:orderId\/designs\/:designId\/stage'\)[\s\S]{0,80}@Roles\('ADMIN'\)/,
    );
  });

  it('keeps the controller class authenticated by AuthGuard only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, RecipeDesignerController)).toEqual(
      [AuthGuard],
    );
  });

  it('requires sourceRecipeId and accepts an optional name', async () => {
    const invalid = new CreateOrderDesignFromTemplateDto();
    await expect(validate(invalid)).resolves.toEqual([
      expect.objectContaining({ property: 'sourceRecipeId' }),
    ]);

    const valid = new CreateOrderDesignFromTemplateDto();
    valid.sourceRecipeId = 'recipe-1';
    valid.name = '低脂鸡肉版';
    await expect(validate(valid)).resolves.toEqual([]);
  });

  it('validates the stage switch payload against the designer scenarios', async () => {
    const missing = new SwitchOrderDesignStageDto();
    await expect(validate(missing)).resolves.toEqual([
      expect.objectContaining({ property: 'scenario' }),
    ]);

    const unknown = new SwitchOrderDesignStageDto();
    unknown.scenario = 'SENIOR_ONLY' as any;
    await expect(validate(unknown)).resolves.not.toEqual([]);

    const valid = new SwitchOrderDesignStageDto();
    valid.scenario = 'ADULT_MER_110';
    await expect(validate(valid)).resolves.toEqual([]);
  });
});

describe('RecipeDesignerController · order design delegation', () => {
  let controller: RecipeDesignerController;

  const recipeDesignerService = {
    listIngredientOptions: jest.fn(),
    listDrafts: jest.fn(),
    getDraft: jest.fn(),
    createDraft: jest.fn(),
    listSeries: jest.fn(),
    createSeries: jest.fn(),
    duplicateSeries: jest.fn(),
    renameSeries: jest.fn(),
    deleteSeries: jest.fn(),
    createSeriesStageDraft: jest.fn(),
    duplicateSeriesStage: jest.fn(),
    copySeriesStageIngredients: jest.fn(),
    updateDraft: jest.fn(),
    deleteDraft: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    reorderItems: jest.fn(),
    updateItemOrder: jest.fn(),
    removeItem: jest.fn(),
    assessDraft: jest.fn(),
    publishDraft: jest.fn(),
    createRevisionDraft: jest.fn(),
    createSupplementOption: jest.fn(),
    createPrivateRecipeSnapshot: jest.fn(),
  };
  const cosService = { uploadImage: jest.fn() };
  const supplementLabelExtractionService = { extractFromImage: jest.fn() };
  const orderRecipeTemplateService = {
    searchTemplates: jest.fn(),
    compareOrderTemplateStage: jest.fn(),
  };
  const orderRecipeDesignService = {
    getWorkspace: jest.fn(),
    createFromTemplate: jest.fn(),
    createBlank: jest.fn(),
    stageDraft: jest.fn(),
    removeSlot: jest.fn(),
    switchStage: jest.fn(),
  };

  const staffUser = {
    userId: 'staff-1',
    customerId: 'staff-1',
    role: 'STAFF',
  };
  const adminUser = {
    userId: 'admin-1',
    customerId: 'admin-1',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RecipeDesignerController],
      providers: [
        { provide: RecipeDesignerService, useValue: recipeDesignerService },
        { provide: TencentCosService, useValue: cosService },
        {
          provide: SupplementLabelExtractionService,
          useValue: supplementLabelExtractionService,
        },
        {
          provide: OrderRecipeTemplateService,
          useValue: orderRecipeTemplateService,
        },
        {
          provide: OrderRecipeDesignService,
          useValue: orderRecipeDesignService,
        },
        {
          provide: AuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: StaffGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: JwtAuthService,
          useValue: { validateToken: jest.fn() },
        },
      ],
    }).compile();

    controller = moduleRef.get(RecipeDesignerController);
    jest.clearAllMocks();
  });

  it('delegates the workspace read', async () => {
    const workspace = {
      orderId: 'CR202610220001',
      dogId: 'dog-1',
      dogName: 'Foxy',
      quantity: 2,
      readyCount: 0,
      slots: [],
    };
    orderRecipeDesignService.getWorkspace.mockResolvedValue(workspace);

    await expect(
      controller.getOrderDesignWorkspace('CR202610220001'),
    ).resolves.toEqual({ code: 0, data: workspace, message: 'Success' });
    expect(orderRecipeDesignService.getWorkspace).toHaveBeenCalledWith(
      'CR202610220001',
    );
  });

  it('delegates template creation with the current operator id', async () => {
    const result = {
      seriesId: 'series-1',
      draftId: 'draft-1',
      stageWarning: '阶段不一致',
    };
    orderRecipeDesignService.createFromTemplate.mockResolvedValue(result);

    await expect(
      controller.createOrderDesignFromTemplate(
        'CR202610220001',
        { sourceRecipeId: 'recipe-1', name: '低脂版' },
        staffUser,
      ),
    ).resolves.toEqual({ code: 0, data: result, message: 'Success' });
    expect(orderRecipeDesignService.createFromTemplate).toHaveBeenCalledWith(
      'CR202610220001',
      { sourceRecipeId: 'recipe-1', name: '低脂版' },
      'staff-1',
    );
  });

  it('delegates blank creation with the current operator id', async () => {
    orderRecipeDesignService.createBlank.mockResolvedValue({
      seriesId: 'series-1',
      draftId: 'draft-1',
    });

    await expect(
      controller.createBlankOrderDesign('CR202610220001', staffUser),
    ).resolves.toEqual({
      code: 0,
      data: { seriesId: 'series-1', draftId: 'draft-1' },
      message: 'Success',
    });
    expect(orderRecipeDesignService.createBlank).toHaveBeenCalledWith(
      'CR202610220001',
      'staff-1',
    );
  });

  it('delegates the stage switch with order, design and operator context', async () => {
    const result = {
      designId: 'design-1',
      draftId: 'draft-1',
      status: 'EDITING',
      scenario: 'ADULT_MER_110',
      lifeStage: 'HIGH_ACTIVITY_ADULT',
      stageWarning: null,
    };
    orderRecipeDesignService.switchStage.mockResolvedValue(result);

    await expect(
      controller.switchOrderDesignStage(
        'CR202610220001',
        'design-1',
        { scenario: 'ADULT_MER_110' },
        staffUser,
      ),
    ).resolves.toEqual({ code: 0, data: result, message: 'Success' });

    expect(orderRecipeDesignService.switchStage).toHaveBeenCalledWith({
      orderId: 'CR202610220001',
      designId: 'design-1',
      scenario: 'ADULT_MER_110',
      access: { userId: 'staff-1', role: 'STAFF' },
    });
  });

  it('delegates staging (admin route) with the current operator id', async () => {
    orderRecipeDesignService.stageDraft.mockResolvedValue({
      status: 'READY',
      recipeId: 'recipe-row-1',
      readyCount: 1,
    });

    await expect(
      controller.stageOrderDesign('CR202610220001', 'design-1', adminUser),
    ).resolves.toEqual({
      code: 0,
      data: { status: 'READY', recipeId: 'recipe-row-1', readyCount: 1 },
      message: 'Success',
    });
    expect(orderRecipeDesignService.stageDraft).toHaveBeenCalledWith(
      'CR202610220001',
      'design-1',
      'admin-1',
    );
  });

  it('exposes admin-only role metadata on the staging handler', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        RecipeDesignerController.prototype.stageOrderDesign,
      ),
    ).toEqual(['ADMIN']);
    // 员工可以继续编辑，但移除槽位不属于最终交付治理
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        RecipeDesignerController.prototype.removeOrderDesign,
      ),
    ).toBeUndefined();
  });

  it('delegates slot removal', async () => {
    orderRecipeDesignService.removeSlot.mockResolvedValue(undefined);

    await expect(
      controller.removeOrderDesign('CR202610220001', 'design-1', staffUser),
    ).resolves.toEqual({ code: 0, data: null, message: 'Success' });
    expect(orderRecipeDesignService.removeSlot).toHaveBeenCalledWith(
      'CR202610220001',
      'design-1',
      'staff-1',
    );
  });
});
