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

/** `POST drafts/:id/candidates/online`：本地零候选时到白名单来源兜底检索。 */
export class SearchOnlineCandidatesDto {
  @ApiProperty({ description: '中文规范名', example: '鸡肝' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name!: string;

  @ApiProperty({
    description: '英文名（白名单页面多为英文，强烈建议填写）',
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
