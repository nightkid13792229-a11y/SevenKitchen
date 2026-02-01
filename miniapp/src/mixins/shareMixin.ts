import { ref, type Ref } from 'vue'

export interface ShareConfig {
  title?: string | Ref<string>
  imageUrl?: string | Ref<string>
  path?: string | Ref<string>
  query?: Record<string, any>
}

export interface ShareResult {
  onShareAppMessage: () => any
  onShareTimeline: () => any
}

// 默认配置
const DEFAULT_CONFIG = {
  title: 'Seven的厨房 - 为您的爱犬定制健康食谱',
  imageUrl: '/static/share-default.png',
  path: '/pages/home/index'
}

/**
 * 分享功能Hook
 * @param config 分享配置
 * @returns 分享钩子函数
 */
export function useShare(config: ShareConfig = {}): ShareResult {
  // 解构配置,处理Ref类型
  const titleRef = typeof config.title === 'string'
    ? ref(config.title)
    : (config.title || ref(DEFAULT_CONFIG.title))

  const imageUrlRef = typeof config.imageUrl === 'string'
    ? ref(config.imageUrl)
    : (config.imageUrl || ref(DEFAULT_CONFIG.imageUrl))

  const pathRef = typeof config.path === 'string'
    ? ref(config.path)
    : (config.path || ref(DEFAULT_CONFIG.path))

  /**
   * 获取当前页面信息
   */
  const getCurrentPageInfo = () => {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    return currentPage?.$page || {}
  }

  /**
   * 验证并安全化分享配置
   */
  const validateConfig = (shareConfig: any) => {
    const safeConfig = { ...shareConfig }

    // 标题长度限制(微信限制: 512字符)
    if (safeConfig.title && typeof safeConfig.title === 'string' && safeConfig.title.length > 512) {
      safeConfig.title = safeConfig.title.substring(0, 509) + '...'
    }

    // 路径有效性检查
    if (safeConfig.path && typeof safeConfig.path === 'string' && !safeConfig.path.startsWith('/')) {
      safeConfig.path = '/' + safeConfig.path
    }

    return safeConfig
  }

  /**
   * 检查图片是否存在
   */
  const checkImageExists = async (imageUrl: string): Promise<boolean> => {
    try {
      // 本地路径检查
      if (imageUrl.startsWith('/static/') || imageUrl.startsWith('/')) {
        const fileInfo = await uni.getFileInfo({
          filePath: imageUrl
        })
        return !!fileInfo
      }
      // 网络图片暂时跳过检查
      return true
    } catch (error) {
      console.warn('[ShareMixin] Image check failed:', imageUrl, error)
      return false
    }
  }

  /**
   * 获取有效的图片URL
   */
  const getValidImageUrl = async (imageUrl: string | Ref<string>): Promise<string> => {
    const imageUrlStr = typeof imageUrl === 'string' ? imageUrl : imageUrl.value

    // 如果是空字符串,直接返回默认图
    if (!imageUrlStr) {
      return DEFAULT_CONFIG.imageUrl
    }

    // 检查配置的图片
    if (await checkImageExists(imageUrlStr)) {
      return imageUrlStr
    }

    // 如果都失败,返回默认图
    return DEFAULT_CONFIG.imageUrl
  }

  /**
   * 转发给朋友
   */
  const onShareAppMessage = async () => {
    const pageInfo = getCurrentPageInfo()

    const title = typeof titleRef.value === 'string' ? titleRef.value : titleRef.value.value
    const path = typeof pathRef.value === 'string' ? pathRef.value : pathRef.value.value

    const shareConfig = {
      title,
      imageUrl: await getValidImageUrl(imageUrlRef),
      path: path || pageInfo.fullPath || DEFAULT_CONFIG.path
    }

    return validateConfig(shareConfig)
  }

  /**
   * 分享到朋友圈
   */
  const onShareTimeline = async () => {
    const title = typeof titleRef.value === 'string' ? titleRef.value : titleRef.value.value

    const shareConfig = {
      title,
      imageUrl: await getValidImageUrl(imageUrlRef)
    }

    return validateConfig(shareConfig)
  }

  return {
    onShareAppMessage,
    onShareTimeline
  }
}
