import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * `POST drafts/:id/authorize`：只收主档案下标。
 *
 * 原料卡与营养档案一律由服务端从**当前草稿**读：请求体里带
 * `ingredient` / `profiles` 会被白名单丢掉，不能替换掉被核验的那份数据。
 */
export class AuthorizeIngredientCreationDto {
  @ApiProperty({
    description: '主档案在草稿 profiles 里的下标',
    example: 0,
  })
  @IsInt()
  @Min(0)
  primaryProfileIndex!: number;
}
