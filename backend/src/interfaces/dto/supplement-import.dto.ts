import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import type { NormalizedSupplementImportDraft } from '../../application/supplement-import/supplement-import.types';

export class CreateSupplementImportDraftDto {
  @ApiProperty({ type: [String], description: 'Supplement label image URLs' })
  @IsArray()
  imageUrls!: string[];
}

export class UpdateSupplementImportDraftDto {
  @ApiProperty({ description: 'Normalized supplement import draft' })
  @ValidateNested()
  normalizedDraft!: NormalizedSupplementImportDraft;
}
