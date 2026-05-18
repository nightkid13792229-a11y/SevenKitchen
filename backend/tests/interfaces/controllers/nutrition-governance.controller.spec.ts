import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException } from '@nestjs/common';
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
    listSupplementDrafts: jest.Mock;
    generateFoodCandidatesForIngredient: jest.Mock;
    importUsdaSourceRecord: jest.Mock;
    getLocalCfctStructuredLibrary: jest.Mock;
    importReviewedCfctSourceRows: jest.Mock;
    createSupplementDraftFromLabelImage: jest.Mock;
    confirmCandidateFromWorkbench: jest.Mock;
    rejectCandidate: jest.Mock;
    confirmSupplementDraft: jest.Mock;
    rejectSupplementDraft: jest.Mock;
  };
  let cosService: {
    uploadImage: jest.Mock;
    deleteImage: jest.Mock;
  };
  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]);

  beforeEach(async () => {
    service = {
      getOverview: jest.fn(),
      listCandidates: jest.fn(),
      listSupplementDrafts: jest.fn(),
      generateFoodCandidatesForIngredient: jest.fn(),
      importUsdaSourceRecord: jest.fn(),
      getLocalCfctStructuredLibrary: jest.fn(),
      importReviewedCfctSourceRows: jest.fn(),
      createSupplementDraftFromLabelImage: jest.fn(),
      confirmCandidateFromWorkbench: jest.fn(),
      rejectCandidate: jest.fn(),
      confirmSupplementDraft: jest.fn(),
      rejectSupplementDraft: jest.fn(),
    };
    cosService = {
      uploadImage: jest.fn(),
      deleteImage: jest.fn(),
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
    service.confirmCandidateFromWorkbench.mockResolvedValue(confirmedCandidate);

    const result = await controller.confirmCandidate(
      'candidate-1',
      { mappingRole: 'PRIMARY' },
      user,
    );

    expect(service.confirmCandidateFromWorkbench).toHaveBeenCalledWith(
      'candidate-1',
      'admin-user-1',
      { mappingRole: 'PRIMARY' },
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
      ingredientId: 'ingredient-1',
    });

    expect(service.importUsdaSourceRecord).toHaveBeenCalledWith('171077', {
      ingredientId: 'ingredient-1',
    });
    expect(result).toEqual({
      code: 0,
      message: 'USDA 来源导入成功',
      data: sourceRecord,
    });
  });

  it('imports reviewed CFCT source rows and wraps the response', async () => {
    const importResult = {
      importedCount: 1,
      records: [{ id: 'cfct-source-1', sourceType: 'CFCT' }],
    };
    const payload = {
      rows: [
        {
          volume: '第六版 第一册',
          page: 120,
          row: 7,
          foodName: '苹果（代表值）',
          nutrients: { energyKcal: 53 },
        },
      ],
    };
    service.importReviewedCfctSourceRows.mockResolvedValue(importResult);

    const result = await controller.importReviewedCfctSourceRows(payload);

    expect(service.importReviewedCfctSourceRows).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      code: 0,
      message: 'CFCT 来源已导入',
      data: importResult,
    });
  });

  it('loads local CFCT structured library rows and wraps the response', async () => {
    const library = {
      queue: 'needs-review',
      rowCount: 1,
      rows: [{ foodName: '鹅肝' }],
      summary: { totalRows: 1937 },
    };
    service.getLocalCfctStructuredLibrary.mockResolvedValue(library);

    const result = await controller.getLocalCfctStructuredLibrary({
      queue: 'needs-review',
    });

    expect(service.getLocalCfctStructuredLibrary).toHaveBeenCalledWith({
      queue: 'needs-review',
    });
    expect(result).toEqual({
      code: 0,
      message: 'Success',
      data: library,
    });
  });

  it('lists supplement drafts and wraps the response', async () => {
    const drafts = [{ id: 'draft-1', status: 'DRAFT' }];
    service.listSupplementDrafts.mockResolvedValue(drafts);

    const result = await controller.listSupplementDrafts({ status: 'DRAFT' as any });

    expect(service.listSupplementDrafts).toHaveBeenCalledWith({
      status: 'DRAFT',
    });
    expect(result).toEqual({
      code: 0,
      message: 'Success',
      data: drafts,
    });
  });

  it('uploads a supplement label and asks the service to create a draft', async () => {
    const file = {
      originalname: 'label.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: validJpegBuffer,
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

  it('rejects missing supplement label files before upload', async () => {
    const user = { userId: 'admin-user-1' } as RequestUser;

    await expect(
      controller.uploadSupplementLabel(
        'supplement-1',
        undefined as unknown as Express.Multer.File,
        user,
      ),
    ).rejects.toThrow('请选择补剂标签图片');

    expect(cosService.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects non-image or oversized supplement label files before upload', async () => {
    const user = { userId: 'admin-user-1' } as RequestUser;

    await expect(
      controller.uploadSupplementLabel(
        'supplement-1',
        {
          originalname: 'label.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('pdf'),
        } as Express.Multer.File,
        user,
      ),
    ).rejects.toThrow('仅支持 JPG、PNG、WEBP 格式的补剂标签图片');

    await expect(
      controller.uploadSupplementLabel(
        'supplement-1',
        {
      originalname: 'label.jpg',
      mimetype: 'image/jpeg',
      size: 11 * 1024 * 1024,
      buffer: validJpegBuffer,
        } as Express.Multer.File,
        user,
      ),
    ).rejects.toThrow('补剂标签图片大小不能超过10MB');

    expect(cosService.uploadImage).not.toHaveBeenCalled();
  });

  it('deletes uploaded supplement label image when draft creation fails', async () => {
    const file = {
      originalname: 'label.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: validJpegBuffer,
    } as Express.Multer.File;
    const user = { userId: 'admin-user-1' } as RequestUser;
    const upload = {
      url: 'https://cdn.example.com/supplement-labels/label.jpg',
      key: 'supplement-labels/label.jpg',
    };
    cosService.uploadImage.mockResolvedValue(upload);
    service.createSupplementDraftFromLabelImage.mockRejectedValue(
      new BadRequestException('补剂原料不存在'),
    );

    await expect(
      controller.uploadSupplementLabel('bad-supplement', file, user),
    ).rejects.toThrow('补剂原料不存在');

    expect(cosService.deleteImage).toHaveBeenCalledWith(upload.key);
  });

  it('confirms supplement drafts with the current user id', async () => {
    const confirmedDraft = {
      id: 'draft-1',
      status: 'CONFIRMED',
    };
    const user = { userId: 'admin-user-1' } as RequestUser;
    service.confirmSupplementDraft.mockResolvedValue(confirmedDraft);

    const result = await controller.confirmSupplementDraft('draft-1', user);

    expect(service.confirmSupplementDraft).toHaveBeenCalledWith(
      'draft-1',
      'admin-user-1',
    );
    expect(result).toEqual({
      code: 0,
      message: '补剂草稿已确认',
      data: confirmedDraft,
    });
  });

  it('rejects supplement drafts', async () => {
    const rejectedDraft = {
      id: 'draft-1',
      status: 'REJECTED',
    };
    service.rejectSupplementDraft.mockResolvedValue(rejectedDraft);

    const result = await controller.rejectSupplementDraft('draft-1');

    expect(service.rejectSupplementDraft).toHaveBeenCalledWith('draft-1');
    expect(result).toEqual({
      code: 0,
      message: '补剂草稿已拒绝',
      data: rejectedDraft,
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
