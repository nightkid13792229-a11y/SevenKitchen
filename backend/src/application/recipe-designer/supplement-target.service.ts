import { BadRequestException, Injectable } from '@nestjs/common';
import { findAnyNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import {
  isLegacyNutritionProfile,
  normalizeNutritionProfile,
} from '../../domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfile,
  NutritionProfileV2,
  SupplementTarget,
} from '../../domain/ingredient/types';
import { readProfileFieldAmount } from '../../domain/recipe-designer/nutrition-profile-reader';
import { PrismaService } from '../../infrastructure/prisma.service';
import { nutritionDataToNutritionProfile } from '../nutrition-standard/nutrient-value-resolver';

/**
 * 补剂目标定义：一个目标永远只对应一个 `fieldPath`。
 *
 * 组合（EPA+DHA、钙磷比等）由营养字段目录里的派生字段表达，
 * 不把多个字段塞进同一个目标 —— 计价、生产、交付链路只认单个 `fieldPath`。
 */
export interface SupplementTargetDefinition {
  fieldPath: string;
  label: string;
  unit: string;
}

/** 每 kg 配方中该营养素的实际添加浓度（计算缓存，不是人工目标值）。 */
export type ComputedSupplementTarget = SupplementTarget;

const MASS_UNITS = new Set(['g', 'mg', 'ug']);

/**
 * 目标字段的统一形态。
 * 标准/派生字段来自营养字段目录；自定义成分来自营养档案的 customItems。
 */
interface ResolvedTargetField {
  fieldPath: string;
  label: string;
  unit: string;
  customItem?: {
    name: string;
    value?: number | null;
    unit?: string | null;
    rawBasisType?: string | null;
  };
}

const CUSTOM_TARGET_PREFIX = 'custom:';

function isCustomTargetKey(value: string): boolean {
  return value.startsWith(CUSTOM_TARGET_PREFIX);
}

function normalizeCustomTargetName(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

/**
 * 补剂目标解析、校验与添加浓度计算。
 *
 * 这里刻意不做「去掉补剂后是否出现缺口」的反向推断：
 * 纤维素粉这类功能性补剂不会造成营养缺口，目标必须由营养师显式选择。
 */
@Injectable()
export class SupplementTargetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 读取补剂营养档案上配置的默认目标营养素。
   *
   * 默认值只是添加补剂时的初始值，不锁定食谱内的选择。
   * 配置了但当前档案里该字段为空/为 0 时直接报错，不静默丢弃。
   */
  async resolveDefaultTargets(
    nutritionFoodId: string,
  ): Promise<SupplementTargetDefinition[]> {
    const id =
      typeof nutritionFoodId === 'string' ? nutritionFoodId.trim() : '';
    if (!id) {
      throw new BadRequestException('营养档案 ID 不能为空');
    }

    const nutritionFood = await this.prisma.nutritionFood.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        nutritionData: true,
        defaultSupplementTargets: true,
      },
    });
    if (!nutritionFood) {
      throw new BadRequestException(
        `营养档案 ${id} 不存在，无法解析默认补剂目标`,
      );
    }

    const rawDefaults = nutritionFood.defaultSupplementTargets;
    if (rawDefaults === null || rawDefaults === undefined) {
      return [];
    }
    if (!Array.isArray(rawDefaults)) {
      throw new BadRequestException(
        `营养档案「${nutritionFood.name}」的默认补剂目标格式不正确`,
      );
    }
    if (rawDefaults.length === 0) {
      return [];
    }

    const profile = toNutritionProfile(nutritionFood.nutritionData);
    if (!profile) {
      throw new BadRequestException(
        `营养档案「${nutritionFood.name}」缺少营养数据，无法解析默认补剂目标`,
      );
    }

    return this.validateTargets(profile, rawDefaults);
  }

  /**
   * 校验并归一化目标定义。
   *
   * - 每个目标必须且只能有一个 `fieldPath`，且必须存在于字段目录或派生字段目录；
   * - 该字段在当前营养档案里必须可读到大于 0 的值（按 1 个单位的克重读取，
   *   与添加浓度使用同一套读取逻辑）；
   * - 重复、未知、空字段一律 400，不静默去重/丢弃。
   *
   * 返回的 label/unit 以字段目录为准：派生字段的标签和规范单位由目录统一维护。
   */
  validateTargets(
    nutritionProfile: NutritionProfile | null | undefined,
    targets: unknown,
  ): SupplementTargetDefinition[] {
    if (targets === null || targets === undefined) {
      return [];
    }
    if (!Array.isArray(targets)) {
      throw new BadRequestException('补剂目标格式不正确，必须是数组');
    }
    if (targets.length === 0) {
      return [];
    }
    if (!nutritionProfile) {
      throw new BadRequestException('缺少营养档案，无法校验补剂目标');
    }

    const definitions: SupplementTargetDefinition[] = [];
    const seenFieldPaths = new Set<string>();

    for (const rawTarget of targets) {
      const targetRecord = asRecord(rawTarget);
      if (!targetRecord) {
        throw new BadRequestException('补剂目标格式不正确');
      }
      if (
        hasValue(targetRecord.fieldPaths) ||
        hasValue(targetRecord.operation)
      ) {
        throw new BadRequestException(
          '补剂目标只支持单个 fieldPath，组合目标请使用派生字段',
        );
      }

      const rawFieldPath =
        typeof targetRecord.fieldPath === 'string'
          ? targetRecord.fieldPath.trim()
          : '';
      if (!rawFieldPath) {
        throw new BadRequestException('补剂目标的营养素字段不能为空');
      }

      const field = this.resolveTargetField(nutritionProfile, rawFieldPath);
      if (!field) {
        throw new BadRequestException(
          `补剂目标营养素 ${rawFieldPath} 不在营养字段目录或营养档案的自定义成分中`,
        );
      }

      if (seenFieldPaths.has(field.fieldPath)) {
        throw new BadRequestException(`补剂目标营养素重复：${field.fieldPath}`);
      }
      seenFieldPaths.add(field.fieldPath);

      const unit = resolveTargetUnit(field, targetRecord.unit);
      if (field.customItem) {
        const value = Number(field.customItem.value);
        if (!Number.isFinite(value) || value <= 0) {
          throw new BadRequestException(
            `营养档案中「${field.label}」的自定义成分为空或为 0，不能作为补剂目标`,
          );
        }
      } else {
        this.assertProfileFieldHasValue(nutritionProfile, field);
      }

      definitions.push({
        fieldPath: field.fieldPath,
        label: field.label,
        unit,
      });
    }

    return definitions;
  }

  /**
   * 按当前配方总重量计算每个目标的实际添加浓度：
   *
   *   添加浓度（每 kg 配方）= 补剂提供的目标营养素总量 ÷ 配方总重量（g）× 1000
   *
   * 分母必须是 `assessment.totalWeightG`（计入评估的有效原料重量），
   * 总重量或补剂用量无效时直接报错，不按 0 静默处理。
   */
  computeTargets(
    nutritionProfile: NutritionProfile | null | undefined,
    targets: unknown,
    weightG: number | null | undefined,
    totalWeightG: number | null | undefined,
  ): ComputedSupplementTarget[] {
    const definitions = this.validateTargets(nutritionProfile, targets);
    if (!nutritionProfile) {
      // 没有档案时 validateTargets 已经拦下非空目标；这里只剩“目标也为空”的情况。
      return [];
    }
    const supplementWeightG = toPositiveWeight(weightG, '补剂用量');
    const recipeTotalWeightG = toPositiveWeight(totalWeightG, '配方总重量');

    return definitions.map((definition) => {
      const read = isCustomTargetKey(definition.fieldPath)
        ? this.readCustomTargetAmount(
            nutritionProfile,
            definition.fieldPath,
            supplementWeightG,
          )
        : readProfileFieldAmount(
            nutritionProfile,
            definition.fieldPath,
            supplementWeightG,
          );
      if (
        read.missing ||
        read.amount === null ||
        !Number.isFinite(read.amount) ||
        read.amount <= 0
      ) {
        throw new BadRequestException(
          `营养档案中「${definition.label}」（${definition.fieldPath}）为空或为 0，无法计算补剂添加浓度`,
        );
      }

      const targetValuePerKg = roundTargetValue(
        (read.amount / recipeTotalWeightG) * 1000,
      );
      if (!Number.isFinite(targetValuePerKg) || targetValuePerKg <= 0) {
        throw new BadRequestException(
          `补剂「${definition.label}」计算出的添加浓度无效`,
        );
      }

      return {
        fieldPath: definition.fieldPath,
        label: definition.label,
        unit: definition.unit,
        targetValuePerKg,
      };
    });
  }

  private resolveTargetField(
    nutritionProfile: NutritionProfile,
    rawFieldPath: string,
  ): ResolvedTargetField | null {
    if (isCustomTargetKey(rawFieldPath)) {
      const wanted = normalizeCustomTargetName(
        rawFieldPath.slice(CUSTOM_TARGET_PREFIX.length),
      );
      const normalized = normalizeNutritionProfile(nutritionProfile);
      const item = (normalized?.customItems ?? []).find(
        (candidate) =>
          normalizeCustomTargetName(candidate.name) === wanted,
      );
      if (!item) return null;
      return {
        fieldPath: `${CUSTOM_TARGET_PREFIX}${normalizeCustomTargetName(item.name)}`,
        label: item.name,
        unit: String(item.unit ?? ''),
        customItem: item,
      };
    }

    const standard = findAnyNutritionField(rawFieldPath);
    if (!standard) return null;
    return {
      fieldPath: standard.fieldPath,
      label: standard.label,
      unit: standard.unit,
    };
  }

  private readCustomTargetAmount(
    nutritionProfile: NutritionProfile,
    fieldPath: string,
    amount: number,
  ): { amount: number | null; missing: boolean } {
    const normalized = normalizeNutritionProfile(nutritionProfile);
    const wanted = normalizeCustomTargetName(
      fieldPath.slice(CUSTOM_TARGET_PREFIX.length),
    );
    const item = (normalized?.customItems ?? []).find(
      (candidate) => normalizeCustomTargetName(candidate.name) === wanted,
    );
    const value = Number(item?.value);
    if (!item || !Number.isFinite(value) || value <= 0) {
      return { amount: null, missing: true };
    }

    const basis = String(
      item.rawBasisType ?? normalized?.meta?.rawBasisType ?? 'PER_100_G',
    ).toUpperCase();
    switch (basis) {
      case 'PER_1_G':
      case 'PER_1_ML':
      case 'PER_SERVING':
      case 'PER_1_PCS':
        return { amount: value * amount, missing: false };
      case 'PER_100_G':
      case 'PER_100_ML':
        return { amount: (value * amount) / 100, missing: false };
      default:
        return { amount: null, missing: true };
    }
  }

  private assertProfileFieldHasValue(
    nutritionProfile: NutritionProfile,
    field: ResolvedTargetField,
  ) {
    const read = readProfileFieldAmount(nutritionProfile, field.fieldPath, 1);
    if (
      read.missing ||
      read.amount === null ||
      !Number.isFinite(read.amount) ||
      read.amount <= 0
    ) {
      throw new BadRequestException(
        `营养档案中「${field.label}」（${field.fieldPath}）为空或为 0，不能作为补剂目标`,
      );
    }
  }
}

/**
 * `NutritionFood.nutritionData` 历史上既可能是分组 v2 档案、也可能是
 * 旧版 items[] 或扁平字段表。这里统一转成可被 `readProfileFieldAmount` 读取的 v2 档案。
 */
function toNutritionProfile(nutritionData: unknown): NutritionProfileV2 | null {
  if (
    !nutritionData ||
    typeof nutritionData !== 'object' ||
    Array.isArray(nutritionData)
  ) {
    return null;
  }

  const record = nutritionData as Record<string, unknown>;
  if (isGroupedNutritionProfile(record) || isLegacyNutritionProfile(record)) {
    return normalizeNutritionProfile(record as unknown as NutritionProfile);
  }

  return nutritionDataToNutritionProfile(record);
}

function isGroupedNutritionProfile(value: Record<string, unknown>): boolean {
  return (
    'meta' in value ||
    'macros' in value ||
    'minerals' in value ||
    'vitamins' in value ||
    'fattyAcids' in value ||
    'aminoAcids' in value
  );
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveTargetUnit(
  field: ResolvedTargetField,
  rawUnit: unknown,
): string {
  if (rawUnit === null || rawUnit === undefined) {
    return field.unit;
  }
  if (typeof rawUnit !== 'string') {
    throw new BadRequestException(
      `补剂目标营养素 ${field.fieldPath} 的单位格式不正确`,
    );
  }

  const requestedUnit = rawUnit.trim();
  if (!requestedUnit) {
    return field.unit;
  }

  if (normalizeUnit(requestedUnit) === normalizeUnit(field.unit)) {
    return field.unit;
  }

  // 同量纲的质量单位统一换算后保存为目录规范单位（目录单位就是读取单位）。
  if (isMassUnit(requestedUnit) && isMassUnit(field.unit)) {
    return field.unit;
  }

  throw new BadRequestException(
    `补剂目标营养素 ${field.fieldPath} 的单位「${requestedUnit}」无法换算为目录单位「${field.unit}」`,
  );
}

function normalizeUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase().replace(/μ/g, 'u');

  return normalized === 'mcg' ? 'ug' : normalized;
}

function isMassUnit(unit: string): boolean {
  return MASS_UNITS.has(normalizeUnit(unit));
}

function toPositiveWeight(
  value: number | null | undefined,
  label: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${label}必须大于 0`);
  }

  return value;
}

function roundTargetValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
