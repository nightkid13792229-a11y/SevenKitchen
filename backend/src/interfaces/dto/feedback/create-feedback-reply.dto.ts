import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength, ArrayMaxSize } from 'class-validator';

export class CreateFeedbackReplyDto {
  @ApiProperty({ description: '回复内容', example: '我也有同样的问题' })
  @IsString()
  @MaxLength(500)
  content!: string;

  @ApiProperty({
    description: '被回复的回复ID（二级回复时填写）',
    required: false,
  })
  @IsOptional()
  @IsString()
  replyToId?: string;

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
