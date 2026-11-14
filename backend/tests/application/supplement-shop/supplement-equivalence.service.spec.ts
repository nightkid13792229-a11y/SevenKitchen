import { SupplementDosageService } from '../../../src/application/supplement-shop/supplement-dosage.service';
import {
  SupplementEquivalenceService,
  buildApprovalErrors,
  canTransitionEquivalenceStatus,
} from '../../../src/application/supplement-shop/supplement-equivalence.service';

function matches(where: any, row: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') {
      return (value as any[]).some((child) => matches(child, row));
    }
    if (key === 'AND') {
      return (value as any[]).every((child) => matches(child, row));
    }
    if (value && typeof value === 'object' && 'in' in (value as any)) {
      return (value as any).in.includes(row[key]);
    }
    if (value && typeof value === 'object' && 'contains' in (value as any)) {
      return String(row[key] ?? '')
        .toLowerCase()
        .includes(String((value as any).contains).toLowerCase());
    }
    return row[key] === value;
  });
}

function createStore() {
  const groups: any[] = [];
  const ingredients: any[] = [];
  const audits: any[] = [];
  const recipeItems: any[] = [];
  let sequence = 0;

  const prisma: any = {
    $transaction: async (arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    },
    supplementEquivalenceGroup: {
      findUnique: async ({ where, include, select }: any) => {
        const group = groups.find((row) => matches(where, row));
        if (!group) return null;
        const result: any = { ...group };
        if (include?.ingredients) {
          result.ingredients = ingredients.filter(
            (item) => item.equivalenceGroupId === group.id,
          );
        }
        if (include?.auditLogs) {
          result.auditLogs = audits
            .filter((item) => item.groupId === group.id)
            .slice()
            .reverse();
        }
        if (include?._count) {
          result._count = {
            ingredients: ingredients.filter(
              (item) => item.equivalenceGroupId === group.id,
            ).length,
          };
        }
        if (select) {
          const selected: any = {};
          for (const key of Object.keys(select)) selected[key] = result[key];
          return selected;
        }
        return result;
      },
      findMany: async ({ where, include, select, skip, take }: any = {}) => {
        let rows = groups.filter((row) => matches(where, row));
        rows = rows
          .slice()
          .sort(
            (a, b) =>
              Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          );
        if (skip) rows = rows.slice(skip);
        if (take) rows = rows.slice(0, take);
        return rows.map((group) => {
          const result: any = { ...group };
          if (include?.ingredients) {
            result.ingredients = ingredients.filter(
              (item) => item.equivalenceGroupId === group.id,
            );
          }
          if (include?._count || select?._count) {
            result._count = {
              ingredients: ingredients.filter(
                (item) => item.equivalenceGroupId === group.id,
              ).length,
            };
          }
          return result;
        });
      },
      count: async ({ where }: any) =>
        groups.filter((row) => matches(where, row)).length,
      create: async ({ data }: any) => {
        sequence += 1;
        const now = new Date();
        const group = {
          id: `group-${sequence}`,
          isActive: true,
          sortOrder: 0,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
          evidenceUrls: [],
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        groups.push(group);
        return { ...group };
      },
      update: async ({ where, data }: any) => {
        const group = groups.find((row) => matches(where, row));
        if (!group) throw new Error('group not found');
        Object.assign(group, data, { updatedAt: new Date() });
        return { ...group };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = groups.filter((row) => matches(where, row));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      delete: async ({ where }: any) => {
        const index = groups.findIndex((row) => matches(where, row));
        if (index < 0) throw new Error('group not found');
        return groups.splice(index, 1)[0];
      },
    },
    supplementEquivalenceGroupAudit: {
      create: async ({ data }: any) => {
        audits.push(data);
        return data;
      },
    },
    ingredient: {
      findMany: async ({ where, select }: any = {}) => {
        const rows = ingredients.filter((row) => matches(where, row));
        return rows.map((row) => {
          if (select?._count) {
            return {
              ...row,
              _count: {
                recipeItems: recipeItems.filter(
                  (item) => item.ingredientId === row.id,
                ).length,
              },
            };
          }
          return { ...row };
        });
      },
      findFirst: async ({ where }: any) =>
        ingredients.find((row) => matches(where, row)) ?? null,
      update: async ({ where, data }: any) => {
        const row = ingredients.find((item) => matches(where, item));
        if (!row) throw new Error('ingredient not found');
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = ingredients.filter((row) => matches(where, row));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      count: async ({ where }: any) =>
        ingredients.filter((row) => matches(where, row)).length,
    },
    recipeItem: {
      count: async ({ where }: any) =>
        recipeItems.filter((row) => matches(where, row)).length,
      groupBy: async ({ by, where }: any) => {
        const rows = recipeItems.filter((row) => matches(where, row));
        const counts = new Map<string, number>();
        for (const row of rows) {
          const key = row[by[0]];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([ingredientId, count]) => ({
          ingredientId,
          _count: { _all: count },
        }));
      },
    },
  };

  return { prisma, groups, ingredients, audits, recipeItems };
}

function calciumIngredient(overrides: Record<string, any> = {}) {
  return {
    id: 'ing-caco3',
    name: '碳酸钙粉',
    brand: 'NOW FOODS',
    productModel: '600mg钙/1.7克',
    type: 'SUPPLEMENT',
    physicalForm: 'POWDER',
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    purchaseUnit: 'g',
    purchaseToBaseRatio: 1,
    currentPricePerPurchaseUnit: 10,
    supplementRetailEnabled: true,
    diyEnabled: true,
    properties: {},
    equivalenceGroupId: null,
    equivalencePriority: 0,
    nutritionProfile: {
      meta: { rawBasisType: 'PER_1_G' },
      minerals: { calcium: 353 },
    },
    ...overrides,
  };
}

function groupInput(overrides: Record<string, any> = {}) {
  return {
    code: 'CALCIUM_MINERAL_SALT',
    name: '钙 · 矿物盐',
    nutrientKey: 'minerals.calcium',
    nutrientLabel: '钙',
    nutrientUnit: 'mg',
    formCategory: '矿物盐',
    evidenceUrls: ['https://example.com/nrc-2006'],
    ...overrides,
  };
}

const operator = { id: 'admin-1', name: '管理员' };

describe('SupplementEquivalenceService', () => {
  let store: ReturnType<typeof createStore>;
  let service: SupplementEquivalenceService;

  beforeEach(() => {
    store = createStore();
    store.ingredients.push(
      calciumIngredient(),
      calciumIngredient({
        id: 'ing-citrate',
        name: '柠檬酸钙粉',
        brand: 'NOW FOODS',
        nutritionProfile: {
          meta: { rawBasisType: 'PER_1_G' },
          minerals: { calcium: 210 },
        },
      }),
      calciumIngredient({
        id: 'ing-bad',
        name: '坏档案钙',
        nutritionProfile: {
          meta: { rawBasisType: 'PER_SERVING' },
          minerals: { calcium: 353 },
        },
      }),
      calciumIngredient({
        id: 'ing-noconc',
        name: '无浓度钙',
        nutritionProfile: { meta: { rawBasisType: 'PER_1_G' }, minerals: {} },
      }),
      calciumIngredient({
        id: 'ing-food',
        name: '鸡胸肉',
        type: 'FOOD',
      }),
    );
    service = new SupplementEquivalenceService(
      store.prisma,
      new SupplementDosageService(),
    );
  });

  it('creates a draft group and writes an audit row', async () => {
    const group = await service.create(groupInput(), operator);

    expect(group.status).toBe('DRAFT');
    expect(group.evidenceUrls).toEqual(['https://example.com/nrc-2006']);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0].action).toBe('CREATE');
  });

  it('rejects duplicate codes and unknown nutrients', async () => {
    await service.create(groupInput(), operator);

    await expect(
      service.create(groupInput({ name: '重复组' }), operator),
    ).rejects.toThrow('已存在');

    await expect(
      service.create(
        groupInput({ code: 'UNKNOWN', nutrientKey: 'minerals.unknown' }),
        operator,
      ),
    ).rejects.toThrow('不在营养字段目录');

    await expect(
      service.create(
        groupInput({
          code: 'CUSTOM_BAD',
          nutrientKey: 'custom:氨糖',
          nutrientLabel: '软骨素',
          nutrientUnit: 'mg',
        }),
        operator,
      ),
    ).rejects.toThrow('编码应为');
  });

  it('takes label and unit from the nutrition catalog, not from the form', async () => {
    const group = await service.create(
      groupInput({
        code: 'TAURINE',
        name: '牛磺酸',
        nutrientKey: 'aminoAcids.taurine',
        nutrientLabel: '牛磺酸',
        // 导入时被写错的单位：目录里牛磺酸是 g
        nutrientUnit: 'mg',
      }),
      operator,
    );

    expect(group.nutrientLabel).toBe('牛磺酸');
    expect(group.nutrientUnit).toBe('g');

    const updated = await service.update(
      group.id,
      { nutrientUnit: 'mg' },
      operator,
    );
    expect(updated.nutrientUnit).toBe('g');
  });

  it('still lets custom nutrients keep their own name and unit', async () => {
    const group = await service.create(
      groupInput({
        code: 'CUSTOM_GLUCOSAMINE',
        nutrientKey: 'custom:氨糖',
        nutrientLabel: '氨糖',
        nutrientUnit: 'mg',
      }),
      operator,
    );

    expect(group.nutrientKey).toBe('custom:氨糖');
    expect(group.nutrientUnit).toBe('mg');
  });

  it('approves only after evidence and healthy members are present', async () => {
    const group = await service.create(groupInput(), operator);
    await service.addMembers(
      group.id,
      ['ing-caco3', 'ing-citrate'],
      operator,
    );
    await service.changeStatus(group.id, 'PENDING_REVIEW', operator);
    const approved = await service.changeStatus(
      group.id,
      'APPROVED',
      operator,
      '管理员审核通过',
    );

    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewedBy).toBe('管理员');
    expect(approved.reviewedAt).toBeTruthy();
    expect(approved.approvalErrors).toEqual([]);
    expect(approved.referenceIngredientId).toBe('ing-caco3');
  });

  it('refuses approval without evidence', async () => {
    const group = await service.create(
      groupInput({ evidenceUrls: [] }),
      operator,
    );
    await service.addMembers(group.id, ['ing-caco3'], operator);
    await service.changeStatus(group.id, 'PENDING_REVIEW', operator);

    await expect(
      service.changeStatus(group.id, 'APPROVED', operator),
    ).rejects.toThrow('分组依据');
  });

  it('refuses approval when a member has no concentration or a unit mismatch', async () => {
    const group = await service.create(groupInput(), operator);
    await service.addMembers(group.id, ['ing-noconc'], operator);
    await service.changeStatus(group.id, 'PENDING_REVIEW', operator);
    await expect(
      service.changeStatus(group.id, 'APPROVED', operator),
    ).rejects.toThrow('缺少钙浓度');

    const second = await service.create(
      groupInput({ code: 'CALCIUM_SECOND', name: '钙 · 第二组' }),
      operator,
    );
    await service.addMembers(second.id, ['ing-bad'], operator);
    await service.changeStatus(second.id, 'PENDING_REVIEW', operator);
    await expect(
      service.changeStatus(second.id, 'APPROVED', operator),
    ).rejects.toThrow('没填每份克重');
  });

  it('reverts an approved group to draft when it is edited', async () => {
    const group = await service.create(groupInput(), operator);
    await service.addMembers(group.id, ['ing-caco3'], operator);
    await service.changeStatus(group.id, 'PENDING_REVIEW', operator);
    await service.changeStatus(group.id, 'APPROVED', operator);

    const updated = await service.update(
      group.id,
      { name: '钙 · 矿物盐（改名）' },
      operator,
    );

    expect(updated.status).toBe('DRAFT');
    expect(updated.reviewedBy).toBeNull();
    expect(updated.reviewedAt).toBeNull();
  });

  it('does not let a member join two groups at once', async () => {
    const first = await service.create(groupInput(), operator);
    await service.addMembers(first.id, ['ing-caco3'], operator);
    const second = await service.create(
      groupInput({ code: 'CALCIUM_BONE', name: '钙 · 骨源' }),
      operator,
    );

    await expect(
      service.addMembers(second.id, ['ing-caco3'], operator),
    ).rejects.toThrow('其他组');
  });

  it('moves a member between groups with audits on both sides', async () => {
    const first = await service.create(groupInput(), operator);
    await service.addMembers(first.id, ['ing-caco3', 'ing-citrate'], operator);
    const second = await service.create(
      groupInput({ code: 'CALCIUM_BONE', name: '钙 · 骨源' }),
      operator,
    );

    const result = await service.assign(['ing-caco3'], second.id, operator);

    expect(result).toEqual({ moved: 1, skipped: 0 });
    expect(
      store.ingredients.find((row) => row.id === 'ing-caco3')
        ?.equivalenceGroupId,
    ).toBe(second.id);
    expect(
      store.audits.some(
        (row) => row.groupId === first.id && row.action === 'MEMBER_REMOVE',
      ),
    ).toBe(true);
    expect(
      store.audits.some(
        (row) => row.groupId === second.id && row.action === 'MEMBER_ADD',
      ),
    ).toBe(true);
  });

  it('rejects non-supplement ingredients and removing unknown members', async () => {
    const group = await service.create(groupInput(), operator);

    await expect(
      service.addMembers(group.id, ['ing-food'], operator),
    ).rejects.toThrow('只有补剂原料');

    await expect(
      service.removeMember(group.id, 'ing-caco3', operator),
    ).rejects.toThrow('不在此组');
  });

  it('summarizes groups and ungrouped supplements', async () => {
    const group = await service.create(groupInput(), operator);
    await service.addMembers(group.id, ['ing-caco3'], operator);

    const summary = await service.summary();

    expect(summary.total).toBe(1);
    expect(summary.draft).toBe(1);
    expect(summary.approved).toBe(0);
    expect(summary.ungrouped).toBe(3);
    expect(summary.singleton).toBe(1);
  });
});

describe('equivalence group pure rules', () => {
  it('only allows the documented status transitions', () => {
    expect(canTransitionEquivalenceStatus('DRAFT', 'PENDING_REVIEW')).toBe(true);
    expect(canTransitionEquivalenceStatus('PENDING_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionEquivalenceStatus('PENDING_REVIEW', 'DRAFT')).toBe(true);
    expect(canTransitionEquivalenceStatus('APPROVED', 'DISABLED')).toBe(true);
    expect(canTransitionEquivalenceStatus('DISABLED', 'DRAFT')).toBe(true);
    expect(canTransitionEquivalenceStatus('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionEquivalenceStatus('APPROVED', 'DRAFT')).toBe(false);
    expect(canTransitionEquivalenceStatus('DISABLED', 'APPROVED')).toBe(false);
  });

  it('reports every approval blocker at once', () => {
    const errors = buildApprovalErrors({
      group: {
        nutrientKey: 'minerals.calcium',
        nutrientLabel: '钙',
        nutrientUnit: 'mg',
        evidenceUrls: [],
      },
      members: [{ name: '甲' }, { name: '乙' }],
      resolve: (member: any) =>
        member.name === '甲'
          ? { status: 'UNIT_MISMATCH', actualUnit: 'g' }
          : { status: 'MISSING' },
    });

    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('分组依据');
    expect(errors[1]).toContain('甲');
    expect(errors[2]).toContain('乙');
  });

  // 2026-11-14：只说"单位与组不一致（g）"没法照着改，得说清是谁的、改哪边
  it('spells out both units when the group unit and the profile unit differ', () => {
    const errors = buildApprovalErrors({
      group: {
        nutrientKey: 'aminoAcids.taurine',
        nutrientLabel: '牛磺酸',
        nutrientUnit: 'mg',
        evidenceUrls: ['https://example.com/nrc-2006'],
      },
      members: [{ name: '牛磺酸胶囊' }],
      resolve: () => ({
        status: 'UNIT_MISMATCH',
        actualUnit: 'g',
        reason: 'UNIT_LABEL',
      }),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('牛磺酸胶囊');
    expect(errors[0]).toContain('组里写的是 mg');
    expect(errors[0]).toContain('档案按 g 记');
  });

  it('names the counting unit when the basis cannot be converted', () => {
    const errors = buildApprovalErrors({
      group: {
        nutrientKey: 'derived.epaDha',
        nutrientLabel: 'EPA + DHA',
        nutrientUnit: 'mg',
        evidenceUrls: ['https://example.com/nrc-2006'],
      },
      members: [{ name: '藻油' }],
      resolve: () => ({
        status: 'UNIT_MISMATCH',
        actualUnit: '粒',
        reason: 'BASIS_BASE_MISMATCH',
      }),
    });

    expect(errors[0]).toContain('藻油');
    expect(errors[0]).toContain('库存按「粒」计');
  });
});
