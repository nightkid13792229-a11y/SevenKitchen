import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { CreateSupplementIngredientInput } from '../../../application/ingredient-creation/supplement-ingredient.service';

/**
 * 补剂的计量单位。与前端 `supplementUsageUnitOptions` 同一组值——
 * 服务端不能引用前端常量，所以这里就地定义；两边改一处就要一起改。
 */
export const SUPPLEMENT_UNIT_LABELS = [
  'g',
  'ml',
  '粒',
  '片',
  '胶囊',
  '平勺',
  '份'
] as const;

const PHYSICAL_FORMS = ['POWDER', 'TABLET', 'CAPSULE', 'LIQUID'] as const;

/** 与 domain/ingredient/supplement-add-timing.ts 同一套词表，别自己造。 */
export const SUPPLEMENT_ADD_TIMINGS = ['BEFORE_MIXING', 'BEFORE_MEAL'] as const;

export class SupplementEvidenceDto {
  @ApiPropertyOptional({ description: '商品链接' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  productUrl?: string;

  @ApiPropertyOptional({ description: '商品名（与原料名不同则填）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @ApiPropertyOptional({ description: '标签图片地址' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  labelImageUrl?: string;

  @ApiPropertyOptional({ description: '标签原文（OCR 或手抄）' })
  @IsOptional()
  @IsString()
  labelText?: string;
}

export class PreviewSupplementLinkDto {
  @ApiProperty({ description: '商品链接', example: 'https://www.iherb.com/pr/x/1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  url!: string;
}

export class CreateSupplementIngredientDto {
  @ApiProperty({ description: '原料名称', example: '鱼油（Omega-3）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '产品品牌' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: '产品规格' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productModel?: string;

  @ApiPropertyOptional({ description: '采购渠道' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purchaseChannel?: string;

  @ApiProperty({ description: '单位展示名', enum: SUPPLEMENT_UNIT_LABELS })
  @IsIn(SUPPLEMENT_UNIT_LABELS)
  unitDisplayLabel!: string;

  @ApiProperty({ description: '物理形态', enum: PHYSICAL_FORMS })
  @IsIn(PHYSICAL_FORMS)
  physicalForm!: (typeof PHYSICAL_FORMS)[number];

  @ApiProperty({ description: '采购单位', example: '瓶' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  purchaseUnit!: string;

  @ApiProperty({ description: '1 个采购单位等于多少粒', example: 120 })
  @IsNumber()
  @Min(0.01)
  purchaseToBaseRatio!: number;

  @ApiProperty({ description: '当前采购价', example: 398 })
  @IsNumber()
  @Min(0.01)
  currentPricePerPurchaseUnit!: number;

  @ApiProperty({ description: '添加时机', enum: SUPPLEMENT_ADD_TIMINGS })
  @IsIn(SUPPLEMENT_ADD_TIMINGS)
  addTiming!: string;

  @ApiProperty({ description: '生产损耗率', example: 1.05 })
  @IsNumber()
  @Min(1)
  @Max(2)
  productionLossRate!: number;

  @ApiProperty({ description: '用于 DIY 推荐' })
  @IsBoolean()
  diyEnabled!: boolean;

  @ApiProperty({ description: '用于采购/生产' })
  @IsBoolean()
  procurementEnabled!: boolean;

  @ApiPropertyOptional({ description: '标签类型', enum: ['FEED_MATERIAL', 'FEED_ADDITIVE'] })
  @IsOptional()
  @IsIn(['FEED_MATERIAL', 'FEED_ADDITIVE'])
  labelCategory?: 'FEED_MATERIAL' | 'FEED_ADDITIVE';

  @ApiPropertyOptional({ description: '目录规范名', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelNames?: string[];

  @ApiPropertyOptional({ description: '名称依据' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelNameSource?: string;

  @ApiPropertyOptional({ description: '标签分类（原料标签名）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @ApiProperty({ description: '每份几粒', example: 2 })
  @IsInt()
  @Min(1)
  servingUnitsPerDose!: number;

  @ApiProperty({
    description: '标签每份的含量，键是规范字段路径；折算由服务端做',
    example: { 'fattyAcids.epa': 650 }
  })
  @IsObject()
  servingNutrients!: Record<string, number>;

  @ApiPropertyOptional({ description: '标签证据', type: SupplementEvidenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SupplementEvidenceDto)
  evidence?: SupplementEvidenceDto;
}

/** 把接口入参翻成服务入参。抽出来是为了能在没有 Nest 的情况下测这段映射。 */
export function toCreateSupplementInput(
  dto: CreateSupplementIngredientDto,
  createdBy: string
): CreateSupplementIngredientInput {
  const nutrientValues: Record<string, number> = {};
  for (const [key, value] of Object.entries(dto.servingNutrients ?? {})) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`营养素 ${key} 必须是大于等于 0 的数字`);
    }
    nutrientValues[key] = value;
  }

  return {
    name: dto.name,
    brand: dto.brand ?? null,
    productModel: dto.productModel ?? null,
    purchaseChannel: dto.purchaseChannel ?? null,
    unitDisplayLabel: dto.unitDisplayLabel,
    physicalForm: dto.physicalForm,
    purchaseUnit: dto.purchaseUnit,
    purchaseToBaseRatio: dto.purchaseToBaseRatio,
    currentPricePerPurchaseUnit: dto.currentPricePerPurchaseUnit,
    addTiming: dto.addTiming,
    productionLossRate: dto.productionLossRate,
    diyEnabled: dto.diyEnabled,
    procurementEnabled: dto.procurementEnabled,
    labelCategory: dto.labelCategory ?? null,
    labelNames: dto.labelNames ?? [],
    labelNameSource: dto.labelNameSource ?? null,
    tagNames: dto.tagNames ?? [],
    servingUnitsPerDose: dto.servingUnitsPerDose,
    servingNutrients: nutrientValues,
    evidence: {
      productUrl: dto.evidence?.productUrl ?? null,
      productName: dto.evidence?.productName ?? null,
      labelImageUrl: dto.evidence?.labelImageUrl ?? null,
      labelText: dto.evidence?.labelText ?? null
    },
    createdBy
  };
}
