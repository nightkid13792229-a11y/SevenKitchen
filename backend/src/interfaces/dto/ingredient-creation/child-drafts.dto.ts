import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DIY制作单推荐商品草稿：与标准原料编辑页的子弹窗字段一一对应。
 *
 * 只用于草稿 payload 与授权提交；正式入库仍走 `recommendedProduct` 表。
 */
export class RecommendedProductDraftDto {
  @ApiPropertyOptional({ description: '前端行标识（不落正式表）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  key?: string;

  @ApiProperty({ description: 'SKU 名称', example: '沃尔玛糙米 600g/罐' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '品牌', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @ApiPropertyOptional({ description: '零售规格', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productModel?: string | null;

  @ApiPropertyOptional({ description: '采购渠道', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purchaseChannel?: string | null;

  @ApiPropertyOptional({ description: '购买链接平台', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  purchaseLinkPlatform?: string | null;

  @ApiPropertyOptional({ description: '购买链接或口令', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  purchaseLinkUrl?: string | null;

  @ApiPropertyOptional({ description: '商品图片 URL', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional({ description: '商品图片 COS key（仅前端清理用）', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageKey?: string | null;

  @ApiPropertyOptional({ description: '建议顺序', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number | null;

  @ApiPropertyOptional({ description: '是否启用', nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean | null;
}

/**
 * 生产/采购SKU 草稿：与标准原料编辑页的子弹窗字段一一对应。
 */
export class ProcurementSkuDraftDto {
  @ApiPropertyOptional({ description: '前端行标识（不落正式表）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  key?: string;

  @ApiProperty({ description: 'SKU 名称', example: '三文鱼整条 5kg/箱' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '品牌', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @ApiPropertyOptional({ description: '产品规格', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productModel?: string | null;

  @ApiPropertyOptional({ description: '采购渠道', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purchaseChannel?: string | null;

  @ApiPropertyOptional({ description: '采购单位', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  purchaseUnit?: string | null;

  @ApiPropertyOptional({ description: '换算倍数', nullable: true })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  purchaseToBaseRatio?: number | null;

  @ApiPropertyOptional({ description: '当前采购价', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentPurchasePrice?: number | null;

  @ApiPropertyOptional({ description: '期初库存（采购单位）', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingStock?: number | null;

  @ApiPropertyOptional({ description: '安全库存', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  safetyStock?: number | null;

  @ApiPropertyOptional({ description: '补货点', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number | null;

  @ApiPropertyOptional({ description: '目标库存', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetStock?: number | null;

  @ApiPropertyOptional({ description: '备注', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string | null;

  @ApiPropertyOptional({ description: '是否启用', nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean | null;
}
