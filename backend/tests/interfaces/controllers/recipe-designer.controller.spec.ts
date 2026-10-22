import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { OrderRecipeDesignService } from '../../../src/application/recipe-designer/order-recipe-design.service';
import { OrderRecipeTemplateService } from '../../../src/application/recipe-designer/order-recipe-template.service';
import { SupplementLabelExtractionService } from '../../../src/application/recipe-designer/supplement-label-extraction.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { AuthGuard, JwtAuthService } from '../../../src/interfaces/auth';
import { RecipeDesignerController } from '../../../src/interfaces/controllers/recipe-designer.controller';
import {
  UpdateRecipeDesignItemOrderDto,
  UpdateRecipeDesignPresentationDto,
  UpdateRecipeSeriesReleaseSettingsDto,
  ListRecipeTemplatesDto,
} from '../../../src/interfaces/dto/recipe-designer/recipe-designer.dto';
import { StaffGuard } from '../../../src/interfaces/guards/role.guard';

describe('RecipeDesignerController authorization', () => {
  it('requires authentication at class level while leaving staff restrictions to selected methods', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      RecipeDesignerController,
    );

    expect(guards).toEqual([AuthGuard]);
  });

  it('keeps order template search and stage comparison staff-only', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(
      /@Get\('recipe-templates'\)\s+@UseGuards\(StaffGuard\)/,
    );
    expect(source).toMatch(
      /@Get\('orders\/:orderId\/design-template-stage'\)\s+@UseGuards\(StaffGuard\)/,
    );
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
    const supplementLabelGuardIndex = supplementLabelDecoratorBlock.indexOf(
      '@UseGuards(StaffGuard)',
    );
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

  it('exposes the shared launch readiness preview route', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(/@Get\('drafts\/:id\/launch-readiness'\)/);
  });

  it('exposes the product presentation patch route', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(/@Patch\('drafts\/:id\/presentation'\)/);
  });

  it('validates presentation patch limits and detail image arrays', async () => {
    const valid = new UpdateRecipeDesignPresentationDto();
    valid.coverTitle = '鸡'.repeat(20);
    valid.sellingPoint = '卖'.repeat(200);
    valid.description = '详'.repeat(4000);
    valid.detailImages = ['https://img.example.com/1.jpg'];
    valid.videoUrl = 'https://video.example.com/a.mp4';
    await expect(validate(valid)).resolves.toEqual([]);

    const tooLong = new UpdateRecipeDesignPresentationDto();
    tooLong.coverTitle = '鸡'.repeat(21);
    tooLong.sellingPoint = '卖'.repeat(201);
    tooLong.description = '详'.repeat(4001);
    (tooLong as any).detailImages = ['ok', 123];

    const errors = await validate(tooLong);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'coverTitle',
        'sellingPoint',
        'description',
        'detailImages',
      ]),
    );

    const nulls = new UpdateRecipeDesignPresentationDto();
    nulls.coverTitle = null;
    nulls.detailImages = null;
    await expect(validate(nulls)).resolves.toEqual([]);
  });

  it('exposes staged series release routes with the designer access/admin patterns', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    // 就绪度预览与草稿预览一致：登录即可，服务层按系列权限返回 404
    expect(source).toMatch(/@Get\('series\/:seriesId\/release-readiness'\)/);
    const readinessRoute = source.match(
      /@Get\('series\/:seriesId\/release-readiness'\)([\s\S]*?)async getSeriesReleaseReadiness/,
    );
    expect(readinessRoute).not.toBeNull();
    expect(readinessRoute?.[1] ?? '').not.toContain('@UseGuards(StaffGuard)');

    expect(source).toMatch(
      /@Patch\('series\/:seriesId\/release-settings'\)\s+@UseGuards\(StaffGuard\)/,
    );
    expect(source).toMatch(
      /@Post\('series\/:seriesId\/release'\)\s+@UseGuards\(StaffGuard\)\s+@Roles\('ADMIN'\)/,
    );
  });

  it('validates series release settings limits and life stage arrays', async () => {
    const valid = new UpdateRecipeSeriesReleaseSettingsDto();
    valid.requiredLifeStages = ['PUPPY_UNDER_14_WEEKS', 'HIGH_ACTIVITY_ADULT'];
    valid.coverImageUrl = 'https://img.example.com/cover.jpg';
    valid.coverTitle = '鸡'.repeat(20);
    valid.sellingPoint = '卖'.repeat(200);
    valid.targetHealthTags = ['JOINT'];
    await expect(validate(valid)).resolves.toEqual([]);

    const tooLong = new UpdateRecipeSeriesReleaseSettingsDto();
    tooLong.coverTitle = '鸡'.repeat(21);
    tooLong.sellingPoint = '卖'.repeat(201);
    (tooLong as any).requiredLifeStages = [
      'PUPPY_UNDER_14_WEEKS',
      'PUPPY_14_WEEKS_PLUS',
      'HIGH_ACTIVITY_ADULT',
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
      'REPRODUCTION',
      'ADULT',
    ];
    (tooLong as any).targetHealthTags = [123];

    const errors = await validate(tooLong);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'coverTitle',
        'sellingPoint',
        'requiredLifeStages',
        'targetHealthTags',
      ]),
    );

    const nulls = new UpdateRecipeSeriesReleaseSettingsDto();
    nulls.coverImageUrl = null;
    nulls.coverTitle = null;
    nulls.sellingPoint = null;
    await expect(validate(nulls)).resolves.toEqual([]);
  });

  it('exposes nutrition report generation and read routes to draft viewers', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(/@Post\('drafts\/:id\/nutrition-report'\)/);
    expect(source).toMatch(/@Get\('drafts\/:id\/nutrition-report'\)/);
  });

  it('exposes private recipe snapshot creation to authenticated users without StaffGuard', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    const snapshotRoute = source.match(
      /@Post\('drafts\/:id\/private-recipe-snapshot'\)([\s\S]*?)async createPrivateRecipeSnapshot/,
    );

    expect(snapshotRoute).not.toBeNull();
    expect(snapshotRoute?.[1] ?? '').not.toContain('@UseGuards(StaffGuard)');
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

  it('accepts an empty item ordering but rejects a non-array itemIds body', async () => {
    const emptyOrder = new UpdateRecipeDesignItemOrderDto();
    emptyOrder.itemIds = [];
    const malformedOrder = new UpdateRecipeDesignItemOrderDto();
    (malformedOrder as any).itemIds = 'item-1';

    await expect(validate(emptyOrder)).resolves.toEqual([]);
    await expect(validate(malformedOrder)).resolves.toEqual([
      expect.objectContaining({ property: 'itemIds' }),
    ]);
  });

  it('accepts only ALL/CATALOG/CUSTOM template kinds', async () => {
    const valid = new ListRecipeTemplatesDto();
    valid.keyword = '鸡肉';
    valid.kind = 'CUSTOM';
    const invalid = new ListRecipeTemplatesDto();
    (invalid as any).kind = 'DRAFT';

    await expect(validate(valid)).resolves.toEqual([]);
    await expect(validate(invalid)).resolves.toEqual([
      expect.objectContaining({ property: 'kind' }),
    ]);
  });
});

describe('RecipeDesignerController', () => {
  let controller: RecipeDesignerController;

  const service = {
    listIngredientOptions: jest.fn(),
    listDrafts: jest.fn(),
    getDraft: jest.fn(),
    updateDraftPresentation: jest.fn(),
    getDraftLaunchReadiness: jest.fn(),
    generateDraftNutritionReport: jest.fn(),
    getDraftNutritionReport: jest.fn(),
    createDraft: jest.fn(),
    listSeries: jest.fn(),
    createSeries: jest.fn(),
    duplicateSeries: jest.fn(),
    renameSeries: jest.fn(),
    deleteSeries: jest.fn(),
    createSeriesStageDraft: jest.fn(),
    duplicateSeriesStage: jest.fn(),
    copySeriesStageIngredients: jest.fn(),
    getSeriesReleaseReadiness: jest.fn(),
    updateSeriesReleaseSettings: jest.fn(),
    releaseSeries: jest.fn(),
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
  const cosService = {
    uploadImage: jest.fn(),
  };
  const supplementLabelExtractionService = {
    extractFromImage: jest.fn(),
  };
  const orderRecipeTemplateService = {
    searchTemplates: jest.fn(),
    compareOrderTemplateStage: jest.fn(),
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
          provide: OrderRecipeTemplateService,
          useValue: orderRecipeTemplateService,
        },
        {
          provide: OrderRecipeDesignService,
          useValue: {
            getWorkspace: jest.fn(),
            createFromTemplate: jest.fn(),
            createBlank: jest.fn(),
            stageDraft: jest.fn(),
            removeSlot: jest.fn(),
          },
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

  it('delegates order template search and stage comparison to the template service', async () => {
    orderRecipeTemplateService.searchTemplates.mockResolvedValue([
      { recipeId: 'recipe-1' },
    ]);
    orderRecipeTemplateService.compareOrderTemplateStage.mockResolvedValue({
      matches: false,
      templateStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      dogStage: 'HIGH_ACTIVITY_ADULT',
      warning: '阶段不一致',
    });

    await expect(
      controller.listRecipeTemplates({ keyword: '鸡肉', kind: 'CATALOG' }),
    ).resolves.toEqual(
      expect.objectContaining({ code: 0, data: [{ recipeId: 'recipe-1' }] }),
    );
    await expect(
      controller.getOrderDesignTemplateStage('CR20261022001', 'recipe-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({ matches: false }),
      }),
    );

    expect(orderRecipeTemplateService.searchTemplates).toHaveBeenCalledWith({
      keyword: '鸡肉',
      kind: 'CATALOG',
    });
    expect(
      orderRecipeTemplateService.compareOrderTemplateStage,
    ).toHaveBeenCalledWith('CR20261022001', 'recipe-1');
  });

  it('delegates draft CRUD with CurrentUser ids', async () => {
    service.listDrafts.mockResolvedValue([{ id: 'design-1' }]);
    service.getDraft.mockResolvedValue({ id: 'design-1' });
    service.getDraftLaunchReadiness.mockResolvedValue({
      draftId: 'design-1',
      ready: true,
      blockers: [],
      warnings: [],
    });
    service.createDraft.mockResolvedValue({ id: 'design-2' });
    service.updateDraft.mockResolvedValue({ id: 'design-1', name: 'new' });
    service.updateDraftPresentation.mockResolvedValue({
      draftId: 'design-1',
      contentRevision: 3,
      coverTitle: '新标题',
    });
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
      controller.getDraftLaunchReadiness('design-1', currentUser),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({ draftId: 'design-1', ready: true }),
      }),
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
      controller.updateDraftPresentation(
        'design-1',
        { coverTitle: '新标题' },
        currentUser,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          draftId: 'design-1',
          contentRevision: 3,
        }),
      }),
    );
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
    expect(service.getDraftLaunchReadiness).toHaveBeenCalledWith('design-1', {
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
    expect(service.updateDraftPresentation).toHaveBeenCalledWith(
      'design-1',
      { coverTitle: '新标题' },
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

  it('delegates nutrition report generation and reads with CurrentUser ids', async () => {
    const report = {
      draftId: 'design-1',
      generatedAt: '2026-10-22T10:00:00.000Z',
      revision: 3,
      stale: false,
      report: { ingredientRows: [] },
    };
    service.generateDraftNutritionReport.mockResolvedValue(report);
    service.getDraftNutritionReport.mockResolvedValue(report);

    await expect(
      controller.generateDraftNutritionReport('design-1', currentUser),
    ).resolves.toEqual(expect.objectContaining({ code: 0, data: report }));
    await expect(
      controller.getDraftNutritionReport('design-1', currentUser),
    ).resolves.toEqual(expect.objectContaining({ code: 0, data: report }));

    expect(service.generateDraftNutritionReport).toHaveBeenCalledWith(
      'design-1',
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.getDraftNutritionReport).toHaveBeenCalledWith('design-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });
  });

  it('delegates series workbench endpoints with CurrentUser ids', async () => {
    service.listSeries.mockResolvedValue([{ id: 'series-1' }]);
    service.createSeries.mockResolvedValue({ id: 'series-2' });
    service.renameSeries.mockResolvedValue({ id: 'series-1', name: '新名字' });
    service.deleteSeries.mockResolvedValue({
      id: 'series-1',
      status: 'DELETED',
    });
    service.createSeriesStageDraft.mockResolvedValue({ id: 'design-1' });
    service.duplicateSeries.mockResolvedValue({ id: 'series-copy' });
    service.duplicateSeriesStage.mockResolvedValue({ id: 'stage-copy' });
    service.copySeriesStageIngredients.mockResolvedValue({
      id: 'target-stage-draft',
    });

    await expect(controller.listSeries({}, currentUser)).resolves.toEqual(
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
      controller.deleteSeriesCommand(
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
    await expect(
      controller.duplicateSeries('series-1', currentUser),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.duplicateSeriesStage(
        'series-1',
        'HIGH_ACTIVITY_ADULT',
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.copySeriesStageIngredients(
        'series-1',
        'LOW_ACTIVITY_ADULT_OR_SENIOR',
        { sourceLifeStage: 'HIGH_ACTIVITY_ADULT' },
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));

    expect(service.listSeries).toHaveBeenCalledWith(
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
      {},
    );
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
    expect(service.deleteSeries).toHaveBeenCalledTimes(2);
    expect(service.deleteSeries).toHaveBeenNthCalledWith(
      1,
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
    expect(service.deleteSeries).toHaveBeenNthCalledWith(
      2,
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
    expect(service.duplicateSeries).toHaveBeenCalledWith('series-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });
    expect(service.duplicateSeriesStage).toHaveBeenCalledWith(
      'series-1',
      'HIGH_ACTIVITY_ADULT',
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.copySeriesStageIngredients).toHaveBeenCalledWith(
      'series-1',
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
      { sourceLifeStage: 'HIGH_ACTIVITY_ADULT' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
  });

  it('delegates staged series release readiness, settings and release', async () => {
    service.getSeriesReleaseReadiness.mockResolvedValue({
      seriesId: 'series-1',
      ready: false,
      blockers: [],
      warnings: [],
    });
    service.updateSeriesReleaseSettings.mockResolvedValue({
      seriesId: 'series-1',
      requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
    });
    service.releaseSeries.mockResolvedValue({
      seriesId: 'series-1',
      businessStatus: 'PUBLIC',
    });

    await expect(
      controller.getSeriesReleaseReadiness('series-1', currentUser),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({ seriesId: 'series-1' }),
      }),
    );
    await expect(
      controller.updateSeriesReleaseSettings(
        'series-1',
        { requiredLifeStages: ['HIGH_ACTIVITY_ADULT'] },
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.releaseSeries('series-1', currentUser),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({ businessStatus: 'PUBLIC' }),
      }),
    );

    const access = { userId: 'staff-1', role: 'STAFF' };
    expect(service.getSeriesReleaseReadiness).toHaveBeenCalledWith(
      'series-1',
      access,
    );
    expect(service.updateSeriesReleaseSettings).toHaveBeenCalledWith(
      'series-1',
      { requiredLifeStages: ['HIGH_ACTIVITY_ADULT'] },
      access,
    );
    expect(service.releaseSeries).toHaveBeenCalledWith('series-1', access);
  });

  it('delegates recipe designer series status filters to the service', async () => {
    service.listSeries.mockResolvedValue([{ id: 'series-public' }]);

    await expect(
      controller.listSeries({ status: 'PUBLIC' }, currentUser),
    ).resolves.toEqual(
      expect.objectContaining({ code: 0, data: [{ id: 'series-public' }] }),
    );

    expect(service.listSeries).toHaveBeenCalledWith(
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
      { status: 'PUBLIC' },
    );
  });

  it('delegates private recipe snapshot creation with CurrentUser ids', async () => {
    service.createPrivateRecipeSnapshot.mockResolvedValue({
      recipeId: 'private-recipe-1',
      dogId: 'dog-1',
      targetUrl:
        '/pages/recipe-order/index?recipeId=private-recipe-1&dogId=dog-1',
    });

    await expect(
      controller.createPrivateRecipeSnapshot(
        'design-1',
        { target: 'ORDER' } as any,
        { userId: 'user-1', customerId: 'customer-1', role: 'CUSTOMER' },
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));

    expect(service.createPrivateRecipeSnapshot).toHaveBeenCalledWith(
      'design-1',
      { target: 'ORDER' },
      { userId: 'user-1', customerId: 'customer-1', role: 'CUSTOMER' },
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
    expect(
      supplementLabelExtractionService.extractFromImage,
    ).toHaveBeenCalledWith({
      imageUrl: 'https://cdn.example.com/supplement-labels/label.jpg',
      originalFilename: 'label.jpg',
      requestedBy: 'staff-1',
    });
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
          imageUrl:
            'https://cdn.example.com/supplement-labels/wx-temp-label.jpg',
        }),
      }),
    );
  });

  it('delegates item mutations, assessment, and publish with CurrentUser ids', async () => {
    service.addItem.mockResolvedValue({ id: 'item-1' });
    service.updateItem.mockResolvedValue({ id: 'item-1', weightG: 120 });
    service.reorderItems.mockResolvedValue({ updatedCount: 2 });
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
    await controller.reorderItems(
      'design-1',
      {
        items: [
          { id: 'item-2', sortOrder: 0 },
          { id: 'item-1', sortOrder: 1 },
        ],
      },
      currentUser,
    );
    await controller.removeItem('item-1', currentUser);
    await controller.assessDraft('design-1', currentUser);
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
    expect(service.reorderItems).toHaveBeenCalledWith(
      'design-1',
      {
        items: [
          { id: 'item-2', sortOrder: 0 },
          { id: 'item-1', sortOrder: 1 },
        ],
      },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
    expect(service.removeItem).toHaveBeenCalledWith('item-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });
    expect(service.assessDraft).toHaveBeenCalledWith('design-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });
    expect(service.publishDraft).toHaveBeenCalledWith(
      'design-1',
      { reviewNote: 'ok' },
      {
        userId: 'staff-1',
        role: 'STAFF',
      },
    );
  });

  it('delegates a full item ordering to the service with the current user access context', async () => {
    service.updateItemOrder.mockResolvedValue([
      { id: 'item-2', sortOrder: 0 },
      { id: 'item-1', sortOrder: 1 },
    ]);

    await expect(
      (controller as any).updateItemOrder(
        'design-1',
        { itemIds: ['item-2', 'item-1'] },
        currentUser,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: [
          { id: 'item-2', sortOrder: 0 },
          { id: 'item-1', sortOrder: 1 },
        ],
      }),
    );

    expect(service.updateItemOrder).toHaveBeenCalledWith(
      'design-1',
      ['item-2', 'item-1'],
      { userId: 'staff-1', role: 'STAFF' },
    );
  });
});
