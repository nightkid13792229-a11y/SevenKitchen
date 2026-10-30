import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findAnyNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  SupplementDosageService,
  normalizeCustomNutrientName,
} from './supplement-dosage.service';

export type EquivalenceOperator = {
  id: string;
  name?: string | null;
};

export type EquivalenceGroupStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'DISABLED';

export interface UpsertEquivalenceGroupInput {
  code: string;
  name: string;
  nutrientKey: string;
  nutrientLabel: string;
  nutrientUnit: string;
  formCategory?: string | null;
  description?: string | null;
  rationale?: string | null;
  evidenceSummary?: string | null;
  evidenceUrls?: string[];
  sortOrder?: number;
}

export interface EquivalenceGroupListQuery {
  status?: string;
  nutrientKey?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

const GROUP_MEMBER_SELECT = {
  id: true,
  name: true,
  brand: true,
  productModel: true,
  type: true,
  physicalForm: true,
  baseUnit: true,
  unitDisplayLabel: true,
  purchaseUnit: true,
  purchaseToBaseRatio: true,
  currentPricePerPurchaseUnit: true,
  supplementRetailEnabled: true,
  diyEnabled: true,
  properties: true,
  nutritionProfile: true,
  equivalencePriority: true,
} satisfies Prisma.IngredientSelect;

export function isCustomEquivalenceKey(nutrientKey: string): boolean {
  return String(nutrientKey ?? '').startsWith('custom:');
}

export function canTransitionEquivalenceStatus(
  from: string,
  to: string,
): boolean {
  const allowed: Record<string, string[]> = {
    DRAFT: ['PENDING_REVIEW'],
    PENDING_REVIEW: ['APPROVED', 'DRAFT'],
    APPROVED: ['DISABLED'],
    DISABLED: ['DRAFT'],
  };
  return (allowed[from] ?? []).includes(to);
}

export function buildApprovalErrors(input: {
  group: {
    nutrientKey: string;
    nutrientLabel: string;
    nutrientUnit: string;
    evidenceUrls: unknown;
  };
  members: Array<{ name: string }>;
  resolve: (member: any) =>
    | { status: 'OK' }
    | { status: 'MISSING' }
    | { status: 'UNIT_MISMATCH'; actualUnit?: string };
}): string[] {
  const errors: string[] = [];

  if (input.members.length === 0) {
    errors.push('组内至少要有 1 个原料');
  }

  const evidence = Array.isArray(input.group.evidenceUrls)
    ? input.group.evidenceUrls.filter((item) => String(item ?? '').trim())
    : [];
  if (evidence.length === 0) {
    errors.push('请先填写至少 1 条分组依据（文献链接或条目）');
  }

  for (const member of input.members) {
    const resolved = input.resolve(member);
    if (resolved.status === 'UNIT_MISMATCH') {
      errors.push(
        `${member.name} 的${input.group.nutrientLabel}单位与组不一致（${resolved.actualUnit || '未知单位'}）`,
      );
    } else if (resolved.status !== 'OK') {
      errors.push(
        `${member.name} 缺少${input.group.nutrientLabel}浓度（${input.group.nutrientUnit}）`,
      );
    }
  }

  return errors;
}

@Injectable()
export class SupplementEquivalenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dosage: SupplementDosageService,
  ) {}

  async list(query: EquivalenceGroupListQuery = {}): Promise<{
    items: any[];
    total: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.SupplementEquivalenceGroupWhereInput = {
      ...(query.status
        ? { status: query.status as EquivalenceGroupStatus }
        : {}),
      ...(query.nutrientKey ? { nutrientKey: query.nutrientKey } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { code: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [groups, total] = await this.prisma.$transaction([
      this.prisma.supplementEquivalenceGroup.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { ingredients: true } },
          ingredients: { select: { id: true } },
        },
      }),
      this.prisma.supplementEquivalenceGroup.count({ where }),
    ]);

    const memberIds = groups.flatMap((group) =>
      group.ingredients.map((ingredient) => ingredient.id),
    );
    const referenceRows = memberIds.length
      ? await this.prisma.recipeItem.groupBy({
          by: ['ingredientId'],
          where: { ingredientId: { in: memberIds } },
          _count: { _all: true },
        })
      : [];
    const countByIngredient = new Map(
      referenceRows.map((row) => [row.ingredientId, row._count._all]),
    );

    return {
      total,
      items: groups.map((group) => ({
        id: group.id,
        code: group.code,
        name: group.name,
        nutrientKey: group.nutrientKey,
        nutrientLabel: group.nutrientLabel,
        nutrientUnit: group.nutrientUnit,
        formCategory: group.formCategory,
        status: group.status,
        isActive: group.isActive,
        memberCount: group._count.ingredients,
        usedByRecipeCount: group.ingredients.reduce(
          (sum, ingredient) =>
            sum + (countByIngredient.get(ingredient.id) ?? 0),
          0,
        ),
        updatedAt: group.updatedAt,
      })),
    };
  }

  async getById(id: string): Promise<any> {
    const group = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id },
      include: {
        ingredients: {
          orderBy: [
            { equivalencePriority: 'asc' },
            { name: 'asc' },
          ],
          select: GROUP_MEMBER_SELECT,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!group) {
      throw new NotFoundException('等价组不存在');
    }

    const members = group.ingredients.map((ingredient) => {
      const resolution = this.resolveMember(ingredient, group);
      return {
        ...ingredient,
        concentration:
          resolution.status === 'OK'
            ? {
                value: resolution.value,
                unit: resolution.unit,
              }
            : null,
        concentrationStatus: resolution.status,
        actualUnit:
          resolution.status === 'UNIT_MISMATCH'
            ? resolution.actualUnit
            : null,
      };
    });

    const memberIds = members.map((member) => member.id);
    const usedByRecipeCount = memberIds.length
      ? await this.prisma.recipeItem.count({
          where: { ingredientId: { in: memberIds } },
        })
      : 0;

    const approvalErrors = buildApprovalErrors({
      group,
      members,
      resolve: (member) => this.resolveMember(member, group),
    });

    return {
      ...group,
      ingredients: members,
      members,
      memberCount: members.length,
      referenceIngredientId: members[0]?.id ?? null,
      usedByRecipeCount,
      approvalErrors,
      canApprove: approvalErrors.length === 0,
    };
  }

  async create(
    input: UpsertEquivalenceGroupInput,
    operator: EquivalenceOperator,
  ): Promise<any> {
    const data = this.normalizeInput(input);
    const existing = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { code: data.code },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`组编码「${data.code}」已存在`);
    }

    const groupId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplementEquivalenceGroup.create({
        data: {
          ...data,
          status: 'DRAFT',
          evidenceUrls: data.evidenceUrls as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await tx.supplementEquivalenceGroupAudit.create({
        data: {
          groupId: created.id,
          action: 'CREATE',
          changes: { after: data } as unknown as Prisma.InputJsonValue,
          operatorId: operator.id,
          operatorName: operator.name ?? operator.id,
        },
      });
      return created.id;
    });

    return this.getById(groupId);
  }

  async update(
    id: string,
    input: Partial<UpsertEquivalenceGroupInput>,
    operator: EquivalenceOperator,
  ): Promise<any> {
    const current = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException('等价组不存在');
    }

    const data: Record<string, unknown> = {};
    if (input.code !== undefined) data.code = input.code.trim().toUpperCase();
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.nutrientKey !== undefined) {
      data.nutrientKey = input.nutrientKey.trim();
      data.nutrientLabel =
        input.nutrientLabel?.trim() || input.nutrientKey.trim();
      data.nutrientUnit = input.nutrientUnit?.trim() || '';
    } else {
      if (input.nutrientLabel !== undefined) {
        data.nutrientLabel = input.nutrientLabel.trim();
      }
      if (input.nutrientUnit !== undefined) {
        data.nutrientUnit = input.nutrientUnit.trim();
      }
    }
    if (input.formCategory !== undefined) {
      data.formCategory = input.formCategory?.trim() || null;
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.rationale !== undefined) {
      data.rationale = input.rationale?.trim() || null;
    }
    if (input.evidenceSummary !== undefined) {
      data.evidenceSummary = input.evidenceSummary?.trim() || null;
    }
    if (input.evidenceUrls !== undefined) {
      data.evidenceUrls = input.evidenceUrls as Prisma.InputJsonValue;
    }
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    if (current.status === 'APPROVED') {
      data.status = 'DRAFT';
      data.reviewedBy = null;
      data.reviewedAt = null;
      data.reviewNote = null;
      data.isActive = true;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.supplementEquivalenceGroup.update({
        where: { id },
        data: data as Prisma.SupplementEquivalenceGroupUpdateInput,
      });
      await tx.supplementEquivalenceGroupAudit.create({
        data: {
          groupId: id,
          action: 'UPDATE',
          changes: {
            before: this.pickAuditFields(current),
            after: data,
          } as Prisma.InputJsonValue,
          operatorId: operator.id,
          operatorName: operator.name ?? operator.id,
        },
      });
    });

    return this.getById(id);
  }

  async changeStatus(
    id: string,
    status: EquivalenceGroupStatus,
    operator: EquivalenceOperator,
    reviewNote?: string,
  ): Promise<any> {
    const group = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id },
      include: {
        ingredients: { select: GROUP_MEMBER_SELECT },
      },
    });
    if (!group) {
      throw new NotFoundException('等价组不存在');
    }

    if (!canTransitionEquivalenceStatus(group.status, status)) {
      throw new BadRequestException(
        `不能再从「${group.status}」变更为「${status}」`,
      );
    }

    if (status === 'APPROVED') {
      const errors = buildApprovalErrors({
        group,
        members: group.ingredients,
        resolve: (member) => this.resolveMember(member, group),
      });
      if (errors.length > 0) {
        throw new BadRequestException(errors.join('；'));
      }
    }

    const data: Prisma.SupplementEquivalenceGroupUpdateInput = {
      status,
      isActive: status !== 'DISABLED',
      ...(status === 'APPROVED'
        ? {
            reviewedBy: operator.name ?? operator.id,
            reviewedAt: new Date(),
            reviewNote: reviewNote?.trim() || null,
          }
        : status === 'DRAFT'
          ? {
              reviewedBy: null,
              reviewedAt: null,
              reviewNote: null,
            }
          : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.supplementEquivalenceGroup.update({ where: { id }, data });
      await tx.supplementEquivalenceGroupAudit.create({
        data: {
          groupId: id,
          action: 'STATUS_CHANGE',
          changes: {
            from: group.status,
            to: status,
            reviewNote: reviewNote?.trim() || null,
          } as Prisma.InputJsonValue,
          operatorId: operator.id,
          operatorName: operator.name ?? operator.id,
        },
      });
    });

    return this.getById(id);
  }

  async addMembers(
    id: string,
    ingredientIds: string[],
    operator: EquivalenceOperator,
  ): Promise<any> {
    const group = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id },
      include: { ingredients: { select: { id: true } } },
    });
    if (!group) {
      throw new NotFoundException('等价组不存在');
    }

    const uniqueIds = Array.from(
      new Set((ingredientIds ?? []).map((item) => String(item ?? '').trim())),
    ).filter(Boolean);
    if (uniqueIds.length === 0) {
      throw new BadRequestException('请选择要加入的原料');
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        name: true,
        type: true,
        equivalenceGroupId: true,
      },
    });
    if (ingredients.length !== uniqueIds.length) {
      throw new BadRequestException('部分原料不存在');
    }

    const nonSupplement = ingredients.filter(
      (ingredient) => ingredient.type !== 'SUPPLEMENT',
    );
    if (nonSupplement.length > 0) {
      throw new BadRequestException(
        `只有补剂原料能归组：${nonSupplement.map((item) => item.name).join('、')}`,
      );
    }

    const otherGroup = ingredients.filter(
      (ingredient) =>
        ingredient.equivalenceGroupId &&
        ingredient.equivalenceGroupId !== id,
    );
    if (otherGroup.length > 0) {
      throw new BadRequestException(
        `以下原料已在其他组，请用批量归组：${otherGroup
          .map((item) => item.name)
          .join('、')}`,
      );
    }

    const toAdd = ingredients.filter(
      (ingredient) => ingredient.equivalenceGroupId !== id,
    );

    await this.prisma.$transaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.ingredient.updateMany({
          where: { id: { in: toAdd.map((item) => item.id) } },
          data: { equivalenceGroupId: id },
        });
      }
      if (group.status === 'APPROVED') {
        await tx.supplementEquivalenceGroup.update({
          where: { id },
          data: {
            status: 'DRAFT',
            isActive: true,
            reviewedBy: null,
            reviewedAt: null,
            reviewNote: null,
          },
        });
      }
      await tx.supplementEquivalenceGroupAudit.create({
        data: {
          groupId: id,
          action: 'MEMBER_ADD',
          changes: {
            ingredientIds: toAdd.map((item) => item.id),
            names: toAdd.map((item) => item.name),
          } as Prisma.InputJsonValue,
          operatorId: operator.id,
          operatorName: operator.name ?? operator.id,
        },
      });
    });

    return this.getById(id);
  }

  async removeMember(
    id: string,
    ingredientId: string,
    operator: EquivalenceOperator,
  ): Promise<any> {
    const group = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!group) {
      throw new NotFoundException('等价组不存在');
    }

    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, equivalenceGroupId: id },
      select: { id: true, name: true },
    });
    if (!ingredient) {
      throw new NotFoundException('该原料不在此组');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.ingredient.update({
        where: { id: ingredientId },
        data: { equivalenceGroupId: null, equivalencePriority: 0 },
      });
      if (group.status === 'APPROVED') {
        await tx.supplementEquivalenceGroup.update({
          where: { id },
          data: {
            status: 'DRAFT',
            isActive: true,
            reviewedBy: null,
            reviewedAt: null,
            reviewNote: null,
          },
        });
      }
      await tx.supplementEquivalenceGroupAudit.create({
        data: {
          groupId: id,
          action: 'MEMBER_REMOVE',
          changes: {
            ingredientId,
            name: ingredient.name,
          } as Prisma.InputJsonValue,
          operatorId: operator.id,
          operatorName: operator.name ?? operator.id,
        },
      });
    });

    return this.getById(id);
  }

  async removeGroup(id: string, _operator: EquivalenceOperator): Promise<void> {
    const group = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id },
      include: { _count: { select: { ingredients: true } } },
    });
    if (!group) {
      throw new NotFoundException('等价组不存在');
    }
    if (group._count.ingredients > 0) {
      throw new BadRequestException('组内还有原料，只能停用，不能删除');
    }
    await this.prisma.supplementEquivalenceGroup.delete({ where: { id } });
  }

  async listUngrouped(query: { keyword?: string } = {}): Promise<any[]> {
    const keyword = String(query.keyword ?? '').trim();
    return this.prisma.ingredient.findMany({
      where: {
        type: 'SUPPLEMENT',
        equivalenceGroupId: null,
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: 'insensitive' } },
                { brand: { contains: keyword, mode: 'insensitive' } },
                { productModel: { contains: keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { brand: 'asc' }],
      select: {
        id: true,
        name: true,
        brand: true,
        productModel: true,
        physicalForm: true,
        baseUnit: true,
        unitDisplayLabel: true,
        purchaseUnit: true,
        diyEnabled: true,
        supplementRetailEnabled: true,
        nutritionProfile: true,
        properties: true,
        _count: { select: { recipeItems: true } },
      },
    });
  }

  async assign(
    ingredientIds: string[],
    groupId: string,
    operator: EquivalenceOperator,
  ): Promise<{ moved: number; skipped: number }> {
    const group = await this.prisma.supplementEquivalenceGroup.findUnique({
      where: { id: groupId },
      select: { id: true, status: true },
    });
    if (!group) {
      throw new NotFoundException('等价组不存在');
    }

    const uniqueIds = Array.from(
      new Set((ingredientIds ?? []).map((item) => String(item ?? '').trim())),
    ).filter(Boolean);
    if (uniqueIds.length === 0) {
      throw new BadRequestException('请选择要归组的原料');
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, type: true, equivalenceGroupId: true },
    });
    if (ingredients.length !== uniqueIds.length) {
      throw new BadRequestException('部分原料不存在');
    }
    const nonSupplement = ingredients.filter(
      (ingredient) => ingredient.type !== 'SUPPLEMENT',
    );
    if (nonSupplement.length > 0) {
      throw new BadRequestException(
        `只有补剂原料能归组：${nonSupplement.map((item) => item.name).join('、')}`,
      );
    }

    const toMove = ingredients.filter(
      (ingredient) => ingredient.equivalenceGroupId !== groupId,
    );
    const skipped = ingredients.length - toMove.length;
    const oldGroupIds = Array.from(
      new Set(
        toMove
          .map((ingredient) => ingredient.equivalenceGroupId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      if (toMove.length > 0) {
        await tx.ingredient.updateMany({
          where: { id: { in: toMove.map((item) => item.id) } },
          data: { equivalenceGroupId: groupId },
        });
      }
      const groupsToReset = new Set(oldGroupIds);
      if (group.status === 'APPROVED') {
        groupsToReset.add(groupId);
      }
      if (groupsToReset.size > 0) {
        await tx.supplementEquivalenceGroup.updateMany({
          where: {
            id: { in: Array.from(groupsToReset) },
            status: 'APPROVED',
          },
          data: {
            status: 'DRAFT',
            isActive: true,
            reviewedBy: null,
            reviewedAt: null,
            reviewNote: null,
          },
        });
      }
      await tx.supplementEquivalenceGroupAudit.create({
        data: {
          groupId,
          action: 'MEMBER_ADD',
          changes: {
            ingredientIds: toMove.map((item) => item.id),
            names: toMove.map((item) => item.name),
            movedFromGroupIds: oldGroupIds,
          } as Prisma.InputJsonValue,
          operatorId: operator.id,
          operatorName: operator.name ?? operator.id,
        },
      });
      for (const oldGroupId of oldGroupIds) {
        await tx.supplementEquivalenceGroupAudit.create({
          data: {
            groupId: oldGroupId,
            action: 'MEMBER_REMOVE',
            changes: {
              ingredientIds: toMove
                .filter((item) => item.equivalenceGroupId === oldGroupId)
                .map((item) => item.id),
              movedToGroupId: groupId,
            } as Prisma.InputJsonValue,
            operatorId: operator.id,
            operatorName: operator.name ?? operator.id,
          },
        });
      }
    });

    return { moved: toMove.length, skipped };
  }

  async summary(): Promise<{
    total: number;
    approved: number;
    pending: number;
    draft: number;
    disabled: number;
    ungrouped: number;
    singleton: number;
  }> {
    const [groups, ungrouped] = await Promise.all([
      this.prisma.supplementEquivalenceGroup.findMany({
        select: { status: true, _count: { select: { ingredients: true } } },
      }),
      this.prisma.ingredient.count({
        where: { type: 'SUPPLEMENT', equivalenceGroupId: null },
      }),
    ]);

    const countByStatus = (status: string) =>
      groups.filter((group) => group.status === status).length;

    return {
      total: groups.length,
      approved: countByStatus('APPROVED'),
      pending: countByStatus('PENDING_REVIEW'),
      draft: countByStatus('DRAFT'),
      disabled: countByStatus('DISABLED'),
      ungrouped,
      singleton: groups.filter((group) => group._count.ingredients <= 1).length,
    };
  }

  private resolveMember(member: any, group: any) {
    return this.dosage.resolveConcentration(member, {
      fieldPath: group.nutrientKey,
      label: group.nutrientLabel,
      unit: group.nutrientUnit,
      targetValuePerKg: 1,
    });
  }

  private normalizeInput(
    input: UpsertEquivalenceGroupInput,
  ): UpsertEquivalenceGroupInput {
    const code = String(input.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(code)) {
      throw new BadRequestException(
        '组编码只能包含大写字母、数字和下划线（2–64 位）',
      );
    }

    const name = String(input.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('组名称不能为空');
    }

    const nutrientKey = String(input.nutrientKey ?? '').trim();
    if (!nutrientKey) {
      throw new BadRequestException('目标营养素不能为空');
    }

    if (!isCustomEquivalenceKey(nutrientKey) && !findAnyNutritionField(nutrientKey)) {
      throw new BadRequestException(`营养素 ${nutrientKey} 不在营养字段目录中`);
    }

    if (isCustomEquivalenceKey(nutrientKey)) {
      const label = String(input.nutrientLabel ?? '').trim();
      if (!label) {
        throw new BadRequestException('自定义成分必须填写名称');
      }
      const expectedKey = `custom:${normalizeCustomNutrientName(label)}`;
      if (expectedKey !== nutrientKey.toLowerCase()) {
        throw new BadRequestException(
          `自定义成分的编码应为 ${expectedKey}`,
        );
      }
    }

    const nutrientLabel = String(input.nutrientLabel ?? '').trim();
    const nutrientUnit = String(input.nutrientUnit ?? '').trim();
    if (!nutrientLabel || !nutrientUnit) {
      throw new BadRequestException('营养素名称和单位不能为空');
    }

    return {
      code,
      name,
      nutrientKey,
      nutrientLabel,
      nutrientUnit,
      formCategory: input.formCategory?.trim() || null,
      description: input.description?.trim() || null,
      rationale: input.rationale?.trim() || null,
      evidenceSummary: input.evidenceSummary?.trim() || null,
      evidenceUrls: (input.evidenceUrls ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean),
      sortOrder: Number(input.sortOrder) || 0,
    };
  }

  private pickAuditFields(group: any) {
    return {
      code: group.code,
      name: group.name,
      nutrientKey: group.nutrientKey,
      nutrientLabel: group.nutrientLabel,
      nutrientUnit: group.nutrientUnit,
      formCategory: group.formCategory,
      evidenceSummary: group.evidenceSummary,
      status: group.status,
    };
  }
}
