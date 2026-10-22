import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `POST drafts`：起手只登记原料名，站点固定为 INTAKE。 */
export class CreateDraftDto {
  @ApiProperty({ description: '原料名称', example: '鸡肝' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name!: string;
}
