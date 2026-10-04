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
    // 组件在只有一个按钮时自动占满整行；颜色跟随当前标签（2026-10-03）
    expect(source).toContain(':primary-theme="stickyAddTheme"')
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

  it('删除附件要先确认（老板：不然很容易误删）', () => {
    const source = records()

    const remove = source.slice(
      source.indexOf('async function removeAttachment('),
      source.indexOf('async function removeAttachment(') + 1200,
    )
    expect(remove).toContain('uni.showModal({')
    expect(remove).toContain("title: '删除这份附件？'")
    expect(remove).toContain("confirmText: '删除'")
    expect(remove).toContain("cancelText: '先不删'")
    // 没确认就直接 return，绝不先删后问
    expect(remove).toContain('if (!confirmed) {')
  })

  it('底部「新增记录」按标签换色，且动作跟着标签走（2026-10-03 老板提的）', () => {
    const source = page()

    expect(source).toContain('const stickyAddTheme = computed<')
    expect(source).toContain("if (activeHealthTab.value === 'checkup') return 'checkup'")
    expect(source).toContain("if (activeHealthTab.value === 'allergy') return 'allergy'")
    expect(source).toContain("if (activeHealthTab.value === 'vaccine') return 'vaccine'")
    expect(source).toContain("if (activeHealthTab.value === 'weight') return 'weight'")
    expect(source).toContain(':primary-theme="stickyAddTheme"')
    // 动作也按标签分派（体检要建体检记录、过敏带路去排查计划、体重落光标）
    expect(source).toContain('recordsSectionRef.value?.startScan?.()')
    expect(source).toContain("scrollPageToSelector('#allergy-trial')")
    expect(source).toContain('weightSectionRef.value?.focusInput?.()')
    // 体检那条通道用的是当前标签的类型
    const recordsSection = records()
    expect(recordsSection).toContain("createHealthVisitDraft(props.visitKind || 'medical')")
    expect(recordsSection).toContain(":entry-kind=\"props.visitKind || 'medical'\"")
  })

  it('「健康记录」是通栏 Banner（整块上色），「健康分析」入口暂时隐藏', () => {
    const source = page()

    expect(source).toContain('class="health-entry health-entry--records"')
    expect(source).not.toContain('health-entry--analysis')
    expect(source).not.toContain('class="health-entries"')
    // 整块上色：底色渐变 + 白字，不再只靠左边一条色条
    const styles = source.slice(source.indexOf('.health-entry {'))
    expect(styles).toContain('background: linear-gradient(135deg, #2f6b52 0%, #3d8464 100%)')
    expect(styles).not.toContain('border-left: 8rpx solid var(--entry-accent')
    // 页面/接口都还在，只是入口不露出
    expect(source).toContain('function goHealthAnalysis()')
  })

  it('附件上传一次能选多张（老板实测：原来只能一张一张传）', () => {
    const source = records()

    expect(source).toContain('const MAX_ATTACHMENT_PICK = 9')
    expect(source).toContain('function chooseImageFiles()')
    expect(source).toContain('function choosePdfFiles()')
    // 两个选择器都用多选额度，不再写死 count: 1
    const pickers = source.slice(
      source.indexOf('function chooseImageFiles()'),
      source.indexOf('function previewAttachment('),
    )
    expect(pickers).not.toContain('count: 1,')
    expect(pickers).toContain('count: MAX_ATTACHMENT_PICK')
    // 逐个上传并显示进度；不合格的挑出来说清原因，不因为一张坏图全丢
    expect(source).toContain('上传中 ${position + 1}/${accepted.length}')
    expect(source).toContain('rejected.push')
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

/**
 * 识别结果的"可追溯"（2026-10-03 老板的两个问题）。
 *
 * 老板："我们能搞清楚具体是哪一张图片未被识别吗？可以搞清楚到底是哪些项目名称被遮挡吗？"
 * 答：前者靠逐张状态（缩略图 + ✓/✗/！），后者靠"提示里点名到具体项目/行 + 页号前缀"。
 */
describe('识别结果可追溯 · 契约', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('逐张记录识别结果，并在确认卡片上露出来（哪张没识别一眼看到）', () => {
    const source = scan()

    expect(source).toContain("status: 'ok' | 'empty' | 'failed'")
    expect(source).toContain('pageOutcomes.value = pageResults')
    expect(source).toContain('v-for="page in pageOutcomes"')
    // 三态文案
    expect(source).toContain('✗ 没读到内容')
    expect(source).toContain('！没识别成功')
    // 点缩略图能放大看原图
    expect(source).toContain('uni.previewImage({ urls, current: path })')
  })

  it('提示带上"第 N 张"，家长才知道去核对哪一张', () => {
    const source = scan()

    // 每张自己的提示都带张号，并且就摆在缩略图那一排的正下方
    expect(source).toContain('第 {{ item.index }} 张：{{ item.text }}')
    expect(source).toContain('class="pages__warnings"')
    expect(source).toContain('const pageWarnings = computed')
    // 点提示能放大对应的那张原图（一边看图一边核这句话）
    expect(source).toContain('@tap="previewPage(item.path)"')

    expect(source).toContain('没能识别（共 ${failed} 张）')
    // 不再只说"有一张没能识别"
    expect(source).not.toContain('有 ${failed} 张没能识别，可以单独再试或手工补充')
  })

  it('提示词要求点名到具体项目/行，不许写笼统的"部分项目被遮挡"', () => {
    const prompt = readFileSync(
      resolve(process.cwd(), '../backend/src/application/health/health-report-extraction.service.ts'),
      'utf-8',
    )

    expect(prompt).toContain('必须点名到具体项目/行与位置')
    expect(prompt).toContain('不许写"有部分项目名称被遮挡"这种笼统说法')
    // 漏行也要防（老板这次那张血涂片就漏了一行）
    expect(prompt).toContain('逐行读完，不许漏行')
    expect(prompt).toContain('正常色素性红细胞')
  })
})
