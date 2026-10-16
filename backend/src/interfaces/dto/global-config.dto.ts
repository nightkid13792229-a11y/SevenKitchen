/**
 * Global Config DTOs
 * Data transfer objects for global configuration management
 */

import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateGlobalConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborHourlyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  minOrderWeightG?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultBatchCapacityG?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  targetMargin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overheadCostPerKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  targetBatchUtilization?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  supplementLossRate?: number;

  @IsOptional()
  @IsString()
  defaultProductLabelId?: string | null;

  @IsOptional()
  @IsString()
  defaultIcePackId?: string | null;

  @IsOptional()
  @IsString()
  defaultShippingTemplateId?: string | null;

  @IsOptional()
  @IsString()
  packageExampleImageUrl?: string | null;

  @IsOptional()
  @IsString()
  shippingCompanyLogoUrl?: string | null;

  @IsOptional()
  @IsString()
  homeHeaderBgImageUrl?: string | null;

  @IsOptional()
  @IsString()
  diySheetHeaderBgImageUrl?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(180)
  paymentTimeoutMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ingredientPriceAutoApproveThreshold?: number;

  @IsOptional()
  equipmentRecommendations?: any;

  /**
   * 疫苗板块应急开关（2026-10-16 B4）。
   *
   * 关掉它的命令（admin-web 的「全局配置」页也在改同一张表）：
   *   curl -X PUT .../api/v1/admin/global-config \
   *     -d '{"vaccineFeatureEnabled": false, "vaccineFeatureNotice": "疫苗功能维护中，稍后开放"}'
   */
  @IsOptional()
  @IsBoolean()
  vaccineFeatureEnabled?: boolean;

  /** 关掉疫苗板块时给顾客看的一句话（可空） */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vaccineFeatureNotice?: string | null;

  /** 识别每日上限（B5）；0 = 不限量 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  healthExtractionDailyLimit?: number;
}
