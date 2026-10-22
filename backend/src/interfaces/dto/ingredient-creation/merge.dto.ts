import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsNotEmpty, IsString } from 'class-validator';

/** `POST drafts/:id/merge`：选主来源与补位来源，生成缝合方案。 */
export class CreateMergePlanDto {
  @ApiProperty({ description: '主来源记录 id' })
  @IsString()
  @IsNotEmpty()
  primarySourceRecordId!: string;

  @ApiProperty({
    description: '补位来源记录 id 列表（只补缺，不覆盖主来源）',
    type: [String],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  supplementalSourceRecordIds!: string[];
}
