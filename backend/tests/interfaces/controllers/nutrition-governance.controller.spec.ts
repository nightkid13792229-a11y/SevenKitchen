import { Test, TestingModule } from '@nestjs/testing';
import { NutritionGovernanceService } from '../../../src/application/nutrition-governance/nutrition-governance.service';
import { AuthGuard } from '../../../src/interfaces/auth';
import type { RequestUser } from '../../../src/interfaces/auth';
import { NutritionGovernanceController } from '../../../src/interfaces/controllers/nutrition-governance.controller';

describe('NutritionGovernanceController', () => {
  let controller: NutritionGovernanceController;
  let service: {
    getOverview: jest.Mock;
    listCandidates: jest.Mock;
    generateFoodCandidatesForIngredient: jest.Mock;
    confirmCandidate: jest.Mock;
    rejectCandidate: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getOverview: jest.fn(),
      listCandidates: jest.fn(),
      generateFoodCandidatesForIngredient: jest.fn(),
      confirmCandidate: jest.fn(),
      rejectCandidate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NutritionGovernanceController],
      providers: [
        {
          provide: NutritionGovernanceService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(AuthGuard)
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
});
