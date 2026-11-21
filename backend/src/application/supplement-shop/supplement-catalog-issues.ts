/**
 * 补剂上架体检（纯函数）
 *
 * 把「上架清单」里逐条判断的体检规则抽成不依赖数据库/服务的纯函数，
 * 供上架清单（SupplementCatalogService）和草稿最终校验（Task 6 的 buildContext）共用。
 *
 * 规则与文案必须和抽取前 `SupplementCatalogService` 内联的那段完全一致：
 * 抽取只是搬家，不改级别、不改阈值、不改字段名。
 */

import { isSupplementUnitOneToOne } from './supplement-unit.util';

export type SupplementCatalogIssueCode =
  | 'NO_PRICE'
  | 'FORM_MISSING'
  | 'LIQUID_UNSUPPORTED'
  | 'SHELF_LIFE_MISSING'
  | 'STORAGE_MISSING'
  | 'UNIT_INCONSISTENT'
  | 'UNIT_INCOMPATIBLE'
  | 'DUPLICATE_NAME'
  | 'EQUIVALENCE_UNGROUPED'
  | 'EQUIVALENCE_GROUP_NOT_APPROVED'
  | 'EQUIVALENCE_GROUP_SINGLETON'
  | 'EQUIVALENCE_NUTRIENT_MISSING'
  | 'EQUIVALENCE_UNIT_MISMATCH';

export interface SupplementCatalogIssue {
  code: SupplementCatalogIssueCode;
  level: 'ERROR' | 'WARN';
  message: string;
}

/** 物理形态（与 prisma schema 的 IngredientPhysicalForm 对齐） */
export type SupplementIssuePhysicalForm =
  | 'POWDER'
  | 'TABLET'
  | 'CAPSULE'
  | 'LIQUID';

/** 体检需要的等价组信息（不直接吃 Prisma 行，避免纯函数依赖数据库形状） */
export interface SupplementIssueEquivalenceGroup {
  name: string;
  /** 组状态：只有 APPROVED 才参与替换 */
  status: string;
  isActive: boolean;
  memberCount: number;
  nutrientLabel: string;
  nutrientUnit: string;
}

/**
 * `SupplementDosageService.resolveConcentration` 的结果。
 * 未归组时不解析浓度，传 null。
 */
export type SupplementIssueConcentration =
  | { status: 'OK' }
  | { status: 'MISSING' }
  | { status: 'UNIT_MISMATCH'; actualUnit: string };

export interface SupplementIssueInput {
  /** 进货价；<= 0 会阻断上架（算不出售价） */
  price: number;
  /**
   * 采购单位换算倍数。
   * 现有体检清单没有针对倍数的规则（倍数为 0 只会让 unitCost 变 null），
   * 为避免改变行为，这里只作为档案输入的一部分保留，不产生 issue。
   */
  purchaseToBaseRatio: number;
  physicalForm: SupplementIssuePhysicalForm | null;
  baseUnit: string;
  unitDisplayLabel: string | null;
  /** 最终展示单位（unit_display_label → properties.display_unit → purchase_unit） */
  displayUnit: string;
  /** properties.display_unit 原值，用于暴露单位口径不一致 */
  propertiesDisplayUnit: string | null;
  shelfLifeMonths: number | null;
  storageCondition: string | null;
  /** 同名补剂档案条数（含自己） */
  sameNameCount: number;
  equivalenceGroup: SupplementIssueEquivalenceGroup | null;
  /** 等价组目标营养素的浓度解析结果；未归组时为 null */
  concentration: SupplementIssueConcentration | null;
}

/**
 * 逐条体检。返回顺序与抽取前一致，上架页/审核页依赖这个顺序展示。
 */
export function evaluateSupplementIssues(
  input: SupplementIssueInput,
): SupplementCatalogIssue[] {
  const {
    price,
    physicalForm,
    baseUnit,
    unitDisplayLabel,
    displayUnit,
    propertiesDisplayUnit,
    shelfLifeMonths,
    storageCondition,
    sameNameCount,
    equivalenceGroup,
    concentration,
  } = input;

  const issues: SupplementCatalogIssue[] = [];

  if (price <= 0) {
    issues.push({
      code: 'NO_PRICE',
      level: 'ERROR',
      message: '进货价为 0，无法计价，需先补价或不上架',
    });
  }

  if (!physicalForm) {
    issues.push({
      code: 'FORM_MISSING',
      level: 'ERROR',
      message: '未填写物理形态，无法确定分装方式',
    });
  } else if (physicalForm === 'LIQUID') {
    issues.push({
      code: 'LIQUID_UNSUPPORTED',
      level: 'ERROR',
      message: '液体补剂暂不支持分装，不应上架',
    });
  }

  if (!isSupplementUnitOneToOne(displayUnit, baseUnit)) {
    issues.push({
      code: 'UNIT_INCOMPATIBLE',
      level: 'ERROR',
      message: `展示单位「${displayUnit}」无法与库存基准单位 ${baseUnit} 1:1 对应；请先修档案，禁止上架`,
    });
  }

  if (!shelfLifeMonths) {
    issues.push({
      code: 'SHELF_LIFE_MISSING',
      level: 'ERROR',
      message: '未填写原厂保质期，无法计算分装后有效期',
    });
  }

  if (!storageCondition) {
    issues.push({
      code: 'STORAGE_MISSING',
      level: 'WARN',
      message: '未填写储存条件，标签无法印刷',
    });
  }

  if (
    propertiesDisplayUnit &&
    unitDisplayLabel &&
    propertiesDisplayUnit !== unitDisplayLabel
  ) {
    issues.push({
      code: 'UNIT_INCONSISTENT',
      level: 'WARN',
      message: `单位口径不一致：properties.display_unit="${propertiesDisplayUnit}"，unit_display_label="${unitDisplayLabel}"`,
    });
  }

  if (sameNameCount > 1) {
    issues.push({
      code: 'DUPLICATE_NAME',
      level: 'WARN',
      message: `同名补剂档案有 ${sameNameCount} 条，需确认是否重复`,
    });
  }

  if (!equivalenceGroup) {
    issues.push({
      code: 'EQUIVALENCE_UNGROUPED',
      level: 'WARN',
      message: '未归入等价组：缺货时无法推荐同营养替代原料',
    });
  } else {
    if (equivalenceGroup.status !== 'APPROVED' || equivalenceGroup.isActive === false) {
      issues.push({
        code: 'EQUIVALENCE_GROUP_NOT_APPROVED',
        level: 'WARN',
        message: `所在等价组「${equivalenceGroup.name}」还未审核通过，不参与替换`,
      });
    }
    if (equivalenceGroup.memberCount <= 1) {
      issues.push({
        code: 'EQUIVALENCE_GROUP_SINGLETON',
        level: 'WARN',
        message: `所在等价组「${equivalenceGroup.name}」只有 1 个成员，等于不能替换`,
      });
    }
    if (concentration?.status === 'UNIT_MISMATCH') {
      issues.push({
        code: 'EQUIVALENCE_UNIT_MISMATCH',
        level: 'WARN',
        message: `等价组「${equivalenceGroup.name}」要求 ${equivalenceGroup.nutrientLabel}（${equivalenceGroup.nutrientUnit}），档案浓度单位是 ${concentration.actualUnit || '未知'}，该原料不参与替换`,
      });
    } else if (concentration?.status !== 'OK') {
      issues.push({
        code: 'EQUIVALENCE_NUTRIENT_MISSING',
        level: 'WARN',
        message: `等价组「${equivalenceGroup.name}」要求的 ${equivalenceGroup.nutrientLabel} 浓度缺失，该原料不参与替换`,
      });
    }
  }

  return issues;
}
