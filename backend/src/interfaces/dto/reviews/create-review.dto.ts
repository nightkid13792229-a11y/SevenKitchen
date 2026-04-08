import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, Max, MaxLength, IsOptional, IsArray } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: '容易制作评分 1-5', example: 4 })
  @IsInt()
  @Min(1)
  @Max(5)
  ratingEase!: number;

  @ApiProperty({ description: '性价比高评分 1-5', example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  ratingValue!: number;

  @ApiProperty({ description: '小狗爱吃评分 1-5', example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  ratingTaste!: number;

  @ApiProperty({ description: '评论内容', example: '我家小狗超爱吃！' })
  @IsString()
  @MaxLength(500)
  content!: string;

  @ApiProperty({ description: '图片URL数组', required: false, isArray: true })
  @IsOptional()
  @IsArray()
  photos?: string[];
}
