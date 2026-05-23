import api from './index';

export interface PaymentConfig {
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
  createdAt: string;
  updatedAt: string;
}

export interface PaymentConfigUpdate {
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

export interface CustomerServiceConfig {
  id: string;
  enabled: boolean;
  provider: string;
  corpId: string | null;
  openKfid: string | null;
  customerServiceUrl: string | null;
  orderCardTitleTemplate: string;
  orderCardPathTemplate: string;
  productCardTitleTemplate: string;
  productCardPathTemplate: string;
  defaultCardTitleTemplate: string;
  defaultCardPathTemplate: string;
  welcomeMessage: string | null;
  orderDetailDeliveryNote: string | null;
  orderDetailAftersaleNote: string | null;
  orderDetailMerchantNote: string | null;
  floatingButtonEnabled: boolean;
  floatingButtonText: string;
  floatingButtonIconUrl: string | null;
  floatingButtonSize: number;
  floatingButtonPosition: string;
  floatingButtonBottom: number;
  floatingButtonRight: number;
  floatingButtonStyle: string;
  autoAssignEnabled: boolean;
  sameCustomerPriority: boolean;
  serviceTimeoutMinutes: number;
  customerServiceSecretConfigured: boolean;
  tokenConfigured: boolean;
  encodingAesKeyConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerServiceConfigUpdate {
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
  productCardTitleTemplate?: string;
  productCardPathTemplate?: string;
  defaultCardTitleTemplate?: string;
  defaultCardPathTemplate?: string;
  welcomeMessage?: string | null;
  orderDetailDeliveryNote?: string | null;
  orderDetailAftersaleNote?: string | null;
  orderDetailMerchantNote?: string | null;
  floatingButtonEnabled?: boolean;
  floatingButtonText?: string;
  floatingButtonIconUrl?: string | null;
  floatingButtonSize?: number;
  floatingButtonPosition?: string;
  floatingButtonBottom?: number;
  floatingButtonRight?: number;
  floatingButtonStyle?: string;
  autoAssignEnabled?: boolean;
  sameCustomerPriority?: boolean;
  serviceTimeoutMinutes?: number;
}

export const platformConfigApi = {
  getPayment: (): Promise<PaymentConfig> =>
    api.get('/admin/platform-config/payment'),

  updatePayment: (data: PaymentConfigUpdate): Promise<PaymentConfig> =>
    api.put('/admin/platform-config/payment', data),

  getCustomerService: (): Promise<CustomerServiceConfig> =>
    api.get('/admin/platform-config/customer-service'),

  updateCustomerService: (
    data: CustomerServiceConfigUpdate,
  ): Promise<CustomerServiceConfig> =>
    api.put('/admin/platform-config/customer-service', data),
};
