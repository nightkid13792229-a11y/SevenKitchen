import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { isSupplementUnitOneToOne } from './supplement-unit.util';
import {
  SupplementDosageResult,
  SupplementDosageService,
  SupplementTargetInput,
} from './supplement-dosage.service';

export interface SupplementCandidate {
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseLink: unknown;
  imageUrl: string | null;
  physicalForm: string | null;
  displayUnit: string;
  isDefault: boolean;
  selectable: boolean;
  unavailableReason: string | null;
  dosage: SupplementDosageResult;
}

export interface SupplementCandidateItem {
  recipeItemId: string;
  sourceIngredientId: string;
  source: 'EQUIVALENCE_GROUP' | 'DEFAULT_ONLY';
  group: {
    id: string;
    code: string;
    name: string;
    status: string;
  } | null;
  defaultIngredient: {
    ingredientId: string;
    name: string;
    displayUnit: string;
    physicalForm: string | null;
    diyEnabled: boolean;
    supplementRetailEnabled: boolean;
    selectable: boolean;
    unavailableReason: string | null;
    dosage: SupplementDosageResult;
  };
  candidates: SupplementCandidate[];
  /** 无营养目标、但食谱行配了固定比例时的兜底用量（g）；否则 null */
  fallbackAmount: number | null;
  unavailableReason: string | null;
  preparationMethod: string | null;
  addTimingLabel: string | null;
  sortOrder: number;
}

export interface SupplementCandidateResponse {
  totalWeightG: number;
  weightSource: 'DIY_SHEET' | 'QUERY';
  items: SupplementCandidateItem[];
}

const NO_CANDIDATE_REASON = '暂时买不到，找 Seven爸爸';

@Injectable()
export class SupplementCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dosage: SupplementDosageService,
  ) {}

  async resolveForRecipe(input: {
    recipeBusinessId: string;
    recipeVersion: number;
    totalWeightG: number;
    weightSource: 'DIY_SHEET' | 'QUERY';
    audience: 'CUSTOMER';
  }): Promise<SupplementCandidateResponse> {
    const recipe = await this.prisma.recipe.findUnique({
      where: {
        recipeId_version: {
          recipeId: input.recipeBusinessId,
          version: input.recipeVersion,
        },
      },
      include: {
        items: {
          include: { ingredient: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException('食谱不存在');
    }

    const supplementItems = recipe.items.filter(
      (item) => item.ingredient?.type === 'SUPPLEMENT',
    );

    const groupIds = Array.from(
      new Set(
        supplementItems
          .map((item) => item.ingredient?.equivalenceGroupId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [groups, config] = await Promise.all([
      groupIds.length
        ? this.prisma.supplementEquivalenceGroup.findMany({
            where: { id: { in: groupIds } },
            include: {
              ingredients: {
                orderBy: [
                  { equivalencePriority: 'asc' },
                  { name: 'asc' },
                ],
              },
            },
          })
        : Promise.resolve([]),
      this.prisma.supplementShopConfig.findUnique({
        where: { id: 'singleton' },
        select: { equivalenceEnabled: true },
      }),
    ]);

    const groupMap = new Map(groups.map((group) => [group.id, group]));
    const equivalenceEnabled = config?.equivalenceEnabled === true;

    return {
      totalWeightG: input.totalWeightG,
      weightSource: input.weightSource,
      items: supplementItems.map((item) =>
        this.resolveForRecipeItem({
          recipeItem: item,
          ingredient: item.ingredient,
          group: item.ingredient?.equivalenceGroupId
            ? (groupMap.get(item.ingredient.equivalenceGroupId) ?? null)
            : null,
          totalWeightG: input.totalWeightG,
          equivalenceEnabled,
          audience: input.audience,
        }),
      ),
    };
  }

  resolveForRecipeItem(input: {
    recipeItem: any;
    ingredient: any;
    group: any;
    totalWeightG: number;
    equivalenceEnabled: boolean;
    audience: 'CUSTOMER';
  }): SupplementCandidateItem {
    const targets = this.normalizeTargets(input.recipeItem);
    const sourceDosage = this.dosage.computeDosage({
      ingredient: input.ingredient,
      targets,
      totalWeightG: input.totalWeightG,
    });
    const sourceReason = this.getEligibilityReason(
      input.ingredient,
      sourceDosage,
    );

    const groupUsable = Boolean(
      input.equivalenceEnabled &&
        input.group &&
        input.group.status === 'APPROVED' &&
        input.group.isActive !== false &&
        Array.isArray(input.group.ingredients) &&
        input.group.ingredients.length >= 2,
    );

    const members: any[] = groupUsable
      ? [...input.group.ingredients].sort(
          (left, right) =>
            Number(left.equivalencePriority ?? 0) -
              Number(right.equivalencePriority ?? 0) ||
            String(left.name ?? '').localeCompare(String(right.name ?? '')),
        )
      : [input.ingredient];

    const candidates: SupplementCandidate[] = [];
    for (const member of members) {
      const dosage =
        member.id === input.ingredient.id
          ? sourceDosage
          : this.dosage.computeDosage({
              ingredient: member,
              targets,
              totalWeightG: input.totalWeightG,
            });
      const reason = this.getEligibilityReason(member, dosage);
      if (reason) continue;

      candidates.push({
        ingredientId: member.id,
        name: member.name,
        brand: member.brand ?? null,
        productModel: member.productModel ?? null,
        purchaseChannel: member.purchaseChannel ?? null,
        purchaseLink: member.properties?.purchase_link ?? null,
        imageUrl:
          typeof member.properties?.image_url === 'string'
            ? member.properties.image_url
            : null,
        physicalForm: member.physicalForm ?? null,
        displayUnit: dosage.unit,
        isDefault: member.id === input.ingredient.id,
        selectable: true,
        unavailableReason: null,
        dosage,
      });
    }

    const ratioPercent = Number(input.recipeItem?.ratioPercent);
    const fallbackAmount =
      targets.length === 0 &&
      Number.isFinite(ratioPercent) &&
      ratioPercent > 0
        ? (input.totalWeightG * ratioPercent) / 100
        : null;

    return {
      recipeItemId: input.recipeItem.id,
      sourceIngredientId: input.ingredient.id,
      source: groupUsable ? 'EQUIVALENCE_GROUP' : 'DEFAULT_ONLY',
      group: input.group
        ? {
            id: input.group.id,
            code: input.group.code,
            name: input.group.name,
            status: input.group.status,
          }
        : null,
      defaultIngredient: {
        ingredientId: input.ingredient.id,
        name: input.ingredient.name,
        displayUnit: sourceDosage.unit,
        physicalForm: input.ingredient.physicalForm ?? null,
        diyEnabled: input.ingredient.diyEnabled === true,
        supplementRetailEnabled:
          input.ingredient.supplementRetailEnabled === true,
        selectable: !sourceReason,
        unavailableReason: sourceReason,
        dosage: sourceDosage,
      },
      candidates,
      fallbackAmount,
      unavailableReason:
        candidates.length > 0
          ? null
          : groupUsable
            ? NO_CANDIDATE_REASON
            : (sourceReason ?? NO_CANDIDATE_REASON),
      preparationMethod: input.recipeItem.preparationMethod ?? null,
      addTimingLabel:
        typeof input.ingredient.properties?.add_timing === 'string'
          ? input.ingredient.properties.add_timing
          : null,
      sortOrder: Number(input.recipeItem.sortOrder ?? 0),
    };
  }

  private normalizeTargets(recipeItem: any): SupplementTargetInput[] {
    const raw = recipeItem?.supplementTargets;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter(
          (target: any) =>
            target?.fieldPath &&
            Number.isFinite(Number(target?.targetValuePerKg)) &&
            Number(target.targetValuePerKg) > 0,
        )
        .map((target: any) => ({
          fieldPath: String(target.fieldPath),
          label: target.label ? String(target.label) : undefined,
          unit: String(target.unit ?? ''),
          targetValuePerKg: Number(target.targetValuePerKg),
        }));
    }

    const legacyKey = String(
      recipeItem?.nutrientTargetKey ??
        recipeItem?.nutrient_target_key ??
        '',
    ).trim();
    const legacyValue = Number(
      recipeItem?.nutrientTargetValue ??
        recipeItem?.nutrient_target_value ??
        0,
    );
    if (legacyKey && Number.isFinite(legacyValue) && legacyValue > 0) {
      return [
        {
          fieldPath: legacyKey,
          label: legacyKey,
          unit: '',
          targetValuePerKg: legacyValue,
        },
      ];
    }

    return [];
  }

  private getEligibilityReason(
    ingredient: any,
    dosage: SupplementDosageResult,
  ): string | null {
    if (ingredient?.type !== 'SUPPLEMENT') {
      return '不是补剂原料';
    }
    if (ingredient?.physicalForm === 'LIQUID') {
      return '液体补剂暂不支持分装';
    }
    if (ingredient?.diyEnabled !== true) {
      return '未开启 DIY 推荐';
    }
    if (ingredient?.supplementRetailEnabled !== true) {
      return '未开启对外售卖';
    }

    const displayUnit = dosage.unit || '';
    if (!isSupplementUnitOneToOne(displayUnit, ingredient?.baseUnit)) {
      return `展示单位「${displayUnit}」无法与库存基准单位 ${ingredient?.baseUnit} 1:1 对应`;
    }

    if (dosage.status === 'UNIT_MISMATCH') {
      return '有效成分单位与配方目标不一致';
    }
    if (dosage.status === 'MISSING_CONCENTRATION') {
      return '缺少配方目标的有效成分浓度';
    }
    if (dosage.status === 'NO_TARGETS') {
      return '这条补剂没有营养目标，无法换算';
    }
    if (dosage.amount === null || !Number.isFinite(dosage.amount) || dosage.amount <= 0) {
      return '用量暂不可算';
    }

    return null;
  }
}
