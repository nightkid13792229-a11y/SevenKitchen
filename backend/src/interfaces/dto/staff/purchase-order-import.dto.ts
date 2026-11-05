import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
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
}

export class UpdateOrderImportLineDto {
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
