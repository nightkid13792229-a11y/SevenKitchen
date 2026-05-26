import { Test } from '@nestjs/testing';
import { SupplementImportService } from '../../../src/application/supplement-import/supplement-import.service';
import { AuthGuard } from '../../../src/interfaces/auth';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { RecipeDesignerSupplementImportController } from '../../../src/interfaces/controllers/recipe-designer-supplement-import.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

describe('RecipeDesignerSupplementImportController', () => {
  let controller: RecipeDesignerSupplementImportController;

  const service = {
    uploadImages: jest.fn(),
    createDraft: jest.fn(),
    getDraft: jest.fn(),
    updateDraft: jest.fn(),
    confirmDraft: jest.fn(),
  };

  const adminUser = {
    userId: 'admin-1',
    customerId: 'admin-1',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [RecipeDesignerSupplementImportController],
      providers: [
        { provide: SupplementImportService, useValue: service },
        { provide: JwtAuthService, useValue: { validateToken: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(RecipeDesignerSupplementImportController);
  });

  it('uses auth and admin guards', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      RecipeDesignerSupplementImportController,
    );

    expect(guards).toEqual(expect.arrayContaining([AuthGuard, AdminGuard]));
  });

  it('delegates image upload and wraps success response', async () => {
    const files = [{ originalname: 'a.jpg', buffer: Buffer.from('x') }] as any;
    service.uploadImages.mockResolvedValue([
      { url: 'https://cdn.example.com/a.jpg', key: 'supplement-import/a.jpg' },
    ]);

    const response = await controller.uploadImages(files, adminUser);

    expect(response.code).toBe(0);
    expect(response.data?.[0].key).toBe('supplement-import/a.jpg');
    expect(service.uploadImages).toHaveBeenCalledWith(files, adminUser);
  });

  it('delegates create/get/update/confirm with current user', async () => {
    const draft = { id: 'draft-1', status: 'READY_TO_CONFIRM' };
    service.createDraft.mockResolvedValue(draft);
    service.getDraft.mockResolvedValue(draft);
    service.updateDraft.mockResolvedValue(draft);
    service.confirmDraft.mockResolvedValue({
      ...draft,
      status: 'CONFIRMED',
      confirmedIngredientId: 'ing-1',
    });

    await expect(
      controller.create(
        { imageUrls: ['https://cdn.example.com/a.jpg'] },
        adminUser,
      ),
    ).resolves.toMatchObject({ code: 0, data: draft });
    await expect(controller.get('draft-1', adminUser)).resolves.toMatchObject({
      code: 0,
      data: draft,
    });
    await expect(
      controller.update(
        'draft-1',
        { normalizedDraft: { ingredient: { name: '海藻碘片' } } as any },
        adminUser,
      ),
    ).resolves.toMatchObject({ code: 0, data: draft });
    await expect(
      controller.confirm('draft-1', adminUser),
    ).resolves.toMatchObject({
      code: 0,
      data: expect.objectContaining({ confirmedIngredientId: 'ing-1' }),
    });

    expect(service.createDraft).toHaveBeenCalledWith(
      { imageUrls: ['https://cdn.example.com/a.jpg'] },
      adminUser,
    );
    expect(service.getDraft).toHaveBeenCalledWith('draft-1', adminUser);
    expect(service.updateDraft).toHaveBeenCalledWith(
      'draft-1',
      { normalizedDraft: { ingredient: { name: '海藻碘片' } } },
      adminUser,
    );
    expect(service.confirmDraft).toHaveBeenCalledWith('draft-1', adminUser);
  });
});
