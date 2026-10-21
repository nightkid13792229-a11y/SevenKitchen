import { describe, expect, it } from 'vitest'
// admin-web 的 vitest 是 node 环境、没有 jsdom / test-utils，
// 所以页面接线用 `?raw` 读源码来锁；算法本身由 dogInsight.spec.ts 真跑。
import panelSource from '@/views/RecipeDesigner/components/DogInsightPanel.vue?raw'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'

/**
 * 读源码断言前必须剥注释。
 *
 * 模板注释里可能写着「以前这里显示确诊/可疑」，直接 includes 会被自己的
 * 说明文字骗到；JS 注释同理。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function templateOf(source: string): string {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  return start >= 0 && end > start ? source.slice(start, end + '</template>'.length) : ''
}

function scriptOf(source: string): string {
  const start = source.indexOf('<script setup lang="ts">')
  const end = source.indexOf('</script>', start)
  return start >= 0 && end > start ? source.slice(start, end) : ''
}

const cleanPanel = stripComments(panelSource)
const template = stripComments(templateOf(panelSource))
const script = stripComments(scriptOf(panelSource))

describe('爱犬指导面板 · fact-only 布局', () => {
  it('按「主蛋白 → 本单需求 → 过敏 → 备注 → 就诊体检 → 基础档案 → 最近食材」排列', () => {
    const anchors = [
      '主蛋白',
      '本单需求',
      '过敏信息',
      '顾客额外备注',
      '就诊 / 体检',
      '基础档案',
      '天吃过的食材',
    ]
    let lastIndex = -1
    for (const anchor of anchors) {
      const index = template.indexOf(anchor)
      expect(index, `缺少区块：${anchor}`).toBeGreaterThan(-1)
      expect(index, `区块顺序不对：${anchor}`).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('主蛋白只展示映射结果，不提供选择器', () => {
    expect(template).toContain('{{ proteinText }}')
    expect(script).toContain('formatRequestedProteins(')
    expect(template).not.toContain('requestedProteinCodes')
    expect(template).not.toContain('el-checkbox-group')
    expect(template).not.toContain('proteinMode')
  })

  it('本单需求只留肠胃、当前饲喂、定制原因', () => {
    expect(template).toContain('肠胃情况')
    expect(template).toContain('{{ stomachText }}')
    expect(template).toContain('v-if="currentFoodText"')
    expect(template).toContain('v-if="changeReasonText"')

    for (const removed of [
      'needsHealthManagement',
      'targetGoal',
      'goalText',
      'medicalConditions',
      'preferredIngredients',
      'dislikedIngredients',
      'allergyStatus',
      '健康管理',
      '体重目标',
      '订单里填的过敏',
      '订单里填的疾病',
      '订单里填的喜好',
      '订单里填的忌口',
    ]) {
      expect(cleanPanel, `不应再出现：${removed}`).not.toContain(removed)
    }
  })

  it('过敏信息合并展示，不再分档、不再标配方命中', () => {
    expect(template).toContain('allergyFacts.allergens')
    expect(script).toContain('buildAllergyFacts(')
    expect(template).not.toContain('档案过敏文本')
    expect(template).toContain('本单填写')

    for (const removed of [
      '确诊',
      '可疑',
      '已排除',
      '配方命中',
      'allergenWarningLevel',
      'allergyGroups',
      'isAllergenInRecipe',
      'CONFIRMED',
      'SUSPECTED',
      'RULED_OUT',
      'TO_VERIFY',
      'certainty',
    ]) {
      expect(cleanPanel, `不应再出现：${removed}`).not.toContain(removed)
    }

    // 过敏区块不再有红/橙风险色，也没有 ⚠ 提醒
    expect(template).not.toContain('type="danger"')
    expect(template).not.toContain('type="warning"')
    expect(template).not.toContain('⚠')
  })

  it('就诊 / 体检只显示最近一条的日期 + 诊断/结论，且不展示化验数值', () => {
    expect(template).toContain('就诊 / 体检')
    expect(template).toContain('healthFacts.medical.date')
    expect(template).toContain('healthFacts.medical.diagnosis')
    expect(template).toContain('healthFacts.checkup.date')
    expect(template).toContain('healthFacts.checkup.findings')
    expect(script).toContain('buildLatestHealthFacts(')
    expect(script).toContain('latestMedicalRecord')
    expect(script).toContain('latestCheckupRecord')

    for (const removed of [
      'labValues',
      'lab_values',
      'vitals',
      'chiefComplaint',
      'exams',
      'checkupType',
    ]) {
      expect(cleanPanel, `不应展示：${removed}`).not.toContain(removed)
    }
  })

  it('就诊体检、基础档案、最近食材三个折叠区默认收起', () => {
    expect(template).toContain('el-collapse v-model="openSections"')
    expect(template).toContain('name="health"')
    expect(template).toContain('name="profile"')
    expect(template).toContain('name="recent"')
    expect(script).toContain('const openSections = ref<string[]>([])')
    expect(template).not.toContain('default-expanded-names')
  })

  it('基础档案摘要进入顶部，详细字段保留在折叠区', () => {
    expect(template).toContain('profileSummary')
    for (const label of [
      '绝育状态',
      '活动量',
      '每日餐数',
      '零食摄入',
      '每日目标能量',
    ]) {
      expect(template).toContain(label)
    }
  })

  it('顾客额外备注只读展示', () => {
    expect(template).toContain('顾客额外备注')
    expect(template).toContain('additionalNotes')
  })

  it('删除「编辑备注」直接编辑与保存链路', () => {
    for (const removed of [
      '编辑备注',
      'saveNotes',
      'updateDogDesignNotes',
      'notesForm',
      'editingNotes',
      'savingNotes',
      'UpdateDogDesignNotesPayload',
      '保存到爱犬档案',
    ]) {
      expect(cleanPanel, `不应再出现：${removed}`).not.toContain(removed)
    }
  })

  it('保留更换参考爱犬与最近天数选择', () => {
    expect(template).toContain('更换参考爱犬')
    expect(template).toContain('设置参考爱犬')
    expect(script).toContain('openDogPicker')
    expect(script).toContain('recipeDesignerApi.setReferenceDog')
    expect(template).toContain('RECENT_DAYS_OPTIONS')
    expect(template).toContain('v-model="recentDays"')
    expect(template).toContain('handleRecentDaysChange')
  })

  it('不再做「与当前配方重合」的自动提醒和红色着色', () => {
    for (const removed of [
      'collisionIds',
      'collisionCount',
      'collision-warning',
      '建议替换',
      'current-ingredient-ids',
      'current-ingredient-names',
    ]) {
      expect(cleanPanel, `不应再出现：${removed}`).not.toContain(removed)
    }
  })
})

describe('设计器 · 爱犬面板接线', () => {
  it('新接口字段都已进入前端类型', () => {
    const types = stripComments(typeSource)
    expect(types).toContain('interface DogLatestMedicalRecord')
    expect(types).toContain('interface DogLatestCheckupRecord')
    expect(types).toContain('latestMedicalRecord: DogLatestMedicalRecord | null')
    expect(types).toContain('latestCheckupRecord: DogLatestCheckupRecord | null')
    expect(types).toContain('recipeQuantity: number')
    expect(types).toContain('requestedProteinCodes: string[]')
  })

  it('不再向面板传「配方命中」所需的名字/ID', () => {
    const editor = stripComments(editorSource)
    expect(editor).not.toContain(':current-ingredient-ids')
    expect(editor).not.toContain(':current-ingredient-names')
    expect(editor).not.toContain('currentIngredientIds')
    expect(editor).not.toContain('currentIngredientNames')
  })

  it('面板仍然挂在编辑页右栏', () => {
    const editor = stripComments(editorSource)
    expect(editor).toContain('<DogInsightPanel')
    expect(editor).toContain(':dog-id="referenceDogId"')
    expect(editor).toContain('@dog-changed=')
  })
})

describe('设计器 · 爱犬面板渲染回归（2026-10-22）', () => {
  it('本单文案使用 computed 值，不能把函数源码渲染到页面', () => {
    const panel = stripComments(panelSource)
    expect(panel).toContain('const stomachText = computed(')
    expect(panel).toContain('const currentFoodText = computed(')
    expect(panel).toContain('const changeReasonText = computed(')
    expect(panel).not.toContain('function stomachText()')
    expect(panel).not.toContain('function currentFoodText()')
    expect(panel).not.toContain('function changeReasonText()')
    expect(panel).toContain('{{ stomachText }}')
    expect(panel).toContain('{{ currentFoodText }}')
    expect(panel).toContain('{{ changeReasonText }}')
  })

  it('订单过敏原文已被档案过敏原覆盖时不再重复显示', () => {
    const panel = stripComments(panelSource)
    expect(panel).toContain('orderAllergyTextExtra')
    expect(panel).toContain('allergyFacts.value.orderText')
    expect(panel).toContain('tokens.some((item) => !covered.has(item.toLowerCase()))')
    expect(panel).toContain('{{ orderAllergyTextExtra }}')
  })
})

describe('设计器 · 爱犬面板头部与附件（2026-10-22）', () => {
  const panel = stripComments(panelSource)
  const template = templateOf(panel)
  const editor = stripComments(editorSource)

  it('从订单进入时锁定参考爱犬，并展示本单号', () => {
    expect(template).toContain('lockReferenceDog')
    expect(template).toContain('本单已绑定该犬，不能更换')
    expect(template).toContain('insight.customRecipeOrder.orderId')
    const editor = stripComments(editorSource)
    expect(editor).toContain(':lock-reference-dog="Boolean(route.query.orderId)"')
  })

  it('顾客随单附件与最近就诊/体检附件都有入口', () => {
    expect(template).toContain('顾客随单附件')
    expect(template).toContain('orderAttachments')
    expect(template).toContain('查看就诊附件')
    expect(template).toContain('查看体检附件')
  })

  it('基础档案摘要进入顶部，详情折叠', () => {
    expect(template).toContain('profileSummary')
    expect(template).toContain('dog-summary')
    expect(template).toContain('name="profile"')
  })
})

describe('设计器 · 爱犬信息命名 / 附件预览 / 历史食谱（2026-10-22）', () => {
  it('面板标题改为「爱犬信息」', () => {
    const editor = stripComments(editorSource)
    expect(editor).toContain('<div class="pane-title">爱犬信息</div>')
    expect(editor).not.toContain('<div class="pane-title">爱犬指导</div>')
  })

  it('附件在当前页弹窗预览，不再新开标签页', () => {
    const panel = stripComments(panelSource)
    const template = templateOf(panel)
    expect(panel).toContain('attachment-preview-dialog')
    expect(panel).toContain('openAttachment(url')
    expect(panel).toContain('attachment-preview-pdf')
    expect(panel).toContain('attachment-preview-image')
    expect(template).not.toContain(':href="url"')
  })

  it('历史订单食谱只展示名称、类型、日期', () => {
    const panel = stripComments(panelSource)
    const template = templateOf(panel)
    expect(template).toContain('历史订单食谱')
    expect(template).toContain('historyRecipes')
    expect(template).toContain('historyKindLabel')
    expect(template).not.toContain('recipeSnapshot')
    expect(template).not.toContain('ingredients')
  })
})
