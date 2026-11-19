import { ApiProperty } from '@nestjs/swagger';

/** 新建类别（输入即建：记账时打的新名字也走这里） */
export class CreateFinanceCategoryDto {
  @ApiProperty({ description: '类别名称（1–60 字，不可与现有类别重名）' })
  name!: string;
}

/** 改名：系统类别也允许改名，历史记录自动显示新名字 */
export class RenameFinanceCategoryDto {
  @ApiProperty({ description: '新名称（1–60 字，不可与现有类别重名）' })
  name!: string;
}

/** 合并：把源类别的历史记录搬到目标类别，源类别停用 */
export class MergeFinanceCategoryDto {
  @ApiProperty({ description: '目标类别 id（保留的那个）' })
  targetId!: string;
}
