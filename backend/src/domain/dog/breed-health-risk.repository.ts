import type { BreedHealthRisk } from './breed-health-risk.entity';

export interface BreedHealthRiskRepository {
  findPublishedByBreedId(breedId: string): Promise<BreedHealthRisk[]>;
}
