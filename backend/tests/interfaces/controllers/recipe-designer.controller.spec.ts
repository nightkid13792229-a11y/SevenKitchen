import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SupplementLabelExtractionService } from '../../../src/application/recipe-designer/supplement-label-extraction.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { AuthGuard, JwtAuthService } from '../../../src/interfaces/auth';
import { RecipeDesignerController } from '../../../src/interfaces/controllers/recipe-designer.controller';
import { StaffGuard } from '../../../src/interfaces/guards/role.guard';

describe('RecipeDesignerController authorization', () => {
  it('requires authentication at class level while leaving staff restrictions to selected methods', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      RecipeDesignerController,
    );

    expect(guards).toEqual([AuthGuard]);
  });

  it('keeps supplement maintenance and revision routes staff-only', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(
      /@Post\('supplement-options'\)\s+@UseGuards\(StaffGuard\)/,
    );
    const supplementLabelRoute = source.match(
      /@Post\('supplement-label\/extract'\)([\s\S]*?)async extractSupplementLabel/,
    );
    expect(supplementLabelRoute).not.toBeNull();

    const supplementLabelDecoratorBlock = supplementLabelRoute?.[1] ?? '';
    const supplementLabelGuardIndex =
      supplementLabelDecoratorBlock.indexOf('@UseGuards(StaffGuard)');
    const supplementLabelInterceptorIndex =
      supplementLabelDecoratorBlock.indexOf('@UseInterceptors(');

    expect(supplementLabelDecoratorBlock).toContain('@UseGuards(StaffGuard)');
    expect(supplementLabelInterceptorIndex).toBeGreaterThanOrEqual(0);
    expect(supplementLabelGuardIndex).toBeLessThan(
      supplementLabelInterceptorIndex,
    );
    expect(source).toMatch(
      /@Post\('drafts\/:id\/revisions'\)\s+@UseGuards\(StaffGuard\)/,
    );
  });

  it('keeps publishing protected by StaffGuard plus admin role metadata', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(
      /@Post\('drafts\/:id\/publish'\)\s+@UseGuards\(StaffGuard\)\s+@Roles\('ADMIN'\)/,
    );
  });

  it('exposes a draft detail route for editor pages opened by id', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(/@Get\('drafts\/:id'\)/);
  });

  it('accepts a source draft id when creating a stage draft from a published template', () => {
    const dtoSource = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/dto/recipe-designer/recipe-designer.dto.ts',
      ),
      'utf8',
    );

    expect(dtoSource).toContain('sourceDraftId?: string');
  });
});

describe('RecipeDesignerController', () => {
  let controller: RecipeDesignerController;

  const service = {
    listIngredientOptions: jest.fn(),
    listDrafts: jest.fn(),
    getDraft: jest.fn(),
    createDraft: jest.fn(),
    listSeries: jest.fn(),
    createSeries: jest.fn(),
    renameSeries: jest.fn(),
    deleteSeries: jest.fn(),
    createSeriesStageDraft: jest.fn(),
    updateDraft: jest.fn(),
    deleteDraft: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    assessDraft: jest.fn(),
    publishDraft: jest.fn(),
    createRevisionDraft: jest.fn(),
    createSupplementOption: jest.fn(),
  };
  const cosService = {
    uploadImage: jest.fn(),
  };
  const supplementLabelExtractionService = {
    extractFromImage: jest.fn(),
  };

  const currentUser = {
    userId: 'staff-1',
    customerId: 'staff-1',
    role: 'STAFF',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RecipeDesignerController],
      providers: [
        { provide: RecipeDesignerService, useValue: service },
        { provide: TencentCosService, useValue: cosService },
        {
          provide: SupplementLabelExtractionService,
          useValue: supplementLabelExtractionService,
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

  it('delegates draft CRUD with CurrentUser ids', async () => {
    service.listDrafts.mockResolvedValue([{ id: 'design-1' }]);
    service.getDraft.mockResolvedValue({ id: 'design-1' });
    service.createDraft.mockResolvedValue({ id: 'design-2' });
    service.updateDraft.mockResolvedValue({ id: 'design-1', name: 'new' });
    service.deleteDraft.mockResolvedValue({ id: 'design-1' });

    await expect(controller.listDrafts(currentUser)).resolves.toEqual(
      expect.objectContaining({ code: 0, data: [{ id: 'design-1' }] }),
    );
    await expect(
      (controller as any).getDraft('design-1', currentUser),
    ).resolves.toEqual(
      expect.objectContaining({ code: 0, data: { id: 'design-1' } }),
    );
    await expect(
      controller.createDraft(
        { name: 'new', scenario: 'ADULT_MER_110' },
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.updateDraft('design-1', { name: 'new' }, currentUser),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.deleteDraft('design-1', currentUser),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));

    expect(service.listDrafts).toHaveBeenCalledWith({
      userId: 'staff-1',
      role: 'STAFF',
    });
    expect(service.getDraft).toHaveBeenCalledWith('design-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });
    expect(service.createDraft).toHaveBeenCalledWith(
      { name: 'new', scenario: 'ADULT_MER_110' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.updateDraft).toHaveBeenCalledWith(
      'design-1',
      { name: 'new' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.deleteDraft).toHaveBeenCalledWith('design-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });
  });

  it('delegates series workbench endpoints with CurrentUser ids', async () => {
    service.listSeries.mockResolvedValue([{ id: 'series-1' }]);
    service.createSeries.mockResolvedValue({ id: 'series-2' });
    service.renameSeries.mockResolvedValue({ id: 'series-1', name: '新名字' });
    service.deleteSeries.mockResolvedValue({ id: 'series-1', status: 'DELETED' });
    service.createSeriesStageDraft.mockResolvedValue({ id: 'design-1' });

    await expect(controller.listSeries(currentUser)).resolves.toEqual(
      expect.objectContaining({ code: 0, data: [{ id: 'series-1' }] }),
    );
    await expect(
      controller.createSeries(
        { name: '牛肉南瓜鲜食', scenario: 'ADULT_MER_110' },
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.renameSeries('series-1', { name: '新名字' }, currentUser),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.deleteSeries(
        'series-1',
        {
          confirmName: '新名字',
          confirmUserVisibleRemoval: true,
        },
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.createSeriesStageDraft(
        'series-1',
        { scenario: 'ADULT_MER_95' },
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));

    expect(service.listSeries).toHaveBeenCalledWith({
      userId: 'staff-1',
      role: 'STAFF',
    });
    expect(service.createSeries).toHaveBeenCalledWith(
      { name: '牛肉南瓜鲜食', scenario: 'ADULT_MER_110' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.renameSeries).toHaveBeenCalledWith(
      'series-1',
      { name: '新名字' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.deleteSeries).toHaveBeenCalledWith(
      'series-1',
      {
        confirmName: '新名字',
        confirmUserVisibleRemoval: true,
      },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.createSeriesStageDraft).toHaveBeenCalledWith(
      'series-1',
      { scenario: 'ADULT_MER_95' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
  });

  it('delegates published recipe revision creation with CurrentUser ids', async () => {
    service.createRevisionDraft.mockResolvedValue({
      id: 'design-revision',
      status: 'DRAFT',
      revisionBaseRecipeId: 'recipe-series-1',
    });

    await expect(
      controller.createRevisionDraft('design-published', currentUser),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          id: 'design-revision',
          revisionBaseRecipeId: 'recipe-series-1',
        }),
      }),
    );

    expect(service.createRevisionDraft).toHaveBeenCalledWith(
      'design-published',
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
  });

  it('delegates ingredient option listing for the mobile picker', async () => {
    service.listIngredientOptions.mockResolvedValue({
      data: [{ id: 'ingredient-1', defaultNutritionFoodId: 'food-1' }],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    await expect(
      controller.listIngredientOptions({
        search: 'mussel',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          data: [{ id: 'ingredient-1', defaultNutritionFoodId: 'food-1' }],
        }),
      }),
    );

    expect(service.listIngredientOptions).toHaveBeenCalledWith({
      search: 'mussel',
      page: 1,
      pageSize: 20,
    });
  });

  it('delegates supplement option creation with CurrentUser ids', async () => {
    service.createSupplementOption.mockResolvedValue({
      id: 'ingredient-calcium',
      defaultNutritionFoodId: 'food-calcium',
    });

    await expect(
      controller.createSupplementOption(
        {
          name: '柠檬酸钙',
          basisType: 'PER_1_G',
          nutrients: { 'minerals.calcium': 210 },
        } as any,
        currentUser,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: {
          id: 'ingredient-calcium',
          defaultNutritionFoodId: 'food-calcium',
        },
      }),
    );

    expect(service.createSupplementOption).toHaveBeenCalledWith(
      {
        name: '柠檬酸钙',
        basisType: 'PER_1_G',
        nutrients: { 'minerals.calcium': 210 },
      },
      'staff-1',
    );
  });

  it('uploads a supplement label image and returns an OCR plus DeepSeek draft', async () => {
    const file = {
      originalname: 'label.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('image'),
      size: 123,
    } as Express.Multer.File;
    cosService.uploadImage.mockResolvedValue({
      url: 'https://cdn.example.com/supplement-labels/label.jpg',
      key: 'recipe-designer-supplement-labels/label.jpg',
    });
    supplementLabelExtractionService.extractFromImage.mockResolvedValue({
      ingredientName: '柠檬酸钙',
      profileName: '柠檬酸钙 包装识别档案',
      usageUnit: '粒',
      basisType: 'PER_SERVING',
      nutrients: { 'minerals.calcium': 200 },
      ocrText: '每粒含钙 200mg',
      warnings: [],
      confidence: 'HIGH',
    });

    await expect(
      controller.extractSupplementLabel(file, currentUser),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          ingredientName: '柠檬酸钙',
          imageUrl: 'https://cdn.example.com/supplement-labels/label.jpg',
          imageKey: 'recipe-designer-supplement-labels/label.jpg',
          ocrText: '每粒含钙 200mg',
        }),
      }),
    );

    expect(cosService.uploadImage).toHaveBeenCalledWith(
      file,
      'label.jpg',
      'recipe-designer-supplement-labels',
    );
    expect(supplementLabelExtractionService.extractFromImage).toHaveBeenCalledWith(
      {
        imageUrl: 'https://cdn.example.com/supplement-labels/label.jpg',
        originalFilename: 'label.jpg',
        requestedBy: 'staff-1',
      },
    );
  });

  it('accepts WeChat image uploads that arrive as octet-stream with an image filename', async () => {
    const file = {
      originalname: 'wx-temp-label.jpg',
      mimetype: 'application/octet-stream',
      buffer: Buffer.from('image'),
      size: 123,
    } as Express.Multer.File;
    cosService.uploadImage.mockResolvedValue({
      url: 'https://cdn.example.com/supplement-labels/wx-temp-label.jpg',
      key: 'recipe-designer-supplement-labels/wx-temp-label.jpg',
    });
    supplementLabelExtractionService.extractFromImage.mockResolvedValue({
      ingredientName: '鱼油',
      profileName: '鱼油 包装识别档案',
      usageUnit: '粒',
      basisType: 'PER_SERVING',
      nutrients: { 'fattyAcids.epa': 180 },
      ocrText: '每粒 EPA 180mg',
      warnings: [],
      confidence: 'HIGH',
    });

    await expect(
      controller.extractSupplementLabel(file, currentUser),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          ingredientName: '鱼油',
          imageUrl: 'https://cdn.example.com/supplement-labels/wx-temp-label.jpg',
        }),
      }),
    );
  });

  it('delegates item mutations, assessment, and publish with CurrentUser ids', async () => {
    service.addItem.mockResolvedValue({ id: 'item-1' });
    service.updateItem.mockResolvedValue({ id: 'item-1', weightG: 120 });
    service.removeItem.mockResolvedValue({ id: 'item-1' });
    service.assessDraft.mockResolvedValue({ overallStatus: 'COMPLIANT' });
    service.publishDraft.mockResolvedValue({ status: 'PUBLISHED' });

    await controller.addItem(
      'design-1',
      {
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-1',
        weightG: 100,
      } as any,
      currentUser,
    );
    await controller.updateItem('item-1', { weightG: 120 }, currentUser);
    await controller.removeItem('item-1', currentUser);
    await controller.assessDraft('design-1');
    await controller.publishDraft(
      'design-1',
      { reviewNote: 'ok' },
      currentUser,
    );

    expect(service.addItem).toHaveBeenCalledWith(
      'design-1',
      {
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-1',
        weightG: 100,
      },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.updateItem).toHaveBeenCalledWith(
      'item-1',
      { weightG: 120 },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.removeItem).toHaveBeenCalledWith('item-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });
    expect(service.assessDraft).toHaveBeenCalledWith('design-1');
    expect(service.publishDraft).toHaveBeenCalledWith(
      'design-1',
      { reviewNote: 'ok' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
  });
});
