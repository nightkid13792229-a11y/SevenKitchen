import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, isAbsolute, resolve } from 'path';
import { spawnSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  importCfctPrivateSourceRows,
  type ReviewedCfctRow,
  type ReviewedCfctNutrients,
  type ReviewedCfctSourceSegment,
} from '../prisma/import-cfct-private-source';

const DEFAULT_STRUCTURED_OUTPUT = 'reports/cfct-ocr-structured-rows.json';
const DEFAULT_REPORT_OUTPUT = 'reports/cfct-ocr-structured-report.csv';
const DEFAULT_OCR_OUTPUT = 'reports/cfct-ocr-pages.jsonl';
const MIN_OCR_CONFIDENCE = 0.72;

type CfctQualityFlag =
  | 'LOW_OCR_CONFIDENCE'
  | 'MISSING_FOOD_NAME'
  | 'MISSING_FOOD_CODE'
  | 'NOT_ENOUGH_NUMERIC_CELLS'
  | 'CONTINUATION_INCOMPLETE'
  | 'MISSING_PRIMARY_ROW'
  | 'WATER_OUT_OF_RANGE'
  | 'NEGATIVE_NUTRIENT'
  | 'MACRO_SUM_OUT_OF_RANGE'
  | 'ENERGY_MACRO_MISMATCH'
  | 'MINERAL_OUT_OF_RANGE';

export interface CfctOcrObservation {
  text: string;
  confidence?: number | null;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface CfctOcrPage {
  sourcePdf: string;
  volume: string;
  page: number;
  imageWidth?: number | null;
  imageHeight?: number | null;
  observations: CfctOcrObservation[];
  fullText: string;
}

export interface StructuredCfctRow extends ReviewedCfctRow {
  foodCode?: string;
  ediblePortionPercent?: number;
  energyKj?: number;
  sourcePdf: string;
  ocrPage: number;
  ocrLine: number;
  rawOcrText: string;
  ocrConfidence: number;
  qualityFlags: CfctQualityFlag[];
  reviewStatus: 'AUTO_STRUCTURED' | 'NEEDS_REVIEW';
}

interface StructuredCfctContinuationRow {
  volume: string;
  page: number;
  row: number;
  foodName: string;
  foodCode: string;
  nutrients: ReviewedCfctNutrients;
  unmappedNutrients?: Record<string, number | null | undefined>;
  sourcePdf: string;
  ocrPage: number;
  ocrLine: number;
  rawOcrText: string;
  ocrConfidence: number;
  qualityFlags: CfctQualityFlag[];
  sourceSegments: ReviewedCfctSourceSegment[];
}

interface ParseLineInput {
  line: string;
  page: CfctOcrPage;
  lineIndex: number;
  confidence: number;
}

interface StructuredRowValidationInput {
  foodName: string;
  nutrients: ReviewedCfctNutrients;
  ocrConfidence: number;
}

interface CodeNamedNutrientLine {
  foodCode: string;
  foodName: string;
  numericValues: number[];
}

interface ImportArgs {
  apply: boolean;
  allowAutoImport: boolean;
  ocrInput: string | null;
  pdf: string | null;
  volume: string;
  orientation: 'up' | 'right' | 'left' | 'down';
  startPage: number | null;
  endPage: number | null;
  ocrOutput: string;
  structuredOutput: string;
  reportOutput: string;
}

interface ImportCounters {
  ocrPages: number;
  structuredRows: number;
  autoStructuredRows: number;
  needsReviewRows: number;
  importedRows: number;
}

const NUMERIC_COLUMN_MAP: Array<keyof ReviewedCfctNutrients> = [
  'energyKcal',
  'moisture',
  'crudeProtein',
  'crudeFat',
  'ash',
  'carbohydrate',
  'calcium',
  'phosphorus',
  'potassium',
  'sodium',
  'magnesium',
  'iron',
  'zinc',
  'selenium',
  'copper',
  'manganese',
  'iodine',
];

loadEnv({ path: process.env.ENV_FILE || '.env' });

export function parseCfctOcrLine({
  line,
  page,
  lineIndex,
  confidence,
}: ParseLineInput): StructuredCfctRow | null {
  const normalizedLine = normalizeOcrLine(line);
  if (!normalizedLine || looksLikeHeaderOrFooter(normalizedLine)) {
    return null;
  }
  if (looksLikeCfctStandaloneSpecialPage(page.fullText)) {
    return null;
  }

  const codeFirstRow = parseCodeFirstCfctRow(normalizedLine, page);
  if (codeFirstRow) {
    const qualityFlags = validateStructuredCfctRow({
      foodName: codeFirstRow.foodName,
      nutrients: codeFirstRow.nutrients,
      ocrConfidence: confidence,
    });

    return {
      volume: page.volume,
      page: page.page,
      row: lineIndex + 1,
      foodName: codeFirstRow.foodName,
      category: null,
      nutrients: codeFirstRow.nutrients,
      foodCode: codeFirstRow.foodCode,
      ediblePortionPercent: codeFirstRow.ediblePortionPercent,
      energyKj: codeFirstRow.energyKj,
      sourcePdf: page.sourcePdf,
      ocrPage: page.page,
      ocrLine: lineIndex + 1,
      rawOcrText: line,
      ocrConfidence: roundNumber(confidence, 4),
      qualityFlags,
      reviewStatus:
        qualityFlags.length === 0 ? 'AUTO_STRUCTURED' : 'NEEDS_REVIEW',
      sourceSegments: [
        createSourceSegment({
          kind: 'PRIMARY',
          page,
          lineIndex,
          line,
          confidence,
          nutrientKeys: [
            ...Object.keys(codeFirstRow.nutrients),
            ...Object.keys(codeFirstRow.unmappedNutrients ?? {}),
          ],
        }),
      ],
      unmappedNutrients: codeFirstRow.unmappedNutrients,
    };
  }

  const numberMatches = Array.from(
    normalizedLine.matchAll(/[-+]?\d+(?:[.,]\d+)?/gu),
  );
  if (numberMatches.length < 6) {
    return null;
  }

  const firstNumber = numberMatches[0];
  if (isLikelyCategoryPrefixedContinuationRow(normalizedLine, firstNumber)) {
    return null;
  }
  const foodName = normalizedLine
    .slice(0, firstNumber.index ?? 0)
    .replace(/[|｜:：]+/gu, '')
    .trim();
  if (!foodName || !containsCjk(foodName)) {
    return null;
  }

  const nutrients: ReviewedCfctNutrients = {};
  numberMatches.slice(0, NUMERIC_COLUMN_MAP.length).forEach((match, index) => {
    const key = NUMERIC_COLUMN_MAP[index];
    const parsed = Number(match[0].replace(',', '.'));
    if (key && Number.isFinite(parsed)) {
      nutrients[key] = parsed;
    }
  });

  const qualityFlags = validateStructuredCfctRow({
    foodName,
    nutrients,
    ocrConfidence: confidence,
  });
  qualityFlags.push('MISSING_FOOD_CODE');

  return {
    volume: page.volume,
    page: page.page,
    row: lineIndex + 1,
    foodName,
    category: null,
    nutrients,
    sourcePdf: page.sourcePdf,
    ocrPage: page.page,
    ocrLine: lineIndex + 1,
    rawOcrText: line,
    ocrConfidence: roundNumber(confidence, 4),
    qualityFlags,
    reviewStatus:
      qualityFlags.length === 0 ? 'AUTO_STRUCTURED' : 'NEEDS_REVIEW',
    sourceSegments: [
      createSourceSegment({
        kind: 'PRIMARY',
        page,
        lineIndex,
        line,
        confidence,
        nutrientKeys: Object.keys(nutrients),
      }),
    ],
  };
}

export function parseCfctContinuationOcrLine({
  line,
  page,
  lineIndex,
  confidence,
}: ParseLineInput): StructuredCfctContinuationRow | null {
  const normalizedLine = normalizeOcrLine(line);
  if (!normalizedLine || looksLikeHeaderOrFooter(normalizedLine)) {
    return null;
  }

  if (looksLikeCfctContinuationPage(page.fullText)) {
    const parsedLine = parseCodeNamedNutrientLine(normalizedLine, {
      allowLeadingText: true,
    });
    if (!parsedLine || parsedLine.numericValues.length < 10) {
      return null;
    }

    const { numericValues } = parsedLine;
    const nutrients: ReviewedCfctNutrients = {
      vitaminB3: numericValues[0],
      vitaminC: numericValues[1],
      calcium: numericValues[6],
      phosphorus: numericValues[7],
      potassium: numericValues[8],
      sodium: numericValues[9],
      magnesium: numericValues[10],
      iron: numericValues[11],
      zinc: numericValues[12],
      selenium: numericValues[13],
      copper: numericValues[14],
      manganese: numericValues[15],
    };
    stripMissingNutrients(nutrients);

    const unmappedNutrients = stripMissingUnmappedNutrients({
      cfctVitaminETotalAlphaEquivalentMg: numericValues[2],
      cfctVitaminEAlphaTocopherolMg: numericValues[3],
      cfctVitaminEBetaGammaTocopherolMg: numericValues[4],
      cfctVitaminEDeltaTocopherolMg: numericValues[5],
    });

    const qualityFlags = validateContinuationCfctRow({
      foodName: parsedLine.foodName,
      nutrients,
      numericCellCount: numericValues.length,
      ocrConfidence: confidence,
    });

    return createContinuationRow({
      parsedLine,
      page,
      line,
      lineIndex,
      confidence,
      nutrients,
      unmappedNutrients,
      qualityFlags,
    });
  }

  return parseCfctSpecialContinuationOcrLine({
    normalizedLine,
    page,
    line,
    lineIndex,
    confidence,
  });
}

function parseCfctSpecialContinuationOcrLine({
  normalizedLine,
  page,
  line,
  lineIndex,
  confidence,
}: ParseLineInput & { normalizedLine: string }): StructuredCfctContinuationRow | null {
  const parsedLine = parseCodeNamedNutrientLine(normalizedLine, {
    allowLeadingText: true,
  });
  if (!parsedLine) {
    return null;
  }

  if (looksLikeCfctAminoAcidFirstPage(page.fullText)) {
    const nutrients: ReviewedCfctNutrients = {
      isoleucine: mgToG(parsedLine.numericValues[2]),
      leucine: mgToG(parsedLine.numericValues[3]),
      lysine: mgToG(parsedLine.numericValues[4]),
      methionine: mgToG(parsedLine.numericValues[6]),
      cystine: mgToG(parsedLine.numericValues[7]),
      phenylalanine: mgToG(parsedLine.numericValues[9]),
      tyrosine: mgToG(parsedLine.numericValues[10]),
      threonine: mgToG(parsedLine.numericValues[11]),
    };
    stripMissingNutrients(nutrients);
    if (Object.keys(nutrients).length === 0) return null;

    return createContinuationRow({
      parsedLine,
      page,
      line,
      lineIndex,
      confidence,
      nutrients,
      unmappedNutrients: stripMissingUnmappedNutrients({
        cfctAminoAcidWaterG: parsedLine.numericValues[0],
        cfctAminoAcidProteinG: parsedLine.numericValues[1],
        cfctSulfurAminoAcidsTotalMg: parsedLine.numericValues[5],
        cfctAromaticAminoAcidsTotalMg: parsedLine.numericValues[8],
      }),
      qualityFlags: validateSpecialCfctRow({
        foodName: parsedLine.foodName,
        nutrients,
        numericCellCount: parsedLine.numericValues.length,
        ocrConfidence: confidence,
        minNumericCells: 12,
      }),
    });
  }

  if (looksLikeCfctAminoAcidSecondPage(page.fullText)) {
    const nutrients: ReviewedCfctNutrients = {
      tryptophan: mgToG(parsedLine.numericValues[0]),
      valine: mgToG(parsedLine.numericValues[1]),
      arginine: mgToG(parsedLine.numericValues[2]),
      histidine: mgToG(parsedLine.numericValues[3]),
      glutamicAcid: mgToG(parsedLine.numericValues[6]),
      glycine: mgToG(parsedLine.numericValues[7]),
      proline: mgToG(parsedLine.numericValues[8]),
    };
    stripMissingNutrients(nutrients);
    if (Object.keys(nutrients).length === 0) return null;

    return createContinuationRow({
      parsedLine,
      page,
      line,
      lineIndex,
      confidence,
      nutrients,
      unmappedNutrients: stripMissingUnmappedNutrients({
        cfctAlanineMg: parsedLine.numericValues[4],
        cfctAsparticAcidMg: parsedLine.numericValues[5],
        cfctSerineMg: parsedLine.numericValues[9],
      }),
      qualityFlags: validateSpecialCfctRow({
        foodName: parsedLine.foodName,
        nutrients,
        numericCellCount: parsedLine.numericValues.length,
        ocrConfidence: confidence,
        minNumericCells: 10,
      }),
    });
  }

  if (looksLikeCfctFattyAcidTotalsPage(page.fullText)) {
    const nutrients: ReviewedCfctNutrients = {
      saturatedFattyAcids: parsedLine.numericValues[2],
      monounsaturatedFattyAcids: parsedLine.numericValues[3],
      polyunsaturatedFattyAcids: parsedLine.numericValues[4],
    };
    stripMissingNutrients(nutrients);
    if (Object.keys(nutrients).length === 0) return null;

    return createContinuationRow({
      parsedLine,
      page,
      line,
      lineIndex,
      confidence,
      nutrients,
      unmappedNutrients: stripMissingUnmappedNutrients({
        cfctFatG: parsedLine.numericValues[0],
        cfctFattyAcidTotalG: parsedLine.numericValues[1],
        cfctUnknownFattyAcidsG: parsedLine.numericValues[5],
      }),
      qualityFlags: validateSpecialCfctRow({
        foodName: parsedLine.foodName,
        nutrients,
        numericCellCount: parsedLine.numericValues.length,
        ocrConfidence: confidence,
        minNumericCells: 5,
      }),
    });
  }

  return null;
}

function createContinuationRow({
  parsedLine,
  page,
  line,
  lineIndex,
  confidence,
  nutrients,
  unmappedNutrients,
  qualityFlags,
}: {
  parsedLine: CodeNamedNutrientLine;
  page: CfctOcrPage;
  line: string;
  lineIndex: number;
  confidence: number;
  nutrients: ReviewedCfctNutrients;
  unmappedNutrients?: Record<string, number | null | undefined>;
  qualityFlags: CfctQualityFlag[];
}): StructuredCfctContinuationRow {
  const cleanedUnmappedNutrients = unmappedNutrients
    ? stripMissingUnmappedNutrients(unmappedNutrients)
    : undefined;

  return {
    volume: page.volume,
    page: page.page,
    row: lineIndex + 1,
    foodName: parsedLine.foodName,
    foodCode: parsedLine.foodCode,
    nutrients,
    sourcePdf: page.sourcePdf,
    ocrPage: page.page,
    ocrLine: lineIndex + 1,
    rawOcrText: line,
    ocrConfidence: roundNumber(confidence, 4),
    qualityFlags,
    sourceSegments: [
      createSourceSegment({
        kind: 'CONTINUATION',
        page,
        lineIndex,
        line,
        confidence,
        nutrientKeys: [
          ...Object.keys(nutrients),
          ...Object.keys(cleanedUnmappedNutrients ?? {}),
        ],
      }),
    ],
    unmappedNutrients: cleanedUnmappedNutrients,
  };
}

function parseCodeFirstCfctRow(
  normalizedLine: string,
  page: CfctOcrPage,
): {
  foodCode: string;
  foodName: string;
  ediblePortionPercent?: number;
  energyKj?: number;
  nutrients: ReviewedCfctNutrients;
  unmappedNutrients?: Record<string, number | null | undefined>;
} | null {
  if (!looksLikeCfctMacroVitaminPage(page.fullText)) {
    return null;
  }

  const parsedLine = parseCodeNamedNutrientLine(normalizedLine, {
    allowLeadingText: false,
  });
  if (!parsedLine) {
    return null;
  }

  const { numericValues } = parsedLine;

  if (numericValues.length < 8) {
    return null;
  }

  const nutrients: ReviewedCfctNutrients = {
    moisture: numericValues[1],
    energyKcal: numericValues[2],
    crudeProtein: numericValues[4],
    crudeFat: numericValues[5],
    ash: numericValues[9],
    carbohydrate: numericValues[6],
    insolubleFiber: numericValues[7],
    vitaminB1: numericValues.length >= 13
      ? numericValues[numericValues.length - 2]
      : undefined,
    vitaminB2: numericValues.length >= 13
      ? numericValues[numericValues.length - 1]
      : undefined,
  };
  stripMissingNutrients(nutrients);
  const unmappedNutrients =
    numericValues.length >= 15
      ? stripMissingUnmappedNutrients({
          cfctCholesterolMg: numericValues[8],
          cfctVitaminATotalUg: numericValues[10],
          cfctCaroteneUg: numericValues[11],
          cfctRetinolUg: numericValues[12],
        })
      : undefined;

  return {
    foodCode: parsedLine.foodCode,
    foodName: parsedLine.foodName,
    ediblePortionPercent: numericValues[0],
    energyKj: numericValues[3],
    nutrients,
    unmappedNutrients,
  };
}

function isLikelyCategoryPrefixedContinuationRow(
  normalizedLine: string,
  firstNumber: RegExpMatchArray,
): boolean {
  const firstNumericToken = firstNumber[0]?.replace(/[|｜]/gu, '');
  if (!/^\d{6}[a-zA-ZxX]?$/u.test(firstNumericToken)) {
    return false;
  }

  const beforeFirstNumber = normalizedLine.slice(0, firstNumber.index ?? 0);
  const afterFirstNumber = normalizedLine.slice(
    (firstNumber.index ?? 0) + firstNumber[0].length,
  );

  return containsCjk(beforeFirstNumber) && containsCjk(afterFirstNumber);
}

function parseCodeNamedNutrientLine(
  normalizedLine: string,
  options: { allowLeadingText: boolean },
): CodeNamedNutrientLine | null {
  const tokens = normalizedLine.split(' ').filter(Boolean);
  const codeCandidates = tokens
    .map((token, index) => ({
      index,
      foodCode: normalizeCfctFoodCode(token),
    }))
    .filter(
      (candidate): candidate is { index: number; foodCode: string } =>
        !!candidate.foodCode,
    );

  for (let index = codeCandidates.length - 1; index >= 0; index -= 1) {
    const candidate = codeCandidates[index];
    if (!options.allowLeadingText && candidate.index !== 0) {
      continue;
    }

    const numericStart = tokens.findIndex(
      (token, tokenIndex) =>
        tokenIndex > candidate.index && isCfctNumericToken(token),
    );
    if (numericStart <= candidate.index + 1) {
      continue;
    }

    const foodName = tokens.slice(candidate.index + 1, numericStart).join(' ');
    if (!foodName.trim() || !containsCjk(foodName)) {
      continue;
    }

    const numericValues = tokens
      .slice(numericStart)
      .map(parseCfctNumericToken)
      .filter((value): value is number => typeof value === 'number');

    return {
      foodCode: candidate.foodCode,
      foodName: foodName.trim(),
      numericValues,
    };
  }

  return null;
}

function normalizeCfctFoodCode(token: string): string | null {
  const normalized = token.replace(/[|｜]/gu, '').trim();
  const match = normalized.match(/^(\d{6})([a-zA-ZxX]?)$/u);
  if (!match) {
    return null;
  }

  return `${match[1]}${match[2].toLowerCase()}`;
}

function stripMissingNutrients(nutrients: ReviewedCfctNutrients): void {
  for (const key of Object.keys(nutrients) as Array<keyof ReviewedCfctNutrients>) {
    const value = nutrients[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      delete nutrients[key];
    }
  }
}

function stripMissingUnmappedNutrients(
  nutrients: Record<string, number | null | undefined>,
): Record<string, number | null | undefined> | undefined {
  const result: Record<string, number | null | undefined> = {};
  for (const [key, value] of Object.entries(nutrients)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function validateContinuationCfctRow({
  foodName,
  nutrients,
  numericCellCount,
  ocrConfidence,
}: StructuredRowValidationInput & { numericCellCount: number }): CfctQualityFlag[] {
  const flags = new Set<CfctQualityFlag>();
  if (!foodName.trim()) {
    flags.add('MISSING_FOOD_NAME');
  }
  if (ocrConfidence < MIN_OCR_CONFIDENCE) {
    flags.add('LOW_OCR_CONFIDENCE');
  }
  if (numericCellCount < 16) {
    flags.add('CONTINUATION_INCOMPLETE');
  }

  const values = Object.values(nutrients).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (values.some((value) => value < 0)) {
    flags.add('NEGATIVE_NUTRIENT');
  }

  const mineralValues = [
    nutrients.calcium,
    nutrients.phosphorus,
    nutrients.potassium,
    nutrients.sodium,
    nutrients.magnesium,
    nutrients.iron,
    nutrients.zinc,
    nutrients.copper,
    nutrients.manganese,
    nutrients.selenium,
    nutrients.iodine,
  ];
  if (
    mineralValues.some(
      (value) => typeof value === 'number' && (value < 0 || value > 10000),
    )
  ) {
    flags.add('MINERAL_OUT_OF_RANGE');
  }

  return Array.from(flags);
}

function mergeContinuationRows(
  rows: StructuredCfctRow[],
  continuationRows: StructuredCfctContinuationRow[],
): void {
  const rowsByFoodCode = new Map<string, StructuredCfctRow>();
  rows.forEach((row) => {
    if (row.foodCode) {
      rowsByFoodCode.set(row.foodCode, row);
    }
  });

  continuationRows.forEach((continuationRow) => {
    const baseRow = rowsByFoodCode.get(continuationRow.foodCode);
    if (!baseRow) {
      const qualityFlags = Array.from(
        new Set<CfctQualityFlag>([
          ...continuationRow.qualityFlags,
          'MISSING_PRIMARY_ROW',
        ]),
      );
      rows.push({
        volume: continuationRow.volume,
        page: continuationRow.page,
        row: continuationRow.row,
        foodName: continuationRow.foodName,
        category: null,
        nutrients: continuationRow.nutrients,
        foodCode: continuationRow.foodCode,
        sourcePdf: continuationRow.sourcePdf,
        ocrPage: continuationRow.ocrPage,
        ocrLine: continuationRow.ocrLine,
        rawOcrText: continuationRow.rawOcrText,
        ocrConfidence: continuationRow.ocrConfidence,
        qualityFlags,
        reviewStatus: 'NEEDS_REVIEW',
        sourceSegments: continuationRow.sourceSegments,
        unmappedNutrients: continuationRow.unmappedNutrients,
      });
      return;
    }

    baseRow.nutrients = {
      ...baseRow.nutrients,
      ...continuationRow.nutrients,
    };
    baseRow.unmappedNutrients = {
      ...(baseRow.unmappedNutrients ?? {}),
      ...(continuationRow.unmappedNutrients ?? {}),
    };
    if (Object.keys(baseRow.unmappedNutrients).length === 0) {
      delete baseRow.unmappedNutrients;
    }
    baseRow.sourceSegments = [
      ...(baseRow.sourceSegments ?? []),
      ...continuationRow.sourceSegments,
    ];
    baseRow.qualityFlags = Array.from(
      new Set<CfctQualityFlag>([
        ...baseRow.qualityFlags,
        ...continuationRow.qualityFlags,
      ]),
    );
    baseRow.reviewStatus =
      baseRow.qualityFlags.length === 0 ? 'AUTO_STRUCTURED' : 'NEEDS_REVIEW';
  });
}

function createSourceSegment({
  kind,
  page,
  lineIndex,
  line,
  confidence,
  nutrientKeys,
}: {
  kind: ReviewedCfctSourceSegment['kind'];
  page: CfctOcrPage;
  lineIndex: number;
  line: string;
  confidence: number;
  nutrientKeys: string[];
}): ReviewedCfctSourceSegment {
  return {
    kind,
    page: page.page,
    row: lineIndex + 1,
    rawOcrText: line,
    ocrConfidence: roundNumber(confidence, 4),
    nutrientKeys,
  };
}

function parseCfctCodeColumnSpecialPageRows({
  page,
  confidence,
}: {
  page: CfctOcrPage;
  confidence: number;
}): StructuredCfctContinuationRow[] {
  if (!looksLikeCfctCholineBiotinPantothenicColumnPage(page.fullText)) {
    return [];
  }

  const text = normalizeOcrLine(page.fullText);
  const codes = extractCfctCodesBeforeMarker(text, /Food code|食物编码/iu);
  if (codes.length === 0) return [];

  const names = extractCodeColumnFoodNames(
    sliceBetweenMarkers(
      text,
      /(?:Food\s*code.*?食物编码|Code\s*编码)/iu,
      /Food name|食物名称/iu,
    ),
    codes.length,
  );
  const cholineValues = extractLastNumbersBeforeMarker(text, /Choline|胆碱/iu, codes.length);
  const biotinValues = extractLastNumbersBeforeMarker(text, /Biotin|生物素/iu, codes.length);
  const pantothenicValues = extractLastNumbersBeforeMarker(
    text,
    /Pantothenic acid|泛酸/iu,
    codes.length,
  );

  return codes
    .map((foodCode, index) => {
      const foodName = names[index];
      if (!foodName) return null;

      const nutrients: ReviewedCfctNutrients = {
        choline: cholineValues[index],
        vitaminB7: biotinValues[index],
        vitaminB5: pantothenicValues[index],
      };
      stripMissingNutrients(nutrients);
      if (Object.keys(nutrients).length === 0) return null;

      return createContinuationRow({
        parsedLine: {
          foodCode,
          foodName,
          numericValues: [
            cholineValues[index],
            biotinValues[index],
            pantothenicValues[index],
          ].filter((value): value is number => typeof value === 'number'),
        },
        page,
        line: `${foodCode} ${foodName} CFCT table 5-2 choline/biotin/pantothenic`,
        lineIndex: index,
        confidence,
        nutrients,
        qualityFlags: validateSpecialCfctRow({
          foodName,
          nutrients,
          numericCellCount: Object.keys(nutrients).length,
          ocrConfidence: confidence,
          minNumericCells: 1,
        }),
      });
    })
    .filter((row): row is StructuredCfctContinuationRow => row !== null);
}

function parseCfctStandaloneSpecialPageRows({
  page,
  confidence,
}: {
  page: CfctOcrPage;
  confidence: number;
}): StructuredCfctRow[] {
  const rows: StructuredCfctRow[] = [
    ...parseCfctNumberedStandalonePageRows({ page, confidence }),
  ];
  const lines = page.fullText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, lineIndex) => {
    const normalizedLine = normalizeOcrLine(line);
    const dhaEpaRow = parseCfctDhaEpaStandaloneLine({
      normalizedLine,
      page,
      line,
      lineIndex,
      confidence,
    });
    if (dhaEpaRow) {
      rows.push(dhaEpaRow);
      return;
    }

    const cholineRow = parseCfctUsdaCholineStandaloneLine({
      normalizedLine,
      page,
      line,
      lineIndex,
      confidence,
    });
    if (cholineRow) {
      rows.push(cholineRow);
    }
  });

  return rows;
}

interface CfctNumberedStandaloneTableConfig {
  sourceLabel: string;
  matches: (fullText: string) => boolean;
  valueLabel: RegExp;
  nutrientKey?: keyof ReviewedCfctNutrients;
  unmappedValueKey: string;
}

const CFCT_NUMBERED_STANDALONE_TABLES: CfctNumberedStandaloneTableConfig[] = [
  {
    sourceLabel: 'CFCT table 4 iodine',
    matches: looksLikeCfctNumberedIodinePage,
    valueLabel: /(?:Iodine|lodine|碘含量)/iu,
    nutrientKey: 'iodine',
    unmappedValueKey: 'cfctIodineUg',
  },
  {
    sourceLabel: 'CFCT table 5-1 folate',
    matches: looksLikeCfctNumberedFolatePage,
    valueLabel: /(?:Folic acid|Folate|叶酸)/iu,
    nutrientKey: 'vitaminB9',
    unmappedValueKey: 'cfctFolateUg',
  },
  {
    sourceLabel: 'CFCT table 6 purine',
    matches: looksLikeCfctNumberedPurinePage,
    valueLabel: /(?:Purine|总嘌呤|岚嘌呤|嘌呤含量)/iu,
    unmappedValueKey: 'cfctPurineTotalMg',
  },
];

function parseCfctNumberedStandalonePageRows({
  page,
  confidence,
}: {
  page: CfctOcrPage;
  confidence: number;
}): StructuredCfctRow[] {
  const text = normalizeOcrLine(page.fullText);
  const config = CFCT_NUMBERED_STANDALONE_TABLES.find((candidate) =>
    candidate.matches(text),
  );
  if (!config) {
    return [];
  }

  const foodNameMarkers = Array.from(text.matchAll(/Food name|食物名称/giu));
  const rows: StructuredCfctRow[] = [];
  foodNameMarkers.forEach((marker, markerIndex) => {
    const namesSegment = text.slice(
      findNumberedNamesStart(text, marker.index),
      marker.index,
    );
    const entries = extractNumberedFoodNameEntries(namesSegment);
    if (entries.length === 0) {
      return;
    }

    const nextMarkerIndex = foodNameMarkers[markerIndex + 1]?.index ?? text.length;
    const valuesSegment = text.slice(
      marker.index + marker[0].length,
      nextMarkerIndex,
    );
    const values = extractLastNumbersBeforeMarker(
      valuesSegment,
      config.valueLabel,
      entries.length,
    );

    entries.forEach((entry, index) => {
      const value = values[index];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return;
      }

      const nutrients: ReviewedCfctNutrients = {};
      const unmappedNutrients: Record<string, number | null | undefined> = {
        cfctSequenceNumber: entry.sequenceNumber,
      };
      if (config.nutrientKey) {
        nutrients[config.nutrientKey] = value;
      } else {
        unmappedNutrients[config.unmappedValueKey] = value;
      }

      rows.push(
        createStandaloneSpecialRow({
          page,
          line: `${entry.sequenceNumber} ${entry.foodName} ${config.sourceLabel}`,
          lineIndex: rows.length,
          confidence,
          foodName: entry.foodName,
          nutrients,
          unmappedNutrients,
        }),
      );
    });
  });

  return rows;
}

function parseCfctDhaEpaStandaloneLine({
  normalizedLine,
  page,
  line,
  lineIndex,
  confidence,
}: ParseLineInput & { normalizedLine: string }): StructuredCfctRow | null {
  if (!looksLikeCfctDhaEpaPage(page.fullText)) {
    return null;
  }

  const match = normalizedLine.match(/^(DE)\s*(\d{3})\s+(.+)$/iu);
  if (!match) return null;

  const rest = match[3].trim();
  const numberMatches = Array.from(rest.matchAll(/(?:Tr|[-+]?\d+(?:[.,]\d+)?)/giu));
  if (numberMatches.length < 3) return null;

  const firstNumber = numberMatches[0];
  const namePart = rest.slice(0, firstNumber.index ?? 0).trim();
  const foodName = extractLeadingCjkFoodName(namePart);
  if (!foodName) return null;

  const numericValues = numberMatches
    .map((match) => parseCfctNumericToken(match[0]))
    .filter((value): value is number => typeof value === 'number');
  const nutrients: ReviewedCfctNutrients = {
    dha: gToMg(numericValues[0]),
    epa: gToMg(numericValues[1]),
  };
  stripMissingNutrients(nutrients);
  if (Object.keys(nutrients).length === 0) return null;

  return createStandaloneSpecialRow({
    page,
    line,
    lineIndex,
    confidence,
    foodName,
    nutrients,
    unmappedNutrients: stripMissingUnmappedNutrients({
      cfctSpecialRowCode: Number(match[2]),
      cfctDhaEpaTotalMg: gToMg(numericValues[2]),
      cfctDhaPercentOfTotalFattyAcids: numericValues[3],
      cfctEpaPercentOfTotalFattyAcids: numericValues[4],
      cfctDhaEpaPercentOfTotalFattyAcids: numericValues[5],
      cfctSaturatedFattyAcidsPercentOfTotal: numericValues[6],
      cfctMonounsaturatedFattyAcidsPercentOfTotal: numericValues[7],
      cfctPolyunsaturatedFattyAcidsPercentOfTotal: numericValues[8],
    }),
  });
}

function parseCfctUsdaCholineStandaloneLine({
  normalizedLine,
  page,
  line,
  lineIndex,
  confidence,
}: ParseLineInput & { normalizedLine: string }): StructuredCfctRow | null {
  if (!looksLikeCfctUsdaCholinePage(page.fullText)) {
    return null;
  }

  const match = normalizedLine.match(/^(C[1I]\s*\d{3})\s+(.+)$/iu);
  if (!match) return null;

  const rest = match[2].trim();
  const numberMatches = Array.from(rest.matchAll(/(?:Tr|[-+]?\d+(?:[.,]\d+)?)/giu));
  if (numberMatches.length < 7) return null;

  const firstNumber = numberMatches[0];
  const namePart = rest.slice(0, firstNumber.index ?? 0).trim();
  const foodName = extractLeadingCjkFoodName(namePart);
  if (!foodName) return null;

  const numericValues = numberMatches
    .map((match) => parseCfctNumericToken(match[0]))
    .filter((value): value is number => typeof value === 'number');
  const totalCholine = numericValues[numericValues.length - 1];
  const nutrients: ReviewedCfctNutrients = {
    choline: totalCholine,
  };
  stripMissingNutrients(nutrients);
  if (Object.keys(nutrients).length === 0) return null;

  return createStandaloneSpecialRow({
    page,
    line,
    lineIndex,
    confidence,
    foodName,
    nutrients,
    unmappedNutrients: stripMissingUnmappedNutrients({
      cfctUsdaCholineSourceRow: Number(match[1].replace(/\D/gu, '')),
      cfctBetaineMg: numericValues[0],
      cfctFreeCholineMg: numericValues[1],
      cfctGpcMg: numericValues[2],
      cfctPchoMg: numericValues[3],
      cfctPtdchoMg: numericValues[4],
      cfctSmMg: numericValues[5],
    }),
  });
}

function createStandaloneSpecialRow({
  page,
  line,
  lineIndex,
  confidence,
  foodName,
  nutrients,
  unmappedNutrients,
}: {
  page: CfctOcrPage;
  line: string;
  lineIndex: number;
  confidence: number;
  foodName: string;
  nutrients: ReviewedCfctNutrients;
  unmappedNutrients?: Record<string, number | null | undefined>;
}): StructuredCfctRow {
  const cleanedUnmappedNutrients = unmappedNutrients
    ? stripMissingUnmappedNutrients(unmappedNutrients)
    : undefined;
  const evidenceCount =
    Object.keys(nutrients).length + Object.keys(cleanedUnmappedNutrients ?? {}).length;
  const qualityFlags = Array.from(
    new Set<CfctQualityFlag>([
      ...validateSpecialCfctRow({
        foodName,
        nutrients,
        numericCellCount: evidenceCount,
        ocrConfidence: confidence,
        minNumericCells: 1,
      }),
      'MISSING_FOOD_CODE',
    ]),
  );

  return {
    volume: page.volume,
    page: page.page,
    row: lineIndex + 1,
    foodName,
    category: null,
    nutrients,
    sourcePdf: page.sourcePdf,
    ocrPage: page.page,
    ocrLine: lineIndex + 1,
    rawOcrText: line,
    ocrConfidence: roundNumber(confidence, 4),
    qualityFlags,
    reviewStatus: 'NEEDS_REVIEW',
    sourceSegments: [
      createSourceSegment({
        kind: 'CONTINUATION',
        page,
        lineIndex,
        line,
        confidence,
        nutrientKeys: [
          ...Object.keys(nutrients),
          ...Object.keys(cleanedUnmappedNutrients ?? {}),
        ],
      }),
    ],
    unmappedNutrients: cleanedUnmappedNutrients,
  };
}

export function buildCfctRowsFromOcrPages(
  pages: CfctOcrPage[],
): StructuredCfctRow[] {
  const rows: StructuredCfctRow[] = [];
  const continuationRows: StructuredCfctContinuationRow[] = [];

  for (const page of pages) {
    const pageConfidence = averageConfidence(page.observations);
    const lines = page.fullText
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);

    continuationRows.push(
      ...parseCfctCodeColumnSpecialPageRows({
        page,
        confidence: pageConfidence,
      }),
    );
    rows.push(
      ...parseCfctStandaloneSpecialPageRows({
        page,
        confidence: pageConfidence,
      }),
    );

    lines.forEach((line, lineIndex) => {
      const row = parseCfctOcrLine({
        line,
        page,
        lineIndex,
        confidence: pageConfidence,
      });
      if (row) rows.push(row);

      const continuationRow = parseCfctContinuationOcrLine({
        line,
        page,
        lineIndex,
        confidence: pageConfidence,
      });
      if (continuationRow) continuationRows.push(continuationRow);
    });
  }

  mergeContinuationRows(rows, continuationRows);

  return rows;
}

export function validateStructuredCfctRow({
  foodName,
  nutrients,
  ocrConfidence,
}: StructuredRowValidationInput): CfctQualityFlag[] {
  const flags = new Set<CfctQualityFlag>();
  if (!foodName.trim()) {
    flags.add('MISSING_FOOD_NAME');
  }
  if (ocrConfidence < MIN_OCR_CONFIDENCE) {
    flags.add('LOW_OCR_CONFIDENCE');
  }

  const values = Object.values(nutrients).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (values.length < 6) {
    flags.add('NOT_ENOUGH_NUMERIC_CELLS');
  }
  if (values.some((value) => value < 0)) {
    flags.add('NEGATIVE_NUTRIENT');
  }

  const moisture = nutrients.moisture;
  if (typeof moisture === 'number' && (moisture < 0 || moisture > 100)) {
    flags.add('WATER_OUT_OF_RANGE');
  }

  const macroSum =
    (nutrients.moisture ?? 0) +
    (nutrients.crudeProtein ?? 0) +
    (nutrients.crudeFat ?? 0) +
    (nutrients.ash ?? 0) +
    (nutrients.carbohydrate ?? 0);
  if (macroSum > 115) {
    flags.add('MACRO_SUM_OUT_OF_RANGE');
  }

  const estimatedEnergy =
    (nutrients.crudeProtein ?? 0) * 4 +
    (nutrients.crudeFat ?? 0) * 9 +
    (nutrients.carbohydrate ?? 0) * 4;
  if (
    typeof nutrients.energyKcal === 'number' &&
    estimatedEnergy > 20 &&
    Math.abs(nutrients.energyKcal - estimatedEnergy) /
      Math.max(nutrients.energyKcal, estimatedEnergy) >
      0.25
  ) {
    flags.add('ENERGY_MACRO_MISMATCH');
  }

  const mineralValues = [
    nutrients.calcium,
    nutrients.phosphorus,
    nutrients.potassium,
    nutrients.sodium,
    nutrients.magnesium,
    nutrients.iron,
    nutrients.zinc,
    nutrients.copper,
    nutrients.manganese,
    nutrients.selenium,
    nutrients.iodine,
  ];
  if (
    mineralValues.some(
      (value) => typeof value === 'number' && (value < 0 || value > 10000),
    )
  ) {
    flags.add('MINERAL_OUT_OF_RANGE');
  }

  return Array.from(flags);
}

export async function runCfctOcrSourceImport({
  args,
  prisma,
  logger,
}: {
  args: ImportArgs;
  prisma: PrismaClient;
  logger: Pick<typeof console, 'log' | 'error'>;
}): Promise<ImportCounters> {
  const ocrInput = args.ocrInput ?? args.ocrOutput;
  if (args.pdf) {
    runLocalOcr({
      pdf: args.pdf,
      volume: args.volume,
      orientation: args.orientation,
      startPage: args.startPage,
      endPage: args.endPage,
      output: args.ocrOutput,
    });
  }

  const pages = await readOcrPagesJsonl(ocrInput);
  const structuredRows = buildCfctRowsFromOcrPages(pages);
  await writeStructuredOutput(args.structuredOutput, structuredRows);
  await writeReport(args.reportOutput, structuredRows);

  const rowsForImport = structuredRows.filter(
    (row) => row.reviewStatus === 'AUTO_STRUCTURED',
  );
  let importedRows = 0;
  if (rowsForImport.length > 0) {
    if (args.apply && !args.allowAutoImport) {
      logger.log(
        'Direct OCR apply skipped: review structured rows first, then import the reviewed JSON with import:cfct-private:apply. Pass --allow-auto-import only for a deliberately trusted OCR batch.',
      );
    } else {
      const counters = await importCfctPrivateSourceRows({
        prisma,
        rows: rowsForImport,
        apply: args.apply,
        logger: {
          info: (message) => logger.log(message),
          error: (message) => logger.error(message),
        },
      });
      importedRows = counters.apply;
    }
  }

  const result = {
    ocrPages: pages.length,
    structuredRows: structuredRows.length,
    autoStructuredRows: rowsForImport.length,
    needsReviewRows: structuredRows.length - rowsForImport.length,
    importedRows,
  };

  logger.log('');
  logger.log('CFCT OCR structure summary');
  logger.log(`- ocrPages: ${result.ocrPages}`);
  logger.log(`- structuredRows: ${result.structuredRows}`);
  logger.log(`- autoStructuredRows: ${result.autoStructuredRows}`);
  logger.log(`- needsReviewRows: ${result.needsReviewRows}`);
  logger.log(`- importedRows: ${result.importedRows}`);
  logger.log(`- structuredOutput: ${args.structuredOutput}`);
  logger.log(`- reportOutput: ${args.reportOutput}`);

  return result;
}

async function readOcrPagesJsonl(path: string): Promise<CfctOcrPage[]> {
  const content = await readFile(path, 'utf8');
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CfctOcrPage);
}

async function writeStructuredOutput(
  path: string,
  rows: StructuredCfctRow[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rows,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function writeReport(
  path: string,
  rows: StructuredCfctRow[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const header = [
    'volume',
    'page',
    'row',
    'foodName',
    'reviewStatus',
    'ocrConfidence',
    'qualityFlags',
    'rawOcrText',
  ];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.volume,
        String(row.page),
        String(row.row),
        row.foodName,
        row.reviewStatus,
        String(row.ocrConfidence),
        row.qualityFlags.join('|'),
        row.rawOcrText,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
}

function runLocalOcr({
  pdf,
  volume,
  orientation,
  startPage,
  endPage,
  output,
}: {
  pdf: string;
  volume: string;
  orientation: 'up' | 'right' | 'left' | 'down';
  startPage: number | null;
  endPage: number | null;
  output: string;
}): void {
  const ocrScript = resolve(__dirname, 'cfct-ocr-pages.sh');
  const argv = [
    ocrScript,
    '--pdf',
    pdf,
    '--volume',
    volume,
    '--orientation',
    orientation,
    '--output',
    output,
  ];
  if (startPage !== null) argv.push('--start-page', String(startPage));
  if (endPage !== null) argv.push('--end-page', String(endPage));

  const result = spawnSync('bash', argv, {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`CFCT OCR failed with exit code ${result.status}`);
  }
}

function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = {
    apply: false,
    allowAutoImport: false,
    ocrInput: null,
    pdf: null,
    volume: '第六版',
    orientation: 'up',
    startPage: null,
    endPage: null,
    ocrOutput: DEFAULT_OCR_OUTPUT,
    structuredOutput: DEFAULT_STRUCTURED_OUTPUT,
    reportOutput: DEFAULT_REPORT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--allow-auto-import') {
      args.allowAutoImport = true;
    } else if (arg === '--ocr-input' && next) {
      args.ocrInput = next;
      index += 1;
    } else if (arg === '--pdf' && next) {
      args.pdf = next;
      index += 1;
    } else if (arg === '--volume' && next) {
      args.volume = next;
      index += 1;
    } else if (arg === '--orientation' && next) {
      if (!['up', 'right', 'left', 'down'].includes(next)) {
        throw new Error('--orientation must be one of up, right, left, down');
      }
      args.orientation = next as ImportArgs['orientation'];
      index += 1;
    } else if (arg === '--start-page' && next) {
      args.startPage = Number(next);
      index += 1;
    } else if (arg === '--end-page' && next) {
      args.endPage = Number(next);
      index += 1;
    } else if (arg === '--ocr-output' && next) {
      args.ocrOutput = next;
      index += 1;
    } else if (arg === '--structured-output' && next) {
      args.structuredOutput = next;
      index += 1;
    } else if (arg === '--report-output' && next) {
      args.reportOutput = next;
      index += 1;
    }
  }

  if (!args.pdf && !args.ocrInput) {
    throw new Error('Provide either --pdf or --ocr-input');
  }
  if (args.pdf && !isAbsolute(args.pdf)) {
    throw new Error('--pdf must be an absolute path');
  }
  for (const key of ['startPage', 'endPage'] as const) {
    const value = args[key];
    if (value !== null && (!Number.isInteger(value) || value < 1)) {
      throw new Error(`--${key === 'startPage' ? 'start-page' : 'end-page'} must be a positive integer`);
    }
  }

  return args;
}

function normalizeOcrLine(line: string): string {
  return line
    .replace(/[０-９]/gu, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30),
    )
    .replace(/[，]/gu, ',')
    .replace(/[．]/gu, '.')
    .replace(/\s+/gu, ' ')
    .trim();
}

function looksLikeCfctMacroVitaminPage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /食物[编編繃]?码|Food code/iu.test(text) &&
    /食物名称|Food name/iu.test(text) &&
    /食部|Edible/iu.test(text) &&
    /水分|Water/iu.test(text) &&
    /能量|Energy/iu.test(text)
  );
}

function looksLikeCfctContinuationPage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /食物[编編繃]?码|Food code/iu.test(text) &&
    /食物名称|Food name/iu.test(text) &&
    /烟酸|Niacin/iu.test(text) &&
    /维生素\s*C|Vitamin\s+C\b/iu.test(text) &&
    /(?:^|\s)(?:钙|Ca)(?:\s|$)/iu.test(text) &&
    /(?:^|\s)(?:锌|Zn)(?:\s|$)/iu.test(text)
  );
}

function looksLikeCfctAminoAcidFirstPage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /氨基酸|Amino acid/iu.test(text) &&
    /异亮氨酸|Isoleucine/iu.test(text) &&
    /赖氨酸|Lysine/iu.test(text) &&
    /苏氨酸|Threonine/iu.test(text)
  );
}

function looksLikeCfctAminoAcidSecondPage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /氨基酸|Amino acid/iu.test(text) &&
    /色氨酸|Tryptophan/iu.test(text) &&
    /精氨酸|Arginine/iu.test(text) &&
    /谷氨酸|Glutamic/iu.test(text)
  );
}

function looksLikeCfctFattyAcidTotalsPage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /脂肪酸|Fatty acid/iu.test(text) &&
    /饱和|Saturated/iu.test(text) &&
    /单不饱和|Monounsaturated/iu.test(text) &&
    /多不饱和|Polyunsaturated/iu.test(text)
  );
}

function looksLikeCfctCholineBiotinPantothenicColumnPage(
  fullText: string,
): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /表\s*5-2|Choline,\s*Biotin,\s*Pantothenic|胆碱.*生物素.*泛酸/iu.test(text) &&
    /(?:Food\s*code|食物编码|Code\s*编码|编码)/iu.test(text) &&
    /(?:Food\s*name|食物名称)/iu.test(text)
  );
}

function looksLikeCfctDhaEpaPage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /DHA/iu.test(text) &&
    /EPA/iu.test(text) &&
    /鱼贝类|fishes and shellfishes/iu.test(text)
  );
}

function looksLikeCfctUsdaCholinePage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /表\s*5-3|Choline Content of Commonly Consumed Foods in the United States|USDA/iu.test(text) &&
    /胆碱|Choline/iu.test(text) &&
    /甜菜碱|Betaine/iu.test(text)
  );
}

function looksLikeCfctNumberedIodinePage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /碘含量|Iodine Content|lodine Content/iu.test(text) &&
    /(?:Food name|食物名称)/iu.test(text)
  );
}

function looksLikeCfctNumberedFolatePage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /表\s*5-1|Folic Acid Content|叶酸含量/iu.test(text) &&
    /(?:Food name|食物名称)/iu.test(text)
  );
}

function looksLikeCfctNumberedPurinePage(fullText: string): boolean {
  const text = normalizeOcrLine(fullText);
  return (
    /嘌呤含量|Purine content/iu.test(text) &&
    /(?:Food name|食物名称)/iu.test(text)
  );
}

function looksLikeCfctStandaloneSpecialPage(fullText: string): boolean {
  return (
    looksLikeCfctCholineBiotinPantothenicColumnPage(fullText) ||
    looksLikeCfctDhaEpaPage(fullText) ||
    looksLikeCfctUsdaCholinePage(fullText) ||
    looksLikeCfctNumberedIodinePage(fullText) ||
    looksLikeCfctNumberedFolatePage(fullText) ||
    looksLikeCfctNumberedPurinePage(fullText)
  );
}

function validateSpecialCfctRow({
  foodName,
  nutrients,
  numericCellCount,
  ocrConfidence,
  minNumericCells,
}: StructuredRowValidationInput & {
  numericCellCount: number;
  minNumericCells: number;
}): CfctQualityFlag[] {
  const flags = new Set<CfctQualityFlag>();
  if (!foodName.trim()) {
    flags.add('MISSING_FOOD_NAME');
  }
  if (ocrConfidence < MIN_OCR_CONFIDENCE) {
    flags.add('LOW_OCR_CONFIDENCE');
  }
  if (numericCellCount < minNumericCells) {
    flags.add('CONTINUATION_INCOMPLETE');
  }

  const values = Object.values(nutrients).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (values.some((value) => value < 0)) {
    flags.add('NEGATIVE_NUTRIENT');
  }

  return Array.from(flags);
}

function extractCfctCodesBeforeMarker(text: string, marker: RegExp): string[] {
  const match = marker.exec(text);
  if (!match || match.index <= 0) {
    return [];
  }

  return text
    .slice(0, match.index)
    .split(/\s+/u)
    .map(normalizeCfctFoodCode)
    .filter((value): value is string => value !== null);
}

function extractCodeColumnFoodNames(text: string, expectedCount: number): string[] {
  const tokens = text
    .replace(/[\r\n]+/gu, ' ')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => containsCjk(token))
    .filter((token) => !/类及制品$|食品类$|Food|名称|食物/u.test(token));

  if (tokens.length <= expectedCount) {
    return tokens;
  }

  return tokens.slice(0, expectedCount);
}

function sliceBetweenMarkers(text: string, start: RegExp, end: RegExp): string {
  const startMatch = start.exec(text);
  if (!startMatch) return '';
  const startIndex = startMatch.index + startMatch[0].length;
  const endMatch = end.exec(text.slice(startIndex));
  if (!endMatch) {
    return text.slice(startIndex);
  }
  return text.slice(startIndex, startIndex + endMatch.index);
}

function extractCfctNumbers(text: string): number[] {
  return Array.from(text.matchAll(/(?:Tr|[-+]?\d+(?:[.,]\d+)?)/giu))
    .map((match) => parseCfctNumericToken(match[0]))
    .filter((value): value is number => typeof value === 'number');
}

function extractLastNumbersBeforeMarker(
  text: string,
  marker: RegExp,
  count: number,
): Array<number | undefined> {
  const match = findLastRegexMatch(text, marker);
  if (!match) {
    return [];
  }

  return takeLastN(extractCfctNumbers(text.slice(0, match.index)), count);
}

function findLastRegexMatch(text: string, marker: RegExp): RegExpExecArray | null {
  const flags = marker.flags.includes('g') ? marker.flags : `${marker.flags}g`;
  const globalMarker = new RegExp(marker.source, flags);
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = globalMarker.exec(text)) !== null) {
    lastMatch = match;
    if (match[0].length === 0) {
      globalMarker.lastIndex += 1;
    }
  }
  return lastMatch;
}

function takeLastN(values: number[], count: number): Array<number | undefined> {
  if (count <= 0) return [];
  const result: Array<number | undefined> = values.slice(
    Math.max(0, values.length - count),
  );
  while (result.length < count) {
    result.unshift(undefined);
  }
  return result;
}

function extractLeadingCjkFoodName(text: string): string | null {
  const match = text.trim().match(/^[\p{Script=Han}（）()、·\-—\[\]【】]+(?:\s*[\p{Script=Han}（）()、·\-—\[\]【】]+)*/u);
  const foodName = match?.[0]?.trim();
  return foodName || null;
}

function findNumberedNamesStart(text: string, foodNameMarkerIndex: number): number {
  const namesText = text.slice(0, foodNameMarkerIndex);
  const columnarNumberRun = namesText.match(
    /(?:^|\s)\d{1,4}(?:\s+\d{1,4}){1,}(?=\s+\p{Script=Han})/u,
  );
  if (columnarNumberRun) {
    return columnarNumberRun.index ?? 0;
  }

  const matches = Array.from(
    namesText.matchAll(/(?:^|\s)\d{1,4}[.、|]?\s*\p{Script=Han}/gu),
  );
  return matches.at(0)?.index ?? 0;
}

function extractNumberedFoodNameEntries(
  text: string,
): Array<{ sequenceNumber: number; foodName: string }> {
  const entries: Array<{ sequenceNumber: number; foodName: string }> = [];
  const matches = text.matchAll(
    /(?:^|\s)(\d{1,4})[.、|]?\s*([^\d]+?)(?=(?:\s+\d{1,4}[.、|]?\s*\p{Script=Han})|\s*$)/gu,
  );

  for (const match of matches) {
    const sequenceNumber = Number(match[1]);
    const foodName = cleanSequenceFoodName(match[2] ?? '');
    if (
      Number.isInteger(sequenceNumber) &&
      sequenceNumber > 0 &&
      foodName &&
      containsCjk(foodName)
    ) {
      entries.push({ sequenceNumber, foodName });
    }
  }

  const columnarEntries = extractColumnarSequenceFoodNameEntries(text);
  return columnarEntries.length > entries.length ? columnarEntries : entries;
}

function extractColumnarSequenceFoodNameEntries(
  text: string,
): Array<{ sequenceNumber: number; foodName: string }> {
  const numberMatches = Array.from(
    text.matchAll(/(?:^|\s)(\d{1,4})(?=\s|$)/gu),
  );
  if (numberMatches.length < 2) {
    return [];
  }

  const numbers = numberMatches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);
  const lastNumberMatch = numberMatches.at(-1);
  if (!lastNumberMatch || numbers.length === 0) {
    return [];
  }

  const namesStart = (lastNumberMatch.index ?? 0) + lastNumberMatch[0].length;
  const names = extractCodeColumnFoodNames(text.slice(namesStart), numbers.length);
  if (names.length < 2) {
    return [];
  }

  return numbers
    .map((sequenceNumber, index) => ({
      sequenceNumber,
      foodName: cleanSequenceFoodName(names[index] ?? ''),
    }))
    .filter((entry) => entry.foodName && containsCjk(entry.foodName));
}

function cleanSequenceFoodName(value: string): string {
  return value
    .replace(/(?:Food group|Food name|食物类|食物名称|常见食物.*|Table\s+\d[\d-]*)/giu, ' ')
    .replace(/[|｜]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function mgToG(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return roundNumber(value / 1000, 4);
}

function gToMg(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return roundNumber(value * 1000, 4);
}

function isCfctNumericToken(token: string): boolean {
  return /^[-+]?\d+(?:[.,]\d+)?$/u.test(token) || /^Tr$/iu.test(token);
}

function parseCfctNumericToken(token: string): number | null {
  if (/^Tr$/iu.test(token)) {
    return 0;
  }

  const value = Number(token.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function looksLikeHeaderOrFooter(line: string): boolean {
  return (
    /^(表|附录|第\s*\d+\s*页)/u.test(line) ||
    /^（?\s*以每\s*\d+\s*g\s*可食部计/u.test(line) ||
    /食物名称|Food name|能量|蛋白质|脂肪|碳水化合物/u.test(line) ||
    /(?:Cereals|Fruits|Vegetables|Meat|Fish|Egg|Milk).+products/iu.test(line) ||
    /维生素\s*E|Vitamin\s*E|Retinol|Thiamin|Riboflavin|Niacin/iu.test(line) ||
    /^(?:锰|铜|硒|锌|铁|灰分|交分|视黄醇|胡萝卜素|硫胺素|核黄素|烟酸)(?:\s|$)/u.test(line) ||
    /^(Mn|Cu|Zn|Fe)\s+(?:mg|μg|ug|mgg|mgq)\b/iu.test(line)
  );
}

function containsCjk(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function averageConfidence(observations: CfctOcrObservation[]): number {
  const confidences = observations
    .map((observation) => observation.confidence)
    .filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
  if (confidences.length === 0) return 0.8;
  return (
    confidences.reduce((sum, value) => sum + value, 0) / confidences.length
  );
}

function roundNumber(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/sevenkitchen';
  }
  const prisma = new PrismaClient();
  runCfctOcrSourceImport({
    args: parseArgs(process.argv.slice(2)),
    prisma,
    logger: console,
  })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
