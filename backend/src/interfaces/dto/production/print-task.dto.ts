/**
 * DTOs for production task printing
 */

import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
} from 'class-validator';
import type { OrderPackagePlanItemDto } from '../orders/order-response.dto';

export class PrintTaskOrderItemDto {
  @IsNumber()
  packageSpecG!: number;

  @IsNumber()
  packageCount!: number;

  @IsArray()
  @IsOptional()
  packagePlan?: OrderPackagePlanItemDto[];

  /// 订单号：制作单上要跟纸质单对得上号（以前只印「订单 1」）
  @IsString()
  @IsOptional()
  orderNo?: string;

  @IsString()
  @IsOptional()
  dogName!: string;

  @IsString()
  @IsOptional()
  recipientName?: string;

  @IsString()
  @IsOptional()
  recipientCity?: string;

  @IsString()
  @IsOptional()
  adminRemark?: string;

  /// 顾客下单时填的备注（过敏 / 分装要求），必印，不能截断
  @IsString()
  @IsOptional()
  customerNote?: string;
}

export class PrintTaskIngredientDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  standardIngredientName?: string;

  @IsString()
  @IsOptional()
  procurementSkuName?: string;

  @IsString()
  @IsOptional()
  procurementSkuBrand?: string;

  @IsString()
  @IsOptional()
  procurementSkuPurchaseChannel?: string;

  @IsString()
  @IsOptional()
  procurementSkuProductModel?: string;

  @IsString()
  amount!: string;

  @IsString()
  unit!: string;

  @IsString()
  typeLabel!: string;

  @IsString()
  typeClass!: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsOptional()
  isTotalWeight?: boolean;
}

export class PrintTaskDto {
  @IsString()
  recipeName!: string;

  @IsString()
  recipeVersion!: string;

  @IsNumber()
  currentPotNumber!: number;

  @IsNumber()
  totalPots!: number;

  @IsString()
  status!: string;

  @IsNumber()
  totalProductionG!: number;

  @IsString()
  createdAt!: string;

  @IsString()
  @IsOptional()
  completedAt?: string;

  @IsArray()
  orderItems!: PrintTaskOrderItemDto[];

  @IsArray()
  parsedIngredients!: PrintTaskIngredientDto[];

  @IsString()
  @IsOptional()
  taskId?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class PrintTaskResponseDto {
  success!: boolean;
  message!: string;
  data?: {
    pdfUrl: string;
    estimatedTime: string;
  };
}
