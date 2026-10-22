import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { PreparationState } from '../../../domain/ingredient-creation/preparation-state';
import { PREPARATION_STATES } from './ingredient-creation.constants';

/** `POST drafts/:id/candidates`：按名字与生熟状态查本地候选。 */
export class FindCandidatesDto {
  @ApiProperty({ description: '中文规范名', example: '鸡肝' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name!: string;

  @ApiProperty({
    description: '英文名（纯中文名经常零候选）',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nameEn?: string;

  @ApiProperty({
    description: '要查生档案还是熟档案',
    enum: PREPARATION_STATES,
  })
  @IsIn(PREPARATION_STATES)
  state!: PreparationState;
}
