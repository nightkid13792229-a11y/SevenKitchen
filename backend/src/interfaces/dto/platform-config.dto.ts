import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePaymentConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  appId?: string | null;

  @IsOptional()
  @IsString()
  mchId?: string | null;

  @IsOptional()
  @IsString()
  merchantSerialNumber?: string | null;

  @IsOptional()
  @IsString()
  apiV3Key?: string | null;

  @IsOptional()
  @IsString()
  privateKeyPem?: string | null;

  @IsOptional()
  @IsString()
  notifyUrl?: string | null;

  @IsOptional()
  @IsString()
  refundNotifyUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  paymentTimeoutMinutes?: number;

  @IsOptional()
  @IsBoolean()
  autoCloseUnpaid?: boolean;

  @IsOptional()
  @IsBoolean()
  allowRefund?: boolean;

  @IsOptional()
  @IsBoolean()
  requireRefundReview?: boolean;
}

export class UpdateCustomerServiceConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  corpId?: string | null;

  @IsOptional()
  @IsString()
  openKfid?: string | null;

  @IsOptional()
  @IsString()
  customerServiceUrl?: string | null;

  @IsOptional()
  @IsString()
  customerServiceSecret?: string | null;

  @IsOptional()
  @IsString()
  token?: string | null;

  @IsOptional()
  @IsString()
  encodingAesKey?: string | null;

  @IsOptional()
  @IsString()
  orderCardTitleTemplate?: string;

  @IsOptional()
  @IsString()
  orderCardPathTemplate?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string | null;

  @IsOptional()
  @IsString()
  orderDetailDeliveryNote?: string | null;

  @IsOptional()
  @IsString()
  orderDetailAftersaleNote?: string | null;

  @IsOptional()
  @IsString()
  orderDetailMerchantNote?: string | null;

  @IsOptional()
  @IsBoolean()
  autoAssignEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sameCustomerPriority?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  serviceTimeoutMinutes?: number;
}
