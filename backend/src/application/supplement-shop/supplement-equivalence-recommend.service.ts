import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { SupplementDosageService } from './supplement-dosage.service';
import {
  describeRecommendation,
  sortRecommendations,
  type RecommendationCandidate,
} from './supplement-equivalence-recommend.logic';

/**
 * 按营养素推荐等价组（2026-11-14）。
 *
 * 只做推荐，**不写库**：一个原料归哪个组是业务决定，要人点确认。
 * 判定口径与补剂候选完全一致（`resolveConcentration` + 组状态 + 成员数），
 * 不另起一套规则。
 */
@Injectable()
export class SupplementEquivalenceRecommendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dosage: SupplementDosageService,
  ) {}

  async recommend(ingredientId: string): Promise<{
    ingredientId: string;
    ingredientName: string;
    candidates: Array<RecommendationCandidate & { reason: string }>;
  }> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: {
        id: true,
        name: true,
        type: true,
        baseUnit: true,
        unitDisplayLabel: true,
        purchaseUnit: true,
        properties: true,
        nutritionProfile: true,
      },
    });

    if (!ingredient || ingredient.type !== 'SUPPLEMENT') {
      throw new NotFoundException('补剂原料不存在');
    }

    const groups = await this.prisma.supplementEquivalenceGroup.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        nutrientKey: true,
        nutrientLabel: true,
        nutrientUnit: true,
        _count: { select: { ingredients: true } },
      },
    });

    const candidates: RecommendationCandidate[] = [];
    for (const group of groups) {
      // 与候选服务同一口径：解析这条原料在组要求营养素上的浓度
      const resolution = this.dosage.resolveConcentration(ingredient, {
        fieldPath: group.nutrientKey,
        label: group.nutrientLabel,
        unit: group.nutrientUnit,
        targetValuePerKg: 1,
      });

      // 完全没有这个营养素 → 这个组跟它无关，不进候选
      if (resolution.status === 'MISSING') {
        continue;
      }

      candidates.push({
        groupId: group.id,
        code: group.code,
        name: group.name,
        status: group.status,
        memberCount: group._count.ingredients,
        sameUnit: resolution.status === 'OK',
        nutrientLabel: group.nutrientLabel,
        nutrientUnit: group.nutrientUnit,
        actualUnit:
          resolution.status === 'UNIT_MISMATCH' ? resolution.actualUnit : null,
      });
    }

    const ranked = sortRecommendations(candidates).slice(0, 8);

    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      candidates: ranked.map((candidate) => ({
        ...candidate,
        reason: describeRecommendation(candidate),
      })),
    };
  }
}
