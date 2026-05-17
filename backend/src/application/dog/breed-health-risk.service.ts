import { Inject, Injectable } from '@nestjs/common';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import { DOG_BREED_REPOSITORY } from './dog.service';
import type { BreedHealthRiskRepository } from '../../domain/dog/breed-health-risk.repository';
import {
  getBreedHealthAttentionLabel,
  type BreedHealthRisk,
} from '../../domain/dog/breed-health-risk.entity';
import type { BreedHealthRiskResponseDto } from '../../interfaces/dto/dogs/breed-health-risk-response.dto';

export const BREED_HEALTH_RISK_REPOSITORY = Symbol('BreedHealthRiskRepository');

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapRiskToDto(risk: BreedHealthRisk) {
  return {
    id: risk.id,
    conditionId: risk.conditionId,
    conditionName: risk.condition.nameCn,
    category: risk.condition.category,
    attentionPriority: risk.attentionPriority,
    attentionLabel: getBreedHealthAttentionLabel(risk.attentionPriority),
    oneLineSummary: risk.oneLineSummary,
    breedSpecificReason: risk.breedSpecificReason,
    commonSigns: risk.condition.commonSigns,
    screeningAdvice: risk.condition.screeningAdvice,
    careAdvice: risk.condition.careAdvice,
    sourceCount: risk.sources.length,
    sources: risk.sources.map((source) => ({
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      accessedAt: formatDateOnly(source.accessedAt),
      note: source.note,
    })),
  };
}

@Injectable()
export class BreedHealthRiskService {
  constructor(
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    @Inject(BREED_HEALTH_RISK_REPOSITORY)
    private readonly breedHealthRiskRepository: BreedHealthRiskRepository,
  ) {}

  async findPublishedByBreedId(
    breedId: string,
  ): Promise<BreedHealthRiskResponseDto | null> {
    const breed = await this.dogBreedRepository.findById(breedId);
    if (!breed) {
      return null;
    }

    const risks =
      await this.breedHealthRiskRepository.findPublishedByBreedId(breedId);

    return {
      breed: {
        id: breed.id,
        name: breed.name,
      },
      risks: risks.map(mapRiskToDto),
    };
  }
}
