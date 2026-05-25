import { request } from './api'

declare const wx: any

export type CustomerServiceSourceType = 'ORDER' | 'PRODUCT' | 'AFTERSALE' | 'REFUND' | 'GENERAL'

export interface CustomerServiceConfig {
  enabled: boolean
  provider: string
  corpId?: string | null
  openKfid?: string | null
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
  imageUrl?: string
}

export const defaultCustomerServiceConfig: CustomerServiceConfig = {
  enabled: false,
  provider: 'WECHAT_CUSTOMER_SERVICE',
  corpId: null,
  openKfid: null,
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
const CUSTOMER_SERVICE_PENDING_TARGET_KEY = 'customer_service_pending_target'

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

function normalizeCustomerServiceCardPath(path?: string) {
  const value = String(path || '').trim()
  if (!value) return ''
  return value.replace(/^\/+/, '')
}

function buildCustomerServiceEntryPath(context: CustomerServiceContext) {
  const sourceType = context.sourceType || 'GENERAL'
  let target = ''
  if (sourceType === 'PRODUCT' && context.productId) {
    target = `pages/staff-customer-service/product?productId=${context.productId}`
  } else if (
    (sourceType === 'ORDER' || sourceType === 'AFTERSALE' || sourceType === 'REFUND') &&
    context.orderId
  ) {
    target = `pages/staff-customer-service/order?orderId=${context.orderId}&scene=${sourceType}`
  } else if (context.path) {
    target = normalizeCustomerServiceCardPath(context.path)
  }

  const params: Record<string, string | undefined> = {
    type: sourceType,
    orderId: context.orderId,
    productId: context.productId,
    target,
  }

  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  return `pages/customer-service-entry/index${query ? `?${query}` : ''}`
}

function buildCustomerServiceTargetUrl(context: CustomerServiceContext, fallbackPath: string) {
  if (context.sourceType === 'PRODUCT' && context.productId) {
    return `/pages/recipe-detail/index?recipeId=${encodeURIComponent(context.productId)}`
  }

  if (
    (context.sourceType === 'ORDER' || context.sourceType === 'AFTERSALE' || context.sourceType === 'REFUND') &&
    context.orderId
  ) {
    return `/pages/order-detail/index?id=${encodeURIComponent(context.orderId)}`
  }

  return fallbackPath ? `/${fallbackPath}` : '/pages/home/index'
}

function rememberCustomerServiceTarget(url: string) {
  try {
    uni.setStorageSync(CUSTOMER_SERVICE_PENDING_TARGET_KEY, {
      url,
      createdAt: Date.now(),
      lastHandledAt: 0,
    })
  } catch (error) {
    console.warn('[CustomerService] remember target failed:', error)
  }
}

function hasLoginToken() {
  try {
    return Boolean(uni.getStorageSync('token'))
  } catch (error) {
    return false
  }
}

function recordCustomerServiceContext(
  context: CustomerServiceContext,
  card: { title: string; path: string; imageUrl?: string },
  targetUrl: string,
) {
  if (!hasLoginToken()) return

  request({
    url: '/customer-service/context',
    method: 'POST',
    quiet: true,
    suppressErrorToast: true,
    data: {
      sourceType: context.sourceType || 'GENERAL',
      sourceTitle: card.title,
      sourcePath: card.path,
      orderId: context.orderId || undefined,
      productId: context.productId || undefined,
      metadata: {
        productName: context.productName || undefined,
        orderNo: context.orderNo || undefined,
        cardPath: card.path,
        cardImageUrl: card.imageUrl || undefined,
        targetUrl,
      },
    },
  } as any).catch((error) => {
    console.warn('[CustomerService] record context failed:', error)
  })
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
      imageUrl: context.imageUrl,
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
      imageUrl: context.imageUrl,
    }
  }

  if (context.sourceType === 'PRODUCT') {
    return {
      title: applyTemplate(config.productCardTitleTemplate, values),
      path: applyTemplate(config.productCardPathTemplate, values),
      imageUrl: context.imageUrl,
    }
  }

  return {
    title: applyTemplate(config.defaultCardTitleTemplate, values),
    path: applyTemplate(config.defaultCardPathTemplate || getCurrentPagePath(), values),
    imageUrl: context.imageUrl,
  }
}

export function getFloatingButtonClass(config: CustomerServiceConfig) {
  return [
    'customer-service-float',
    config.floatingButtonPosition === 'LEFT_BOTTOM' ? 'left' : 'right',
    config.floatingButtonStyle === 'DARK' ? 'dark' : 'light',
  ].join(' ')
}

export function openCustomerServiceChat(
  config: CustomerServiceConfig,
  context: CustomerServiceContext = {},
) {
  const card = buildCustomerServiceCard(config, context)
  const cardTargetPath = normalizeCustomerServiceCardPath(card.path)
  const targetUrl = buildCustomerServiceTargetUrl(context, cardTargetPath)
  const sendMessagePath = buildCustomerServiceEntryPath(context) || cardTargetPath

  if (!config.enabled) {
    uni.showModal({
      title: '联系客服',
      content: '客服暂未启用，请稍后再试',
      showCancel: false,
    })
    return
  }

  if (
    config.provider === 'WECHAT_CUSTOMER_SERVICE' &&
    config.corpId &&
    config.customerServiceUrl &&
    typeof wx !== 'undefined' &&
    typeof wx.openCustomerServiceChat === 'function'
  ) {
    rememberCustomerServiceTarget(targetUrl)
    recordCustomerServiceContext(context, card, targetUrl)

    const chatOptions: any = {
      extInfo: {
        url: config.customerServiceUrl,
      },
      corpId: config.corpId,
      showMessageCard: Boolean(card.title && sendMessagePath),
      sendMessageTitle: card.title,
      sendMessagePath,
      success: () => {},
      fail: (error: any) => {
        console.warn('[CustomerService] openCustomerServiceChat failed:', error)
        uni.showModal({
          title: '联系客服失败',
          content: '客服入口暂时无法打开，请稍后再试',
          showCancel: false,
        })
      },
    }

    if (card.imageUrl) {
      chatOptions.sendMessageImg = card.imageUrl
    }

    wx.openCustomerServiceChat(chatOptions)
    return
  }

  if (config.customerServiceUrl) {
    uni.navigateTo({
      url: `/pages/common/webview?url=${encodeURIComponent(config.customerServiceUrl)}&title=${encodeURIComponent(card.title)}`,
    })
    return
  }

  uni.showModal({
    title: '联系客服',
    content: '客服入口未配置，请联系管理员',
    showCancel: false,
  })
}
