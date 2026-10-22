import { NotFoundException } from '@nestjs/common';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';

describe('IngredientCreationAuditService', () => {
  const prisma = {
    ingredientCreationAudit: {
      findFirst: jest.fn(),
    },
  } as any;

  let service: IngredientCreationAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IngredientCreationAuditService(prisma);
  });

  it('按 ingredientId 读最近一条创建记录，proposals/changes 原样返回', async () => {
    prisma.ingredientCreationAudit.findFirst.mockResolvedValue({
      id: 'audit-1',
      draftId: 'draft-1',
      ingredientId: 'ing-1',
      nutritionFoodIds: ['nf-1', 'nf-2'],
      proposals: [{ kind: 'MERGE', createdAt: '2026-10-22T00:00:00.000Z' }],
      changes: { fields: [], exceptions: [] },
      committedBy: 'admin-1',
      committedAt: new Date('2026-10-22T12:00:00.000Z'),
    });

    const result = await service.getByIngredientId('ing-1');

    expect(prisma.ingredientCreationAudit.findFirst).toHaveBeenCalledWith({
      where: { ingredientId: 'ing-1' },
      orderBy: { committedAt: 'desc' },
    });
    expect(result).toMatchObject({
      id: 'audit-1',
      ingredientId: 'ing-1',
      nutritionFoodIds: ['nf-1', 'nf-2'],
      committedBy: 'admin-1',
      committedAt: '2026-10-22T12:00:00.000Z',
    });
    expect(result.proposals).toEqual([
      { kind: 'MERGE', createdAt: '2026-10-22T00:00:00.000Z' },
    ]);
    expect(result.changes).toEqual({ fields: [], exceptions: [] });
  });

  it('没有审计记录 → NotFoundException', async () => {
    prisma.ingredientCreationAudit.findFirst.mockResolvedValue(null);

    await expect(
      service.getByIngredientId('ing-without-audit'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
