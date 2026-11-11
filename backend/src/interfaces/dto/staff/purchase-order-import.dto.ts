import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ImportOrderScreenshotsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  imageUrls!: string[];

  /** 与 imageUrls 一一对应的 COS key（私有目录用；公开 URL 可省略） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  imageKeys?: string[];
}

export class UpdateOrderImportDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  orderNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  orderTime?: string | null;

  /**
   * 运费 / 包装费允许人工修正（模型读错时以员工填的为准）。
   * null = 明确清空（按 0 计），不传 = 不改。
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packagingFee?: number | null;

  /** 实付：模型没读到（先用后付/截图截断）时人工补填 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  paid?: number | null;

  /** 预计到货（YYYY-MM-DD）；清空传 null */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  expectedDeliveryAt?: string | null;
}

export class CreateOrderImportLineDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  rawName?: string | null;

  @IsOptional()
  @IsString()
  ingredientId?: string | null;

  @IsOptional()
  @IsString()
  procurementSkuId?: string | null;

  @IsNumber()
  @Min(0.001)
  qty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string | null;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineTotal?: number | null;

  @IsOptional()
  @IsBoolean()
  isPersonal?: boolean;
}

export class UpdateOrderImportLineDto {
  /** 截图里那串商品名：识别错了允许员工直接改（2026-11-05） */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  rawName?: string;

  @IsOptional()
  @IsString()
  ingredientId?: string | null;

  @IsOptional()
  @IsString()
  procurementSkuId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineTotal?: number | null;

  @IsOptional()
  @IsBoolean()
  isPersonal?: boolean;

  /** 显式同意把采购商品改名（默认 false，防止换商品时误改） */
  @IsOptional()
  @IsBoolean()
  syncSkuName?: boolean;
}

export class ConfirmOrderImportsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  importIds!: string[];
}
