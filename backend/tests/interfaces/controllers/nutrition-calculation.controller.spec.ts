import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FediafTargetSelectorService } from '../../../src/application/nutrition-calculation/fediaf-target-selector.service';
import { IngredientReadinessService } from '../../../src/application/nutrition-calculation/ingredient-readiness.service';
import { NutrientMappingAuditService } from '../../../src/application/nutrition-calculation/nutrient-mapping-audit.service';
import { AuthGuard, JwtAuthService } from '../../../src/interfaces/auth';
import { NutritionCalculationController } from '../../../src/interfaces/controllers/nutrition-calculation.controller';
import { FediafTargetQueryDto } from '../../../src/interfaces/dto/nutrition-calculation/nutrition-calculation.dto';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

describe('NutritionCalculationController authorization', () => {
  it('requires authentication and admin guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NutritionCalculationController,
    );

    expect(guards).toEqual([AuthGuard, AdminGuard]);
  });
});

describe('NutritionCalculationController', () => {
  let controller: NutritionCalculationController;

  const mappingAuditService = {
    auditFediaf2025DogMappings: jest.fn(),
  };

  const ingredientReadinessService = {
    listIngredientReadiness: jest.fn(),
  };

  const targetSelectorService = {
    selectFediaf2025DogTarget: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NutritionCalculationController],
      providers: [
        {
          provide: NutrientMappingAuditService,
          useValue: mappingAuditService,
        },
        {
          provide: IngredientReadinessService,
          useValue: ingredientReadinessService,
        },
        {
          provide: FediafTargetSelectorService,
          useValue: targetSelectorService,
        },
        {
          provide: AuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: AdminGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: JwtAuthService,
          useValue: { validateToken: jest.fn() },
        },
      ],
    }).compile();

    controller = moduleRef.get(NutritionCalculationController);
    jest.clearAllMocks();
  });

  it('delegates mapping audit requests to the mapping audit service', async () => {
    const auditResult = {
      versionCode: 'FEDIAF_2025_DOG',
      summary: { totalNutrients: 1 },
      items: [{ nutrientCode: 'CA' }],
    };
    mappingAuditService.auditFediaf2025DogMappings.mockResolvedValue(
      auditResult,
    );

    const response = await controller.getMappingAudit();

    expect(response).toEqual(
      expect.objectContaining({ code: 0, data: auditResult }),
    );
    expect(
      mappingAuditService.auditFediaf2025DogMappings,
    ).toHaveBeenCalledTimes(1);
  });

  it('delegates ingredient readiness requests to the readiness service', async () => {
    const readinessResult = {
      versionCode: 'FEDIAF_2025_DOG',
      summary: { totalIngredients: 1 },
      items: [{ ingredientId: 'ingredient-1' }],
      missingNutrientRanking: [],
    };
    ingredientReadinessService.listIngredientReadiness.mockResolvedValue(
      readinessResult,
    );

    const response = await controller.listIngredientReadiness();

    expect(response).toEqual(
      expect.objectContaining({ code: 0, data: readinessResult }),
    );
    expect(
      ingredientReadinessService.listIngredientReadiness,
    ).toHaveBeenCalledTimes(1);
  });

  it('delegates FEDIAF target requests with the selected life stage', async () => {
    const targetResult = {
      versionCode: 'FEDIAF_2025_DOG',
      lifeStage: 'ADULT_MER_110',
      sourceType: 'ANNEX_7_8',
      entries: [{ nutrientCode: 'CA' }],
    };
    targetSelectorService.selectFediaf2025DogTarget.mockResolvedValue(
      targetResult,
    );

    const query: FediafTargetQueryDto = { lifeStage: 'ADULT_MER_110' };
    const response = await controller.previewFediafTarget(query);

    expect(response).toEqual(
      expect.objectContaining({ code: 0, data: targetResult }),
    );
    expect(targetSelectorService.selectFediaf2025DogTarget).toHaveBeenCalledWith(
      { lifeStage: 'ADULT_MER_110' },
    );
  });
});
