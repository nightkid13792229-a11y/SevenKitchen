jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StaffGuard } from '../../src/interfaces/guards/role.guard';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StaffPurchasingController } from '../../src/interfaces/controllers/staff-purchasing.controller';
import { CreateStaffProcurementSkuDto } from '../../src/interfaces/dto/staff/procurement-sku-create.dto';

describe('StaffPurchasingController — 新增采购商品', () => {
  const purchasingService = {} as any;
  const reimbursementService = {} as any;
  const cosService = { uploadImage: jest.fn() };
  const procurementSkuService = {
    getFormOptions: jest.fn(),
    createFromStaff: jest.fn(),
  } as any;
  const draftService = { draftFromScreenshot: jest.fn() } as any;

  const controller = new StaffPurchasingController(
    purchasingService,
    reimbursementService,
    cosService as any,
    procurementSkuService,
    draftService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('截图落到 procurement-sku-screenshots 目录', async () => {
    cosService.uploadImage.mockResolvedValue({
      url: 'https://img.example.com/x.jpg',
      key: 'procurement-sku-screenshots/x.jpg',
    });

    const result = await controller.uploadProcurementSkuScreenshot({
      originalname: 'shot.jpg',
    } as any);

    expect(cosService.uploadImage).toHaveBeenCalledWith(
      expect.anything(),
      'shot.jpg',
      'procurement-sku-screenshots',
    );
    expect(result.data).toEqual({
      url: 'https://img.example.com/x.jpg',
      key: 'procurement-sku-screenshots/x.jpg',
    });
  });

  it('没传文件时拒绝上传', async () => {
    await expect(
      controller.uploadProcurementSkuScreenshot(undefined as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('form-options 把请求转给服务层', async () => {
    procurementSkuService.getFormOptions.mockResolvedValue({
      baseUnit: 'G',
      purchaseUnits: ['g', '袋'],
    });

    const result = await controller.getProcurementSkuFormOptions('ing-1');

    expect(procurementSkuService.getFormOptions).toHaveBeenCalledWith('ing-1');
    expect(result.data).toEqual({ baseUnit: 'G', purchaseUnits: ['g', '袋'] });
  });

  it('识别成功时返回草稿', async () => {
    draftService.draftFromScreenshot.mockResolvedValue({
      name: '沃集鲜 糙米 1kg',
      missing: [],
      confidence: {},
    });

    const result = await controller.draftProcurementSku(
      { imageUrl: 'https://img.example.com/x.jpg', ingredientId: 'ing-1' },
      'user-1',
    );

    expect(draftService.draftFromScreenshot).toHaveBeenCalledWith({
      imageUrl: 'https://img.example.com/x.jpg',
      ingredientId: 'ing-1',
      userId: 'user-1',
    });
    expect(result.data).toEqual({
      draft: expect.objectContaining({ name: '沃集鲜 糙米 1kg' }),
      degraded: false,
    });
  });

  it('模型超时这类故障降级为手填，而不是报 500', async () => {
    draftService.draftFromScreenshot.mockRejectedValue(new Error('timeout'));

    const result = await controller.draftProcurementSku(
      { imageUrl: 'https://img.example.com/x.jpg', ingredientId: 'ing-1' },
      'user-1',
    );

    expect(result.data).toEqual({ draft: null, degraded: true });
  });

  it('订单列表截图这类明确的拒绝要原样抛给前端，不能被降级吞掉', async () => {
    const verdict = new BadRequestException('这张图看起来是订单列表，请截商品详情页');
    draftService.draftFromScreenshot.mockRejectedValue(verdict);

    await expect(
      controller.draftProcurementSku(
        { imageUrl: 'https://img.example.com/x.jpg', ingredientId: 'ing-1' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('配额用尽也要把原因告诉员工，不能降级成"没认出来"', async () => {
    const quotaError = new BadRequestException('今天的识别次数已用完（每天 30 次）');
    draftService.draftFromScreenshot.mockRejectedValue(quotaError);

    await expect(
      controller.draftProcurementSku(
        { imageUrl: 'https://img.example.com/x.jpg', ingredientId: 'ing-1' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('整个采购接口都要求员工身份（顾客 token 不能建采购商品）', () => {
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, StaffPurchasingController) as unknown[]) ?? [];
    expect(guards).toContain(StaffGuard);
  });

  it('创建时把当前登录用户写进 createdById', async () => {
    procurementSkuService.createFromStaff.mockResolvedValue({
      status: 'created',
      sku: { id: 'sku-1' },
    });

    const dto = plainToInstance(CreateStaffProcurementSkuDto, {
      name: '椰汁',
      purchaseChannel: '山姆',
      purchaseUnit: '箱',
      packCount: 24,
      netContentPerPack: 330,
    });

    const result = await controller.createStaffProcurementSku(
      'ing-1',
      dto,
      'user-9',
    );

    expect(procurementSkuService.createFromStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'ing-1',
        createdById: 'user-9',
        packCount: 24,
        netContentPerPack: 330,
      }),
    );
    expect(result.data).toEqual({ status: 'created', sku: { id: 'sku-1' } });
  });
});

describe('CreateStaffProcurementSkuDto', () => {
  const build = (payload: Record<string, unknown>) =>
    plainToInstance(CreateStaffProcurementSkuDto, payload);

  it('件数为 0 时不通过校验', async () => {
    const errors = await validate(
      build({
        name: '椰汁',
        purchaseChannel: '山姆',
        purchaseUnit: '箱',
        packCount: 0,
        netContentPerPack: 330,
      }),
    );

    expect(errors.map((error) => error.property)).toContain('packCount');
  });

  it('缺商品名时不通过校验', async () => {
    const errors = await validate(
      build({
        purchaseChannel: '山姆',
        purchaseUnit: '箱',
        packCount: 1,
        netContentPerPack: 330,
      }),
    );

    expect(errors.map((error) => error.property)).toContain('name');
  });
});
