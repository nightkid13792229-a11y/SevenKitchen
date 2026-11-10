import { ReplenishmentService } from '../../../src/application/purchasing/replenishment.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('ReplenishmentService · 过期草稿清理', () => {
  it('deletes only stale draft rows and their imports', async () => {
    const prisma: any = {
      purchaseList: {
        findMany: jest.fn().mockResolvedValue([{ id: 'draft-1' }, { id: 'draft-2' }]),
        delete: jest.fn().mockResolvedValue({}),
      },
      purchaseOrderImport: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new ReplenishmentService(
      {} as any,
      {} as any,
      prisma,
      {} as any,
      {} as any,
    );

    const deleted = await service.cleanupStaleDrafts();

    expect(deleted).toBe(2);
    expect(prisma.purchaseOrderImport.deleteMany).toHaveBeenCalledWith({
      where: { purchaseListId: 'draft-1' },
    });
    expect(prisma.purchaseList.delete).toHaveBeenCalledWith({
      where: { id: 'draft-2' },
    });
  });
});
