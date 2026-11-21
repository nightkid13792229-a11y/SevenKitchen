import {
  BadRequestException,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { SupplementDraftAiService } from '../../../src/application/ingredient-creation/supplement-draft-ai.service';
import type { SupplementDraftReviewService } from '../../../src/application/ingredient-creation/supplement-draft-review.service';
import type { SupplementDraftService } from '../../../src/application/ingredient-creation/supplement-draft.service';
import type { SupplementFinalizeService } from '../../../src/application/ingredient-creation/supplement-finalize.service';
import type { SupplementVerificationService } from '../../../src/application/ingredient-creation/supplement-verification.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import type { RequestUser } from '../../../src/interfaces/auth/request-user.interface';
import { SupplementDraftController } from '../../../src/interfaces/controllers/supplement-draft.controller';
import {
  AiFillSupplementDraftDto,
  CreateSupplementDraftDto,
  FinalizeSupplementDraftDto,
  UpdateSupplementDraftDto,
} from '../../../src/interfaces/dto/ingredient-creation/supplement-draft.dto';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

const CONTROLLER_PATH = 'api/v1/admin/ingredient-creation/supplement-drafts';

const user: RequestUser = {
  userId: 'admin-1',
  customerId: 'admin-1',
  role: 'ADMIN',
};

/** 原始开关值：用例会临时改写 env，结束后必须还原。 */
const originalFlowFlag = process.env.SUPPLEMENT_DRAFT_FLOW;

function createMocks() {
  return {
    draftService: {
      list: jest.fn(),
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      discard: jest.fn(),
    },
    aiService: { fill: jest.fn() },
    reviewService: { validate: jest.fn(), recommendGroups: jest.fn() },
    finalizeService: { finalize: jest.fn() },
    verificationService: {
      getVerification: jest.fn(),
      reverify: jest.fn(),
    },
  };
}

describe('SupplementDraftController', () => {
  let mocks: ReturnType<typeof createMocks>;
  let controller: SupplementDraftController;

  beforeEach(() => {
    mocks = createMocks();
    controller = new SupplementDraftController(
      mocks.draftService as unknown as SupplementDraftService,
      mocks.aiService as unknown as SupplementDraftAiService,
      mocks.reviewService as unknown as SupplementDraftReviewService,
      mocks.finalizeService as unknown as SupplementFinalizeService,
      mocks.verificationService as unknown as SupplementVerificationService,
    );
    // 普通用例先显式打开（默认关，只有 true 才启用）
    process.env.SUPPLEMENT_DRAFT_FLOW = 'true';
  });

  afterEach(() => {
    if (originalFlowFlag === undefined) {
      delete process.env.SUPPLEMENT_DRAFT_FLOW;
    } else {
      process.env.SUPPLEMENT_DRAFT_FLOW = originalFlowFlag;
    }
  });

  /* ---------------------------------------------------------------- */
  /* 路由契约（spec §11）                                              */
  /* ---------------------------------------------------------------- */

  it('控制器路径与守卫符合 spec §11', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SupplementDraftController)).toBe(
      CONTROLLER_PATH,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SupplementDraftController),
    ).toEqual([AuthGuard, AdminGuard]);
  });

  it('11 条路由的方法与路径符合 spec §11', () => {
    const routes: Array<[string, string, RequestMethod]> = [
      ['list', '/', RequestMethod.GET],
      ['create', '/', RequestMethod.POST],
      ['getVerification', ':id/verification', RequestMethod.GET],
      ['aiFill', ':id/ai-fill', RequestMethod.POST],
      ['validate', ':id/validate', RequestMethod.POST],
      ['finalize', ':id/finalize', RequestMethod.POST],
      ['reverify', ':id/reverify', RequestMethod.POST],
      ['recommendGroups', ':id/recommend-groups', RequestMethod.POST],
      ['get', ':id', RequestMethod.GET],
      ['update', ':id', RequestMethod.PATCH],
      ['discard', ':id', RequestMethod.DELETE],
    ];

    for (const [method, path, requestMethod] of routes) {
      const handler = (
        SupplementDraftController.prototype as unknown as Record<string, object>
      )[method];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
    }
  });

  /* ---------------------------------------------------------------- */
  /* 每个路由：当前用户 + DTO 透传 + 统一响应包                          */
  /* ---------------------------------------------------------------- */

  it('GET / 只查当前用户的草稿', async () => {
    const drafts = [{ id: 'draft-1', name: '鱼油' }];
    mocks.draftService.list.mockResolvedValue(drafts);

    await expect(controller.list(user)).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: drafts,
    });
    expect(mocks.draftService.list).toHaveBeenCalledWith('admin-1');
  });

  it('POST / 用当前用户新建草稿', async () => {
    const dto: CreateSupplementDraftDto = { name: '鱼油' };
    const created = { id: 'draft-1', name: '鱼油' };
    mocks.draftService.create.mockResolvedValue(created);

    await expect(controller.create(user, dto)).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: created,
    });
    expect(mocks.draftService.create).toHaveBeenCalledWith('admin-1', dto);
  });

  it('GET /:id 按 id + 当前用户读取', async () => {
    const draft = { id: 'draft-1' };
    mocks.draftService.get.mockResolvedValue(draft);

    await expect(controller.get(user, 'draft-1')).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: draft,
    });
    expect(mocks.draftService.get).toHaveBeenCalledWith('draft-1', 'admin-1');
  });

  it('PATCH /:id 透传 name/payload/manualFields/expectedUpdatedAt', async () => {
    const dto: UpdateSupplementDraftDto = {
      name: '鱼油',
      payload: { basic: { name: '鱼油' } },
      manualFields: ['basic.name'],
      expectedUpdatedAt: '2026-11-21T00:00:00.000Z',
    };
    const updated = { id: 'draft-1', name: '鱼油' };
    mocks.draftService.update.mockResolvedValue(updated);

    await expect(controller.update(user, 'draft-1', dto)).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: updated,
    });
    expect(mocks.draftService.update).toHaveBeenCalledWith(
      'draft-1',
      'admin-1',
      dto,
    );
  });

  it('DELETE /:id 按 id + 当前用户放弃', async () => {
    const discarded = { id: 'draft-1', status: 'DISCARDED' };
    mocks.draftService.discard.mockResolvedValue(discarded);

    await expect(controller.discard(user, 'draft-1')).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: discarded,
    });
    expect(mocks.draftService.discard).toHaveBeenCalledWith(
      'draft-1',
      'admin-1',
    );
  });

  it('POST /:id/ai-fill 把当前用户与两张图原样传给 AI 服务', async () => {
    const dto: AiFillSupplementDraftDto = {
      frontImageUrl: 'https://cdn.example.com/front.png',
      labelImageUrl: 'https://cdn.example.com/label.png',
      productUrl: 'https://www.iherb.com/pr/x/1',
      selectionNote: '选品依据',
    };
    const filled = { id: 'draft-1' };
    mocks.aiService.fill.mockResolvedValue(filled);

    await expect(controller.aiFill(user, 'draft-1', dto)).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: filled,
    });
    expect(mocks.aiService.fill).toHaveBeenCalledWith(user, 'draft-1', dto);
  });

  it('POST /:id/validate 按 id + 当前用户校验', async () => {
    const review = { draft: { id: 'draft-1' }, blockers: [], warnings: [] };
    mocks.reviewService.validate.mockResolvedValue(review);

    await expect(controller.validate(user, 'draft-1')).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: review,
    });
    expect(mocks.reviewService.validate).toHaveBeenCalledWith(
      'admin-1',
      'draft-1',
    );
  });

  it('POST /:id/finalize 传 { id, name } 与乐观锁 DTO', async () => {
    const dto: FinalizeSupplementDraftDto = {
      expectedUpdatedAt: '2026-11-21T00:00:00.000Z',
    };
    const result = { ingredientId: 'ing-1', verification: { ok: true } };
    mocks.finalizeService.finalize.mockResolvedValue(result);

    await expect(controller.finalize(user, 'draft-1', dto)).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: result,
    });
    expect(mocks.finalizeService.finalize).toHaveBeenCalledWith(
      { id: 'admin-1', name: 'admin-1' },
      'draft-1',
      dto,
    );
  });

  it('GET /:id/verification 按 id + 当前用户读核验报告', async () => {
    const report = { ok: false, checkedAt: '2026-11-21T00:00:00.000Z' };
    mocks.verificationService.getVerification.mockResolvedValue(report);

    await expect(controller.getVerification(user, 'draft-1')).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: report,
    });
    expect(mocks.verificationService.getVerification).toHaveBeenCalledWith(
      'admin-1',
      'draft-1',
    );
  });

  it('POST /:id/reverify 按 id + 当前用户重跑功能核验', async () => {
    const report = { ok: true, checkedAt: '2026-11-21T00:00:00.000Z' };
    mocks.verificationService.reverify.mockResolvedValue(report);

    await expect(controller.reverify(user, 'draft-1')).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: report,
    });
    expect(mocks.verificationService.reverify).toHaveBeenCalledWith(
      'admin-1',
      'draft-1',
    );
  });

  it('POST /:id/recommend-groups 按 id + 当前用户推荐等价组', async () => {
    const recommendations = { equivalenceEnabled: true, candidates: [] };
    mocks.reviewService.recommendGroups.mockResolvedValue(recommendations);

    await expect(controller.recommendGroups(user, 'draft-1')).resolves.toEqual({
      code: 0,
      message: 'Success',
      data: recommendations,
    });
    expect(mocks.reviewService.recommendGroups).toHaveBeenCalledWith(
      'admin-1',
      'draft-1',
    );
  });

  /* ---------------------------------------------------------------- */
  /* 开关                                                              */
  /* ---------------------------------------------------------------- */

  it('SUPPLEMENT_DRAFT_FLOW 未设置或 false 时所有路由 404，且不调用服务', async () => {
    // ① 未设置（默认关）
    delete process.env.SUPPLEMENT_DRAFT_FLOW;

    await expect(controller.list(user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.list(user)).rejects.toThrow('补剂草稿流程未开启');
    await expect(controller.finalize(user, 'draft-1', {})).rejects.toThrow(
      '补剂草稿流程未开启',
    );
    await expect(controller.getVerification(user, 'draft-1')).rejects.toThrow(
      NotFoundException,
    );

    // ② 显式 false
    process.env.SUPPLEMENT_DRAFT_FLOW = 'false';

    await expect(controller.list(user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.finalize(user, 'draft-1', {})).rejects.toThrow(
      '补剂草稿流程未开启',
    );

    expect(mocks.draftService.list).not.toHaveBeenCalled();
    expect(mocks.finalizeService.finalize).not.toHaveBeenCalled();
    expect(mocks.verificationService.getVerification).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /* DTO 边界                                                          */
  /* ---------------------------------------------------------------- */

  describe('DTO 校验', () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });

    async function transformBody<T>(
      metatype: new () => T,
      body: Record<string, unknown>,
    ): Promise<T> {
      return (await pipe.transform(body, {
        type: 'body',
        metatype,
      })) as T;
    }

    it('PATCH 不接受 aiSnapshot/status/finalized* 等客户端字段', async () => {
      const dto = await transformBody(UpdateSupplementDraftDto, {
        payload: { basic: { name: '鱼油' } },
        name: '鱼油',
        manualFields: ['basic.name'],
        aiSnapshot: { proposedDecisions: {} },
        status: 'FINALIZED',
        finalizedIngredientId: 'ing-1',
        finalizedNutritionFoodId: 'nf-1',
        finalizedEvidenceId: 'ev-1',
      });

      expect(dto).toEqual({
        payload: { basic: { name: '鱼油' } },
        name: '鱼油',
        manualFields: ['basic.name'],
      });
    });

    it('PATCH 的 payload 必须是对象', async () => {
      await expect(
        transformBody(UpdateSupplementDraftDto, { payload: 'not-an-object' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AI 起草必须同时有正面图与标签图', async () => {
      await expect(
        transformBody(AiFillSupplementDraftDto, {
          frontImageUrl: 'https://cdn.example.com/front.png',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        transformBody(AiFillSupplementDraftDto, {
          frontImageUrl: 'https://cdn.example.com/front.png',
          labelImageUrl: 'https://cdn.example.com/label.png',
        }),
      ).resolves.toEqual({
        frontImageUrl: 'https://cdn.example.com/front.png',
        labelImageUrl: 'https://cdn.example.com/label.png',
      });
    });
  });
});
