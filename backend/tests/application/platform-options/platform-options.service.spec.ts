import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformOptionsService } from '../../../src/application/platform-options/platform-options.service';
import {
  CUSTOM_RECIPE_STATUS_SET,
  ENUM_SOURCES,
  OPTION_SET_DEFINITIONS,
} from '../../../src/application/platform-options/option-sets.registry';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 平台选项字典 · 服务测试（2026-10-16，批次 1.3）
 *
 * 用一个**内存假数据库**而不是 jest.fn 桩：要验证的行为里有
 * 「同步只补缺失、不覆盖人工改过的文案」这类**状态相关**的语义，
 * 用纯桩验证不了（桩不会真的累积状态）。
 */

interface SetRow {
  code: string;
  name: string;
  description: string | null;
  sourceType: string;
  enumName: string | null;
  enabled: boolean;
}

interface ItemRow {
  id: string;
  setId: string;
  code: string;
  label: string;
  description: string | null;
  tone: string | null;
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
  isDefault: boolean;
  extra: unknown;
}

let seq = 0;

function createFakePrisma() {
  const sets = new Map<string, SetRow>();
  const items: ItemRow[] = [];
  let queryCount = 0;

  const api = {
    platformOptionSet: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { code: string };
          create: SetRow;
          update: Partial<SetRow>;
        }) => {
          const existing = sets.get(where.code);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          sets.set(where.code, { enabled: true, ...create });
          return sets.get(where.code);
        },
      ),
    },
    platformOptionItem: {
      findMany: jest.fn(
        async (args: {
          where?: { setId?: string; enabled?: boolean; set?: { enabled: boolean } };
          select?: { code: boolean; label: boolean };
          orderBy?: unknown;
        }) => {
          queryCount += 1;
          let rows = items.slice();
          if (args?.where?.setId) {
            rows = rows.filter((row) => row.setId === args.where!.setId);
          }
          if (args?.where?.enabled !== undefined) {
            rows = rows.filter((row) => row.enabled === args.where!.enabled);
          }
          if (args?.where?.set) {
            rows = rows.filter(
              (row) => sets.get(row.setId)?.enabled === args.where!.set!.enabled,
            );
          }
          rows.sort(
            (left, right) =>
              left.sortOrder - right.sortOrder ||
              left.code.localeCompare(right.code),
          );
          if (args?.select) {
            return rows.map((row) => ({
              code: row.code,
              label: row.label,
            }));
          }
          return rows;
        },
      ),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { setId_code: { setId: string; code: string } };
        }) =>
          items.find(
            (row) =>
              row.setId === where.setId_code.setId &&
              row.code === where.setId_code.code,
          ) ?? null,
      ),
      groupBy: jest.fn(
        async (args: {
          by: string[];
          where?: { enabled?: boolean };
        }) => {
          queryCount += 1;
          const rows = args?.where?.enabled
            ? items.filter((row) => row.enabled === args.where!.enabled)
            : items;
          const buckets = new Map<string, number>();
          for (const row of rows) {
            buckets.set(row.setId, (buckets.get(row.setId) ?? 0) + 1);
          }
          return [...buckets.entries()].map(([setId, count]) => ({
            setId,
            _count: { _all: count },
          }));
        },
      ),
      count: jest.fn(async (args: { where?: { setId?: string } }) => {
        queryCount += 1;
        if (!args?.where?.setId) return items.length;
        return items.filter((row) => row.setId === args.where!.setId).length;
      }),
      create: jest.fn(async ({ data }: { data: Omit<ItemRow, 'id'> }) => {
        const row: ItemRow = {
          id: `id-${(seq += 1)}`,
          enabled: true,
          isDefault: false,
          ...data,
          setId: data.setId,
          code: data.code,
          label: data.label,
          description: data.description ?? null,
          tone: data.tone ?? null,
          icon: data.icon ?? null,
          sortOrder: data.sortOrder ?? 0,
          extra: data.extra ?? null,
        };
        items.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { setId_code: { setId: string; code: string } };
          data: Partial<ItemRow>;
        }) => {
          const row = items.find(
            (candidate) =>
              candidate.setId === where.setId_code.setId &&
              candidate.code === where.setId_code.code,
          );
          if (!row) throw new Error('not found');
          Object.assign(row, data);
          return row;
        },
      ),
      delete: jest.fn(
        async ({
          where,
        }: {
          where: { setId_code: { setId: string; code: string } };
        }) => {
          const index = items.findIndex(
            (candidate) =>
              candidate.setId === where.setId_code.setId &&
              candidate.code === where.setId_code.code,
          );
          if (index < 0) throw new Error('not found');
          return items.splice(index, 1)[0];
        },
      ),
    },
  };

  return { api, sets, items, getQueryCount: () => queryCount };
}

describe('PlatformOptionsService', () => {
  let service: PlatformOptionsService;
  let fake: ReturnType<typeof createFakePrisma>;

  beforeEach(async () => {
    seq = 0;
    fake = createFakePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformOptionsService,
        { provide: PrismaService, useValue: fake.api },
      ],
    }).compile();
    service = module.get(PlatformOptionsService);
  });

  describe('启动同步', () => {
    it('空库时把 ENUM 类的全部取值补进来', async () => {
      const result = await service.syncEnumBackedSets();

      // 定制订单状态 5 档 + 定制目标 4 档 = 9
      expect(result.inserted).toBe(9);
      expect(result.unlabeled).toEqual([]);

      const statuses = await service.listSet(CUSTOM_RECIPE_STATUS_SET);
      expect(statuses.map((item) => item.code)).toEqual([
        'PENDING_PAYMENT',
        'PAID',
        'IN_PROGRESS',
        'DELIVERED',
        'CANCELLED',
      ]);
      // 中文来自登记表，不是英文码
      expect(statuses.find((item) => item.code === 'PAID')?.label).toBe('已付款');
    });

    it('★ 只补缺失，**不覆盖人工改过的文案**', async () => {
      await service.syncEnumBackedSets();

      // 运营把「已付款」改成了「已收款」
      await service.updateItem(CUSTOM_RECIPE_STATUS_SET, 'PAID', {
        label: '已收款',
      });

      // 重启服务（再跑一次同步）
      const second = await service.syncEnumBackedSets();

      expect(second.inserted).toBe(0);
      const statuses = await service.listSet(CUSTOM_RECIPE_STATUS_SET);
      expect(statuses.find((item) => item.code === 'PAID')?.label).toBe(
        '已收款',
      );
    });

    it('补齐时会给「还没配中文」的项报警', async () => {
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      /**
       * 手工造一个"枚举里有、登记表里没配标签"的场景：
       * 直接删掉登记表里的 CANCELLED，同步会把它补回来但标签只能是码本身，
       * 于是应当进 unlabeled 列表并打 warn。
       */
      const original = OPTION_SET_DEFINITIONS.find(
        (set) => set.code === CUSTOM_RECIPE_STATUS_SET,
      )!.seed!;
      const cancelled = original.find((item) => item.code === 'CANCELLED')!;
      const index = original.indexOf(cancelled);
      original.splice(index, 1);

      try {
        const result = await service.syncEnumBackedSets();
        expect(result.unlabeled).toContain(
          `${CUSTOM_RECIPE_STATUS_SET}/CANCELLED`,
        );
      } finally {
        original.splice(index, 0, cancelled);
      }
    });
  });

  describe('读与缓存', () => {
    it('批量取多个选项集', async () => {
      await service.syncEnumBackedSets();

      const sets = await service.listSets([
        CUSTOM_RECIPE_STATUS_SET,
        'custom_recipe_goal',
      ]);

      expect(Object.keys(sets).sort()).toEqual([
        'custom_recipe_goal',
        CUSTOM_RECIPE_STATUS_SET,
      ].sort());
      expect(sets['custom_recipe_goal']).toHaveLength(4);
    });

    it('不传 codes 时返回全部登记的选项集（没数据的给空数组，不是 undefined）', async () => {
      const sets = await service.listSets();
      for (const definition of OPTION_SET_DEFINITIONS) {
        expect(sets[definition.code]).toEqual([]);
      }
    });

    it('连续两次读只查一次库（缓存生效）', async () => {
      await service.syncEnumBackedSets();
      const before = fake.getQueryCount();

      await service.listSets();
      await service.listSets();

      expect(fake.getQueryCount()).toBe(before + 1);
    });

    it('写操作之后缓存失效（不会读到旧值）', async () => {
      await service.syncEnumBackedSets();
      await service.listSet(CUSTOM_RECIPE_STATUS_SET); // 预热缓存

      await service.updateItem(CUSTOM_RECIPE_STATUS_SET, 'PAID', {
        label: '已收款',
      });

      const statuses = await service.listSet(CUSTOM_RECIPE_STATUS_SET);
      expect(statuses.find((item) => item.code === 'PAID')?.label).toBe(
        '已收款',
      );
    });

    it('未知选项集报 404，不是静默空数组', async () => {
      await expect(service.listSet('not_a_set')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('labelOf 能把码翻成中文（后端自己发通知时用）', async () => {
      await service.syncEnumBackedSets();
      expect(await service.labelOf(CUSTOM_RECIPE_STATUS_SET, 'DELIVERED')).toBe(
        '已交付',
      );
      expect(await service.labelOf(CUSTOM_RECIPE_STATUS_SET, 'NOPE')).toBeNull();
    });
  });

  describe('后台维护页用的「全部选项集」接口', () => {
    it('列出全部登记集，并标出哪些可增删、各有几项', async () => {
      await service.syncEnumBackedSets();
      await service.seedDataSetsIfEmpty();

      const sets = await service.listAllSetsForAdmin();

      expect(sets).toHaveLength(OPTION_SET_DEFINITIONS.length);

      const status = sets.find((row) => row.code === CUSTOM_RECIPE_STATUS_SET)!;
      expect(status.sourceType).toBe('ENUM');
      // ENUM 类不能增删 —— 前端据此把「新增/删除」按钮置灰
      expect(status.canAddOrRemove).toBe(false);
      expect(status.itemCount).toBe(5);

      const aftersale = sets.find(
        (row) => row.code === 'custom_recipe_aftersale_type',
      )!;
      expect(aftersale.sourceType).toBe('DATA');
      expect(aftersale.canAddOrRemove).toBe(true);
      expect(aftersale.itemCount).toBe(3);
    });

    it('停用的项计入 itemCount 但不计入 enabledCount', async () => {
      await service.syncEnumBackedSets();
      await service.updateItem(CUSTOM_RECIPE_STATUS_SET, 'PAID', {
        enabled: false,
      });

      const status = (await service.listAllSetsForAdmin()).find(
        (row) => row.code === CUSTOM_RECIPE_STATUS_SET,
      )!;
      expect(status.itemCount).toBe(5);
      expect(status.enabledCount).toBe(4);
    });

    it('色彩档位由后端给出（前端不自己写一份）', () => {
      const tones = service.listTones();
      expect(tones).toContain('warning');
      expect(tones).toContain('success');
      expect(tones.length).toBeGreaterThan(0);
    });
  });

  describe('ENUM 类选项集不许增删（代码有依赖）', () => {
    beforeEach(async () => {
      await service.syncEnumBackedSets();
    });

    it('新增被拒绝，且提示怎么改', async () => {
      await expect(
        service.createItem(CUSTOM_RECIPE_STATUS_SET, {
          code: 'REFUNDING',
          label: '退款中',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('删除被拒绝', async () => {
      await expect(
        service.deleteItem(CUSTOM_RECIPE_STATUS_SET, 'PAID'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('但**改标签/排序/启用**是允许的', async () => {
      await service.updateItem(CUSTOM_RECIPE_STATUS_SET, 'PAID', {
        label: '已收款',
        sortOrder: 15,
        enabled: false,
      });

      const { items } = await service.listSetForAdmin(CUSTOM_RECIPE_STATUS_SET);
      const paid = items.find((item) => item.code === 'PAID');
      expect(paid?.label).toBe('已收款');
      expect(paid?.sortOrder).toBe(15);
      expect(paid?.enabled).toBe(false);
    });
  });

  describe('DATA 类选项集可以增删改', () => {
    beforeEach(async () => {
      await service.seedDataSetsIfEmpty();
    });

    it('可以新增与删除', async () => {
      await service.createItem('custom_recipe_aftersale_type', {
        code: 'URGENT',
        label: '加急',
        sortOrder: 5,
      });

      let items = await service.listSet('custom_recipe_aftersale_type');
      expect(items.map((item) => item.code)).toContain('URGENT');
      // 排序生效：sortOrder 5 排在最前
      expect(items[0].code).toBe('URGENT');

      await service.deleteItem('custom_recipe_aftersale_type', 'URGENT');
      items = await service.listSet('custom_recipe_aftersale_type');
      expect(items.map((item) => item.code)).not.toContain('URGENT');
    });

    it('同一个集里码不能重复', async () => {
      await expect(
        service.createItem('custom_recipe_aftersale_type', {
          code: 'QUESTION',
          label: '重复的',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('空标签被拒绝', async () => {
      await expect(
        service.createItem('custom_recipe_aftersale_type', {
          code: 'X',
          label: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('色彩档位白名单', () => {
    beforeEach(async () => {
      await service.seedDataSetsIfEmpty();
    });

    it('未知档位被拒绝（前端会把不认识的值静默变成默认样式）', async () => {
      await expect(
        service.updateItem('custom_recipe_aftersale_type', 'QUESTION', {
          tone: 'red',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('合法档位可以写', async () => {
      await expect(
        service.updateItem('custom_recipe_aftersale_type', 'QUESTION', {
          tone: 'danger',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('登记表与实现的一致性', () => {
    it('ENUM 类都必须登记 enumName，且能在 ENUM_SOURCES 里找到', async () => {
      const enumSets = OPTION_SET_DEFINITIONS.filter(
        (set) => set.sourceType === 'ENUM',
      );
      expect(enumSets.length).toBeGreaterThan(0);

      for (const definition of enumSets) {
        expect(definition.enumName).toBeTruthy();
        expect(ENUM_SOURCES[definition.enumName!]).toBeDefined();
      }
    });

    it('登记表里每个码都有唯一的 code（同集内不重复）', () => {
      for (const definition of OPTION_SET_DEFINITIONS) {
        const codes = (definition.seed ?? []).map((item) => item.code);
        expect(new Set(codes).size).toBe(codes.length);
      }
    });
  });
});
