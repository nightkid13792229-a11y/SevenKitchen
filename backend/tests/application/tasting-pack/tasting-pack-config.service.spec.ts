/**
 * 试吃装设置（单例）测试
 *
 * 重点不是 CRUD，而是**校验**：这些参数直接决定售价与备货量，
 * 填错一个数量级（例如把试吃倍率填成 12、把预警阈值填成 -5）
 * 会静默地把生意做亏。所以非法值必须被拒绝，而不是被写进库。
 */
import { BadRequestException } from '@nestjs/common';
import { TastingPackConfigService } from '../../../src/application/tasting-pack/tasting-pack-config.service';

function buildPrismaMock() {
  return {
    tastingPackConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

function buildRow(overrides: Record<string, any> = {}) {
  return {
    enabled: false,
    tastingMultiplier: 1.25,
    priceRoundingMode: 'CEIL_TO_1',
    maxSetsPerOrder: 5,
    lowStockThreshold: 10,
    defaultRestockSets: 20,
    shelfLifeMonths: 6,
    defaultBagsPerRecipe: 2,
    defaultPackSpecG: 80,
    allowForceSchedule: true,
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TastingPackConfigService', () => {
  it('读取配置时把 Decimal 转成 number，并带上 updatedAt', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackConfig.findUnique.mockResolvedValue(buildRow());
    const service = new TastingPackConfigService(prisma as any);

    const config = await service.getConfig();

    expect(config.tastingMultiplier).toBe(1.25);
    expect(typeof config.tastingMultiplier).toBe('number');
    expect(config.updatedAt).toBe('2026-09-25T00:00:00.000Z');
  });

  it('单例不存在时自动落默认值', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackConfig.findUnique.mockResolvedValue(null);
    prisma.tastingPackConfig.create.mockResolvedValue(buildRow());
    const service = new TastingPackConfigService(prisma as any);

    await service.getConfig();

    expect(prisma.tastingPackConfig.create).toHaveBeenCalledWith({
      data: { id: 'singleton' },
    });
  });

  it('拒绝越界或不合理的参数，不写库', async () => {
    const prisma = buildPrismaMock();
    const service = new TastingPackConfigService(prisma as any);

    const cases: Array<[Record<string, any>, string]> = [
      [{ tastingMultiplier: 0 }, '试吃倍率'],
      [{ tastingMultiplier: -1 }, '试吃倍率'],
      [{ tastingMultiplier: 99 }, '试吃倍率'],
      [{ priceRoundingMode: 'ROUND_HALF_UP' as any }, '圆整规则'],
      [{ maxSetsPerOrder: 0 }, '单次限购套数'],
      [{ maxSetsPerOrder: 2.5 }, '单次限购套数'],
      [{ lowStockThreshold: -1 }, '补货预警阈值'],
      [{ defaultRestockSets: 0 }, '默认备货套数'],
      [{ shelfLifeMonths: 0 }, '成品保质期'],
      [{ defaultBagsPerRecipe: 0 }, '每道菜袋数'],
      [{ defaultPackSpecG: 0 }, '每袋克重'],
    ];

    for (const [dto, expectMessage] of cases) {
      await expect(service.updateConfig(dto as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateConfig(dto as any)).rejects.toThrow(
        expectMessage,
      );
    }

    expect(prisma.tastingPackConfig.upsert).not.toHaveBeenCalled();
  });

  it('合法参数只写入传入的字段，不覆盖其他配置', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackConfig.upsert.mockResolvedValue(
      buildRow({ tastingMultiplier: 1.3 }),
    );
    const service = new TastingPackConfigService(prisma as any);

    await service.updateConfig({ tastingMultiplier: 1.3 });

    const call = prisma.tastingPackConfig.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'singleton' });
    expect(call.update).toEqual({ tastingMultiplier: 1.3 });
    expect(Object.keys(call.update)).toHaveLength(1);
  });

  it('isEnabled 如实反映总开关', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPackConfig.findUnique.mockResolvedValue(
      buildRow({ enabled: true }),
    );
    const service = new TastingPackConfigService(prisma as any);

    await expect(service.isEnabled()).resolves.toBe(true);
  });
});
