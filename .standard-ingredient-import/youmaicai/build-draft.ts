/**
 * 生成「油麦菜」原料草稿（方案二）
 *
 *   主数据：中国食物成分表 标准版 第六版 第一册 p74-75，食物编码 045334
 *           + p212 碘含量表（油麦菜代表值 3.1 µg/100g）
 *   补缺项：CFCT 未检测的氨基酸，借用同种莴苣 USDA FDC 169990（Celtuce, raw）
 *
 * 只读本地营养库，不写任何数据库；产出草稿 JSON。
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// 脚本在 backend/ 目录下用 ts-node 执行，从 backend/node_modules 解析 Prisma 客户端。
const { PrismaClient } = require(join(
  process.cwd(),
  'node_modules/@prisma/client',
)) as { PrismaClient: new () => any };

import {
  mapCfctRowToSourceInput,
  type ReviewedCfctRow,
} from '../../backend/prisma/import-cfct-private-source';
import { NUTRITION_FIELD_CATALOG } from '../../backend/src/domain/ingredient/nutrition-field-catalog';
import type { NutritionProfileV2 } from '../../backend/src/domain/ingredient/types';
import { auditNutritionProfileForImport } from '../../backend/src/application/standard-ingredient-import';

const TAB_KEYS = ['macros', 'minerals', 'vitamins', 'fattyAcids', 'aminoAcids'] as const;
const USDA_SOURCE_KEY = 'USDA:169990';

// ── 1. 人工核对过的 CFCT 油麦菜行（照书页原图逐格核对）
const cfctRow: ReviewedCfctRow = {
  volume: '第六版 第一册',
  page: 98,
  row: 7,
  foodName: '油麦菜',
  category: '蔬菜类及制品/嫩茎、叶、花菜类',
  foodCode: '045334',
  ediblePortionPercent: 81,
  energyKj: 50,
  nutrients: {
    moisture: 95.9,
    energyKcal: 12,
    crudeProtein: 1.1,
    crudeFat: 0.4,
    ash: 0.5,
    carbohydrate: 2.1,
    calcium: 60,
    phosphorus: 26,
    potassium: 164,
    sodium: 32,
    magnesium: 23,
    iron: 0.5,
    zinc: 0.24,
    copper: 0.02,
    manganese: 0.06,
    selenium: 0.16,
    iodine: 3.1, // ← 表四 常见食物中碘含量 p212，序号127 油麦菜（代表值）
    vitaminB1: 0.03,
    vitaminB2: 0.07,
    vitaminB3: 0.56,
    vitaminC: 2,
  },
  unmappedNutrients: {
    cfctVitaminARetinolUg: 0,
    cfctVitaminABetaCaroteneUg: 751,
    cfctVitaminEAlphaTocopherolMg: 0.45,
    cfctVitaminEBetaGammaTocopherolMg: 0,
    cfctVitaminEDeltaTocopherolMg: 0,
    cfctVitaminETotalAlphaEquivalentMg: 0.45,
  },
  sourceSegments: [
    {
      kind: 'PRIMARY',
      page: 98,
      row: 7,
      rawOcrText: '045334 油麦菜 81 95.9 12 50 1.1 0.4 2.1 0 0.5 63 751 0 0.03 0.07',
      ocrConfidence: 0.7951,
    },
    {
      kind: 'CONTINUATION',
      page: 99,
      row: 7,
      rawOcrText:
        '045334 油麦菜 0.56 2.0 0.45 0.45 Tr Tr 60 26 164 32.0 •23 0.5 0.24 0.16 0.02 0.06',
      ocrConfidence: 0.8127,
    },
  ],
  qualityFlags: [],
  reviewStatus: 'REVIEWED_MANUAL',
};

const prisma = new PrismaClient();

async function main() {
  // ── 2. 取 USDA 同种莴苣档案（只读）
  const usdaRecord = await prisma.nutritionSourceRecord.findFirst({
    where: { sourceKey: USDA_SOURCE_KEY },
    select: { normalizedNutrition: true, foodName: true },
  });
  if (!usdaRecord?.normalizedNutrition) {
    throw new Error(`本地营养库找不到 ${USDA_SOURCE_KEY}`);
  }
  const usda = usdaRecord.normalizedNutrition as unknown as NutritionProfileV2;

  // ── 3. CFCT 主档 → 犬用口径
  const profile = mapCfctRowToSourceInput(cfctRow).normalizedNutrition as NutritionProfileV2;
  profile.meta.confidenceLevel = 'MEDIUM';
  profile.meta.sourceTitle = '中国食物成分表 标准版 第六版 第一册';
  profile.meta.conversionNotes ??= {};
  profile.meta.conversionNotes['meta.supplementation'] =
    `CFCT 未检测氨基酸；氨基酸字段借用同种莴苣（USDA FDC ${USDA_SOURCE_KEY}，Celtuce/莴苣 var. angustata）。` +
    `其余字段全部来自 CFCT 第六版第一册 p74-75（食物编码 045334），碘来自 p212。`;

  // ── 4. 方案二：只补 CFCT 未检测的氨基酸（老板 2026-10-16 选定）
  //      膳食纤维 / 维生素B5 / B6 / 叶酸保持空缺，不借用，留给治理流程后续补。
  const SUPPLEMENT_TABS = ['aminoAcids'] as const;
  const supplemented: string[] = [];
  for (const tabKey of SUPPLEMENT_TABS) {
    const src = (usda as unknown as Record<string, Record<string, number | null>>)[tabKey] ?? {};
    const dst = (profile as unknown as Record<string, Record<string, number | null>>)[tabKey];
    for (const [fieldKey, value] of Object.entries(src)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
      if (dst[fieldKey] != null) continue;
      dst[fieldKey] = value;
      supplemented.push(`${tabKey}.${fieldKey}`);
      const usdaForm = usda.meta?.sourceForms?.[`${tabKey}.${fieldKey}`];
      profile.meta.sourceForms ??= {};
      profile.meta.sourceForms[`${tabKey}.${fieldKey}`] = {
        ...(usdaForm ?? {}),
        supplementalSource: true,
        supplementalFrom: `${USDA_SOURCE_KEY} (Celtuce, raw)`,
        supplementalReason: 'CFCT 第六版第一册未检测该营养素，借用同种莴苣档案。',
      } as never;
    }
  }

  // ── 5. 覆盖率审计
  const nutrients: Record<string, { value: number; unit: string }> = {};
  const sourceForms: Record<string, Record<string, unknown>> = {};
  for (const tabKey of TAB_KEYS) {
    const tab = (profile as unknown as Record<string, Record<string, number | null>>)[tabKey] ?? {};
    for (const [fieldKey, value] of Object.entries(tab)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const def = NUTRITION_FIELD_CATALOG.find(
        (f: { tabKey: string; fieldKey: string }) => f.tabKey === tabKey && f.fieldKey === fieldKey,
      );
      if (!def) continue;
      nutrients[fieldKey] = { value, unit: def.unit };
      const sf = profile.meta?.sourceForms?.[`${tabKey}.${fieldKey}`];
      if (sf) sourceForms[fieldKey] = sf as Record<string, unknown>;
    }
  }
  const audit = auditNutritionProfileForImport({
    profileName: '油麦菜',
    nutrients,
    sourceForms,
  } as never);
  const coverage = Math.round(audit.essentialCoveragePercent * 10) / 10;

  console.log(`覆盖率: ${coverage}%  缺失 ${audit.missingEssentialNutrients.length} 项`);
  console.log(`阻断问题: ${JSON.stringify(audit.blockingIssues)}`);
  console.log(`复核问题: ${JSON.stringify(audit.reviewIssues)}`);
  console.log(`借用 USDA 补齐的字段 (${supplemented.length}): ${supplemented.join(', ')}`);

  // ── 6. 组装草稿
  const draft = {
    version: 1,
    summary: {
      name: '油麦菜',
      nameEn: 'A-choy (Taiwan lettuce), raw',
      type: 'FOOD',
      state: 'raw',
      coveragePercent: coverage,
      missingNutrients: audit.missingEssentialNutrients,
      evidenceNotes:
        '营养数据：中国食物成分表 标准版 第六版 第一册 p74-75（食物编码 045334，生、鲜）+ p212 碘含量表。' +
        `CFCT 未检测的 ${supplemented.length} 个氨基酸字段，借用同种莴苣 USDA FDC 169990（Celtuce, raw），逐字段来源见档案元数据。`,
      notesForUser: `油麦菜（叶用莴苣）。核心营养数值来自中国食物成分表第六版，覆盖率 ${coverage}%，氨基酸借用同种莴苣数据。`,
    },
    ingredient: {
      name: '油麦菜',
      type: 'FOOD',
      procurementStrategy: 'DAILY_PURCHASE',
      diyEnabled: false,
      procurementEnabled: true,
      brand: null,
      productModel: null,
      purchaseChannel: null,
      notes: '叶用莴苣。营养档案来源：中国食物成分表 标准版 第六版 第一册 p74-75（编码 045334）。',
      baseUnit: 'G',
      baseUnitDisplayName: '克',
      unitDisplayLabel: 'g',
      purchaseUnit: '份',
      purchaseToBaseRatio: 500,
      currentPricePerPurchaseUnit: 3.98,
      effectivePricePerPurchaseUnit: 3.98,
      properties: {
        nutritionPending: false,
        nutritionCoveragePercent: coverage,
        missingNutrients: audit.missingEssentialNutrients,
        nutritionSourceRecordId: null,
        nutritionSourceNotes:
          'CFCT 第六版第一册 045334（p74-75 主表+续表，p212 碘）；氨基酸等补缺字段来自 USDA FDC 169990。',
      },
    },
    nutritionFood: {
      name: '油麦菜（生）',
      nameEn: 'A-choy (Taiwan lettuce), raw',
      displayNameZh: '油麦菜',
      category: 'VEGETABLE',
      dataSource: 'CFCT',
      externalId: '045334',
      preparationState: 'RAW',
      preparationStateLabel: '生重',
      ediblePortionLabel: '去根，可食部 81%',
      processingLabel: '未加工',
      nutritionData: profile,
      notes:
        '中国食物成分表 标准版 第六版 第一册 p74-75（食物编码 045334，生、鲜；2002.8 采自北京市崇文门菜市场）；' +
        '碘取自 p212「常见食物中碘含量」油麦菜（代表值）。' +
        `CFCT 未检测的 ${supplemented.length} 个氨基酸字段借用同种莴苣 USDA FDC 169990，逐字段来源见 meta.sourceForms。`,
    },
    mapping: { isPrimary: true, yieldRate: 1, notes: null },
    procurementSku: null,
  };

  const out = join(__dirname, 'youmaicai.draft.json');
  await writeFile(out, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  console.log(`草稿已写入: ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
