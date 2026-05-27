import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { AuthGuard, JwtAuthService } from '../../../src/interfaces/auth';
import { RecipeDesignerController } from '../../../src/interfaces/controllers/recipe-designer.controller';
import { StaffGuard } from '../../../src/interfaces/guards/role.guard';

describe('RecipeDesignerController authorization', () => {
  it('requires authentication and staff guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RecipeDesignerController);

    expect(guards).toEqual([AuthGuard, StaffGuard]);
  });

  it('requires admin role before publishing a design recipe', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/interfaces/controllers/recipe-designer.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(
      /@Post\('drafts\/:id\/publish'\)\s+@Roles\('ADMIN'\)/,
    );
  });
});

describe('RecipeDesignerController', () => {
  let controller: RecipeDesignerController;

  const service = {
    listIngredientOptions: jest.fn(),
    listDrafts: jest.fn(),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
    deleteDraft: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    assessDraft: jest.fn(),
    publishDraft: jest.fn(),
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
    service.createDraft.mockResolvedValue({ id: 'design-2' });
    service.updateDraft.mockResolvedValue({ id: 'design-1', name: 'new' });
    service.deleteDraft.mockResolvedValue({ id: 'design-1' });

    await expect(controller.listDrafts(currentUser)).resolves.toEqual(
      expect.objectContaining({ code: 0, data: [{ id: 'design-1' }] }),
    );
    await expect(
      controller.createDraft(
        { name: 'new', scenario: 'ADULT_MER_110' },
        currentUser,
      ),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.updateDraft('design-1', { name: 'new' }),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));
    await expect(
      controller.deleteDraft('design-1', currentUser),
    ).resolves.toEqual(expect.objectContaining({ code: 0 }));

    expect(service.listDrafts).toHaveBeenCalledWith('staff-1');
    expect(service.createDraft).toHaveBeenCalledWith(
      { name: 'new', scenario: 'ADULT_MER_110' },
      'staff-1',
    );
    expect(service.updateDraft).toHaveBeenCalledWith('design-1', {
      name: 'new',
    });
    expect(service.deleteDraft).toHaveBeenCalledWith('design-1', 'staff-1');
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

  it('delegates item mutations, assessment, and publish with CurrentUser ids', async () => {
    service.addItem.mockResolvedValue({ id: 'item-1' });
    service.updateItem.mockResolvedValue({ id: 'item-1', weightG: 120 });
    service.removeItem.mockResolvedValue({ id: 'item-1' });
    service.assessDraft.mockResolvedValue({ overallStatus: 'COMPLIANT' });
    service.publishDraft.mockResolvedValue({ status: 'PUBLISHED' });

    await controller.addItem('design-1', {
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      weightG: 100,
    } as any);
    await controller.updateItem('item-1', { weightG: 120 });
    await controller.removeItem('item-1');
    await controller.assessDraft('design-1');
    await controller.publishDraft('design-1', { reviewNote: 'ok' }, currentUser);

    expect(service.addItem).toHaveBeenCalledWith('design-1', {
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      weightG: 100,
    });
    expect(service.updateItem).toHaveBeenCalledWith('item-1', { weightG: 120 });
    expect(service.removeItem).toHaveBeenCalledWith('item-1');
    expect(service.assessDraft).toHaveBeenCalledWith('design-1');
    expect(service.publishDraft).toHaveBeenCalledWith(
      'design-1',
      { reviewNote: 'ok' },
      'staff-1',
    );
  });
});
