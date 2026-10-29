import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  INGREDIENT_LINES,
  type IngredientLine,
} from '../../../application/ingredient-creation/ingredient-line';

/** `POST agent/run`：给一句话，让 AI 在草稿上受控地调工具。 */
export class RunIngredientAgentDto {
  @ApiPropertyOptional({
    description: '在这份草稿上起草；不传则先新建一份草稿',
    example: '3f0c6a5e-1b2c-4d5e-8f90-1234567890ab',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  draftId?: string;

  @ApiPropertyOptional({
    description:
      '本次要建的原料线路：FOOD 食材 / SUPPLEMENT 补剂。有 draftId 时忽略；缺省按 FOOD 处理（过渡兼容）',
    enum: INGREDIENT_LINES,
  })
  @IsOptional()
  @IsIn(INGREDIENT_LINES)
  line?: IngredientLine;

  @ApiProperty({
    description: '用户原话，例如「帮我加鸡肝」',
    example: '帮我加鸡肝',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;
}
