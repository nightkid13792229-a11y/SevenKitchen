export enum BreedHealthAttentionPriority {
  KEY_ATTENTION = 'KEY_ATTENTION',
  RECOMMENDED_AWARENESS = 'RECOMMENDED_AWARENESS',
  SUPPLEMENTAL_AWARENESS = 'SUPPLEMENTAL_AWARENESS',
}

export enum BreedHealthRiskSourceType {
  CIDD = 'CIDD',
  OFA_CHIC = 'OFA_CHIC',
  OMIA = 'OMIA',
  WSAVA = 'WSAVA',
  VETERINARY_LITERATURE = 'VETERINARY_LITERATURE',
  BREED_CLUB = 'BREED_CLUB',
  OTHER = 'OTHER',
}

export const BREED_HEALTH_ATTENTION_LABELS: Record<BreedHealthAttentionPriority, string> = {
  [BreedHealthAttentionPriority.KEY_ATTENTION]: '重点关注',
  [BreedHealthAttentionPriority.RECOMMENDED_AWARENESS]: '建议了解',
  [BreedHealthAttentionPriority.SUPPLEMENTAL_AWARENESS]: '补充了解',
};

export interface BreedHealthCondition {
  id: string;
  nameCn: string;
  nameEn: string | null;
  aliases: string[];
  category: string;
  summary: string;
  commonSigns: string[];
  screeningAdvice: string | null;
  careAdvice: string | null;
  isActive: boolean;
}

export interface BreedHealthRiskSource {
  id: string;
  riskId: string;
  sourceType: BreedHealthRiskSourceType;
  sourceName: string;
  publisher: string | null;
  title: string;
  url: string;
  accessedAt: Date;
  note: string | null;
}

export interface BreedHealthRisk {
  id: string;
  breedId: string;
  conditionId: string;
  attentionPriority: BreedHealthAttentionPriority;
  oneLineSummary: string;
  breedSpecificReason: string | null;
  displayOrder: number;
  isPublished: boolean;
  condition: BreedHealthCondition;
  sources: BreedHealthRiskSource[];
}

export function getBreedHealthAttentionLabel(priority: BreedHealthAttentionPriority): string {
  return BREED_HEALTH_ATTENTION_LABELS[priority] || priority;
}
