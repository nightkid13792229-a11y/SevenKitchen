import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `POST intake/classify`：判断用户原话指的是食材还是补剂。 */
export class ClassifyIntakeDto {
  @ApiProperty({
    description: '用户原话',
    example: '牛肉',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string;
}
