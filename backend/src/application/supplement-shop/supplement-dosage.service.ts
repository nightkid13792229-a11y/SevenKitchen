import { BadRequestException, Injectable } from '@nestjs/common';
import {
  findDerivedNutritionField,
  findNutritionField,
  getNutritionProfileFieldValue,
} from '../../domain/ingredient/nutrition-field-catalog';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';

export interface SupplementTargetInput {
  fieldPath: string;
  label?: string;
  unit: string;
  targetValuePerKg: number;
}

export interface SupplementDosageResult {
  status: 'OK' | 'NO_TARGETS' | 'MISSING_CONCENTRATION' | 'UNIT_MISMATCH';
  amount: number | null;
  unit: string;
  targets: Array<{
    fieldPath: string;
    label: string;
    unit: string;
    targetValuePerKg: number;
  }>;
  concentrations: Array<{
    fieldPath: string;
    value: number;
    unit: string;
  }>;
  missingFieldPaths: string[];
}

type ConcentrationResolution =
  | { status: 'OK'; value: number; unit: string }
  | { status: 'MISSING' }
  | { status: 'UNIT_MISMATCH'; actualUnit: string };

const UNIT_ALIASES: Record<string, string> = {
  μg: 'μg',
  µg: 'μg',
  ug: 'μg',
  mcg: 'μg',
  微克: 'μg',
  mg: 'mg',
  毫克: 'mg',
  g: 'g',
  克: 'g',
  iu: 'IU',
  ml: 'mL',
  毫升: 'mL',
};

const BASIS_FACTORS: Record<string, number | null> = {
  PER_100_G: 0.01,
  PER_100_ML: 0.01,
  PER_1_G: 1,
  PER_1_ML: 1,
  PER_SERVING: 1,
  PER_1_PCS: 1,
};

const BASIS_BASE_UNITS: Record<string, 'G' | 'ML' | 'PCS'> = {
  PER_100_G: 'G',
  PER_100_ML: 'ML',
  PER_1_G: 'G',
  PER_1_ML: 'ML',
  PER_SERVING: 'PCS',
  PER_1_PCS: 'PCS',
};

export function normalizeSupplementUnit(unit: unknown): string {
  const raw = String(unit ?? '').trim();
  if (!raw) return '';
  return UNIT_ALIASES[raw.toLowerCase()] ?? raw;
}

/** 自定义成分的规范化 key，与后台录入/比对共用一套规则 */
export function normalizeCustomNutrientName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function customNutrientKeyFromLabel(label: unknown): string {
  return `custom:${normalizeCustomNutrientName(label)}`;
}

function normalizeLookupKey(value: unknown): string {
  return normalizeCustomNutrientName(value).replace(/[_-]+/g, '');
}

function isCustomNutrientKey(fieldPath: string): boolean {
  return fieldPath.startsWith('custom:');
}

function normalizeBasis(value: unknown): string {
  const basis = String(value ?? '').trim().toUpperCase();
  return basis === 'PER_1_PCS' ? 'PER_SERVING' : basis;
}

function resolveDisplayUnit(ingredient: any): string {
  const properties =
    ingredient?.properties && typeof ingredient.properties === 'object'
      ? (ingredient.properties as Record<string, unknown>)
      : {};
  const candidates = [
    ingredient?.unitDisplayLabel,
    properties.display_unit,
    ingredient?.purchaseUnit,
    ingredient?.baseUnit,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) return normalizeSupplementUnit(value);
  }
  return '';
}

function readActiveNutrients(ingredient: any): Record<string, any> {
  const fromProperties = ingredient?.properties?.active_nutrients;
  if (fromProperties && typeof fromProperties === 'object') {
    return fromProperties as Record<string, any>;
  }
  const fromIngredient = ingredient?.activeNutrients;
  if (fromIngredient && typeof fromIngredient === 'object') {
    return fromIngredient as Record<string, any>;
  }
  return {};
}

function findActiveNutrient(
  activeNutrients: Record<string, any>,
  target: SupplementTargetInput,
): { value: number; unit: string } | null {
  const keys = [
    target.fieldPath,
    target.label,
    target.fieldPath.split('.').pop(),
  ]
    .map(normalizeLookupKey)
    .filter(Boolean);

  for (const [rawKey, rawValue] of Object.entries(activeNutrients)) {
    if (!keys.includes(normalizeLookupKey(rawKey))) continue;
    const record =
      rawValue && typeof rawValue === 'object'
        ? (rawValue as Record<string, unknown>)
        : null;
    const value = Number(record?.value ?? rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    return {
      value,
      unit: String(record?.unit ?? target.unit ?? ''),
    };
  }

  return null;
}

@Injectable()
export class SupplementDosageService {
  /**
   * 解析“1 个计量单位里含多少有效成分”。
   *
   * 顺序（与设计文档 5.1 一致）：
   *   1. nutritionProfile 标准字段 / 派生字段（PER_* 基准折算）
   *   2. nutritionProfile customItems（自定义成分）
   *   3. properties.active_nutrients（旧档兜底，带单位校验）
   *
   * 任何一步的浓度单位与目标单位不一致都返回 UNIT_MISMATCH，
   * 不做系数猜测（例如把 active_nutrients 里写错的 g 当成 mg）。
   */
  resolveConcentration(
    ingredient: any,
    target: SupplementTargetInput,
  ): ConcentrationResolution {
    const profile = normalizeNutritionProfile(
      ingredient?.nutritionProfile,
    ) as NutritionProfileV2 | null;

    if (profile && isCustomNutrientKey(target.fieldPath)) {
      const wanted = normalizeCustomNutrientName(
        target.fieldPath.slice('custom:'.length),
      );
      const item = (profile.customItems ?? []).find(
        (candidate) =>
          normalizeCustomNutrientName(candidate.name) === wanted ||
          candidate.canonicalFieldPath === target.fieldPath,
      );
      if (item) {
        const resolved = this.resolveProfileValue({
          ingredient,
          profile,
          rawValue: Number(item.value),
          rawUnit: item.unit,
          rawBasis: item.rawBasisType ?? profile.meta?.rawBasisType,
          target,
        });
        if (resolved.status === 'OK' || resolved.status === 'UNIT_MISMATCH') {
          return resolved;
        }
      }
    }

    if (profile && !isCustomNutrientKey(target.fieldPath)) {
      const rawValue = getNutritionProfileFieldValue(
        profile,
        target.fieldPath,
      );
      if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
        const derived = findDerivedNutritionField(target.fieldPath);
        const field = findNutritionField(target.fieldPath);
        const rawUnit =
          derived?.unit ??
          field?.unit ??
          target.unit ??
          '';
        const resolved = this.resolveProfileValue({
          ingredient,
          profile,
          rawValue,
          rawUnit,
          rawBasis:
            derived?.formula === 'RATIO'
              ? 'PER_1_G'
              : profile.meta?.rawBasisType,
          target,
          skipBasisCheck: derived?.formula === 'RATIO',
        });
        if (resolved.status === 'OK' || resolved.status === 'UNIT_MISMATCH') {
          return resolved;
        }
      }
    }

    const active = findActiveNutrient(
      readActiveNutrients(ingredient),
      target,
    );
    if (active) {
      return this.matchUnit(active.value, active.unit, target);
    }

    return { status: 'MISSING' };
  }

  computeDosage(input: {
    ingredient: any;
    targets: SupplementTargetInput[];
    totalWeightG: number;
  }): SupplementDosageResult {
    const totalWeightG = Number(input.totalWeightG);
    if (!Number.isFinite(totalWeightG) || totalWeightG <= 0) {
      throw new BadRequestException('批次总重必须大于 0');
    }

    const targets = (input.targets ?? []).filter(
      (target) =>
        Number.isFinite(Number(target?.targetValuePerKg)) &&
        Number(target.targetValuePerKg) > 0,
    );

    const unit = resolveDisplayUnit(input.ingredient);

    if (targets.length === 0) {
      return {
        status: 'NO_TARGETS',
        amount: null,
        unit,
        targets: [],
        concentrations: [],
        missingFieldPaths: [],
      };
    }

    const kg = totalWeightG / 1000;
    let maxAmount = 0;
    let hasMismatch = false;
    let hasMissing = false;
    const concentrations: SupplementDosageResult['concentrations'] = [];
    const missingFieldPaths = new Set<string>();

    for (const target of targets) {
      const resolution = this.resolveConcentration(input.ingredient, target);
      if (resolution.status !== 'OK') {
        if (resolution.status === 'UNIT_MISMATCH') hasMismatch = true;
        else hasMissing = true;
        missingFieldPaths.add(target.fieldPath);
        continue;
      }

      const needed = Number(target.targetValuePerKg) * kg;
      const amount = needed / resolution.value;
      if (!Number.isFinite(amount) || amount <= 0) {
        hasMissing = true;
        missingFieldPaths.add(target.fieldPath);
        continue;
      }

      maxAmount = Math.max(maxAmount, amount);
      concentrations.push({
        fieldPath: target.fieldPath,
        value: resolution.value,
        unit: resolution.unit,
      });
    }

    const status = hasMismatch
      ? 'UNIT_MISMATCH'
      : hasMissing
        ? 'MISSING_CONCENTRATION'
        : 'OK';

    return {
      status,
      amount: status === 'OK' ? maxAmount : null,
      unit,
      targets: targets.map((target) => ({
        fieldPath: target.fieldPath,
        label: target.label || target.fieldPath,
        unit: target.unit,
        targetValuePerKg: Number(target.targetValuePerKg),
      })),
      concentrations,
      missingFieldPaths: Array.from(missingFieldPaths),
    };
  }

  private resolveProfileValue(input: {
    ingredient: any;
    profile: NutritionProfileV2;
    rawValue: number;
    rawUnit: string;
    rawBasis: unknown;
    target: SupplementTargetInput;
    skipBasisCheck?: boolean;
  }): ConcentrationResolution {
    if (!Number.isFinite(input.rawValue) || input.rawValue <= 0) {
      return { status: 'MISSING' };
    }

    const basis = normalizeBasis(input.rawBasis);
    const factor = BASIS_FACTORS[basis];
    if (factor === null || factor === undefined) {
      return { status: 'MISSING' };
    }

    if (!input.skipBasisCheck) {
      const expectedBase = BASIS_BASE_UNITS[basis];
      const actualBase = String(input.ingredient?.baseUnit ?? '')
        .trim()
        .toUpperCase();
      if (expectedBase && actualBase && expectedBase !== actualBase) {
        return {
          status: 'UNIT_MISMATCH',
          actualUnit: resolveDisplayUnit(input.ingredient),
        };
      }
    }

    const value = input.rawValue * factor;
    return this.matchUnit(value, input.rawUnit, input.target);
  }

  private matchUnit(
    value: number,
    unit: string,
    target: SupplementTargetInput,
  ): ConcentrationResolution {
    const actualUnit = normalizeSupplementUnit(unit);
    const expectedUnit = normalizeSupplementUnit(target.unit);

    if (expectedUnit && actualUnit && expectedUnit !== actualUnit) {
      return { status: 'UNIT_MISMATCH', actualUnit };
    }

    return {
      status: 'OK',
      value,
      unit: actualUnit || expectedUnit || '',
    };
  }
}
