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
  IsObject,
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

  /**
   * 包装层级（2026-11-11）：{ links: [{count,unit}], amount, amountUnit, amountLabel? }
   * 传了它就以它为准；老版本小程序仍只传下面的件数 + 净含量。
   */
  @IsOptional()
  @IsObject()
  packaging?: Record<string, unknown>;

  /** 一箱/一袋里有几件（单件商品填 1）—— 老字段，有 packaging 时可省 */
  @IsOptional()
  @IsInt()
  @Min(1)
  packCount?: number;

  /** 单件净含量，单位固定为这道原料的基准单位 —— 老字段，有 packaging 时可省 */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  netContentPerPack?: number;

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

  /**
   * 从识别结果页的新建入口过来时，带上那条订单识别记录（2026-11-07）。
   * 服务端据此校验「渠道必须是这笔订单的渠道」，防止绕过同名同渠道的判重。
   */
  @IsOptional()
  @IsString()
  @Length(1, 36)
  orderImportId?: string;
}
