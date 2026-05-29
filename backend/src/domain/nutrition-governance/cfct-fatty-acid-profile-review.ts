import {
  calculateCfctFattyAcidValueFromPercent,
  type CfctFattyAcidCanonicalUnit,
} from './cfct-fatty-acid-conversion';

type JsonRecord = Record<string, unknown>;

export interface CfctFattyAcidProfileReviewInput {
  id: string;
  name: string;
  displayNameZh?: string | null;
  dataSource: string;
  externalId?: string | null;
  nutritionData: unknown;
}

export interface CfctFattyAcidProfileReviewSummary {
  profileCount: number;
  fieldRowCount: number;
  enteredFieldCount: number;
  missingFieldCount: number;
  highRiskFieldCount: number;
  percentConversionCheckedCount: number;
}

export interface CfctFattyAcidProfileReviewProfileRow {
  id: string;
  name: string;
  displayNameZh: string;
  dataSource: string;
  externalId: string;
  enteredFieldCount: number;
  missingFieldCount: number;
  highRiskFieldCount: number;
  percentConversionCheckedCount: number;
  totalClosureDifferenceG: number | null;
  totalClosureRiskZh: string;
  actionZh: string;
}

export interface CfctFattyAcidProfileReviewFieldRow {
  id: string;
  name: string;
  displayNameZh: string;
  externalId: string;
  fieldPath: string;
  fieldKey: string;
  labelZh: string;
  cfctSourceColumn: string;
  unit: string;
  currentValue: number | null;
  sourceStatusZh: string;
  sourceRiskZh: string;
  actionZh: string;
  originalValue: number | string | null;
  originalUnit: string;
  sourcePage: string;
  sourceTable: string;
  totalFattyAcidsG: number | null;
  convertedValue: number | null;
  conversionCheckZh: string;
  notesZh: string;
}

export interface CfctFattyAcidProfileReviewGuideRow {
  topicZh: string;
  ruleZh: string;
}

export interface CfctFattyAcidProfileReview {
  summary: CfctFattyAcidProfileReviewSummary;
  profileRows: CfctFattyAcidProfileReviewProfileRow[];
  fieldRows: CfctFattyAcidProfileReviewFieldRow[];
  guideRows: CfctFattyAcidProfileReviewGuideRow[];
}

interface FattyAcidFieldDefinition {
  key: string;
  labelZh: string;
  unit: string;
  cfctSourceColumn: string;
  group: 'total' | 'percent';
}

const FATTY_ACID_FIELDS: FattyAcidFieldDefinition[] = [
  {
    key: 'saturatedFattyAcids',
    labelZh: '饱和脂肪酸',
    unit: 'g',
    cfctSourceColumn: 'SFA 总量',
    group: 'total',
  },
  {
    key: 'monounsaturatedFattyAcids',
    labelZh: '单不饱和脂肪酸',
    unit: 'g',
    cfctSourceColumn: 'MUFA 总量',
    group: 'total',
  },
  {
    key: 'polyunsaturatedFattyAcids',
    labelZh: '多不饱和脂肪酸',
    unit: 'g',
    cfctSourceColumn: 'PUFA 总量',
    group: 'total',
  },
  {
    key: 'linoleicAcid',
    labelZh: '亚油酸',
    unit: 'g',
    cfctSourceColumn: '18:2',
    group: 'percent',
  },
  {
    key: 'alphaLinolenicAcid',
    labelZh: 'α-亚麻酸',
    unit: 'g',
    cfctSourceColumn: '18:3',
    group: 'percent',
  },
  {
    key: 'arachidonicAcid',
    labelZh: '花生四烯酸',
    unit: 'g',
    cfctSourceColumn: '20:4',
    group: 'percent',
  },
  {
    key: 'epa',
    labelZh: 'EPA',
    unit: 'mg',
    cfctSourceColumn: '20:5',
    group: 'percent',
  },
  {
    key: 'dpa',
    labelZh: 'DPA',
    unit: 'mg',
    cfctSourceColumn: '22:5',
    group: 'percent',
  },
  {
    key: 'dha',
    labelZh: 'DHA',
    unit: 'mg',
    cfctSourceColumn: '22:6',
    group: 'percent',
  },
];

export function buildCfctFattyAcidProfileReview(
  profiles: CfctFattyAcidProfileReviewInput[],
): CfctFattyAcidProfileReview {
  const profileRows: CfctFattyAcidProfileReviewProfileRow[] = [];
  const fieldRows: CfctFattyAcidProfileReviewFieldRow[] = [];

  for (const profile of profiles) {
    const rows = FATTY_ACID_FIELDS.map((field) =>
      buildFieldRow(profile, field),
    );
    fieldRows.push(...rows);
    profileRows.push(buildProfileRow(profile, rows));
  }

  return {
    summary: {
      profileCount: profiles.length,
      fieldRowCount: fieldRows.length,
      enteredFieldCount: fieldRows.filter((row) => row.currentValue !== null)
        .length,
      missingFieldCount: fieldRows.filter((row) => row.currentValue === null)
        .length,
      highRiskFieldCount: fieldRows.filter((row) =>
        row.sourceRiskZh.startsWith('高'),
      ).length,
      percentConversionCheckedCount: fieldRows.filter(
        (row) => row.conversionCheckZh === '通过',
      ).length,
    },
    profileRows,
    fieldRows,
    guideRows: [
      {
        topicZh: '可入库字段',
        ruleZh:
          '仅将当前营养档案模型已有的 9 个脂肪酸字段写入主字段；其他 CFCT 细分脂肪酸保留在来源证据或未映射字段中。',
      },
      {
        topicZh: '百分比换算',
        ruleZh:
          'CFCT 组成表中的单项脂肪酸为“占总脂肪酸百分比”，必须按 总脂肪酸 g/100g × 百分比 ÷ 100 复算；AA 使用 g 单位，EPA/DPA/DHA 需再乘以 1000 写入内部 mg 单位。',
      },
      {
        topicZh: 'Tr 处理',
        ruleZh:
          'Tr 表示微量或低于报告阈值，不自动写为 0；主字段保持空值，并在来源证据或备注中说明。',
      },
    ],
  };
}

function buildFieldRow(
  profile: CfctFattyAcidProfileReviewInput,
  field: FattyAcidFieldDefinition,
): CfctFattyAcidProfileReviewFieldRow {
  const nutritionData = asRecord(profile.nutritionData);
  const fattyAcids = asRecord(nutritionData.fattyAcids);
  const meta = asRecord(nutritionData.meta);
  const sourceForms = asRecord(meta.sourceForms);
  const fieldPath = `fattyAcids.${field.key}`;
  const sourceForm = asRecord(sourceForms[fieldPath]);
  const currentValue = finiteNumber(fattyAcids[field.key]);
  const originalValue =
    finiteNumber(sourceForm.originalValue) ?? stringValue(sourceForm.originalValue);
  const totalFattyAcidsG = finiteNumber(sourceForm.cfctFattyAcidTotalG);
  const convertedValue = calculateConvertedValue(sourceForm, field);
  const conversionCheckZh = checkConversion(currentValue, convertedValue);
  const sourcePage = cellText(sourceForm.sourcePage);
  const sourceTable = cellText(sourceForm.sourceTable);
  const hasSourceForm = Object.keys(sourceForm).length > 0;

  return {
    id: profile.id,
    name: profile.name,
    displayNameZh: profile.displayNameZh ?? '',
    externalId: profile.externalId ?? '',
    fieldPath,
    fieldKey: field.key,
    labelZh: field.labelZh,
    cfctSourceColumn: field.cfctSourceColumn,
    unit: field.unit,
    currentValue,
    sourceStatusZh: buildSourceStatus(field, currentValue, hasSourceForm),
    sourceRiskZh: buildSourceRisk(field, currentValue, hasSourceForm, conversionCheckZh),
    actionZh: buildAction(field, currentValue, hasSourceForm, conversionCheckZh),
    originalValue,
    originalUnit: cellText(sourceForm.originalUnit),
    sourcePage,
    sourceTable,
    totalFattyAcidsG,
    convertedValue,
    conversionCheckZh,
    notesZh: buildNotes(field, currentValue, sourcePage, sourceTable),
  };
}

function buildProfileRow(
  profile: CfctFattyAcidProfileReviewInput,
  rows: CfctFattyAcidProfileReviewFieldRow[],
): CfctFattyAcidProfileReviewProfileRow {
  const highRiskFieldCount = rows.filter((row) =>
    row.sourceRiskZh.startsWith('高'),
  ).length;
  const enteredFieldCount = rows.filter((row) => row.currentValue !== null).length;
  const missingFieldCount = rows.length - enteredFieldCount;
  const percentConversionCheckedCount = rows.filter(
    (row) => row.conversionCheckZh === '通过',
  ).length;
  const totalClosureDifferenceG = calculateTotalClosureDifference(rows);

  return {
    id: profile.id,
    name: profile.name,
    displayNameZh: profile.displayNameZh ?? '',
    dataSource: profile.dataSource,
    externalId: profile.externalId ?? '',
    enteredFieldCount,
    missingFieldCount,
    highRiskFieldCount,
    percentConversionCheckedCount,
    totalClosureDifferenceG,
    totalClosureRiskZh: buildTotalClosureRisk(totalClosureDifferenceG),
    actionZh:
      highRiskFieldCount > 0
        ? '存在高风险字段，需回看 PDF 原图后再写入。'
        : '已完成可量化主字段录入；缺失项需保留为待补源或 Tr/未列值证据。',
  };
}

function buildSourceStatus(
  field: FattyAcidFieldDefinition,
  currentValue: number | null,
  hasSourceForm: boolean,
): string {
  if (currentValue === null) return '未录入';
  if (field.group === 'percent') return '已录入（CFCT 百分比换算）';
  if (hasSourceForm) return '已录入（CFCT 总量表）';
  return '已录入（缺少来源元数据）';
}

function buildSourceRisk(
  field: FattyAcidFieldDefinition,
  currentValue: number | null,
  hasSourceForm: boolean,
  conversionCheckZh: string,
): string {
  if (conversionCheckZh === '不一致') {
    return '高：当前值与原始百分比换算结果不一致';
  }
  if (currentValue === null) {
    return '中：主字段为空；若原图为 Tr/未列值，不应自动写 0';
  }
  if (!hasSourceForm) {
    return '中：已有数值但缺少字段级来源元数据';
  }
  if (field.group === 'percent') {
    return '低：原始百分比、总脂肪酸基数和换算值可复算';
  }
  return '低：字段已有来源页、单位和 CFCT 总量表证据';
}

function buildAction(
  field: FattyAcidFieldDefinition,
  currentValue: number | null,
  hasSourceForm: boolean,
  conversionCheckZh: string,
): string {
  if (conversionCheckZh === '不一致') {
    return '暂停使用该字段，回看 PDF 原图并修正换算。';
  }
  if (currentValue === null) {
    return '保留为空并在来源证据中说明；只有获得可量化来源后再录入。';
  }
  if (!hasSourceForm) {
    return '补充字段级来源元数据后再视为审核通过。';
  }
  if (field.group === 'percent') {
    return '保留当前值；后续复跑时继续按百分比换算校验。';
  }
  return '保留当前值；后续复跑时继续核对来源页和单位。';
}

function buildNotes(
  field: FattyAcidFieldDefinition,
  currentValue: number | null,
  sourcePage: string,
  sourceTable: string,
): string {
  if (currentValue === null) {
    return `${field.cfctSourceColumn} 当前无可量化主字段值；如原图为 Tr，应保留空值。`;
  }
  const source = [sourceTable, sourcePage ? `第 ${sourcePage} 页` : '']
    .filter(Boolean)
    .join('，');
  return source ? `${field.cfctSourceColumn} 来源：${source}。` : '';
}

function calculateConvertedValue(
  sourceForm: JsonRecord,
  field: FattyAcidFieldDefinition,
): number | null {
  if (!isPercentSourceForm(sourceForm)) return null;

  const percent = finiteNumber(sourceForm.originalValue);
  const totalFattyAcidsG = finiteNumber(sourceForm.cfctFattyAcidTotalG);
  if (percent === null || totalFattyAcidsG === null) return null;

  return calculateCfctFattyAcidValueFromPercent({
    totalFattyAcidsG,
    percentOfTotalFattyAcids: percent,
    targetUnit: toCanonicalUnit(field.unit),
  });
}

function toCanonicalUnit(unit: string): CfctFattyAcidCanonicalUnit {
  return unit === 'mg' ? 'mg' : 'g';
}

function isPercentSourceForm(sourceForm: JsonRecord): boolean {
  const originalUnit = stringValue(sourceForm.originalUnit);
  const sourceNutrientId = stringValue(sourceForm.sourceNutrientId);
  return (
    originalUnit?.includes('%') === true ||
    sourceNutrientId?.includes('_PERCENT') === true
  );
}

function checkConversion(
  currentValue: number | null,
  convertedValue: number | null,
): string {
  if (currentValue === null || convertedValue === null) return '不适用';
  return Math.abs(currentValue - convertedValue) <= 0.000001 ? '通过' : '不一致';
}

function calculateTotalClosureDifference(
  rows: CfctFattyAcidProfileReviewFieldRow[],
): number | null {
  const saturated = valueFor(rows, 'saturatedFattyAcids');
  const monounsaturated = valueFor(rows, 'monounsaturatedFattyAcids');
  const polyunsaturated = valueFor(rows, 'polyunsaturatedFattyAcids');
  const total = rows.find((row) => row.totalFattyAcidsG !== null)
    ?.totalFattyAcidsG;
  if (
    saturated === null ||
    monounsaturated === null ||
    polyunsaturated === null ||
    total === null ||
    total === undefined
  ) {
    return null;
  }

  return round(total - saturated - monounsaturated - polyunsaturated);
}

function buildTotalClosureRisk(totalClosureDifferenceG: number | null): string {
  if (totalClosureDifferenceG === null) return '未校验：缺少总脂肪酸或分类总量';
  if (Math.abs(totalClosureDifferenceG) <= 0.05) {
    return '低：SFA/MUFA/PUFA 与总脂肪酸基本闭合';
  }
  if (Math.abs(totalClosureDifferenceG) <= 0.5) {
    return '中：分类总量与总脂肪酸存在小幅差异，需在报告中保留';
  }
  return '高：分类总量与总脂肪酸差异较大，需回看原图';
}

function valueFor(
  rows: CfctFattyAcidProfileReviewFieldRow[],
  fieldKey: string,
): number | null {
  return rows.find((row) => row.fieldKey === fieldKey)?.currentValue ?? null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
