/**
 * 员工在小程序「新增采购商品」时提交的内容（2026-11-01）。
 *
 * 注意这里**没有** `purchaseToBaseRatio`：换算由服务端按
 * `packCount × netContentPerPack` 算出来，不接受前端传乘积 ——
 * 一旦前端只填了单件规格（330 而不是 7920），账目会静默差几十倍。
 */

import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateStaffProcurementSkuDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(1, 200)
  purchaseChannel!: string;

  @IsString()
  @Length(1, 50)
  purchaseUnit!: string;

  /** 一箱/一袋里有几件（单件商品填 1） */
  @IsInt()
  @Min(1)
  packCount!: number;

  /** 单件净含量，单位固定为这道原料的基准单位 */
  @IsNumber()
  @IsPositive()
  netContentPerPack!: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  brand?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  productModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentPurchasePrice?: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  sourceScreenshotUrl?: string;
}
