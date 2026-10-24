import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';

/**
 * 删除附件（2026-10-25）。
 *
 * 只删数据库记录会留下永久孤儿文件；必须连 COS 一起删。
 * 顾客删除还要校验附件属于本人的订单。
 */
function createService(options: {
  attachment?: unknown;
  cosError?: Error;
} = {}) {
  const prisma = {
    customRecipeAttachment: {
      findUnique: jest.fn().mockResolvedValue(
        'attachment' in options
          ? options.attachment
          : {
              id: 'att-1',
              fileUrl: 'https://cdn.example.com/a.jpg',
              order: { customerId: 'user-1' },
            },
      ),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const cos = {
    deleteImageByUrl: options.cosError
      ? jest.fn().mockRejectedValue(options.cosError)
      : jest.fn().mockResolvedValue(undefined),
  };
  const service = new CustomRecipeService(
    prisma as never,
    cos as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, cos };
}

describe('CustomRecipeService.deleteAttachment', () => {
  it('先删 COS 再删记录', async () => {
    const { service, prisma, cos } = createService();

    await service.deleteAttachment('att-1', 'user-1');

    expect(cos.deleteImageByUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/a.jpg',
    );
    expect(prisma.customRecipeAttachment.delete).toHaveBeenCalledWith({
      where: { id: 'att-1' },
    });
  });

  it('不是本人的附件：拒绝，且不动 COS / 数据库', async () => {
    const { service, prisma, cos } = createService();

    await expect(
      service.deleteAttachment('att-1', 'user-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(cos.deleteImageByUrl).not.toHaveBeenCalled();
    expect(prisma.customRecipeAttachment.delete).not.toHaveBeenCalled();
  });

  it('COS 删除失败：保留记录，让顾客重试', async () => {
    const { service, prisma } = createService({
      cosError: new Error('cos down'),
    });

    await expect(
      service.deleteAttachment('att-1', 'user-1'),
    ).rejects.toThrow('cos down');

    expect(prisma.customRecipeAttachment.delete).not.toHaveBeenCalled();
  });

  it('附件不存在：返回 NotFound', async () => {
    const { service } = createService({ attachment: null });

    await expect(
      service.deleteAttachment('missing', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
