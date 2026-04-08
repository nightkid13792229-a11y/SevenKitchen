import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export enum FeedbackTypeDto {
  BUG = 'BUG',
  SUGGESTION = 'SUGGESTION',
  OTHER = 'OTHER',
}

export class CreateFeedbackDto {
  @ApiProperty({
    description: '反馈类型',
    enum: FeedbackTypeDto,
    example: 'BUG',
  })
  @IsEnum(FeedbackTypeDto)
  type!: FeedbackTypeDto;

  @ApiProperty({ description: '反馈内容', example: '我发现了一个问题' })
  @IsString()
  @MaxLength(500)
  content!: string;

  @ApiProperty({
    description: '图片URL数组',
    required: false,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  imageUrls?: string[];

  @ApiProperty({
    description: '图片COS Key数组',
    required: false,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  imageKeys?: string[];
}
