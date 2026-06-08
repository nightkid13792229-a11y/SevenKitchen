import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('logging regressions', () => {
  it('keeps recipe detail free of noisy debug logs', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain("[Recipe Share] 分享信息已更新:")
    expect(source).not.toContain('[Recipe Share] ========== 转发给朋友分享函数被调用 ==========')
    expect(source).not.toContain('[Recipe Share] ========== 分享到朋友圈函数被调用 ==========')
    expect(source).not.toContain('[RecipeDetail] API Response:')
    expect(source).not.toContain('[RecipeDetail] recipe.value.items[0]:')
    expect(source).not.toContain('[RecipeDetail] Checking favorite for recipeId:')
    expect(source).not.toContain('[RecipeDetail] Favorite status from API:')
    expect(source).not.toContain('[RecipeDetail] isFavorite set to:')
    expect(source).not.toContain('[RecipeDetail] 健康标签映射表加载完成')
    expect(source).not.toContain('[RecipeDetail] 预生成分享令牌成功:')
    expect(source).not.toContain('[RecipeDetail] 预生成分享令牌失败（可能是非员工用户）:')
  })

  it('keeps generic api helper free of request success-path debug logs', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/utils/api.ts'),
      'utf-8',
    )

    expect(source).not.toContain('[API Request]')
    expect(source).not.toContain('[API Request Data]')
    expect(source).not.toContain('[API Response]')
    expect(source).not.toContain('[API Parsed Response]')
    expect(source).not.toContain('[API] 204 No Content - treating as success')
  })
})
