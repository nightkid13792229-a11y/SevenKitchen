import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSupplementImportAgentConfigDto {
  @ApiPropertyOptional({ description: 'Whether the agent can be used' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['OPENAI_COMPATIBLE'] })
  @IsOptional()
  @IsIn(['OPENAI_COMPATIBLE'])
  provider?: 'OPENAI_COMPATIBLE';

  @ApiPropertyOptional({ nullable: true, example: 'https://api.openai.com/v1' })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  baseUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Plaintext key, encrypted on write only',
  })
  @IsOptional()
  @IsString()
  apiKey?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'gpt-4.1-mini' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  visionModel?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'gpt-4.1-mini' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  textModel?: string | null;

  @ApiPropertyOptional({ example: 0.1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  timeoutMs?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetries?: number;

  @ApiPropertyOptional({ example: 'supplement-import-v1' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promptVersion?: string;

  @ApiPropertyOptional({ example: 'supplement-import-schema-v1' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  schemaVersion?: string;
}
