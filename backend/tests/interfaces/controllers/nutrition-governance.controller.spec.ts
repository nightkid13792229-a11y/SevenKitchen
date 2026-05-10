import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NutritionGovernanceService } from '../../../src/application/nutrition-governance/nutrition-governance.service';
import { AuthGuard } from '../../../src/interfaces/auth';
import type { RequestUser } from '../../../src/interfaces/auth';
import { NutritionGovernanceController } from '../../../src/interfaces/controllers/nutrition-governance.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

describe('NutritionGovernanceController', () => {
  let controller: NutritionGovernanceController;
  let service: {
    getOverview: jest.Mock;
    listCandidates: jest.Mock;
    generateFoodCandidatesForIngredient: jest.Mock;
    importUsdaSourceRecord: jest.Mock;
    createSupplementDraftFromLabelImage: jest.Mock;
    confirmCandidate: jest.Mock;
    rejectCandidate: jest.Mock;
  };
  let cosService: {
    uploadImage: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getOverview: jest.fn(),
      listCandidates: jest.fn(),
      generateFoodCandidatesForIngredient: jest.fn(),
      importUsdaSourceRecord: jest.fn(),
      createSupplementDraftFromLabelImage: jest.fn(),
      confirmCandidate: jest.fn(),
      rejectCandidate: jest.fn(),
    };
    cosService = {
      uploadImage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NutritionGovernanceController],
      providers: [
        {
          provide: NutritionGovernanceService,
          useValue: service,
        },
        {
          provide: TencentCosService,
          useValue: cosService,
        },
        { provide: AdminGuard, useValue: { canActivate: jest.fn() } },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(NutritionGovernanceController);
  });

  it('getOverview returns code 0 and data', async () => {
    const overview = {
      foodIngredientCount: 8,
      supplementIngredientCount: 3,
      confirmedNutritionProfileCount: 5,
      incompleteProfileCount: 6,
      candidateCount: 11,
      supplementDraftCount: 2,
    };
    service.getOverview.mockResolvedValue(overview);

    const result = await controller.getOverview();

    expect(service.getOverview).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      code: 0,
      message: 'Success',
      data: overview,
    });
  });

  it('confirmCandidate passes current user id into service', async () => {
    const confirmedCandidate = {
      id: 'candidate-1',
      status: 'CONFIRMED',
    };
    const user = { userId: 'admin-user-1' } as RequestUser;
    service.confirmCandidate.mockResolvedValue(confirmedCandidate);

    const result = await controller.confirmCandidate('candidate-1', user);

    expect(service.confirmCandidate).toHaveBeenCalledWith(
      'candidate-1',
      'admin-user-1',
    );
    expect(result).toEqual({
      code: 0,
      message: '确认成功',
      data: confirmedCandidate,
    });
  });

  it('imports a USDA source record and wraps the response', async () => {
    const sourceRecord = {
      id: 'source-record-1',
      sourceType: 'USDA',
      sourceKey: 'USDA:171077',
    };
    service.importUsdaSourceRecord.mockResolvedValue(sourceRecord);

    const result = await controller.importUsdaSourceRecord({
      fdcId: '171077',
    });

    expect(service.importUsdaSourceRecord).toHaveBeenCalledWith('171077');
    expect(result).toEqual({
      code: 0,
      message: 'USDA 来源导入成功',
      data: sourceRecord,
    });
  });

  it('uploads a supplement label and asks the service to create a draft', async () => {
    const file = {
      originalname: 'label.jpg',
      buffer: Buffer.from('image-bytes'),
    } as Express.Multer.File;
    const user = { userId: 'admin-user-1' } as RequestUser;
    const upload = {
      url: 'https://cdn.example.com/supplement-labels/label.jpg',
      key: 'supplement-labels/label.jpg',
    };
    const draft = {
      id: 'draft-1',
      status: 'DRAFT',
    };
    cosService.uploadImage.mockResolvedValue(upload);
    service.createSupplementDraftFromLabelImage.mockResolvedValue(draft);

    const result = await controller.uploadSupplementLabel(
      'supplement-1',
      file,
      user,
    );

    expect(cosService.uploadImage).toHaveBeenCalledWith(
      file,
      'label.jpg',
      'supplement-labels',
    );
    expect(service.createSupplementDraftFromLabelImage).toHaveBeenCalledWith({
      ingredientId: 'supplement-1',
      imageUrl: upload.url,
      imageKey: upload.key,
      createdBy: 'admin-user-1',
    });
    expect(result).toEqual({
      code: 0,
      message: '补剂标签草稿已生成',
      data: draft,
    });
  });

  it('requires both authentication and admin authorization guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NutritionGovernanceController,
    );

    expect(guards).toEqual(expect.arrayContaining([AuthGuard, AdminGuard]));
  });
});
