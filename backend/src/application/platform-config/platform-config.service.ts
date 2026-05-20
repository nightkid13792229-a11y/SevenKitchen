import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface PaymentConfigResponse {
  id: string;
  enabled: boolean;
  provider: string;
  mode: string;
  appId: string | null;
  mchId: string | null;
  merchantSerialNumber: string | null;
  notifyUrl: string | null;
  refundNotifyUrl: string | null;
  paymentTimeoutMinutes: number;
  autoCloseUnpaid: boolean;
  allowRefund: boolean;
  requireRefundReview: boolean;
  apiV3KeyConfigured: boolean;
  privateKeyConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatePaymentConfigInput {
  enabled?: boolean;
  provider?: string;
  mode?: string;
  appId?: string | null;
  mchId?: string | null;
  merchantSerialNumber?: string | null;
  apiV3Key?: string | null;
  privateKeyPem?: string | null;
  notifyUrl?: string | null;
  refundNotifyUrl?: string | null;
  paymentTimeoutMinutes?: number;
  autoCloseUnpaid?: boolean;
  allowRefund?: boolean;
  requireRefundReview?: boolean;
}

export interface CustomerServiceConfigResponse {
  id: string;
  enabled: boolean;
  provider: string;
  corpId: string | null;
  openKfid: string | null;
  customerServiceUrl: string | null;
  orderCardTitleTemplate: string;
  orderCardPathTemplate: string;
  welcomeMessage: string | null;
  orderDetailDeliveryNote: string | null;
  orderDetailAftersaleNote: string | null;
  orderDetailMerchantNote: string | null;
  autoAssignEnabled: boolean;
  sameCustomerPriority: boolean;
  serviceTimeoutMinutes: number;
  customerServiceSecretConfigured: boolean;
  tokenConfigured: boolean;
  encodingAesKeyConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateCustomerServiceConfigInput {
  enabled?: boolean;
  provider?: string;
  corpId?: string | null;
  openKfid?: string | null;
  customerServiceUrl?: string | null;
  customerServiceSecret?: string | null;
  token?: string | null;
  encodingAesKey?: string | null;
  orderCardTitleTemplate?: string;
  orderCardPathTemplate?: string;
  welcomeMessage?: string | null;
  orderDetailDeliveryNote?: string | null;
  orderDetailAftersaleNote?: string | null;
  orderDetailMerchantNote?: string | null;
  autoAssignEnabled?: boolean;
  sameCustomerPriority?: boolean;
  serviceTimeoutMinutes?: number;
}

@Injectable()
export class PlatformConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getPaymentConfig(): Promise<PaymentConfigResponse> {
    const config = await this.prisma.paymentConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
    });

    return this.toPaymentResponse(config);
  }

  async updatePaymentConfig(
    input: UpdatePaymentConfigInput,
  ): Promise<PaymentConfigResponse> {
    const data: Record<string, unknown> = {};

    this.assignIfDefined(data, 'enabled', input.enabled);
    this.assignIfDefined(data, 'provider', input.provider);
    this.assignIfDefined(data, 'mode', input.mode);
    this.assignIfDefined(data, 'appId', this.normalizeNullable(input.appId));
    this.assignIfDefined(data, 'mchId', this.normalizeNullable(input.mchId));
    this.assignIfDefined(
      data,
      'merchantSerialNumber',
      this.normalizeNullable(input.merchantSerialNumber),
    );
    this.assignSecret(data, 'apiV3Key', input.apiV3Key);
    this.assignSecret(data, 'privateKeyPem', input.privateKeyPem);
    this.assignIfDefined(data, 'notifyUrl', this.normalizeNullable(input.notifyUrl));
    this.assignIfDefined(
      data,
      'refundNotifyUrl',
      this.normalizeNullable(input.refundNotifyUrl),
    );
    this.assignIfDefined(
      data,
      'paymentTimeoutMinutes',
      input.paymentTimeoutMinutes,
    );
    this.assignIfDefined(data, 'autoCloseUnpaid', input.autoCloseUnpaid);
    this.assignIfDefined(data, 'allowRefund', input.allowRefund);
    this.assignIfDefined(data, 'requireRefundReview', input.requireRefundReview);

    const config = await this.prisma.paymentConfig.upsert({
      where: { id: 'singleton' },
      create: data,
      update: data,
    });

    return this.toPaymentResponse(config);
  }

  async getCustomerServiceConfig(): Promise<CustomerServiceConfigResponse> {
    const config = await this.prisma.customerServiceConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
    });

    return this.toCustomerServiceResponse(config);
  }

  async updateCustomerServiceConfig(
    input: UpdateCustomerServiceConfigInput,
  ): Promise<CustomerServiceConfigResponse> {
    const data: Record<string, unknown> = {};

    this.assignIfDefined(data, 'enabled', input.enabled);
    this.assignIfDefined(data, 'provider', input.provider);
    this.assignIfDefined(data, 'corpId', this.normalizeNullable(input.corpId));
    this.assignIfDefined(data, 'openKfid', this.normalizeNullable(input.openKfid));
    this.assignIfDefined(
      data,
      'customerServiceUrl',
      this.normalizeNullable(input.customerServiceUrl),
    );
    this.assignSecret(
      data,
      'customerServiceSecret',
      input.customerServiceSecret,
    );
    this.assignSecret(data, 'token', input.token);
    this.assignSecret(data, 'encodingAesKey', input.encodingAesKey);
    this.assignIfDefined(
      data,
      'orderCardTitleTemplate',
      input.orderCardTitleTemplate,
    );
    this.assignIfDefined(
      data,
      'orderCardPathTemplate',
      input.orderCardPathTemplate,
    );
    this.assignIfDefined(
      data,
      'welcomeMessage',
      this.normalizeNullable(input.welcomeMessage),
    );
    this.assignIfDefined(
      data,
      'orderDetailDeliveryNote',
      this.normalizeNullable(input.orderDetailDeliveryNote),
    );
    this.assignIfDefined(
      data,
      'orderDetailAftersaleNote',
      this.normalizeNullable(input.orderDetailAftersaleNote),
    );
    this.assignIfDefined(
      data,
      'orderDetailMerchantNote',
      this.normalizeNullable(input.orderDetailMerchantNote),
    );
    this.assignIfDefined(data, 'autoAssignEnabled', input.autoAssignEnabled);
    this.assignIfDefined(
      data,
      'sameCustomerPriority',
      input.sameCustomerPriority,
    );
    this.assignIfDefined(
      data,
      'serviceTimeoutMinutes',
      input.serviceTimeoutMinutes,
    );

    const config = await this.prisma.customerServiceConfig.upsert({
      where: { id: 'singleton' },
      create: data,
      update: data,
    });

    return this.toCustomerServiceResponse(config);
  }

  private assignIfDefined(
    data: Record<string, unknown>,
    key: string,
    value: unknown,
  ) {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  private assignSecret(
    data: Record<string, unknown>,
    key: string,
    value: string | null | undefined,
  ) {
    if (value === undefined) return;
    data[key] = this.normalizeNullable(value);
  }

  private normalizeNullable(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toPaymentResponse(config: any): PaymentConfigResponse {
    return {
      id: config.id,
      enabled: config.enabled,
      provider: config.provider,
      mode: config.mode,
      appId: config.appId,
      mchId: config.mchId,
      merchantSerialNumber: config.merchantSerialNumber,
      notifyUrl: config.notifyUrl,
      refundNotifyUrl: config.refundNotifyUrl,
      paymentTimeoutMinutes: config.paymentTimeoutMinutes,
      autoCloseUnpaid: config.autoCloseUnpaid,
      allowRefund: config.allowRefund,
      requireRefundReview: config.requireRefundReview,
      apiV3KeyConfigured: Boolean(config.apiV3Key),
      privateKeyConfigured: Boolean(config.privateKeyPem),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private toCustomerServiceResponse(config: any): CustomerServiceConfigResponse {
    return {
      id: config.id,
      enabled: config.enabled,
      provider: config.provider,
      corpId: config.corpId,
      openKfid: config.openKfid,
      customerServiceUrl: config.customerServiceUrl,
      orderCardTitleTemplate: config.orderCardTitleTemplate,
      orderCardPathTemplate: config.orderCardPathTemplate,
      welcomeMessage: config.welcomeMessage,
      orderDetailDeliveryNote: config.orderDetailDeliveryNote,
      orderDetailAftersaleNote: config.orderDetailAftersaleNote,
      orderDetailMerchantNote: config.orderDetailMerchantNote,
      autoAssignEnabled: config.autoAssignEnabled,
      sameCustomerPriority: config.sameCustomerPriority,
      serviceTimeoutMinutes: config.serviceTimeoutMinutes,
      customerServiceSecretConfigured: Boolean(config.customerServiceSecret),
      tokenConfigured: Boolean(config.token),
      encodingAesKeyConfigured: Boolean(config.encodingAesKey),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
