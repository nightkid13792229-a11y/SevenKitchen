import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { BreedHealthRiskRepository } from '../../domain/dog/breed-health-risk.repository';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
  type BreedHealthRisk,
} from '../../domain/dog/breed-health-risk.entity';

@Injectable()
export class PrismaBreedHealthRiskRepository implements BreedHealthRiskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublishedByBreedId(breedId: string): Promise<BreedHealthRisk[]> {
    const records = await this.prisma.breedHealthRisk.findMany({
      where: {
        breedId,
        isPublished: true,
        condition: { isActive: true },
        sources: { some: {} },
      },
      include: {
        condition: true,
        sources: {
          orderBy: [{ sourceType: 'asc' }, { sourceName: 'asc' }],
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return records.map((record: any) => ({
      id: record.id,
      breedId: record.breedId,
      conditionId: record.conditionId,
      attentionPriority: record.attentionPriority as BreedHealthAttentionPriority,
      oneLineSummary: record.oneLineSummary,
      breedSpecificReason: record.breedSpecificReason,
      displayOrder: record.displayOrder,
      isPublished: record.isPublished,
      condition: {
        id: record.condition.id,
        nameCn: record.condition.nameCn,
        nameEn: record.condition.nameEn,
        aliases: record.condition.aliases || [],
        category: record.condition.category,
        summary: record.condition.summary,
        commonSigns: record.condition.commonSigns || [],
        screeningAdvice: record.condition.screeningAdvice,
        careAdvice: record.condition.careAdvice,
        isActive: record.condition.isActive,
      },
      sources: (record.sources || []).map((source: any) => ({
        id: source.id,
        riskId: source.riskId,
        sourceType: source.sourceType as BreedHealthRiskSourceType,
        sourceName: source.sourceName,
        publisher: source.publisher,
        title: source.title,
        url: source.url,
        accessedAt: source.accessedAt,
        note: source.note,
      })),
    }));
  }
}
