import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 实时保存（2026-10-03 老板定）。
 *
 * 老板："无论是 AI 识别自动录入表单，还是手动填入表单，都改成实时保存。
 * 这样就可以把最下面的保存按钮直接删掉。"
 *
 * 自动保存把"忘记点保存"这类丢失消灭了，但它自己也带来两个必须守住的口子：
 *   ① **缺信息的草稿不能硬存**（会往库里灌半条记录）—— 必须在卡片上说清"还差什么"；
 *   ② **改完马上切走**不能丢最后几个字 —— 切标签、隐藏、卸载时必须立刻落库。
 * 这组测试锁的就是这两条，外加"保存按钮真的没了"。
 */
describe('实时保存 · 契约', () => {
  const read = (path: string) =>
    readFileSync(resolve(process.cwd(), path), 'utf-8')

  const page = () => read('src/pages/dog-profile-health/index.vue')
  const records = () => read('src/components/dog-profile/HealthRecordsSection.vue')
  const vaccine = () => read('src/components/dog-profile/VaccineManagementSection.vue')
  const weight = () => read('src/components/dog-profile/WeightManagementSection.vue')

  it('底部保存按钮已删除，只剩「记一条」', () => {
    const source = page()

    expect(source).not.toContain("computed(() => '保存')")
    expect(source).not.toContain('stickyPrimaryDisabled')
    expect(source).toContain(':primary-text="stickySecondaryText"')
    // 组件在只有一个按钮时自动占满整行
    expect(source).toContain('primary-theme="visit"')
  })

  it('切标签 / 页面隐藏 / 卸载时立刻落库（自动保存的 1.2 秒延迟不能吃掉最后几个字）', () => {
    const source = page()

    expect(source).toContain('function flushActiveTabAutoSaves()')
    expect(source).toContain('onHide(')
    expect(source).toContain('onUnload(')
    // 切标签那一刻先 flush，再切
    const tabSwitch = source.slice(
      source.indexOf('function selectHealthTab('),
      source.indexOf('function selectHealthTab(') + 400,
    )
    expect(tabSwitch).toContain('flushActiveTabAutoSaves()')
    // 三个板块都要能被 flush
    expect(source).toContain('recordsSectionRef.value?.flushAutoSaves?.()')
    expect(source).toContain('vaccineSectionRef.value?.flushAutoSaves?.()')
    expect(source).toContain('weightSectionRef.value?.flushAutoSaves?.()')
  })

  it('就诊/体检：改动 1.2 秒后落库，点「完成」/收起卡片立刻落库', () => {
    const source = records()

    expect(source).toContain('const AUTO_SAVE_DELAY_MS = 1200')
    expect(source).toContain('function scheduleAutoSave(')
    expect(source).toContain('function flushAutoSaves()')
    // 字段改动 → 排一次
    expect(source).toContain('scheduleAutoSave(draftRecords.value[index], index)')
    // 点「完成」→ 立刻
    expect(source).toContain('scheduleAutoSave(record, index, { immediate: true })')
  })

  it('缺信息的草稿不硬存，卡片上写清"还差什么"', () => {
    const source = records()

    // 缺信息 → 只写提示，不派发保存
    const run = source.slice(
      source.indexOf('async function runAutoSave('),
      source.indexOf('async function runAutoSave(') + 1800,
    )
    expect(run).toContain('const validationError = recordValidationError(record, index)')
    expect(run).toContain('setAutoSaveNotice(key, \'还差内容，填完自动保存\')')
    // 校验用的是与手动保存同一套规则，不另起一套
    expect(source).toContain('getHealthVisitValidationError(resolveHealthVisitKind(record), record)')
    // 提示可以点：缺信息 → 展开滚过去并说清；失败 → 重试
    expect(source).toContain('function onAutoSaveNoticeTap(')
    expect(source).toContain('void runAutoSave(key)')
  })

  it('保存中也能接着改：存完自动再存最新内容（不再"保存中不许改"）', () => {
    const source = records()

    expect(source).toContain('autoSaveQueue')
    expect(source).toContain('if (autoSaveQueue.size > 0)')
    // 同步完列表后，还是脏的就再排一次
    expect(source).toContain('if (isRecordDirty(record, index) && !isRecordSaving(record, index))')
  })

  it('AI 识别确认后直接落库（不用再点保存）', () => {
    const source = records()

    const scanned = source.slice(
      source.indexOf('function onScanned('),
      source.indexOf('function onScanned(') + 3000,
    )
    expect(scanned).toContain('scheduleAutoSave(record, index, { immediate: true })')
  })

  it('疫苗：只有"疫苗名 + 接种日期"齐了才存，缺什么写什么', () => {
    const source = vaccine()

    expect(source).toContain('function autoSaveBlockReason(')
    expect(source).toContain("return '还差疫苗名称，填完自动保存'")
    expect(source).toContain("return '还差接种日期，填完自动保存'")
    // 手动保存按钮下线
    expect(source).not.toContain('>保存</button>')
    expect(source).toContain('vaccine-card__autosave')
  })

  it('体重趋势图：画布必须带上组件实例，否则只会剩一块白框（老板实测）', () => {
    const source = weight()

    // 画布在自定义组件里 → createCanvasContext 少传实例就找不到画布，draw() 静默失败
    expect(source).toContain('uni.createCanvasContext(\'weightChart\', componentInstance)')
    expect(source).toContain('const componentInstance = getCurrentInstance()?.proxy')
    // 节点就绪要等一次渲染：画一次 + 重试
    expect(source).toContain('function drawChartWithRetry()')
  })

  it('体重：保存成功后把"刚记下的数值"显出来（输入框会清空，别让人以为丢了）', () => {
    const source = weight()

    expect(source).toContain('lastSavedText.value = `${newWeight} kg · ${formData.value.recordDate}`')
    expect(source).toContain('已记下 {{ lastSavedText }}，见下方「历史记录」')
  })

  it('体重：新增块关闭时不渲染空卡片', () => {
    const source = weight()

    expect(source).toContain('v-if="!embedded || showAddEntry" class="health-card weight-record-card"')
  })

  it('体重：失焦才算一条，绝不会把打到一半的数字存进去', () => {
    const source = weight()

    expect(source).toContain('@blur="onWeightInputBlur"')
    expect(source).toContain('async function flushAutoSaves()')
    // 空输入直接返回 —— 不存半截数据
    expect(source).toContain("if (!String(weightInputText.value || '').trim()) {")
  })
})
