import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const SEARCH_GOVERNANCE_DOMAINS = [
  'INGREDIENT',
  'NUTRITION_FOOD',
  'BREED',
  'ORDER',
] as const;

export const SEARCH_ALIAS_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const SEARCH_ALIAS_GROUP_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const SEARCH_ALIAS_SUGGESTION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'FAILED',
] as const;

export class ListSearchAliasGroupsQueryDto {
  @IsOptional()
  @IsIn(SEARCH_GOVERNANCE_DOMAINS)
  domain?: (typeof SEARCH_GOVERNANCE_DOMAINS)[number];

  @IsOptional()
  @IsIn(SEARCH_ALIAS_GROUP_STATUSES)
  status?: (typeof SEARCH_ALIAS_GROUP_STATUSES)[number];
}

export class UpsertSearchAliasGroupDto {
  @IsIn(SEARCH_GOVERNANCE_DOMAINS)
  domain!: (typeof SEARCH_GOVERNANCE_DOMAINS)[number];

  @IsString()
  canonicalTerm!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  aliases!: string[];

  @IsOptional()
  @IsIn(SEARCH_ALIAS_RISK_LEVELS)
  riskLevel?: (typeof SEARCH_ALIAS_RISK_LEVELS)[number];

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class SearchInsightsQueryDto {
  @IsOptional()
  @IsIn(SEARCH_GOVERNANCE_DOMAINS)
  domain?: (typeof SEARCH_GOVERNANCE_DOMAINS)[number];

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  days?: number;
}

export class ListSearchAliasSuggestionsQueryDto {
  @IsOptional()
  @IsIn(SEARCH_GOVERNANCE_DOMAINS)
  domain?: (typeof SEARCH_GOVERNANCE_DOMAINS)[number];

  @IsOptional()
  @IsIn(SEARCH_ALIAS_SUGGESTION_STATUSES)
  status?: (typeof SEARCH_ALIAS_SUGGESTION_STATUSES)[number];
}

export class GenerateSearchAliasSuggestionsDto extends SearchInsightsQueryDto {}
