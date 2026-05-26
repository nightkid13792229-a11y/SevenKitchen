import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject } from 'class-validator';
import type { NormalizedSupplementImportDraft } from '../../application/supplement-import/supplement-import.types';

export class CreateSupplementImportDraftDto {
  @ApiProperty({ type: [String], description: 'Supplement label image URLs' })
  @IsArray()
  imageUrls!: string[];
}

export class UpdateSupplementImportDraftDto {
  @ApiProperty({ description: 'Normalized supplement import draft' })
  @IsObject()
  normalizedDraft!: NormalizedSupplementImportDraft;
}
