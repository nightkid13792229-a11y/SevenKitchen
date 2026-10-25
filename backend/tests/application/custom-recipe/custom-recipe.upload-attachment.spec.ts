import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';

/**
 * 附件上传的订单关联（2026-10-25 生产事故）。
 *
 * 真实现象：COS 上传成功，但写 custom_recipe_attachment 时
 * `custom_recipe_attachment_order_id_fkey` 外键失败 → 接口 500 → 页面没缩略图。
 *
 * 根因：控制器传的是**业务订单号 CR…**，附件表 `order_id` 外键要的是
 * `custom_recipe_order.id`（uuid）。这里守住“先把业务号解析成主键再写”。
 */
describe('CustomRecipeService · 上传附件按订单主键落库', () => {
  function createService() {
    const order = { id: 'order-pk-1', orderId: 'CR202610250001' };
    const prisma = {
      customRecipeOrder: {
        findFirst: jest.fn().mockResolvedValue(order),
      },
      customRecipeAttachment: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'attachment-1',
          ...data,
          uploadedAt: new Date('2026-10-25T09:00:00.000Z'),
        })),
      },
    };
    const cos = {
      uploadImage: jest.fn().mockResolvedValue({
        url: 'https://img.sevenkitchen.cloud/custom-recipe-attachments/a.jpg',
        key: 'custom-recipe-attachments/a.jpg',
      }),
      getSensitiveMediaUrl: jest.fn().mockReturnValue('https://api.example.com/media/sensitive/token'),
    };
    const service = new CustomRecipeService(
      prisma as unknown as PrismaService,
      cos as unknown as TencentCosService,
      {} as CustomRecipeConfigService,
      {} as CustomRecipePricingService,
    );
    return { service, prisma, cos };
  }

  it('★ 业务订单号 CR… 先解析成订单主键，再写附件', async () => {
    const { service, prisma } = createService();
    const file = {
      originalname: 'a.jpg',
      size: 1024,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    const result = await service.uploadAttachment(file, 'CR202610250001');

    expect(prisma.customRecipeOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ orderId: 'CR202610250001' }),
          ]),
        }),
      }),
    );
    expect(prisma.customRecipeAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order-pk-1' }),
      }),
    );
    expect(result.fileUrl).toContain('/media/sensitive/');
  });

  it('找不到订单时给 404，不写附件', async () => {
    const { service, prisma } = createService();
    (prisma.customRecipeOrder.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.uploadAttachment(
        { originalname: 'a.jpg', size: 1 } as Express.Multer.File,
        'CR-MISSING',
      ),
    ).rejects.toThrow('订单不存在');
    expect(prisma.customRecipeAttachment.create).not.toHaveBeenCalled();
  });
});
