import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const INTAKE_HISTORY_ROLES = ['user', 'assistant'] as const;
export type IntakeHistoryRole = (typeof INTAKE_HISTORY_ROLES)[number];

export const INTAKE_CURRENT_KINDS = ['FOOD', 'SUPPLEMENT'] as const;
export type IntakeCurrentKind = (typeof INTAKE_CURRENT_KINDS)[number];

/** 对话里的一条消息；只回传最近几条，别把整段聊天塞进来。 */
export class IntakeHistoryEntryDto {
  @ApiProperty({
    description: '说话人：用户或助手',
    enum: INTAKE_HISTORY_ROLES,
    example: 'assistant',
  })
  @IsIn(INTAKE_HISTORY_ROLES)
  role!: IntakeHistoryRole;

  @ApiProperty({
    description: '这句话的内容（最多 200 字）',
    example: '这是补剂。',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  content!: string;
}

/** 当前正在处理的那个原料（上一轮已经判过类别）。 */
export class IntakeCurrentIngredientDto {
  @ApiProperty({
    description: '当前原料名',
    example: '葡萄糖酸锌',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string;

  @ApiProperty({
    description: '上一轮判定的类别',
    enum: INTAKE_CURRENT_KINDS,
    example: 'SUPPLEMENT',
  })
  @IsIn(INTAKE_CURRENT_KINDS)
  kind!: IntakeCurrentKind;
}

/** `POST intake/classify`：判断用户原话指的是食材还是补剂，并识别纠正意图。 */
export class ClassifyIntakeDto {
  @ApiProperty({
    description: '用户原话',
    example: '牛肉',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string;

  @ApiPropertyOptional({
    description:
      '最近几轮对话（由旧到新，最多 6 条）；用来理解“这不是补剂”这类纠正',
    type: [IntakeHistoryEntryDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => IntakeHistoryEntryDto)
  history?: IntakeHistoryEntryDto[];

  @ApiPropertyOptional({
    description: '当前正在处理的原料；纠正或补充信息时带上',
    type: IntakeCurrentIngredientDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntakeCurrentIngredientDto)
  current?: IntakeCurrentIngredientDto | null;
}
