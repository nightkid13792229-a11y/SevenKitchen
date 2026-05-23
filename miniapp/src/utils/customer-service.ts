import { request } from './api'

export type CustomerServiceSourceType = 'ORDER' | 'PRODUCT' | 'AFTERSALE' | 'REFUND' | 'GENERAL'

export interface CustomerServiceConfig {
  enabled: boolean
  provider: string
  customerServiceUrl?: string | null
  orderCardTitleTemplate: string
  orderCardPathTemplate: string
  productCardTitleTemplate: string
  productCardPathTemplate: string
  defaultCardTitleTemplate: string
  defaultCardPathTemplate: string
  welcomeMessage?: string | null
  orderDetailDeliveryNote?: string | null
  orderDetailAftersaleNote?: string | null
  orderDetailMerchantNote?: string | null
  floatingButtonEnabled: boolean
  floatingButtonText: string
  floatingButtonIconUrl?: string | null
  floatingButtonSize: number
  floatingButtonPosition: string
  floatingButtonBottom: number
  floatingButtonRight: number
  floatingButtonStyle: string
}

export interface CustomerServiceContext {
  sourceType?: CustomerServiceSourceType
  orderId?: string
  orderNo?: string
  productId?: string
  productName?: string
  title?: string
  path?: string
}

export const defaultCustomerServiceConfig: CustomerServiceConfig = {
  enabled: false,
  provider: 'WECHAT_CUSTOMER_SERVICE',
  customerServiceUrl: null,
  orderCardTitleTemplate: '订单 {orderNo}',
  orderCardPathTemplate: '/pages/order-detail/index?id={orderId}',
  productCardTitleTemplate: '咨询商品 {productName}',
  productCardPathTemplate: '/pages/recipe-detail/index?recipeId={productId}',
  defaultCardTitleTemplate: 'SevenKitchen 客服咨询',
  defaultCardPathTemplate: '/pages/home/index',
  welcomeMessage: null,
  orderDetailDeliveryNote: null,
  orderDetailAftersaleNote: null,
  orderDetailMerchantNote: null,
  floatingButtonEnabled: true,
  floatingButtonText: '客服',
  floatingButtonIconUrl: null,
  floatingButtonSize: 56,
  floatingButtonPosition: 'RIGHT_BOTTOM',
  floatingButtonBottom: 128,
  floatingButtonRight: 18,
  floatingButtonStyle: 'LIGHT',
}

let configCache: CustomerServiceConfig | null = null
let configLoading: Promise<CustomerServiceConfig> | null = null

function applyTemplate(template: string, values: Record<string, string | undefined>) {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.split(`{${key}}`).join(value || '')
  }, template)
}

function getCurrentPagePath() {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1] as any
  if (!page?.route) return defaultCustomerServiceConfig.defaultCardPathTemplate

  const options = page.options || {}
  const query = Object.keys(options)
    .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
    .join('&')

  return `/${page.route}${query ? `?${query}` : ''}`
}

export async function getCustomerServiceConfig(force = false): Promise<CustomerServiceConfig> {
  if (!force && configCache) return configCache
  if (!force && configLoading) return configLoading

  configLoading = request<Partial<CustomerServiceConfig>>({
    url: '/platform-config/customer-service',
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  } as any)
    .then((res) => {
      const data = res.code === 0 && res.data ? res.data : {}
      configCache = {
        ...defaultCustomerServiceConfig,
        ...data,
      }
      return configCache
    })
    .catch((error) => {
      console.warn('[CustomerService] Load config failed:', error)
      configCache = { ...defaultCustomerServiceConfig }
      return configCache
    })
    .finally(() => {
      configLoading = null
    })

  return configLoading
}

export function buildCustomerServiceCard(
  config: CustomerServiceConfig,
  context: CustomerServiceContext,
) {
  if (context.title && context.path) {
    return {
      title: context.title,
      path: context.path,
    }
  }

  const values = {
    orderId: context.orderId,
    orderNo: context.orderNo || context.orderId,
    productId: context.productId,
    productName: context.productName,
  }

  if (context.sourceType === 'ORDER' || context.sourceType === 'AFTERSALE' || context.sourceType === 'REFUND') {
    return {
      title: applyTemplate(config.orderCardTitleTemplate, values),
      path: applyTemplate(config.orderCardPathTemplate, values),
    }
  }

  if (context.sourceType === 'PRODUCT') {
    return {
      title: applyTemplate(config.productCardTitleTemplate, values),
      path: applyTemplate(config.productCardPathTemplate, values),
    }
  }

  return {
    title: applyTemplate(config.defaultCardTitleTemplate, values),
    path: applyTemplate(config.defaultCardPathTemplate || getCurrentPagePath(), values),
  }
}

export function getFloatingButtonClass(config: CustomerServiceConfig) {
  return [
    'customer-service-float',
    config.floatingButtonPosition === 'LEFT_BOTTOM' ? 'left' : 'right',
    config.floatingButtonStyle === 'DARK' ? 'dark' : 'light',
  ].join(' ')
}
