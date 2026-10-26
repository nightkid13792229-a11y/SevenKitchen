import { describe, expect, it } from 'vitest'
import dialogSource from '@/views/RecipeDesigner/components/TaxonomyNodeDialog.vue?raw'
import viewSource from '@/views/RecipeDesigner/components/TaxonomyView.vue?raw'

describe('节点结构维护', () => {
  it('定义必填且限 200 字，与后端校验一致', () => {
    expect(dialogSource).toContain('maxlength="200"')
    expect(dialogSource).toContain('请填写节点定义')
    expect(dialogSource).toContain("error?.message || '保存失败'")
  })

  it('编辑态可以停用，但停用不删除归属', () => {
    expect(dialogSource).toContain("status: isActive.value ? 'ACTIVE' : 'DISABLED'")
    expect(dialogSource).toContain('已有归属保留')
  })

  it('删除前二次确认，并把后端拒绝原因显示出来', () => {
    expect(dialogSource).toContain('ElMessageBox.confirm')
    expect(dialogSource).toContain("error?.message || '删除失败'")
  })

  it('只有管理员看得到结构维护入口', () => {
    expect(viewSource).toContain('useIsAdmin')
    expect(viewSource).toContain('v-if="isAdmin"')
  })
})
