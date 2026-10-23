import { ConflictException } from '@nestjs/common';
import { RecipeDesignerService } from 'src/application/recipe-designer/recipe-designer.service';

function makeService(updateMany: jest.Mock) {
  const service = Object.create(RecipeDesignerService.prototype) as any;
  service.getDraft = jest.fn().mockResolvedValue({
    id: 'draft-1',
    contentRevision: 7,
    fediafDogScenario: 'ADULT_MER_110',
    items: [],
  });
  service.targetProvider = { getTargets: jest.fn().mockResolvedValue([]) };
  service.assessLoadedDraft = jest.fn().mockResolvedValue({
    items: [],
    groupedEntries: [],
    entries: [],
  });
  service.buildAssessmentUpdateData = jest.fn().mockReturnValue({ isCompliant: true });
  service.prisma = { designRecipe: { updateMany } };
  return service;
}

describe('assessDraftForAgent', () => {
  it('把 assessmentContentRevision 和评估结果原子写入', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = makeService(updateMany);

    const result = await service.assessDraftForAgent('draft-1', { userId: 'u1', role: 'STAFF' });

    expect(result.contentRevision).toBe(7);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', contentRevision: 7 },
      data: { isCompliant: true, assessmentContentRevision: 7 },
    });
  });

  it('评估期间草稿被改（count=0）→ 冲突，不返回新鲜结果', async () => {
    const service = makeService(jest.fn().mockResolvedValue({ count: 0 }));
    await expect(
      service.assessDraftForAgent('draft-1', { userId: 'u1', role: 'STAFF' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('assessDraft', () => {
  it('编辑器评估也把 assessmentContentRevision 一起写回', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = makeService(updateMany);
    service.buildRemovableSupplementWarnings = jest.fn().mockReturnValue([]);
    service.buildDraftAllergenWarnings = jest.fn().mockResolvedValue([]);
    service.toClientAssessmentResult = jest.fn().mockReturnValue({});

    await service.assessDraft('draft-1', { userId: 'u1', role: 'STAFF' });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', contentRevision: 7 },
      data: { isCompliant: true, assessmentContentRevision: 7 },
    });
  });
});
