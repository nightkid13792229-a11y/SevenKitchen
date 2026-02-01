/**
 * 微信分享配置
 * 图片存储在腾讯云COS，通过CDN加速访问
 */

export const SHARE_CONFIG = {
  /**
   * 全局默认分享图
   * 用途：当其他图片不可用时使用
   * CDN域名: img.sevenkitchen.cloud
   */
  defaultImageUrl: 'https://img.sevenkitchen.cloud/share/share-default.png',

  /**
   * 首页专属分享图
   * 用途：首页分享
   * CDN域名: img.sevenkitchen.cloud
   */
  homeImageUrl: 'https://img.sevenkitchen.cloud/share/share-home.png',

  /**
   * 食谱类默认分享图
   * 用途：食谱详情页的后备图（当食谱没有封面图时使用）
   * CDN域名: img.sevenkitchen.cloud
   */
  recipeImageUrl: 'https://img.sevenkitchen.cloud/share/share-recipe.png'
}

/**
 * 本地开发环境备用配置（如果COS图片不可用）
 * 取消注释以使用本地图片
 */
export const LOCAL_SHARE_CONFIG = {
  defaultImageUrl: '/static/share-default.png',
  homeImageUrl: '/static/share-home.png',
  recipeImageUrl: '/static/share-recipe.png'
}

// 当前使用的配置（修改这里切换）
export const CURRENT_SHARE_CONFIG = SHARE_CONFIG
