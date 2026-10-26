import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipeTaxonomyService } from 'src/application/recipe-taxonomy/recipe-taxonomy.service';

function createService(options: {
  kindExists?: boolean;
  node?: Record<string, unknown> | null;
  childCount?: number;
  linkCount?: number;
}) {
  const prisma = {
    recipeTaxonomyKind: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.kindExists === false
            ? null
            : { id: 'k1', code: 'MAIN_PROTEIN' },
        ),
    },
    recipeTaxonomyNode: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.node === undefined
            ? {
                id: 'n1',
                kindId: 'k1',
                name: '鱼类',
                definition: 'd',
                sort: 10,
                status: 'ACTIVE',
              }
            : options.node,
        ),
      count: jest.fn().mockResolvedValue(options.childCount ?? 0),
      create: jest.fn(async ({ data }: any) => ({ id: 'n-new', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'n1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'n1' }),
    },
    recipeSeriesTaxonomy: {
      count: jest.fn().mockResolvedValue(options.linkCount ?? 0),
    },
  };
  return { prisma, service: new RecipeTaxonomyService(prisma as never) };
}

describe('RecipeTaxonomyService.createNode', () => {
  it('定义为空拒绝', async () => {
    const { service } = createService({});
    await expect(
      service.createNode({ kindId: 'k1', name: '鱼', definition: '   ' }),
    ).rejects.toThrow(/定义不能为空/);
  });

  it('定义超过 200 字拒绝', async () => {
    const { service } = createService({});
    await expect(
      service.createNode({
        kindId: 'k1',
        name: '鱼',
        definition: '字'.repeat(201),
      }),
    ).rejects.toThrow(/不能超过 200 字/);
  });

  it('分类不存在时报错', async () => {
    const { service } = createService({ kindExists: false });
    await expect(
      service.createNode({ kindId: 'k-missing', name: '鱼', definition: 'd' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('正常创建时 trim 名称与定义', async () => {
    const { prisma, service } = createService({});
    await service.createNode({
      kindId: 'k1',
      name: '  鱼类  ',
      definition: '  占比第一的动物蛋白来自鱼  ',
    });
    expect(prisma.recipeTaxonomyNode.create).toHaveBeenCalledWith({
      data: {
        kindId: 'k1',
        parentId: null,
        name: '鱼类',
        definition: '占比第一的动物蛋白来自鱼',
        sort: 0,
      },
    });
  });
});

describe('RecipeTaxonomyService.updateNode', () => {
  it('节点不存在时 404', async () => {
    const { service } = createService({ node: null });
    await expect(service.updateNode('n-missing', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('把定义改空拒绝', async () => {
    const { service } = createService({});
    await expect(service.updateNode('n1', { definition: ' ' })).rejects.toThrow(
      /定义不能为空/,
    );
  });

  it('停用节点不删除任何归属', async () => {
    const { prisma, service } = createService({});
    await service.updateNode('n1', { status: 'DISABLED' });
    expect(prisma.recipeSeriesTaxonomy.count).not.toHaveBeenCalled();
    expect(prisma.recipeTaxonomyNode.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { status: 'DISABLED' },
    });
  });
});

describe('RecipeTaxonomyService.deleteNode', () => {
  it('有子节点时拒绝', async () => {
    const { service } = createService({ childCount: 2 });
    await expect(service.deleteNode('n1')).rejects.toThrow(/子节点/);
  });

  it('有归属时拒绝并报数量', async () => {
    const { service } = createService({ childCount: 0, linkCount: 3 });
    await expect(service.deleteNode('n1')).rejects.toThrow(/还有 3 道菜/);
  });

  it('无子节点无归属才允许删除', async () => {
    const { prisma, service } = createService({
      childCount: 0,
      linkCount: 0,
    });
    await service.deleteNode('n1');
    expect(prisma.recipeTaxonomyNode.delete).toHaveBeenCalledWith({
      where: { id: 'n1' },
    });
  });
});
