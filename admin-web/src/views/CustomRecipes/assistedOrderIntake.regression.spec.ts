import { describe, expect, it } from 'vitest'

/**
 * 代客下单 · 带入上次需求 + 狗狗档案抽屉（2026-11-16）
 *
 * 老板原话：
 *   「定制需求如果之前这只狗狗填过，那在这里可以快速呈现/加载吗？
 *     不然每一次都要填一遍？」
 *   「我在代客下单的时候，可能还需要查看这只狗狗的档案资料，
 *     包括健康档案里的附件，比如体检报告、过敏检测报告。」
 *
 * admin-web 的 vitest 是 node 环境（没有 jsdom），页面挂不起来；
 * 所以这里用 `?raw` 读源码断言**接线**，真正的校正规则在
 * `src/utils/__tests__/assistedIntakePrefill.spec.ts` 里真跑。
 *
 * ⚠️ 用 Vite 的 `?raw`，不要用 node:fs：构建的 tsconfig 里没有 node 类型。
 */
import page from './AssistedOrderCreate.vue?raw'
import drawer from './DogArchiveDrawer.vue?raw'
import apiSource from '@/api/customRecipe.ts?raw'
import dogsApiSource from '@/api/dogs.ts?raw'

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const cleanPage = stripComments(page)
const cleanDrawer = stripComments(drawer)
const cleanApi = stripComments(apiSource)
const cleanDogsApi = stripComments(dogsApiSource)

describe('带入上次定制需求 · 接线', () => {
  it('★ 选完狗狗就去读这只狗上一单的答案', () => {
    expect(cleanPage).toContain('customRecipeApi.getDogLastIntake(')
    expect(cleanPage).toContain('normalizeLastIntake(')
    expect(cleanPage).toContain('applyIntakeDraft(')
    // 两个选狗入口（合并搜索卡片 / 代客客户狗卡片）都要触发
    expect(cleanPage).toContain('handleDogSelected(dog.id, changed)')
  })

  it('★ 校正时带上当前份数上限与选项字典（下线选项不能带进表单）', () => {
    expect(cleanPage).toContain('maxQuantity: maxQuantity.value')
    expect(cleanPage).toContain('allowedCurrentFoods:')
    expect(cleanPage).toContain('allowedChangeReasons:')
    expect(cleanPage).toContain('allowedStomach:')
    // 字典还没加载时不能传空数组，否则所有 code 都会被当"已下线"过滤掉
    expect(cleanPage).toContain('foodCodes.length ? foodCodes : undefined')
  })

  it('★ 读失败不能拦住下单（静默，保持空白）', () => {
    // 读失败只把提示条清掉，不弹错、不阻断提交
    expect(cleanPage).toMatch(
      /async function loadLastIntake[\s\S]*?catch \{[\s\S]*?intakePrefill\.value = null/,
    )
    // 静默分支里不能出现错误提示（带入失败不该打扰员工）
    const catchBlock = cleanPage.slice(
      cleanPage.indexOf('async function loadLastIntake'),
    )
    const firstCatch = catchBlock.slice(catchBlock.indexOf('catch {'))
    expect(firstCatch.slice(0, 400)).not.toContain('ElMessage.error')
  })

  it('★ 提示条写清来源日期/单号，并提供「清空重填」', () => {
    expect(cleanPage).toContain('已带入 {{ intakePrefill.dateText }} 那一单的答案')
    expect(cleanPage).toContain('{{ intakePrefill.orderId }}')
    expect(cleanPage).toContain('清空重填')
    expect(cleanPage).toContain('clearIntakePrefill')
    // 提醒"过敏/肠胃会变"，不能让员工以为已经确认过
    expect(cleanPage).toContain('请跟顾客确认一下')
  })

  it('★ 主蛋白与份数对不上时要解释清楚（不能让人以为漏填）', () => {
    expect(cleanPage).toContain('intakePrefill.proteinCleared')
    expect(cleanPage).toContain('主蛋白数量与本次份数对不上')
  })

  it('★ 换狗先清空上一只狗的答案，且旧请求不能覆盖新狗', () => {
    expect(cleanPage).toContain('resetIntakeState()')
    expect(cleanPage).toContain('if (seq !== intakeRequestSeq || form.dogId !== dogId) return')
    // 同一只狗再点一次不重读，避免覆盖员工刚改的内容
    expect(cleanPage).toContain('intakeLoadedForDog.value === dogId')
  })

  it('★ 没有历史时提示条不出现（页面与以前一致）', () => {
    expect(cleanPage).toContain('v-if="intakePrefill"')
    expect(cleanPage).toContain('if (!intake) {')
  })

  it('★ 接口地址与后端一致', () => {
    expect(cleanApi).toContain('`${BASE}/dogs/${encodeURIComponent(dogId)}/last-intake`')
    expect(cleanApi).toContain('getDogLastIntake')
  })
})

describe('狗狗档案抽屉 · 接线', () => {
  it('★ 已选狗狗旁边有「查看档案」按钮，抽屉挂在页面上', () => {
    expect(cleanPage).toContain('查看档案')
    expect(cleanPage).toContain('openDogArchive')
    expect(cleanPage).toContain('<DogArchiveDrawer')
    expect(cleanPage).toContain('v-model="archiveVisible"')
    expect(cleanPage).toContain(':dog-id="archiveDogId"')
  })

  it('★ 抽屉不跑 AI 分析（要秒开）', () => {
    expect(cleanDrawer).toContain('dogApi.getHealthOverview(props.dogId, false)')
    expect(cleanDogsApi).toContain('includeAnalysis ? undefined : { includeAnalysis: \'0\' }')
  })

  it('★ 展示过敏记录与过敏检测报告（含报告原件）', () => {
    expect(cleanDrawer).toContain('过敏检测报告')
    expect(cleanDrawer).toContain('v-for="report in allergyReports"')
    expect(cleanDrawer).toContain('overview.value?.allergyReports')
    expect(cleanDrawer).toContain('report.attachments')
    expect(cleanDrawer).toContain('report.summary')
    expect(cleanDrawer).toContain('report.institution')
  })

  it('★ 展示病史、最近就诊/体检与全部报告原件', () => {
    expect(cleanDrawer).toContain('medicalHistory')
    expect(cleanDrawer).toContain('ongoingConditions')
    expect(cleanDrawer).toContain('recentVisits')
    expect(cleanDrawer).toContain('recentCheckups')
    expect(cleanDrawer).toContain('overview.value?.attachments')
    expect(cleanDrawer).toContain('v-for="(item, index) in attachments"')
    expect(cleanDrawer).toContain('preview-src-list')
  })

  it('★ 只读：要改档案/看 AI 分析就新开完整健康档案页（不丢表单）', () => {
    expect(cleanDrawer).toContain('这里只读')
    expect(cleanDrawer).toContain('打开完整健康档案')
    expect(cleanDrawer).toContain('`/dogs/${encodeURIComponent(props.dogId)}/health`')
    expect(cleanDrawer).toContain("'_blank'")
  })

  it('★ 抽屉开着时切换狗狗要重新读，不能显示上一只狗的档案', () => {
    expect(cleanDrawer).toContain('props.dogId')
    expect(cleanDrawer).toContain('void load()')
    expect(cleanDrawer).toContain('加载狗狗档案失败')
  })
})
