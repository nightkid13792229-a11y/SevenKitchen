import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  MappingStatus,
  MappingType,
  NutrientMappingAuditItem,
  NutrientMappingAuditResult,
} from './nutrition-calculation.types';

const FEDIAF_2025_DOG_CODE = 'FEDIAF_2025_DOG';

const REVIEW_EVENT_ORDER_BY: Prisma.NutritionStandardReviewEventOrderByWithRelationInput[] =
  [{ reviewedAt: 'desc' }, { id: 'desc' }];

type ReviewEventLike = {
  id?: string;
  status: NutrientMappingAuditItem['reviewStatus'];
  reviewedAt: Date;
};

type NutrientExpression = {
  op?: unknown;
  fields?: unknown;
  numerator?: unknown;
  denominator?: unknown;
};

type NutrientLike = {
  code: string;
  fieldPath: string | null;
  defaultStandardUnit: string;
  expression: Prisma.JsonValue | null;
};

type EntryLike = {
  id: string;
  nutrient: NutrientLike;
  reviewEvents?: ReviewEventLike[];
};

@Injectable()
export class NutrientMappingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async auditFediaf2025DogMappings(): Promise<NutrientMappingAuditResult> {
    const version = await this.prisma.nutritionStandardVersion.findUnique({
      where: { code: FEDIAF_2025_DOG_CODE },
      include: {
        entries: {
          include: {
            nutrient: true,
            reviewEvents: {
              orderBy: REVIEW_EVENT_ORDER_BY,
            },
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        'FEDIAF 2025 dog standard has not been imported',
      );
    }

    const entriesByNutrientCode = new Map<string, EntryLike>();
    for (const entry of version.entries as EntryLike[]) {
      if (!entriesByNutrientCode.has(entry.nutrient.code)) {
        entriesByNutrientCode.set(entry.nutrient.code, entry);
      }
    }

    const items = [...entriesByNutrientCode.values()].map((entry) =>
      this.auditEntry(entry),
    );

    return {
      summary: {
        totalNutrients: items.length,
        reviewedNutrients: items.filter(
          (item) => item.reviewStatus !== 'UNREVIEWED',
        ).length,
        resolvedMappings: items.filter(
          (item) => item.mappingStatus === 'RESOLVED',
        ).length,
        missingMappings: items.filter(
          (item) => item.mappingStatus === 'MISSING_MAPPING',
        ).length,
        unsupportedMappings: items.filter(
          (item) => item.mappingStatus === 'UNSUPPORTED_EXPRESSION',
        ).length,
      },
      items,
    };
  }

  private auditEntry(entry: EntryLike): NutrientMappingAuditItem {
    const expression = this.toExpression(entry.nutrient.expression);
    const mappingType = this.getMappingType(
      entry.nutrient.fieldPath,
      expression,
    );
    const sourceFieldPaths = this.getSourceFieldPaths(
      entry.nutrient.fieldPath,
      expression,
    );
    const missingFieldPaths = sourceFieldPaths.filter(
      (fieldPath) => !findNutritionField(fieldPath),
    );
    const mappingStatus = this.getMappingStatus(
      mappingType,
      sourceFieldPaths,
      missingFieldPaths,
    );

    return {
      nutrientCode: entry.nutrient.code,
      defaultStandardUnit: entry.nutrient.defaultStandardUnit,
      reviewStatus: this.getLatestReviewStatus(entry.reviewEvents),
      mappingType,
      mappingStatus,
      sourceFieldPaths,
      missingFieldPaths,
    };
  }

  private getLatestReviewStatus(
    events: ReviewEventLike[] | undefined,
  ): NutrientMappingAuditItem['reviewStatus'] {
    if (!events || events.length === 0) {
      return 'UNREVIEWED';
    }

    const [latest] = [...events].sort((a, b) => {
      const reviewedAtDiff = b.reviewedAt.getTime() - a.reviewedAt.getTime();
      if (reviewedAtDiff !== 0) {
        return reviewedAtDiff;
      }

      return (b.id ?? '').localeCompare(a.id ?? '');
    });

    return latest?.status ?? 'UNREVIEWED';
  }

  private getMappingType(
    fieldPath: string | null,
    expression: NutrientExpression | null,
  ): MappingType {
    if (fieldPath) {
      return 'DIRECT';
    }

    if (expression?.op === 'sum') {
      return 'COMBINATION';
    }

    if (expression?.op === 'ratio') {
      return 'RATIO';
    }

    if (expression) {
      return 'UNSUPPORTED';
    }

    return 'DIRECT';
  }

  private getSourceFieldPaths(
    fieldPath: string | null,
    expression: NutrientExpression | null,
  ): string[] {
    if (fieldPath) {
      return [fieldPath];
    }

    if (expression?.op === 'sum' && Array.isArray(expression.fields)) {
      return expression.fields.filter(
        (sourceField): sourceField is string => typeof sourceField === 'string',
      );
    }

    if (expression?.op === 'ratio') {
      return [expression.numerator, expression.denominator].filter(
        (sourceField): sourceField is string => typeof sourceField === 'string',
      );
    }

    return [];
  }

  private getMappingStatus(
    mappingType: MappingType,
    sourceFieldPaths: string[],
    missingFieldPaths: string[],
  ): MappingStatus {
    if (mappingType === 'UNSUPPORTED') {
      return 'UNSUPPORTED_EXPRESSION';
    }

    if (sourceFieldPaths.length === 0 || missingFieldPaths.length > 0) {
      return 'MISSING_MAPPING';
    }

    return 'RESOLVED';
  }

  private toExpression(
    value: Prisma.JsonValue | null,
  ): NutrientExpression | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as NutrientExpression;
  }
}
