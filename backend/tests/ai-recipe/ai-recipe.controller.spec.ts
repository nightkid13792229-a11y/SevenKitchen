import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AiRecipeController } from '../../src/interfaces/controllers/ai-recipe.controller';
import { AuthGuard } from '../../src/interfaces/auth';
import { AdminGuard } from '../../src/interfaces/guards/role.guard';

describe('AiRecipeController', () => {
  function createController() {
    const knowledgeBaseService = {
      listActiveSources: jest.fn(),
      listActiveRulePackages: jest.fn(),
    };
    const nutritionAssessmentRecordService = {
      createAssessment: jest.fn(),
      getAssessment: jest.fn(),
    };
    const controller = new AiRecipeController(
      knowledgeBaseService as any,
      nutritionAssessmentRecordService as any,
    );

    return {
      controller,
      knowledgeBaseService,
      nutritionAssessmentRecordService,
    };
  }

  it('uses auth and admin guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AiRecipeController);

    expect(guards).toEqual([AuthGuard, AdminGuard]);
  });

  it('returns active knowledge sources in the common response envelope', async () => {
    const { controller, knowledgeBaseService } = createController();
    const sources = [{ id: 'source-1', code: 'FEDIAF_2025' }];
    knowledgeBaseService.listActiveSources.mockResolvedValue(sources);

    const result = await controller.listKnowledgeSources();

    expect(knowledgeBaseService.listActiveSources).toHaveBeenCalledWith();
    expect(result).toEqual({
      code: 0,
      message: 'Success',
      data: sources,
    });
  });

  it('returns active rule packages in the common response envelope', async () => {
    const { controller, knowledgeBaseService } = createController();
    const packages = [{ id: 'package-1', code: 'WEIGHT_MANAGEMENT' }];
    knowledgeBaseService.listActiveRulePackages.mockResolvedValue(packages);

    const result = await controller.listRulePackages();

    expect(knowledgeBaseService.listActiveRulePackages).toHaveBeenCalledWith();
    expect(result).toEqual({
      code: 0,
      message: 'Success',
      data: packages,
    });
  });

  it('creates a persisted assessment with the requesting admin id', async () => {
    const { controller, nutritionAssessmentRecordService } = createController();
    const assessment = {
      id: 'assessment-1',
      dogId: 'dog-1',
      createdBy: 'admin-1',
      status: 'DRAFT',
    };
    nutritionAssessmentRecordService.createAssessment.mockResolvedValue(
      assessment,
    );

    const result = await controller.createAssessment(
      {
        dogId: 'dog-1',
        prompt: '请评估',
        confirmedInputs: { dietHistory: '鲜食' },
      },
      { userId: 'admin-1', role: 'ADMIN' } as any,
    );

    expect(
      nutritionAssessmentRecordService.createAssessment,
    ).toHaveBeenCalledWith({
      dogId: 'dog-1',
      prompt: '请评估',
      confirmedInputs: { dietHistory: '鲜食' },
      createdBy: 'admin-1',
    });
    expect(result).toEqual({
      code: 0,
      message: 'Assessment created',
      data: assessment,
    });
  });

  it('returns a persisted assessment lookup', async () => {
    const { controller, nutritionAssessmentRecordService } = createController();
    const assessment = { id: 'assessment-1', status: 'DRAFT' };
    nutritionAssessmentRecordService.getAssessment.mockResolvedValue(
      assessment,
    );

    const result = await controller.getAssessment('assessment-1');

    expect(nutritionAssessmentRecordService.getAssessment).toHaveBeenCalledWith(
      'assessment-1',
    );
    expect(result).toEqual({
      code: 0,
      message: 'Success',
      data: assessment,
    });
  });
});

describe('AdminGuard', () => {
  function createContext(role?: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: role ? { userId: 'user-1', role } : undefined,
        }),
      }),
    };
  }

  it('allows ADMIN users', () => {
    const guard = new AdminGuard();

    expect(guard.canActivate(createContext('ADMIN') as any)).toBe(true);
  });

  it('rejects non-admin users', () => {
    const guard = new AdminGuard();

    expect(() => guard.canActivate(createContext('USER') as any)).toThrow(
      ForbiddenException,
    );
  });
});
