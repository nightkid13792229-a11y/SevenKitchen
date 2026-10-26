import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  IngredientCreationAuthorizeService,
  type AuthorizeBlockedReason,
  type AuthorizeInput,
} from '../../../src/application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import {
  CHECK_RULES_VERSION,
  IngredientCheckRunService,
} from '../../../src/application/ingredient-creation/ingredient-check-run.service';
import type {
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  IngredientDraft,
  ProfileDraft,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { hashDraftPayload } from '../../../src/domain/ingredient-creation/draft-payload-hash';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

const CREATED_AT = new Date('2026-10-26T08:00:00.000Z');

const EMPTY_RESULT: FinalCheckResult = {
  blocking: [],
  exceptionable: [],
  warnings: [],
};

/** 草稿里「被核验的那份」原料卡：提交入参必须来自它。 */
const DRAFT_INGREDIENT: IngredientDraft = {
  name: '冷冻三文鱼',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克',
};

/** 请求体里夹带的另一份原料卡：任何情况下都不能进入 commit。 */
const BODY_INGREDIENT: IngredientDraft = {
  name: '请求体里的名字',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克',
};

const DRAFT_PROFILES: ProfileDraft[] = [
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
];

/** 请求体里夹带的档案：同样不能进入 commit。 */
const BODY_PROFILES: ProfileDraft[] = [
  {
    preparationState: 'RAW',
    sourceRecordId: 'body-src',
    entries: [],
    notes: null,
  },
];

type CheckRow = Record<string, unknown>;

type PrismaMock = {
  ingredientCheckRun: { findFirst: jest.Mock };
};

function checkItem(code: string): FinalCheckResult['blocking'][number] {
  return { code, message: `${code} message`, fieldPath: 'macros.crudeProtein' };
}

function createDraft(
  overrides: Partial<IngredientCreationDraftPayload> = {},
): IngredientCreationDraft {
  return {
    id: 'draft-1',
    name: '冷冻三文鱼',
    type: 'FOOD',
    step: 'INGREDIENT',
    payload: {
      ingredient: DRAFT_INGREDIENT,
      profiles: DRAFT_PROFILES,
      verify: { exceptions: [] },
      ...overrides,
    },
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-26T07:00:00.000Z'),
    updatedAt: new Date('2026-10-26T07:00:00.000Z'),
  };
}

/** 请求体只剩主档案下标：原料卡与档案一律从草稿取。 */
const authorizeInput: AuthorizeInput = {
  draftId: 'draft-1',
  userId: 'admin-1',
  primaryProfileIndex: 0,
};

async function rejectionOf(
  promise: Promise<unknown>,
): Promise<BadRequestException> {
  try {
    await promise;
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('expected authorize() to reject');
}

function reasonsOf(error: BadRequestException): AuthorizeBlockedReason[] {
  const body = error.getResponse() as {
    message: string;
    reasons: AuthorizeBlockedReason[];
  };
  expect(body.message).toBe('授权前还有未满足的条件');
  return body.reasons;
}

function messageOf(error: BadRequestException): string {
  const body = error.getResponse() as { message?: unknown };
  return typeof body.message === 'string' ? body.message : '';
}

describe('IngredientCreationAuthorizeService', () => {
  let service: IngredientCreationAuthorizeService;
  let prisma: PrismaMock;
  let draftService: { get: jest.Mock };
  let commitService: { commit: jest.Mock };
  let draft: IngredientCreationDraft;
  let runs: Record<'INGREDIENT' | 'NUTRITION', CheckRow | null>;

  function runRow(
    domain: 'INGREDIENT' | 'NUTRITION',
    overrides: Record<string, unknown> = {},
  ): CheckRow {
    const result =
      (overrides.result as FinalCheckResult | undefined) ?? EMPTY_RESULT;

    return {
      id: `run-${domain}`,
      draftId: 'draft-1',
      domain,
      trigger: 'USER',
      rulesVersion: CHECK_RULES_VERSION[domain],
      payloadHash: hashDraftPayload(draft.payload),
      result,
      blockingCount: result.blocking.length,
      exceptionableCount: result.exceptionable.length,
      warningCount: result.warnings.length,
      createdBy: 'admin-1',
      createdAt: CREATED_AT,
      ...overrides,
    };
  }

  beforeEach(async () => {
    draft = createDraft();
    runs = { INGREDIENT: null, NUTRITION: null };

    prisma = {
      ingredientCheckRun: {
        findFirst: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { domain: 'INGREDIENT' | 'NUTRITION' } }) =>
              Promise.resolve(runs[where.domain] ?? null),
          ),
      },
    };
    draftService = {
      get: jest.fn().mockImplementation(() => Promise.resolve(draft)),
    };
    commitService = {
      commit: jest.fn().mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodIds: ['nf-1'],
        auditId: 'audit-1',
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientCreationAuthorizeService,
        IngredientCheckRunService,
        { provide: PrismaService, useValue: prisma },
        { provide: IngredientCreationDraftService, useValue: draftService },
        { provide: IngredientCreationCommitService, useValue: commitService },
      ],
    }).compile();

    service = moduleRef.get(IngredientCreationAuthorizeService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('没有任何核验报告 → 两域各一条 CHECK_MISSING，commit 一次都不调', async () => {
    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toEqual([
      expect.objectContaining({ code: 'CHECK_MISSING', domain: 'INGREDIENT' }),
      expect.objectContaining({ code: 'CHECK_MISSING', domain: 'NUTRITION' }),
    ]);
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('跑完核验又改了草稿 → 两域都 CHECK_STALE（对着当前草稿判）', async () => {
    runs.INGREDIENT = runRow('INGREDIENT');
    runs.NUTRITION = runRow('NUTRITION');
    draft = {
      ...draft,
      payload: {
        ...draft.payload,
        ingredient: {
          ...(draft.payload.ingredient as IngredientDraft),
          name: '冷冻三文鱼 带皮',
        },
      },
    };

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toEqual([
      expect.objectContaining({ code: 'CHECK_STALE', domain: 'INGREDIENT' }),
      expect.objectContaining({ code: 'CHECK_STALE', domain: 'NUTRITION' }),
    ]);
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('报告的 rulesVersion 不是当前规则版本 → CHECK_VERSION（两域各自判）', async () => {
    runs.INGREDIENT = runRow('INGREDIENT', {
      rulesVersion: 'ingredient-card-v0',
    });
    runs.NUTRITION = runRow('NUTRITION', { rulesVersion: 'final-check-v0' });

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toEqual([
      expect.objectContaining({ code: 'CHECK_VERSION', domain: 'INGREDIENT' }),
      expect.objectContaining({ code: 'CHECK_VERSION', domain: 'NUTRITION' }),
    ]);
    expect(reasons[0].detail).toContain('ingredient-card-v0');
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('某一域有拦死项 → CHECK_BLOCKING 带上该域', async () => {
    runs.INGREDIENT = runRow('INGREDIENT', {
      result: {
        blocking: [checkItem('NAME_DUPLICATE')],
        exceptionable: [],
        warnings: [],
      },
    });
    runs.NUTRITION = runRow('NUTRITION');

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toEqual([
      expect.objectContaining({ code: 'CHECK_BLOCKING', domain: 'INGREDIENT' }),
    ]);
    expect(reasons[0].detail).toContain('NAME_DUPLICATE');
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('exceptionable 没登记例外 → CHECK_EXCEPTIONABLE，commit 不调', async () => {
    runs.INGREDIENT = runRow('INGREDIENT', {
      result: {
        blocking: [],
        exceptionable: [checkItem('EDIBLE_RANGE')],
        warnings: [],
      },
    });
    runs.NUTRITION = runRow('NUTRITION');

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toEqual([
      expect.objectContaining({
        code: 'CHECK_EXCEPTIONABLE',
        domain: 'INGREDIENT',
      }),
    ]);
    expect(reasons[0].detail).toContain('EDIBLE_RANGE');
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('exceptionable 按 code 命中 payload.verify.exceptions → 放行并提交', async () => {
    // 例外必须在核验之前就登记：登记本身也是草稿内容，会进哈希。
    draft = createDraft({
      verify: {
        exceptions: [
          {
            code: 'EDIBLE_RANGE',
            reason: '按供应商实测可食部 0.95 处理',
            approvedBy: 'admin-1',
            approvedAt: '2026-10-26T07:30:00.000Z',
          },
        ],
      },
    });
    runs.INGREDIENT = runRow('INGREDIENT', {
      result: {
        blocking: [],
        exceptionable: [checkItem('EDIBLE_RANGE')],
        warnings: [],
      },
    });
    runs.NUTRITION = runRow('NUTRITION');

    const result = await service.authorize(authorizeInput);

    expect(commitService.commit).toHaveBeenCalledTimes(1);
    expect(typeof result.authorizedAt).toBe('string');
  });

  it('四条件都满足才真正 commit，并用草稿里的原料卡 / 档案', async () => {
    runs.INGREDIENT = runRow('INGREDIENT');
    runs.NUTRITION = runRow('NUTRITION');

    const result = await service.authorize(authorizeInput);

    expect(commitService.commit).toHaveBeenCalledTimes(1);
    expect(commitService.commit).toHaveBeenCalledWith({
      draftId: 'draft-1',
      userId: 'admin-1',
      ingredient: DRAFT_INGREDIENT,
      profiles: DRAFT_PROFILES,
      primaryProfileIndex: 0,
    });
    const { authorizedAt, ...submitted } = result;
    expect(submitted).toEqual({
      ingredientId: 'ing-1',
      nutritionFoodIds: ['nf-1'],
      auditId: 'audit-1',
    });
    expect(typeof authorizedAt).toBe('string');
    expect(Date.parse(authorizedAt)).not.toBeNaN();
  });

  it('入参里夹带的 ingredient / profiles 一律忽略，写入的仍是草稿', async () => {
    runs.INGREDIENT = runRow('INGREDIENT');
    runs.NUTRITION = runRow('NUTRITION');
    const tamperedInput = {
      ...authorizeInput,
      ingredient: BODY_INGREDIENT,
      profiles: BODY_PROFILES,
    } as AuthorizeInput;

    await service.authorize(tamperedInput);

    expect(commitService.commit).toHaveBeenCalledTimes(1);
    expect(commitService.commit).toHaveBeenCalledWith({
      draftId: 'draft-1',
      userId: 'admin-1',
      ingredient: DRAFT_INGREDIENT,
      profiles: DRAFT_PROFILES,
      primaryProfileIndex: 0,
    });
  });

  it('一域登记了例外、另一域有 blocking → 例外不能掩盖另一域的阻断', async () => {
    // 原料域的可例外项已被 verify.exceptions 覆盖；营养域仍有拦死项。
    draft = createDraft({
      verify: {
        exceptions: [
          {
            code: 'EDIBLE_RANGE',
            reason: '按供应商实测可食部 0.95 处理',
            approvedBy: 'admin-1',
            approvedAt: '2026-10-26T07:30:00.000Z',
          },
        ],
      },
    });
    runs.INGREDIENT = runRow('INGREDIENT', {
      result: {
        blocking: [],
        exceptionable: [checkItem('EDIBLE_RANGE')],
        warnings: [],
      },
    });
    runs.NUTRITION = runRow('NUTRITION', {
      result: {
        blocking: [checkItem('MACRO_SUM_OVER_100')],
        exceptionable: [],
        warnings: [],
      },
    });

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toEqual([
      expect.objectContaining({ code: 'CHECK_BLOCKING', domain: 'NUTRITION' }),
    ]);
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('一次收齐所有未满足条件，而不是只报第一条', async () => {
    // 原料域没跑过；营养域报告是旧内容、有拦死项、还有没登记例外的可例外项。
    runs.NUTRITION = runRow('NUTRITION', {
      payloadHash: 'stale-hash',
      result: {
        blocking: [checkItem('MACRO_SUM_OVER_100')],
        exceptionable: [checkItem('FIBER_MISSING')],
        warnings: [],
      },
    });

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(
      reasons.map((reason) => `${reason.code}:${reason.domain ?? ''}`),
    ).toEqual([
      'CHECK_MISSING:INGREDIENT',
      'CHECK_STALE:NUTRITION',
      'CHECK_BLOCKING:NUTRITION',
      'CHECK_EXCEPTIONABLE:NUTRITION',
    ]);
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('草稿缺原料卡 → 400 CHECK_MISSING（写明缺原料卡），commit 零调用', async () => {
    draft = createDraft({ ingredient: undefined });

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toHaveLength(1);
    expect(reasons[0].code).toBe('CHECK_MISSING');
    expect(reasons[0].detail).toContain('原料卡');
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('草稿没有任何可用档案 → 400 CHECK_MISSING（写明缺营养档案）', async () => {
    draft = createDraft({
      profiles: [
        {
          preparationState: 'FROZEN' as never,
          sourceRecordId: 'src-primary',
          entries: [],
          notes: null,
        },
      ],
    });

    const reasons = reasonsOf(
      await rejectionOf(service.authorize(authorizeInput)),
    );

    expect(reasons).toHaveLength(1);
    expect(reasons[0].code).toBe('CHECK_MISSING');
    expect(reasons[0].detail).toContain('营养档案');
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('primaryProfileIndex 越界 → 400，commit 零调用', async () => {
    runs.INGREDIENT = runRow('INGREDIENT');
    runs.NUTRITION = runRow('NUTRITION');

    const error = await rejectionOf(
      service.authorize({ ...authorizeInput, primaryProfileIndex: 5 }),
    );

    expect(messageOf(error)).toContain('主档案下标');
    expect(commitService.commit).not.toHaveBeenCalled();
  });

  it('primaryProfileIndex 指向不可用档案 → 400，commit 零调用', async () => {
    draft = createDraft({
      profiles: [
        DRAFT_PROFILES[0],
        {
          preparationState: 'FROZEN' as never,
          sourceRecordId: 'src-cooked',
          entries: [],
          notes: null,
        },
      ],
    });
    runs.INGREDIENT = runRow('INGREDIENT');
    runs.NUTRITION = runRow('NUTRITION');

    const error = await rejectionOf(
      service.authorize({ ...authorizeInput, primaryProfileIndex: 1 }),
    );

    expect(messageOf(error)).toContain('主档案下标');
    expect(commitService.commit).not.toHaveBeenCalled();
  });
});
