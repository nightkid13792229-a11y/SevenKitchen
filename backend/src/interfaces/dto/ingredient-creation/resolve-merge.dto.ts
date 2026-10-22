import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** `POST drafts/:id/merge/resolve`：人工裁决一个冲突字段。 */
export class ResolveMergeConflictDto {
  @ApiProperty({
    description: '冲突字段的 fieldPath',
    example: 'minerals.iron',
  })
  @IsString()
  @IsNotEmpty()
  fieldPath!: string;

  @ApiProperty({ description: '人选定的来源记录 id' })
  @IsString()
  @IsNotEmpty()
  sourceRecordId!: string;
}
