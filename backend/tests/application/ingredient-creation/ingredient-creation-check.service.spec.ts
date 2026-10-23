import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
  IntakeCard,
  MergePlan,
  NutritionEvidenceEntry,
  ProfileDraft,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { runFinalCheck } from '../../../src/domain/ingredient-creation/final-check';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

jest.mock('../../../src/domain/ingredient-creation/final-check', () => ({
  runFinalCheck: jest.fn(),
}));

const actualFinalCheck = jest.requireActual<
  typeof import('../../../src/domain/ingredient-creation/final-check')
>('../../../src/domain/ingredient-creation/final-check');

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

function entry(
  overrides: Partial<NutritionEvidenceEntry> = {},
): NutritionEvidenceEntry {
  return {
    fieldPath: 'macros.crudeProtein',
    finalValue: 20,
    unit: 'g',
    status: 'DIRECT',
    sourceRecordId: 'src-primary',
    sourceValue: 20,
    sourceUnit: 'g',
    formula: null,
    confirmedBy: null,
    confirmedAt: null,
    ...overrides,
  };
}

function entryFromPlanRow(
  row: MergePlan['rows'][number],
): NutritionEvidenceEntry {
  return entry({
    fieldPath: row.fieldPath,
    finalValue: row.value,
    unit: row.unit,
    status: row.status === 'CONFLICT' ? 'DIRECT' : row.status,
    sourceRecordId: row.sourceRecordId,
    sourceValue: row.sourceValue,
    sourceUnit: row.sourceUnit,
  });
}

function profile(
  preparationState: ProfileDraft['preparationState'],
  sourceRecordId: string,
  entries: NutritionEvidenceEntry[],
): ProfileDraft {
  return { preparationState, sourceRecordId, entries, notes: null };
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

const ironMergePlan: MergePlan = {
  primarySourceRecordId: 'src-primary',
  rows: [planRow('minerals.iron', 5.5, 'mg')],
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

function humanEditedIronDraft(): IngredientCreationDraft {
  return createDraft({
    payload: {
      intake: intakeCard,
      mergePlan: ironMergePlan,
      profiles: [
        profile('RAW', 'src-primary', [
          entry({
            fieldPath: 'minerals.iron',
            finalValue: 5.5,
            unit: 'g',
            status: 'MANUAL',
            sourceRecordId: 'src-primary',
            sourceValue: 5.5,
            sourceUnit: 'mg',
          }),
        ]),
      ],
    },
  });
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

  it('profile 存在时用 profile entries 算宏量、能量与 4/9/4 反算值', async () => {
    draftService.get.mockResolvedValue(
      createDraft({
        payload: {
          intake: intakeCard,
          mergePlan: fullMergePlan,
          profiles: [
            profile(
              'RAW',
              'src-primary',
              fullMergePlan.rows.map(entryFromPlanRow),
            ),
            profile('COOKED', 'src-cooked', []),
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

  it('人改过的 profile entries 参与终检：非法单位 → UNIT_MISMATCH（拦死）', async () => {
    runFinalCheckMock.mockImplementation(actualFinalCheck.runFinalCheck);
    draftService.get.mockResolvedValue(humanEditedIronDraft());

    const result = await service.runCheck('draft-1');

    expect(result.blocking).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNIT_MISMATCH',
          fieldPath: 'minerals.iron',
        }),
      ]),
    );

    // 检查的是 profile 里人工改过的 g，而不是 mergePlan 里合法的 mg。
    const input = runFinalCheckMock.mock.calls[0][0];
    expect(input.entries).toEqual([
      expect.objectContaining({
        fieldPath: 'minerals.iron',
        unit: 'g',
        status: 'MANUAL',
      }),
    ]);
  });

  it('profiles 为空时仍按 mergePlan 的证据账本跑，行为不变', async () => {
    runFinalCheckMock.mockImplementation(actualFinalCheck.runFinalCheck);
    draftService.get.mockResolvedValue(
      createDraft({
        payload: {
          intake: intakeCard,
          mergePlan: ironMergePlan,
          profiles: [],
        },
      }),
    );

    const result = await service.runCheck('draft-1');

    expect(result.blocking).toEqual([]);
    const input = runFinalCheckMock.mock.calls[0][0];
    expect(input.entries).toEqual([
      expect.objectContaining({
        fieldPath: 'minerals.iron',
        unit: 'mg',
        status: 'DIRECT',
      }),
    ]);
  });

  it('basis 从 profile 的来源记录取（PER_SERVING + servingGrams）', async () => {
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'src-raw',
        normalizedNutrition: {
          meta: {
            rawBasisType: 'PER_SERVING',
            sampleState: 'RAW',
            servingWeightG: 50,
          },
        },
      },
      {
        id: 'src-primary',
        normalizedNutrition: {
          meta: { rawBasisType: 'PER_100_G', sampleState: 'RAW' },
        },
      },
    ]);
    draftService.get.mockResolvedValue(
      createDraft({
        payload: {
          intake: intakeCard,
          mergePlan: ironMergePlan,
          profiles: [
            profile('RAW', 'src-raw', [
              entryFromPlanRow(ironMergePlan.rows[0]),
            ]),
          ],
        },
      }),
    );

    await service.runCheck('draft-1');

    expect(runFinalCheckMock.mock.calls[0][0].basis).toEqual({
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
            profile('RAW', 'src-primary', []),
            profile('COOKED', 'src-cooked', []),
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

  it('审核页改了原料卡类别 → required 以卡片为准，不再用旧起手卡', async () => {
    draftService.get.mockResolvedValue(
      createDraft({
        payload: {
          // 起手卡是「肉/内脏」（必需生），但人在原料卡上改成了根茎淀粉类（必需熟）。
          intake: intakeCard,
          ingredient: {
            name: '鸡肝',
            type: 'FOOD',
            category: 'STARCHY_VEGETABLE',
            baseUnit: 'G',
            unitDisplayLabel: '克',
            cfctClass: null,
            edibleYieldRate: null,
          },
          mergePlan: fullMergePlan,
          profiles: [profile('RAW', 'src-primary', [])],
        },
      }),
    );

    await service.runCheck('draft-1');

    expect(runFinalCheckMock.mock.calls[0][0].coverage).toEqual({
      required: ['COOKED'],
      present: ['RAW'],
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

  it('没有 profiles 且没有 mergePlan → 400，不跑终检', async () => {
    draftService.get.mockResolvedValue(createDraft({ payload: {} }));

    await expect(service.runCheck('draft-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(runFinalCheckMock).not.toHaveBeenCalled();
  });

  it('提交前置检查：人改过非法单位 → 400，并带回 UNIT_MISMATCH', async () => {
    runFinalCheckMock.mockImplementation(actualFinalCheck.runFinalCheck);
    draftService.get.mockResolvedValue(humanEditedIronDraft());

    const error = await service
      .assertCommitAllowed('draft-1')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    const response = (error as BadRequestException).getResponse() as {
      blocking: Array<{ code: string }>;
    };
    expect(response.blocking).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNIT_MISMATCH',
          fieldPath: 'minerals.iron',
        }),
      ]),
    );
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
