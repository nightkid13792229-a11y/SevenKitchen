import { BadRequestException } from '@nestjs/common';
import { CoverTrashService } from 'src/application/recipe-designer/cover-trash.service';

describe('CoverTrashService', () => {
  const prisma = {
    coverTrash: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const referenceService = { isReferenced: jest.fn() };
  const cosService = {
    copyImageToTrash: jest.fn(),
    deleteImageByUrl: jest.fn(),
    deleteImageByUrlStrict: jest.fn(),
    isOwnedImageUrl: jest.fn(),
  };
  const service = new CoverTrashService(
    prisma as never,
    referenceService as never,
    cosService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    referenceService.isReferenced.mockResolvedValue(false);
    cosService.isOwnedImageUrl.mockReturnValue(true);
    cosService.copyImageToTrash.mockResolvedValue(
      'https://img.sevenkitchen.cloud/recipes/covers/trash/1.jpg',
    );
    prisma.coverTrash.create.mockResolvedValue({ id: 'trash-1' });
  });

  it('未被引用：移动到 trash 并写表，7 天后删除', async () => {
    const before = Date.now();
    const trashed = await service.trashIfUnreferenced(
      'https://img.sevenkitchen.cloud/recipes/covers/a.jpg',
      'REPLACED',
    );

    expect(trashed).toBe(true);
    expect(cosService.copyImageToTrash).toHaveBeenCalledWith(
      'https://img.sevenkitchen.cloud/recipes/covers/a.jpg',
    );
    const data = prisma.coverTrash.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      sourceUrl: 'https://img.sevenkitchen.cloud/recipes/covers/a.jpg',
      trashUrl: 'https://img.sevenkitchen.cloud/recipes/covers/trash/1.jpg',
      reason: 'REPLACED',
      status: 'PENDING',
    });
    expect(data.deleteAfter.getTime()).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000,
    );
  });

  it('仍被引用：不动 COS、不写表', async () => {
    referenceService.isReferenced.mockResolvedValue(true);

    const trashed = await service.trashIfUnreferenced(
      'https://img.sevenkitchen.cloud/recipes/covers/a.jpg',
      'REPLACED',
    );

    expect(trashed).toBe(false);
    expect(cosService.copyImageToTrash).not.toHaveBeenCalled();
    expect(prisma.coverTrash.create).not.toHaveBeenCalled();
  });

  it('非本站 COS 地址：拒绝，不碰外部对象', async () => {
    cosService.isOwnedImageUrl.mockReturnValue(false);
    await expect(
      service.trashIfUnreferenced(
        'https://example.com/recipes/covers/a.jpg',
        'REPLACED',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cosService.copyImageToTrash).not.toHaveBeenCalled();
  });

  it('已在 trash 前缀的地址直接跳过', async () => {
    const trashed = await service.trashIfUnreferenced(
      'https://img.sevenkitchen.cloud/recipes/covers/trash/old.jpg',
      'PREVIEW_DISCARDED',
    );
    expect(trashed).toBe(false);
    expect(cosService.copyImageToTrash).not.toHaveBeenCalled();
  });

  it('到期清理：删 trash 对象并标记 DELETED', async () => {
    prisma.coverTrash.findMany.mockResolvedValue([
      { id: 't1', trashUrl: 'https://img.sevenkitchen.cloud/recipes/covers/trash/1.jpg' },
    ]);
    cosService.deleteImageByUrlStrict.mockResolvedValue(undefined);
    prisma.coverTrash.update.mockResolvedValue({ id: 't1' });

    await expect(service.cleanupExpired()).resolves.toBe(1);
    expect(cosService.deleteImageByUrlStrict).toHaveBeenCalledWith(
      'https://img.sevenkitchen.cloud/recipes/covers/trash/1.jpg',
    );
    expect(prisma.coverTrash.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'DELETED' },
    });
  });
});
