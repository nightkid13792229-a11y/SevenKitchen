import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import type {
  IngredientCreationDraft,
  MergePlan,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

function createDraft(
  overrides: Partial<IngredientCreationDraft> = {},
): IngredientCreationDraft {
  return {
    id: 'draft-1',
    name: '鸡肝',
    type: 'FOOD',
    step: 'SOURCES',
    payload: {},
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-22T00:00:00.000Z'),
    updatedAt: new Date('2026-10-22T00:00:00.000Z'),
    ...overrides,
  };
}

function sourceRecords() {
  return [
    {
      id: 'src-primary',
      normalizedNutrition: {
        meta: {
          rawBasisType: 'PER_100_G',
          sampleState: 'RAW',
          fieldSources: {
            'macros.crudeProtein': { originalValue: 20, originalUnit: 'g' },
            'vitamins.vitaminB12': {
              originalValue: '0.55',
              originalUnit: 'mg',
            },
          },
        },
        macros: { crudeProtein: 20 },
        minerals: { iron: 5.5 },
        vitamins: { vitaminB12: 550 },
      },
    },
    {
      id: 'src-supplemental',
      normalizedNutrition: {
        meta: {
          rawBasisType: 'PER_100_G',
          fieldSources: {
            'macros.crudeFat': { originalValue: '5', originalUnit: 'g' },
          },
        },
        macros: { crudeFat: 5 },
        minerals: { iron: 12 },
      },
    },
  ];
}

const draftPlanWithIronConflict: MergePlan = {
  primarySourceRecordId: 'src-primary',
  rows: [
    {
      fieldPath: 'minerals.iron',
      value: null,
      unit: 'mg',
      status: 'CONFLICT',
      sourceRecordId: null,
      sourceValue: null,
      sourceUnit: null,
    },
  ],
  conflicts: [
    {
      fieldPath: 'minerals.iron',
      candidates: [
        {
          sourceRecordId: 'src-primary',
          value: 5.5,
          unit: 'mg',
          sourceValue: 5.5,
          sourceUnit: 'mg',
        },
        {
          sourceRecordId: 'src-supplemental',
          value: 12,
          unit: 'mg',
          sourceValue: 12,
          sourceUnit: 'mg',
        },
      ],
    },
  ],
  missingFields: [],
};

describe('IngredientCreationMergeService', () => {
  let service: IngredientCreationMergeService;
  let prisma: { nutritionSourceRecord: { findMany: jest.Mock } };
  let draftService: {
    get: jest.Mock;
    patch: jest.Mock;
    appendProposal: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      nutritionSourceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    draftService = {
      get: jest.fn().mockResolvedValue(createDraft()),
      patch: jest.fn().mockResolvedValue(createDraft()),
      appendProposal: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientCreationMergeService,
        { provide: PrismaService, useValue: prisma },
        { provide: IngredientCreationDraftService, useValue: draftService },
      ],
    }).compile();

    service = moduleRef.get(IngredientCreationMergeService);
  });

  it('适配 normalizedNutrition：canonical 值 + 来源原文，补缺不覆盖、冲突不裁决', async () => {
    prisma.nutritionSourceRecord.findMany.mockResolvedValue(sourceRecords());

    const plan = await service.createMergePlan('draft-1', {
      primarySourceRecordId: 'src-primary',
      supplementalSourceRecordIds: ['src-supplemental'],
    });

    const row = (fieldPath: string) =>
      plan.rows.find((item) => item.fieldPath === fieldPath);

    expect(row('macros.crudeProtein')).toMatchObject({
      status: 'DIRECT',
      value: 20,
      sourceValue: 20,
      sourceUnit: 'g',
    });
    expect(row('macros.crudeFat')).toMatchObject({
      status: 'FILLED',
      value: 5,
      sourceValue: 5,
      sourceUnit: 'g',
    });
    // 来源原文 0.55 mg → 目录单位 550 μg；两套数都要保留。
    expect(row('vitamins.vitaminB12')).toMatchObject({
      status: 'DIRECT',
      value: 550,
      sourceValue: 0.55,
      sourceUnit: 'mg',
    });
    expect(row('minerals.iron')).toMatchObject({
      status: 'CONFLICT',
      value: null,
    });
    expect(plan.conflicts).toEqual([
      {
        fieldPath: 'minerals.iron',
        candidates: [
          {
            sourceRecordId: 'src-primary',
            value: 5.5,
            unit: 'mg',
            sourceValue: 5.5,
            sourceUnit: 'mg',
          },
          {
            sourceRecordId: 'src-supplemental',
            value: 12,
            unit: 'mg',
            sourceValue: 12,
            sourceUnit: 'mg',
          },
        ],
      },
    ]);
  });

  it('先存 MERGE 原始快照，再 patch 当前方案', async () => {
    prisma.nutritionSourceRecord.findMany.mockResolvedValue(sourceRecords());
    const proposalHistory: Array<Record<string, unknown>> = [];
    draftService.appendProposal.mockImplementation(
      async (
        _draftId: string,
        proposal: Record<string, unknown>,
        kind: string,
      ) => {
        proposalHistory.push({ ...proposal, kind });
      },
    );

    const plan = await service.createMergePlan('draft-1', {
      primarySourceRecordId: 'src-primary',
      supplementalSourceRecordIds: ['src-supplemental'],
    });

    expect(proposalHistory).toHaveLength(1);
    expect(proposalHistory[0]).toMatchObject({
      kind: 'MERGE',
      primarySourceRecordId: 'src-primary',
    });
    expect(
      (proposalHistory[0].conflicts as MergePlan['conflicts'])[0].candidates,
    ).toHaveLength(2);
    expect(draftService.appendProposal).toHaveBeenCalledTimes(1);
    expect(draftService.appendProposal).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({ primarySourceRecordId: 'src-primary' }),
      'MERGE',
    );
    // 快照必须是原始方案：含冲突候选，人工裁决后仍能追到 AI 当初提了什么。
    const snapshot = draftService.appendProposal.mock.calls[0][1];
    expect(snapshot).toEqual(plan);
    expect(snapshot.conflicts[0].candidates).toHaveLength(2);
    expect(
      draftService.appendProposal.mock.invocationCallOrder[0],
    ).toBeLessThan(draftService.patch.mock.invocationCallOrder[0]);
    expect(draftService.patch).toHaveBeenCalledWith('draft-1', 'SOURCES', {
      mergePlan: plan,
    });
    expect(draftService.patch.mock.calls[0][2]).not.toHaveProperty(
      'proposalHistory',
    );
  });

  it('采纳主来源只 patch 当前方案，写成 DIRECT，且不追加提案快照', async () => {
    draftService.get.mockResolvedValue(
      createDraft({ payload: { mergePlan: draftPlanWithIronConflict } }),
    );

    const resolved = await service.resolveConflict('draft-1', {
      fieldPath: 'minerals.iron',
      sourceRecordId: 'src-primary',
    });

    expect(resolved.rows).toEqual([
      {
        fieldPath: 'minerals.iron',
        value: 5.5,
        unit: 'mg',
        status: 'DIRECT',
        sourceRecordId: 'src-primary',
        sourceValue: 5.5,
        sourceUnit: 'mg',
      },
    ]);
    expect(resolved.conflicts).toEqual([]);
    expect(draftService.appendProposal).not.toHaveBeenCalled();
    expect(draftService.patch).toHaveBeenCalledWith('draft-1', 'SOURCES', {
      mergePlan: resolved,
    });
    // 人工裁决只改当前方案，proposalHistory 原样保留、不由这里写入。
    expect(draftService.patch.mock.calls[0][2]).not.toHaveProperty(
      'proposalHistory',
    );
  });

  it('裁决一个没有冲突的字段 → 领域层 Error 映射成 400，且不 patch', async () => {
    draftService.get.mockResolvedValue(
      createDraft({ payload: { mergePlan: draftPlanWithIronConflict } }),
    );

    await expect(
      service.resolveConflict('draft-1', {
        fieldPath: 'minerals.zinc',
        sourceRecordId: 'src-primary',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.resolveConflict('draft-1', {
        fieldPath: 'minerals.zinc',
        sourceRecordId: 'src-primary',
      }),
    ).rejects.toThrow('No unresolved conflict');
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('主来源不存在 → 400，不写快照也不 patch', async () => {
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([]);

    await expect(
      service.createMergePlan('draft-1', {
        primarySourceRecordId: 'src-missing',
        supplementalSourceRecordIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(draftService.appendProposal).not.toHaveBeenCalled();
    expect(draftService.patch).not.toHaveBeenCalled();
  });
});
