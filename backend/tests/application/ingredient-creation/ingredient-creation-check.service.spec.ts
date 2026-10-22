import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
  IntakeCard,
  MergePlan,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { runFinalCheck } from '../../../src/domain/ingredient-creation/final-check';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

jest.mock('../../../src/domain/ingredient-creation/final-check', () => ({
  runFinalCheck: jest.fn(),
}));

const runFinalCheckMock = runFinalCheck as jest.MockedFunction<
  typeof runFinalCheck
>;

const emptyCheckResult: FinalCheckResult = {
  blocking: [],
  exceptionable: [],
  warnings: [],
};

const intakeCard: IntakeCard = {
  name: '鸡肝',
  nameEn: 'Chicken liver',
  aliases: [],
  confusables: [],
  category: 'MEAT_ORGAN',
  requiredStates: ['RAW'],
  suggestedStates: ['COOKED'],
};

function createDraft(
  overrides: Partial<IngredientCreationDraft> = {},
): IngredientCreationDraft {
  return {
    id: 'draft-1',
    name: '鸡肝',
    type: 'FOOD',
    step: 'CHECK',
    payload: {},
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-22T00:00:00.000Z'),
    updatedAt: new Date('2026-10-22T00:00:00.000Z'),
    ...overrides,
  };
}

function planRow(
  fieldPath: string,
  value: number,
  unit: string,
): MergePlan['rows'][number] {
  return {
    fieldPath,
    value,
    unit,
    status: 'DIRECT',
    sourceRecordId: 'src-primary',
    sourceValue: value,
    sourceUnit: unit,
  };
}

const fullMergePlan: MergePlan = {
  primarySourceRecordId: 'src-primary',
  rows: [
    planRow('macros.energyKcal', 200, 'kcal'),
    planRow('macros.moisture', 60, 'g'),
    planRow('macros.crudeProtein', 20, 'g'),
    planRow('macros.crudeFat', 5, 'g'),
    planRow('macros.ash', 2, 'g'),
    planRow('macros.carbohydrate', 10, 'g'),
    planRow('macros.fiber', 3, 'g'),
  ],
  conflicts: [],
  missingFields: [],
};

function primarySourceRecord(sampleState = 'RAW') {
  return [
    {
      id: 'src-primary',
      normalizedNutrition: {
        meta: {
          rawBasisType: 'PER_SERVING',
          sampleState,
          servingWeightG: 50,
        },
        macros: { crudeProtein: 20 },
      },
    },
  ];
}

describe('IngredientCreationCheckService', () => {
  let service: IngredientCreationCheckService;
  let prisma: { nutritionSourceRecord: { findMany: jest.Mock } };
  let draftService: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      nutritionSourceRecord: {
        findMany: jest.fn().mockResolvedValue(primarySourceRecord()),
      },
    };
    draftService = {
      get: jest.fn().mockResolvedValue(createDraft()),
    };
    runFinalCheckMock.mockReset();
    runFinalCheckMock.mockReturnValue(emptyCheckResult);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientCreationCheckService,
        { provide: PrismaService, useValue: prisma },
        { provide: IngredientCreationDraftService, useValue: draftService },
      ],
    }).compile();

    service = moduleRef.get(IngredientCreationCheckService);
  });

  it('重建证据账本，算宏量、能量与 4/9/4 反算值', async () => {
    draftService.get.mockResolvedValue(
      createDraft({
        payload: {
          intake: intakeCard,
          mergePlan: fullMergePlan,
          profiles: [
            {
              preparationState: 'RAW',
              sourceRecordId: 'src-primary',
              entries: [],
              notes: null,
            },
            {
              preparationState: 'COOKED',
              sourceRecordId: 'src-cooked',
              entries: [],
              notes: null,
            },
          ],
        },
      }),
    );

    const result = await service.runCheck('draft-1');

    expect(result).toEqual(emptyCheckResult);
    expect(runFinalCheckMock).toHaveBeenCalledTimes(1);
    expect(draftService.get).toHaveBeenCalledTimes(1);

    const input = runFinalCheckMock.mock.calls[0][0];
    expect(input.entries).toHaveLength(7);
    // 宏量之和 = 水分 60 + 蛋白 20 + 脂肪 5 + 灰分 2 + 碳水 10；纤维不重复计。
    expect(input.macroSumG).toBe(97);
    expect(input.energyKcal).toBe(200);
    // 4×20 + 9×5 + 4×10 = 165
    expect(input.energyFromMacrosKcal).toBe(165);
    expect(input.basis).toEqual({
      profileBasis: 'PER_100_G',
      sourceBasis: 'PER_SERVING',
      servingGrams: 50,
    });
  });

  it('覆盖：profiles 决定 present，类别决定 required 默认值', async () => {
    const intakeWithoutExplicitStates = {
      name: '土豆',
      nameEn: 'Potato',
      aliases: [],
      confusables: [],
      category: 'STARCHY_VEGETABLE',
      suggestedStates: ['RAW'],
    } as unknown as IntakeCard;

    draftService.get.mockResolvedValue(
      createDraft({
        payload: {
          intake: intakeWithoutExplicitStates,
          mergePlan: fullMergePlan,
          profiles: [
            {
              preparationState: 'RAW',
              sourceRecordId: 'src-primary',
              entries: [],
              notes: null,
            },
            {
              preparationState: 'COOKED',
              sourceRecordId: 'src-cooked',
              entries: [],
              notes: null,
            },
          ],
        },
      }),
    );

    await service.runCheck('draft-1');

    expect(runFinalCheckMock.mock.calls[0][0].coverage).toEqual({
      required: ['COOKED'],
      present: ['RAW', 'COOKED'],
    });
  });

  it('没有 profiles 时，只按主来源的 sampleState 判断 present', async () => {
    prisma.nutritionSourceRecord.findMany.mockResolvedValue(
      primarySourceRecord('COOKED'),
    );
    draftService.get.mockResolvedValue(
      createDraft({
        payload: {
          intake: { ...intakeCard, requiredStates: ['RAW', 'COOKED'] },
          mergePlan: fullMergePlan,
        },
      }),
    );

    await service.runCheck('draft-1');

    expect(runFinalCheckMock.mock.calls[0][0].coverage).toEqual({
      required: ['RAW', 'COOKED'],
      present: ['COOKED'],
    });
  });

  it('没有 mergePlan → 400，不跑终检', async () => {
    draftService.get.mockResolvedValue(createDraft({ payload: {} }));

    await expect(service.runCheck('draft-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(runFinalCheckMock).not.toHaveBeenCalled();
  });

  it('提交前置检查：blocking 非空 → 400，并带回阻断项', async () => {
    const blocking = [{ code: 'UNIT_NOT_ALLOWED', message: '字段单位不合法' }];
    runFinalCheckMock.mockReturnValue({
      blocking,
      exceptionable: [],
      warnings: [],
    });
    draftService.get.mockResolvedValue(
      createDraft({
        payload: { intake: intakeCard, mergePlan: fullMergePlan },
      }),
    );

    const error = await service
      .assertCommitAllowed('draft-1')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: '终检存在阻断项，不能提交',
      blocking,
    });
    expect(runFinalCheckMock).toHaveBeenCalledTimes(1);
  });

  it('提交前置检查：没有 blocking 时放行', async () => {
    draftService.get.mockResolvedValue(
      createDraft({
        payload: { intake: intakeCard, mergePlan: fullMergePlan },
      }),
    );

    await expect(
      service.assertCommitAllowed('draft-1'),
    ).resolves.toBeUndefined();

    expect(runFinalCheckMock).toHaveBeenCalledTimes(1);
  });
});
