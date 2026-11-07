import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 建档时必须一起提交的采购商品（2026-11-07 硬门禁）。
 *
 * 它是原料成本的第一个、也是唯一的初始来源。允许它为空的话，
 * 库里就会出现「有原料、没价」的状态，一进食谱按 0 元算。
 */
export class AuthorizeProcurementSkuDto {
  @ApiPropertyOptional({ description: '商品名；留空时用原料名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '采购单位', example: '袋' })
  @IsString()
  @IsNotEmpty()
  purchaseUnit!: string;

  @ApiProperty({ description: '一箱/一袋几件', example: 1 })
  @IsInt()
  @Min(1)
  packCount!: number;

  @ApiProperty({ description: '每件净含量（基准单位）', example: 500 })
  @IsNumber()
  @IsPositive()
  netContentPerPack!: number;

  @ApiProperty({ description: '这一件多少钱', example: 39.9 })
  @IsNumber()
  @IsPositive()
  currentPurchasePrice!: number;

  /**
   * 在哪买的（2026-11-08）：只认后台维护的渠道字典；
   * 归不上字典码时服务端存空，不阻断建档。
   */
  @ApiPropertyOptional({ description: '采购渠道（后台维护的渠道名）', example: '山姆' })
  @IsOptional()
  @IsString()
  purchaseChannel?: string;

  /** 识别用的商品详情页截图：留在采购商品上，能追这个价是从哪张图来的。 */
  @ApiPropertyOptional({ description: '商品详情页截图地址' })
  @IsOptional()
  @IsString()
  sourceScreenshotUrl?: string;
}

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

  @ApiProperty({
    description: '建档同时新增的采购商品（含价格与换算）',
    type: AuthorizeProcurementSkuDto,
  })
  @ValidateNested()
  @Type(() => AuthorizeProcurementSkuDto)
  procurementSku!: AuthorizeProcurementSkuDto;
}
