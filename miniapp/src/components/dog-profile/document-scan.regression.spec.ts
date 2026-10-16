import { describe, expect, it } from 'vitest'
import { stripComments } from '../../architecture/source-text'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * AI 录入扩展（2026-10-01，第六期）。
 *
 * 老板第 4 条：拍照识别覆盖到除过敏报告以外的体检报告和疫苗本。
 * 老板第 5 条：识别后不需逐条确认，确认一次就自动录入表单。
 * 老板第 6 条：顾客可选 AI 识别，也可以手动填写。
 */
describe('拍照录入 · 组件', () => {
  function readScan() {
    return stripComments(
      readFileSync(
        resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
        'utf-8',
      ),
    )
  }

  it('第 4 条：支持四类文档', () => {
    const scan = readScan()

    expect(scan).toContain("'ALLERGY_REPORT' | 'CHECKUP_REPORT' | 'VACCINE_BOOK' | 'MEDICAL_RECORD'")
  })

  it('第 5 条：疫苗本**逐条确认后才入库**；其余四类仍是一次确认（2026-10-08 老板改）', () => {
    const scan = readScan()

    /*
     * ⚠️ 这条原来是"识别后只确认一次，没有逐条勾选"（老板 2026-09 的口径）。
     * 2026-10-08 他改了：**"只有当用户一个记录一个记录的确认了之后，他才应该入库"**，
     * 同时要求"不要一条一屏，要优化一屏多条的信息量和交互"。
     */
    // 疫苗本：逐条确认 + 只提交确认过的那几条
    expect(scan).toContain('逐条确认后保存')
    // 老板 2026-10-09：这句改成红色高亮的"务必人工确认"
    expect(scan).toContain('AI识别，为防止模型的幻觉，请您务必人工确认一次！')
    expect(scan).not.toContain('一条一条核对，确认过的才会存进档案')
    expect(scan).toContain('@tap="acceptConfirmed"')
    expect(scan).toContain('rowConfirmed')
    expect(scan).toContain('保存我确认的')

    // 其余四类（只合成一条记录）：仍然是一次确认，按钮精简成「确认」
    // （文案 2026-10-08 审计第 6 块改成"确认后就存进档案"——不在那儿填表单）
    expect(scan).toContain('识别到以下内容，确认后就存进档案')
    expect(scan).toContain('@tap="accept"')
    expect(scan).not.toContain('确认，填入表单')
  })

  it('第 5 条：识别的结果只填表、不直接保存（顾客还能改、还能不存）', () => {
    const scan = readScan()

    // 组件只 emit，不调用任何保存接口
    expect(scan).toContain("emit('scanned'")
    expect(scan).not.toContain('createHealthRecord')
    expect(scan).not.toContain('saveRecord')
    // 识别把握**一个字都不给顾客看**：
    // 2026-10-02 去掉"中/高"，2026-10-04 老板拍板连"低"的那句也不要
    expect(scan).not.toContain('识别把握：')
    expect(scan).not.toContain('填完请对着原件核一遍')
    expect(scan).not.toContain('lowConfidenceHint')
    expect(scan).not.toContain('confirm__confidence')
  })

  it('第 6 条：明确写着也可以手填，且任何一步失败都不挡人', () => {
    const scan = readScan()

    expect(scan).toContain('也可以直接手填')
    // 失败时降级提示，不是死路
    // 2026-10-01：失败文案统一走 resolveHealthScanErrorMessage ——
    // 腾讯云自己的报错（如"服务未开通，请前往控制台…"）不能直接弹给顾客
    expect(scan).toContain('resolveHealthScanErrorMessage(error?.message)')
  })

  it('不做医学判断：界面只展示"照抄来的"字段', () => {
    const scan = readScan()

    /*
     * ⚠️ 2026-10-16 修：这一行原来写的是 `toContain('识别把握')` —— 而"识别把握"
     *    只出现在**注释**里（注释在解释"这个字段为什么被去掉"）。
     *    也就是说它一直靠注释混过去、什么都没验证 ✗。
     *    现在这个文件统一先剥注释再断言，它立刻暴露了。
     *
     * 本条真正要守的是：组件的**界面**里不许出现把握度/诊断性措辞。
     */
    expect(scan).not.toContain('识别把握')
    expect(scan).not.toContain('置信度')
    expect(scan).not.toContain('可能是')
    expect(scan).not.toContain('建议治疗')
  })

  it('识别结果为空时不假装成功', () => {
    const scan = readScan()

    expect(scan).toContain('没识别到内容，请换一张更清晰的图片')
  })

  it('一次最多选 9 张（微信上限），逐张识别后合并成一份确认结果', () => {
    const scan = readScan()

    expect(scan).toContain('count: 9')
    /**
     * 2026-10-03 改：不再要微信的 compressed（只有 1280 宽，化验数值会读错），
     * 改成拿原图 + 自己压到 2000 宽再上传。细节见 utils/scan-image.ts。
     */
    expect(scan).toContain('sizeType: SCAN_IMAGE_SIZE_TYPE')
    // 相册里同一张图选两次没必要识别两次
    expect(scan).toContain('new Set(paths.filter(Boolean))')
    expect(scan).toContain('识别中 ${index + 1}/${filePaths.length}…')
  })

  it('识别出的记录带上顾客拍的原图当附件（识别只是抄字，原图才是凭证）', () => {
    const scan = readScan()

    // 后端返回的 drafts.attachments 是空数组，图片地址只有上传这一步知道
    expect(scan).toContain('attachments: [uploaded.url]')
    // 多页合并时附件要跨页汇总（buildSingleScannedRecord 里做，见 scan-record-merge.spec）
    expect(scan).toContain('buildSingleScannedRecord')
  })

  it('多张图按类型分组：同类型合成一条，不同类型各成一条（疫苗本不合并）', () => {
    const scan = readScan()

    expect(scan).toContain('mergeScannedReportDrafts')
    expect(scan).toContain('draftsByType')
    // 疫苗本一张本子读出多条接种记录，合并会把几针并成一针
    expect(scan).toContain("type === 'VACCINE_BOOK' ? list : mergeScannedReportDrafts(list)")
    // 类型按"多数页"定只用于文案，真正的类型贴在每条草稿上
    expect(scan).toContain('resolveScannedDocumentType')
    expect(scan).toContain('__documentType: type')
  })

  it('识别结果里不再出现内部状态文字（2026-10-02 老板第二次实测提的）', () => {
    const scan = readScan()
    // 只看**渲染出来的模板**（注释里提到这些词是允许的）
    const template = scan
      .slice(scan.indexOf('<template>'), scan.indexOf('</template>'))
      .replace(/<!--[\s\S]*?-->/g, '')

    // 老板原话："记到就诊记录 / 识别为病历 / 本次共 5 张图片合成一条 /
    // 5 张原图会一起存进这条记录 / 报告上的动物名 seven 这些内部信息就不要放了"
    expect(template).not.toContain('记到：')
    expect(template).not.toContain('识别为：')
    expect(template).not.toContain('合成 1 条记录')
    expect(template).not.toContain('张原图会一起存进这条记录')
    expect(template).not.toContain('报告上的动物名：')
    // 但"名字真的对不上"和"有页没能用上"还要说（那两条是家长要做的事）
    expect(template).toContain('名字对不上')
    expect(template).toContain('ignoredPagesNote')
  })
})

  it('化验数据在确认卡片上分块展示（报告名 / 项目 / 数值分层）', () => {
    const scan = readScanFile()

    expect(scan).toContain("import LabValuesView from './LabValuesView.vue'")
    // 化验那一行走分块组件（push 的第三个参数 = rich 标记）
    expect(scan).toContain("push('化验数据', draft.labValues, 'lab')")
    expect(scan).toContain('<LabValuesView')
  })

  it('名字核对忽略大小写/空格/标点（seven vs Seven 不再提醒）', () => {
    const scan = readScanFile()

    expect(scan).toContain('const normalize = (value: string) =>')
    expect(scan).toContain('.toLowerCase()')
    // 用归一化后的名字比较，而不是原字符串
    expect(scan).toContain('normalize(name) !== normalizedCurrent')
  })

  it('入口类型由 props 传进来，默认就医', () => {
    const scan = readScanFile()
    expect(scan).toContain("entryKind?: 'medical' | 'checkup'")
    expect(scan).toContain("entryKind: 'medical',")
  })

function readScanFile() {
  return stripComments(
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    ),
  )
}

describe('拍照录入 · 接线', () => {
  it('病历与体检报告挂在「病历/检查」板块，入口合并成底部一个「新增记录」', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(section).toContain('<HealthDocumentScan')
    // 2026-10-02：扫描组件改成常驻挂载 + display:none 控制显隐
    // （原来懒挂载 → 第一次点「从相册选择」时 ref 还是空的，点了没反应）
    expect(section).toContain('v-if="isVisitMode && dogId"')
    expect(section).toContain("'scan-entry--hidden': !scanActive")
    // 2026-10-01 老板要求：三个入口并成一个，且**不再让顾客先选文档类型** ——
    // 传 AUTO 由后端判断，两个选项就合并成了「从相册选择（自动识别）」
    expect(section).toContain("itemList: ['手动填写', '从相册选择（自动识别检查报告）']")
    expect(section).toContain('function openAddRecordChooser()')
    expect(section).toContain('function startScan()')
    expect(section).toContain('document-type="AUTO"')
    expect(section).toContain('hide-trigger')
    // 判成别的资料（过敏报告 / 疫苗本）时不硬填成病历，提示去对应板块
    expect(section).toContain('这看起来是过敏原检测报告，请到「过敏」板块上传')
    expect(section).toContain('这看起来是疫苗本，请到「疫苗」板块上传')
  })

  const readScanFile = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('确认卡片与表单字段一一对应：没有兽医，叫法也一致（2026-10-02 老板提的）', () => {
    const scan = readScanFile()
    const block = scan.slice(
      scan.indexOf("documentType === 'CHECKUP_REPORT'"),
      scan.indexOf("push('过敏原'"),
    )

    // 表单里已经删掉的字段不该再出现在识别结果里
    expect(block).not.toContain('兽医')
    expect(block).not.toContain('draft.veterinarian')
    // 表单里叫什么，这里就必须叫什么（2026-10-02 定稿）
    expect(block).toContain("push('医生诊断', draft.diagnosis)")
    expect(block).toContain("push('医嘱', draft.treatment)")
    expect(block).toContain("push('这次做的检查', draft.exams)")
    expect(block).toContain("push('体征', draft.vitals)")
    expect(block).toContain("push('补充说明', draft.notes)")
    // 表单里已经删掉的字段不该再出现在卡片上
    expect(block).not.toContain("push('处理与提醒'")
  })

  it('「重新拍」改成「重新上传」（走的本来就是相册，不是相机）', () => {
    const scan = readScanFile()

    expect(scan).toContain('>重新上传</text>')
    expect(scan).not.toContain('>重新拍</text>')
  })

  it('后端说"这不是宠物医疗资料"时不参与类型票选，原话直接给顾客看', () => {
    const scan = readScanFile()

    expect(scan).toContain("type !== 'NOT_MEDICAL'")
    expect(scan).toContain('collectedWarnings[0] ||')
  })

  it('没识别到内容时给一块看得见的提示，不是一闪而过的 toast（2026-10-02 老板提的）', () => {
    const scan = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

    expect(scan).toContain('class="failure"')
    expect(scan).toContain('这次没有识别到内容')
    expect(scan).toContain('{{ failureNotice }}')
    // 失败路径改成写面板，不再只弹 toast
    const catchBlock = scan.match(/\} catch \(error: any\) \{[\s\S]*?\} finally \{/)?.[0] || ''
    expect(catchBlock).toContain('failureNotice.value = resolveHealthScanErrorMessage')
    expect(catchBlock).not.toContain('uni.showToast')
  })

  it('没用上的图片立刻从 COS 删掉（老板担心白占空间）', () => {
    const scan = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

    // 每张图传完就记下来
    expect(scan).toContain('uploadedUrls.value.push(uploadedUrl)')
    // 这张没读出内容 → 删
    expect(scan).toContain('await dropUploadedFile(uploadedUrl)')
    // 「重新上传」＝整轮结果丢掉 → 传上去的都删
    const discardBlock = scan.match(/function discard\(\)[\s\S]*?\n\}/)?.[0] || ''
    expect(discardBlock).toContain('leftovers.forEach')
    // 确认填入表单的图不能删（记录保存后还要用）
    const acceptBlock = scan.match(/function accept\(\)[\s\S]*?\n\}/)?.[0] || ''
    expect(acceptBlock).not.toContain('dropUploadedFile')
    expect(acceptBlock).toContain('uploadedUrls.value = []')
  })

  it('疫苗本挂在「疫苗」板块（2026-10-15 起挂在 VaccineTab 下）', () => {
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/vaccine/VaccineTab.vue'),
      'utf-8',
    )
    const next = stripComments(
      readFileSync(
        resolve(process.cwd(), 'src/components/vaccine/NextCard.vue'),
        'utf-8',
      ),
    )

    expect(vaccine).toContain('<HealthDocumentScan')
    expect(vaccine).toContain('document-type="VACCINE_BOOK"')
    // 疫苗侧把它**当识别服务用**：确认页是疫苗自己的 ScanConfirm（只有名称 + 日期两列）
    expect(vaccine).toContain('defer-confirm')
    expect(vaccine).toContain("import ScanConfirm from './ScanConfirm.vue'")
    /*
     * 2026-10-16 老板："下一针窗口中，取消掉上传疫苗本的按钮，只保留记录这一针" ——
     * 这张卡不再放上传入口；上传疫苗本 / 报告在底部固定栏（全局入口）。
     */
    expect(next).not.toContain('上传疫苗本')
    expect(next).toContain('记录这一针')
  })

  it('过敏报告那条路搬去了定制食谱，仍然走同一个识别接口', () => {
    const allergy = readFileSync(
      resolve(process.cwd(), 'src/components/custom-recipe/AllergyScanBlock.vue'),
      'utf-8',
    )

    // 仍然调用同一个识别接口；不传 documentType 即走缺省的过敏报告
    expect(allergy).toContain('extractHealthReport')
  })

  it('API 层把 documentType 与 drafts 暴露出来', () => {
    const api = stripComments(readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8'))

    expect(api).toContain('documentType?')
    expect(api).toContain('drafts: Record<string, any>[]')
  })
})

/**
 * 一次传了「化验单 + 门诊病历」时的数据丢失（2026-10-02 老板实测发现）。
 *
 * 面包那次：8 张里 6 张成功，其中 4 张化验单判成体检报告、2 张判成病历
 * （门诊病历里写着"膀胱结石、膀胱炎"和医嘱、用药）。
 * 原来按多数票算成"体检"，保存时只提交体检字段 —— 诊断、医嘱、用药全丢了。
 */
describe('混合资料不能互相吃掉', () => {
  const readScan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('按判定出来的类型分组收集，各组各自合并', () => {
    const scan = readScan()

    /*
     * 2026-10-08：分组与合并从"内联在 scanAll 里"抽成了
     * collectDraftsByType() + mergePageDrafts() —— 因为"单独重传某一页"
     * 必须用同一套逻辑重算。行为不变：按判定出来的类型分组，各组各自合并。
     */
    expect(scan).toContain('function collectDraftsByType()')
    expect(scan).toContain('const bucket = map.get(page.type) || []')
    expect(scan).toContain('function mergePageDrafts(pages:')
    expect(scan).toContain('for (const [type, list] of draftsByType.entries())')
    expect(scan).toContain("const targetType = props.entryKind === 'checkup' ? 'CHECKUP_REPORT' : 'MEDICAL_RECORD'")
  })

  it('每条草稿带着自己的类型，确认卡片按它渲染、父组件按它建记录', () => {
    const scan = readScan()
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(scan).toContain('__documentType: type')
    expect(scan).toContain('function draftDocumentType(draft: Record<string, any>)')
    // 卡片不再写"识别为：X"（内部状态），但每条草稿的类型标记仍在
    expect(scan).toContain('__documentType')
    // 父组件：有自带类型就按它走，不能一律用整批类型
    expect(section).toContain('const draftType = String(draft?.__documentType || \'\').toUpperCase()')
    expect(section).toContain("draftType === 'CHECKUP_REPORT' || draftType === 'IMAGING'")
  })

  it('化验单数值要求逐项一行、以报告名开头（一堵数字墙没人看得下去）', () => {
    const service = readFileSync(
      resolve(
        process.cwd(),
        '../backend/src/application/health/health-report-extraction.service.ts',
      ),
      'utf-8',
    )

    expect(service).toContain('逐项一行')
    expect(service).toContain('不要把几十项用分号串成一行'.replace('不要把', '**不要**把'))
  })
})

/**
 * 动物名核对 + 化验数据独立成栏（2026-10-02 老板批准）。
 */
describe('动物名提醒与化验数据', () => {
  const readScan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('报告上的动物名与当前狗狗不一致时提醒，但**不拦保存**', () => {
    const scan = readScan()

    // 读出来、显示出来
    expect(scan).toContain('reportedPatientNames')
    // 不一致时的提醒里必须写出"报告上写的是谁"（独立的"报告上的动物名："那行已按老板要求下线）
    expect(scan).toContain('报告上写的动物名是「')
    // 不一致 → 一块黄色提醒，措辞里写清"由你决定"
    expect(scan).toContain('patientNameMismatch')
    expect(scan).toContain('名字对不上')
    expect(scan).toContain('存不存进这份档案由你决定')
    // 只提醒：校验里不许因为名字不同就报错
    expect(scan).not.toContain('请确认报告属于这只狗后再保存')
  })

  it('化验数据独立成一栏，不再混进检查结论', () => {
    const scan = readScan()
    const utils = stripComments(readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8'))
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 确认卡片里单独一行
    expect(scan).toContain("push('化验数据', draft.labValues, 'lab')")
    // 字段表里两类都有这一栏（2026-10-02 老板定：就诊里传的化验单，
    // 数字就落在这条就诊记录里，不再另开一条体检记录）
    expect((utils.match(/labValuesKey: 'labValues'/g) || []).length).toBe(2)
    // 表单里有这一格（统一渲染器：标签 + 编辑按钮 + 值/输入框）
    expect(section).toContain('config.labValuesLabel')
    expect(section).toContain('function visitLabValuesKey')
    // 保存时要提交
    expect(utils).toContain('labValues: normalizeOptionalText(record?.labValues)')
  })

  it('卡片标题不再拿数字墙当标题', () => {
    const utils = stripComments(readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8'))

    expect(utils).toContain('shortPrimary')
    expect(utils).toContain("'含化验数据'")
  })
})

/**
 * 上传的照片全部显示预览（2026-10-06 老板）。
 *
 * 原话："在疫苗的 AI 识别内容表单中。把上传的所有的照片的预览图全部显示出来。"
 */
describe('拍照录入 · 上传的照片全部显示预览（2026-10-06）', () => {
  function readScan() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )
  }

  it('🔴 只传一张也要显示预览（原来卡在"多于一张才显示"）', () => {
    const source = readScan()

    // 原来这一排是 `v-if="pageOutcomes.length > 1"` ——
    // 只传 1 张时整个不出现，顾客看不到自己刚拍的那张，
    // 也就没法和识别出来的字对照。
    expect(source).toContain('v-if="pageOutcomes.length > 0"')
    expect(source).not.toContain('<view v-if="pageOutcomes.length > 1" class="pages">')
  })

  it('每一张上传的图都有记录（成功 / 没读到 / 失败都算）', () => {
    const source = readScan()

    // pageResults 在成功、空、失败三条路上都 push，
    // 所以"全部显示"是真的全部，不是只有识别成功的那些
    expect(source).toContain("status: 'ok'")
    expect(source).toContain("status: 'empty'")
    expect(source).toContain("status: 'failed'")
    expect(source).toContain('pageOutcomes.value = pageResults')
  })

  it('只有一张时给一个大一点的预览 —— 那是唯一能对照的原图', () => {
    const source = readScan()

    expect(source).toContain('pages__item--single')
    expect(source).toContain("{{ pageOutcomes.length > 1 ? '这几张的结果' : '上传的照片' }}")
  })

  it('点缩略图能放大看原图', () => {
    const source = readScan()

    expect(source).toContain('@tap="previewPage(page.path)"')
    expect(source).toContain('uni.previewImage({')
  })
})

/**
 * 疫苗本：逐条确认后才入库（2026-10-08 老板定）
 *
 * 老板的原话：
 *   · "只有当用户一个记录一个记录的确认了之后，他才应该入库"
 *   · "确认页的字段那肯定要能直接修改"
 *   · "一条一屏的话，交互没有一屏多条操作成本低，我们需要着重的去优化
 *      一屏多条的信息量和交互"
 *
 * 另外他点出一个前提问题："AI 模型也有可能无法精准的判断哪些是高风险的问题，
 * 它也有可能乱说自己没把握的是哪几条" —— 所以：
 *   · 判"拿不准"只用**我们自己算得出来**的信号（名字没认出来 / 日期缺失或涂改 /
 *     病种空），**不用模型自评的 confidence**；
 *   · 而且**每一条都要家长过一遍**（不是只问可疑的），可疑的只是排前面。
 */
describe('疫苗本 · 逐条确认后才入库（2026-10-08）', () => {
  const readScan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('🔴 没确认的条目不提交（只 emit 确认过的那些）', () => {
    const scan = readScan()

    /*
     * ⚠️ 2026-10-09 改成"收集 + 把没确认的留在页面上"：
     * 老板实测踩到过 —— 识别 7 条、"拿不准"的 3 条排最前面，
     * 他确认那 3 条就保存了，剩下 4 条被**静默丢掉** ✗
     * （"其他的已经识别的接种记录去哪里了呢？"）。
     */
    expect(scan).toContain('const picked: Record<string, any>[] = []')
    expect(scan).toContain("uni.showToast({ title: '还没有确认任何一条'")
    expect(scan).toContain('还有 ${remaining} 条没确认')
  })

  it('🔴 判"拿不准"只用我们自己算得出来的信号，不许用模型自评', () => {
    const scan = readScan()

    // 三个可靠信号
    expect(scan).toContain('名字没认出来，请核对或从产品库选一支')
    expect(scan).toContain('接种日期没读出来，请补上')
    expect(scan).toContain('日期有涂改，请核对')
    expect(scan).toContain('没读出防哪些病，请勾一下')

    // 模型自评的 confidence 不参与"要不要问"的判断
    const careFn = scan.slice(scan.indexOf('function rowCare'), scan.indexOf('function rowBlockReason'))
    expect(careFn).not.toContain('confidence')
  })

  it('🔴 缺东西的那条不让确认（点确认自动展开让它补）', () => {
    const scan = readScan()

    expect(scan).toContain('还差疫苗名')
    expect(scan).toContain('还差接种日期')
    expect(scan).toContain('还差病种')
    expect(scan).toContain('先把它补上')
  })

  it('一屏多条：一行给全"要核对的三样"，可疑的排最前面', () => {
    const scan = readScan()

    // 一行里的三样
    expect(scan).toContain('rowName(drafts[index])')
    expect(scan).toContain('rowComponentsText(drafts[index])')
    expect(scan).toContain('已确认 {{ confirmedCount }} / 共 {{ drafts.length }} 条')

    // 顺序只在识别完成时算一次（勾着勾着行不许跳）
    expect(scan).toContain('rowOrder.value = drafts.value')
    expect(scan).toContain('const careA = rowCare(a).care ? 0 : 1')
  })

  it('就地能改三样：名字（产品库候选）/ 日期 / 病种', () => {
    const scan = readScan()

    expect(scan).toContain('@input="onRowNameInput(index, $event)"')
    expect(scan).toContain('@tap="pickRowName(index, item)"')
    expect(scan).toContain('@change="onRowDateChange(index, $event)"')
    expect(scan).toContain('@tap="toggleRowComponent(index, option.value)"')
    // 病种候选由疫苗板块传进来（前端不复制一份闭集）
    expect(scan).toContain('componentOptions?: { value: string; label: string }[]')
  })

  it('疫苗侧把病种候选交给录入器（前端不复制一份闭集）', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/vaccine/VaccineTab.vue'),
      'utf-8',
    )

    // 词表来自接口，兜底只有 domain/vaccine/catalog.ts 那一份
    expect(section).toContain(':component-options="componentOptions"')
    expect(section).toContain('readComponentOptions(catalog.value)')
  })
})

/**
 * 老板 2026-10-08 要的四件事里，属于拍照/识别这一块的三件：
 *   ① 单独重传某一页（以前界面写着"可以单独重传一次"，其实没这个功能）
 *   ② 存完整批回执小结
 *   ④ PDF / Word 文档上传（他："就诊报告、体检报告、过敏检测报告，
 *      有可能是 PDF 或者是 Word 文档，可能需要支持进入微信、选择文档上传"）
 */
describe('单独重传某一页（2026-10-08）', () => {
  const readScan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('🔴 每一张都能单独换一张（不再是句空话）', () => {
    const scan = readScan()

    expect(scan).toContain('@tap.stop="rescanPage(page.index - 1)"')
    expect(scan).toContain('async function rescanPage(pageIndex: number)')
    // 只选一张
    expect(scan).toContain('function pickOneImage(): Promise<string>')
  })

  it('🔴 只替换这一页、并按新的页集合重新合并（不能叠加成两条）', () => {
    const scan = readScan()

    expect(scan).toContain('nextPages[pageIndex] = {')
    expect(scan).toContain('pageDraftCache = nextPages')
    expect(scan).toContain('renderMergedResult()')
    // 换完之后把这一页原来那张图从 COS 删掉
    expect(scan).toContain('void dropUploadedFile(oldUrl)')
  })

  it('🔴 换上来这张也读不出内容时，保留原来的结果（不能把顾客已有的弄丢）', () => {
    const scan = readScan()

    expect(scan).toContain('mergePageDrafts(nextPages).merged.length === 0')
    expect(scan).toContain('这一张还是没读出内容，原来的结果先留着')
  })

  it('按钮就在每一张下面，不需要再多一句说明（老板 2026-10-09 让删掉那句文案）', () => {
    const scan = readScan()

    expect(scan).toContain('@tap.stop="rescanPage(page.index - 1)"')
    expect(scan).not.toContain('就点它下面的「重传这一张」换一张')
    expect(scan).not.toContain('单独重传一次，或直接手工补充')
  })
})

describe('选文档上传（PDF / Word，2026-10-08）', () => {
  const readScan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('走微信的「从聊天里选文件」，只收 PDF / docx', () => {
    const scan = readScan()

    expect(scan).toContain('chooseMessageFile')
    expect(scan).toContain("extension: ['pdf', 'docx']")
    expect(scan).toContain('async function startDocumentScan()')
    // 文档一次一份，不走多页累加
    expect(scan).toContain('pageResultsCache = [')
  })

  it('英文环境/不支持时给一句能懂的话，而不是崩掉', () => {
    const scan = readScan()

    expect(scan).toContain('当前环境不支持选文档，请在手机微信里打开')
  })

  it('文档没有缩略图，就显示文件名那一格', () => {
    const scan = readScan()

    expect(scan).toContain('pages__thumb--file')
    expect(scan).toContain('fileName?: string')
  })

  it('疫苗板块与病历/检查板块都能调起它，页面菜单里有这一项', () => {
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/vaccine/VaccineTab.vue'),
      'utf-8',
    )
    const records = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    // 就诊/体检/过敏三类仍然可以从底部选"PDF / Word 文档"
    expect(records).toContain('function startDocumentScan()')
    // 疫苗侧没有这条路（原型只有两个明面按钮，且疫苗本是纸质小本）——
    // 见 vaccine-tab.regression.spec.ts 里的说明
    expect(vaccine).not.toContain('startDocumentScan')
    expect(page).toContain("'选 PDF / Word 文档（先发到微信里）'")
    expect(page).toContain('startDocumentScan?.()')
  })
})


/**
 * 异常路径：**识别结果还没确认就离开**（2026-10-08）
 *
 * ⚠️ 这是"逐条确认后才入库"带来的新情况 —— 确认之前那几条只在内存里，
 * 切标签会把板块整个销毁，不拦就是**静默丢数据** ✗
 * （以前识别完立刻自动保存，所以没有这个问题。）
 */
describe('识别结果没确认就离开 · 要拦一下（2026-10-08）', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('组件能报出"还有几条没确认"', () => {
    const source = scan()

    expect(source).toContain('function unconfirmedDraftCount(): number')
    expect(source).toContain('return showConfirm.value ? drafts.value.length : 0')
  })

  it('确认页开着时拦住"点返回"（微信的离开确认弹窗）', () => {
    const source = scan()

    expect(source).toContain('function syncLeaveGuard()')
    expect(source).toContain('enableAlertBeforeUnload')
    expect(source).toContain('识别结果还没确认，现在离开就丢掉啦')
    // 拿不到这个能力时静默跳过
    expect(source).toContain('api.enableAlertBeforeUnload?.({')
  })

  it('页面切标签时也要拦（这个守卫一定在，不依赖上面那个能力）', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('unconfirmedDraftCount?.()')
    expect(page).toContain('识别结果还没确认')
    expect(page).toContain('现在切走就会丢掉')
  })

  it('两个板块都把这件事透给页面', () => {
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/vaccine/VaccineTab.vue'),
      'utf-8',
    )
    const records = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    /*
     * 2026-10-15 起疫苗侧的那一份在 VaccineTab 自己手上 ——
     * 识别结果交给它自己的确认页（ScanConfirm），数就是那几个待确认的行。
     */
    expect(vaccine).toContain('unconfirmedDraftCount: () => scanRows.value.length')
    expect(records).toContain('unconfirmedDraftCount: () => scanRef.value?.unconfirmedDraftCount?.() ?? 0')
  })
})


/**
 * 老板 2026-10-09 实测报的三个问题（都在这一版里修）
 */
describe('识别结果 · 三个实测问题（2026-10-09）', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('🔴 没确认的那几条**留在页面上**，不再静默丢掉', () => {
    const source = scan()

    expect(source).toContain('const remaining = drafts.value.length - picked.length')
    expect(source).toContain('remaining,')
    // 留在页面上的那些，图片还得用，不能跟着一起清掉
    expect(source).toContain('uploadedUrls.value = []')
    expect(source).toContain('renderMergedResult()')
  })

  it('给出红色高亮的人工确认提示（模型会编细节，无法根除）', () => {
    const source = scan()

    expect(source).toContain('AI识别，为防止模型的幻觉，请您务必人工确认一次！')
    // 红色高亮
    expect(source).toContain('.rows__hint {')
    expect(source).toContain('color: #c0392b;')
  })

  it('模型说"没看清/被遮挡"的行，也排到最前面让家长核', () => {
    const source = scan()

    expect(source).toContain('/没看清|看不清|遮挡|反光|模糊/')
    expect(source).toContain('这行有一处没看清，请照本子核一下')
  })

  /*
   * 「扫描入库后不自动展开卡片」那一条随旧记录板块一起删除（2026-10-15）——
   * 它钉的是 VaccineManagementSection 里 expandedIndex 这个实现细节，
   * 那个板块已经不在新版里了。新版的行为由下面这条盯：
   * **存进去的那几条不重复存，剩下的留在页面上**（不静默丢数据）。
   */
  it('保存识别结果时：存进去的不重复存，没存上的留在这一页', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/vaccine/VaccineTab.vue'),
      'utf-8',
    )

    expect(section).toContain('scanRows.value = rows.slice(saved)')
    expect(section).toContain('saved += 1')
  })
})

/**
 * 针对"认错成同一牌子的另一支苗"的一键改对（2026-10-09）
 *
 * 老板实测的原话：贴纸是「宠必威锐必威」，模型读成了「英特威优免康」✗
 * —— 两支都是真实存在的产品，提示词里已经写明"照抄品牌名"，它照样会串。
 * 所以除了风险提示，再给一条**一键改对**的路：
 * 识别的名字命中产品库时，把**同一牌子的其他几支**摆在旁边。
 */
describe('同一牌子的其他几支 · 一键改对（2026-10-09）', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('确认页行内给出"同一个牌子的其他几支"', () => {
    const source = scan()

    expect(source).toContain('function rowSameBrandAlternatives(index: number): string[]')
    expect(source).toContain('同一个牌子的其他几支：')
    // 点一下就换成那一支
    expect(source).toContain('@tap="pickRowName(index, item)"')
  })

  it('产品库由疫苗板块传下来（前端不复制一份）', () => {
    const source = scan()
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/vaccine/VaccineTab.vue'),
      'utf-8',
    )

    expect(source).toContain('catalogProducts?: { name: string; brand?: string; manufacturer?: string }[]')
    // 疫苗侧只用**对外字段**那一份（接口下发），识别服务与录入器共用同一个来源
    expect(section).toContain('readCatalogProducts(catalog.value)')
    expect(section).toContain(':products="catalogProducts"')
  })

  it('模型说"日子没看清"的行也会被标出来（编出来的日子比空着更糟）', () => {
    const scanSource = scan()
    const backend = readFileSync(
      resolve(process.cwd(), '../backend/src/application/health/health-report-extraction.service.ts'),
      'utf-8',
    )

    expect(scanSource).toContain('/没看清|看不清|遮挡|反光|模糊/')
    // 2026-10-09 提示词改写（老板实测"生产日期被当成注射日期"）—— 断言跟着换代，
    // 守的还是同一件事：**不许编日子、不许拿别的日期顶上** ✓
    expect(backend).toContain('只写到年月的')
    expect(backend).toContain('没写注射日期')
  })
})


/**
 * 「重新上传」与「重传这一张」到底重不重复（老板 2026-10-09 让核的）
 *
 * 核对结果：
 *   · 图片那一批 —— 重复。每一张下面都有「重传这一张」（只换那一张，别的结果不动），
 *     底部那个"整批丢掉重来"就没有必要了 → **删掉**；
 *   · 文档（PDF / Word）那一批 —— **不重复**：文档那格没有「重传这一张」，
 *     删掉底部按钮就等于没有退路 → **留着**；
 *   · 整批失败时 —— 失败面板里另有「重新上传」（那时没有别的出路）→ 留着。
 */
describe('「重新上传」只在该有的时候出现（2026-10-09）', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('结果页底部：图片批次不再有「重新上传」，文档批次保留', () => {
    const source = scan()

    expect(source).toContain('const hasDocumentPage = computed(')
    expect(source).toContain("pageOutcomes.value.some((page) => !page.path)")
    expect(source).toContain('<text v-if="hasDocumentPage" class="confirm__discard" @tap="discard">重新上传</text>')
  })

  it('失败面板里的「重新上传」保留（整批失败时唯一的出路）', () => {
    const source = scan()

    expect(source).toContain('<text class="confirm__discard" @tap="discard">重新上传</text>')
  })
})

/**
 * 产品名"再看一眼图"的复核（2026-10-09 老板定）
 *
 * 老板："我们可以让模型没有触发条件的再审一遍原图，和代码的匹配结果，看有没有问题。
 *        这样不是更保险吗？"
 * —— 采纳（每次都审、不设触发条件），但问题必须是**封闭的**：
 *    问"本子上那一行真正写的是什么"，不问"有没有问题"✗
 *    （开放式问题会逼模型编 —— 实测它编过"贴纸被手指遮挡"）。
 *
 * 前端只负责一件事：**不一致的行**把复核意见摆出来 + 候选一键换。
 */
describe('识别结果 · 产品名复核意见（2026-10-09）', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('复核说不一致的行：排最前面 + 默认展开 + 说清"本子上写的是什么"', () => {
    const source = scan()

    expect(source).toContain('draft.productReview.consistent === false')
    expect(source).toContain('本子上写的是「${read}」，和我们认定的不是同一支，请核对')
  })

  it('复核候选一键换（走的是同一套 pickRowName）', () => {
    const source = scan()

    expect(source).toContain('function rowReviewCandidates(index: number): string[]')
    expect(source).toContain('复核建议这几支：')
    expect(source).toContain('@tap="pickRowName(index, item)"')
  })

  it('一致的行不留任何痕迹（正确的不打扰，避免狼来了）', () => {
    const source = scan()

    expect(source).toContain('if (!review || review.consistent !== false) return null')
  })
})

/**
 * 品牌一致性检查（2026-10-09 老板定）
 *
 * 为什么加它：实测"同一个模型再审一遍"抓不住"同一个模型看错字" ✗ ——
 * 赛文那本连跑 3 遍，两遍把贴纸「宠必威锐必威」读成「英特威®瑞比克」✗，
 * 复核还说"一致"✗（两次错得一模一样）。
 * 但「瑞比克是勃林格的、文字里却写着英特威」这条矛盾，
 * **纯代码一眼看得出来** ✓（我们库里登记了每支苗的品牌）。
 */
describe('识别结果 · 品牌对不上要提醒（2026-10-09）', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('品牌对不上的行：排最前面 + 默认展开 + 说清哪家对哪家', () => {
    const source = scan()

    expect(source).toContain('draft.brandCheck.conflict === true')
    expect(source).toContain('而这支苗是${draft.brandCheck.productBrand}的，请核对')
    expect(source).toContain('品牌对不上：文字里写的是')
  })

  it('判定在后端、界面只负责显示（前端不复制一份品牌表）', () => {
    const source = scan()

    expect(source).toContain('drafts[index].brandCheck.conflict')
    expect(source).not.toContain('勃林格')
  })
})

/**
 * 猫的疫苗本提醒（2026-10-09 老板定）
 *
 * 老板："猫的疫苗本可以给提醒，但是你这个提示文案需要优化。
 *        看起来是猫的疫苗本，请您再确认一下。"
 *
 * 为什么值得提醒：模型很容易把猫苗**换成它更熟悉的狗苗名** ✗ ——
 * 实测 23 张真实疫苗本：猫三联「妙三多」被读成狗苗「卫佳伍」，
 * 还编出库里根本没有的「卫佳玖」✗（产品名那 16 行错里，10 行是这一类）。
 */
describe('识别结果 · 猫的疫苗本提醒（2026-10-09）', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('用老板给的文案，且提醒但不拦截（记录照旧可保存）', () => {
    const source = scan()

    expect(source).toContain('看起来是猫的疫苗本，请您再确认一下。')
    expect(source).toContain('我们目前只做狗的疫苗接种记录。')
    expect(source).toContain("page.speciesHint === 'cat'")
  })

  it('标记来自后端识别结果（前端不自己判物种）', () => {
    const source = scan()

    /*
     * ⚠️ 2026-10-16：这里原来钉的是 `(data as …)` —— 而 `data` 在那个作用域里**根本不存在**
     *    （应该是 `res.data`）。守卫把一处真崩溃当成了正确写法，所以它一直是绿的 ✗。
     *    这类"名字不存在"的错现在由 architecture/no-undefined-names.spec.ts 统一拦。
     */
    expect(source).toContain('speciesHint: String((res.data as { speciesHint?: string }).speciesHint')
    // 前端不自己判物种（不做"看到猫三联就当猫本"这种本地规则）✓
    expect(source).not.toContain('function detectSpecies')
  })
})

/*
 * ══ 这两组（2026-10-10）随**鱼骨图**一起删除（2026-10-15）══════════════
 *
 *   · 「已完成的步骤不进鱼骨图；每一类最多一条」
 *   · 「窗口结束超过 90 天就补一句'窗口已过，建议尽快补'」
 *
 * 原因：鱼骨图（`utils/vaccine-fishbone.ts` + `VaccinePlanSection.vue`）是**死的**——
 * 需求 2026-10-15 定稿后，计划一律由后端算好、页面只渲染，
 * "每一类最多一条 DONE 过滤"和"窗口已过补一句"这类**前端推算**整体作废
 * （那正是"两套口径"的来源）。新版里：
 *   · 计划行按后端顺序画（`PlanTimeline.vue`）；
 *   · 逾期与否由后端的 `status` 决定，文案由 `domain/vaccine/status.ts` 一处给。
 * 对应的新断言在 `src/domain/vaccine/status.spec.ts`（逐条对着原型 A–K 十一屏）。
 */

/**
 * 启动卡死要有底线（2026-10-11 老板报"一直停在正在读取狗狗档案"）
 *
 * 现场证据：那会儿服务端**一条日志都没有** ✗ —— 请求没发出去/没回来 ✓，
 * 而页面会一直等 ✗。这类"静默卡死"最近出现三次 ✗，所以加统一底线：
 * **等超过 10 秒就明说 + 给一个重试键** ✓。
 */
describe('健康管理 · 启动卡死的底线（2026-10-11）', () => {
  const page = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('10 秒没结果就显示"网络好像不太顺" + 重新加载', () => {
    const source = page()

    expect(source).toContain('const startupStuck = ref(false)')
    expect(source).toContain('网络好像不太顺')
    expect(source).toContain('@tap="retryStartup"')
    expect(source).toContain('}, 10000)')
  })

  it('有结果（选中狗 / 确实没有狗）就撤掉看门狗，不许误报', () => {
    const source = page()

    expect(source).toContain('clearStartupWatchdog()')
    expect(source).toContain('if (id || none)')
  })
})

/**
 * ⚠️ 钉死一类我犯过的错：**函数写了，却没人调用** ✗（2026-10-11）
 *
 * 老板截图：页面一直停在「正在读取狗狗档案」，我加的"10 秒超时"却没出现 ✗。
 * 查下来：`armStartupWatchdog()` 定义得好好的 ✓，但那次替换**没命中 onMounted** ✗
 * （而这个页面用的是 uni-app 的 onLoad / onShow ✗），于是看门狗从没起过表 ✗。
 *
 * 所以：超时兜底必须**挂在真实生命周期上** ✓，而且这条断言要盯住它 ✓。
 */
describe('健康管理 · 超时兜底必须真的挂上（2026-10-11）', () => {
  const page = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('看门狗在 onLoad / onShow 里起表，离开页面清掉', () => {
    const source = page()

    // onLoad 里必须起表（页面首次进入）
    const onLoad = source.slice(source.indexOf('onLoad((options'), source.indexOf('onShow(() =>'))
    expect(onLoad).toContain('armStartupWatchdog()')
    // onShow 里也要（从别的页面回来）
    const onShow = source.slice(source.indexOf('onShow(() =>'), source.indexOf('onHide(() =>'))
    expect(onShow).toContain('armStartupWatchdog()')
    // 离开页面清定时器
    expect(source).toContain('clearStartupWatchdog()')
  })

  it('版本号用字面量印出来（ref 那次没渲染出来 ✗），卡住时印关键状态', () => {
    const source = page()

    expect(source).toContain('版本 2026.10.11.6')
    expect(source).toContain('[诊断] 加载中=')
  })
})

/**
 * ⚠️ 钉死这个 bug（2026-10-11，害了两天）：**用了却没导入** ✗
 *
 * 症状：健康管理页**一直停在「正在读取狗狗档案」**✗ ——
 * 页面能渲染（模板还在 ✓），但数据全空 ✗、请求一个不发 ✗、超时兜底也不触发 ✗。
 * 根因：页面里用了 `watch(...)`，但改导入那一行时把 `watch` 弄丢了 ✗
 * → setup 抛 `ReferenceError: watch is not defined` ✗
 * （用微信开发者工具的自动化接口才读出这句原文 ✓ —— 小程序把错误吞在控制台里 ✗）。
 *
 * 这条测试守的是"**导入表与使用情况对齐**" ✓：用到的组合式 API 必须都导入 ✓。
 */
describe('健康管理页 · 组合式 API 必须都导入（2026-10-11）', () => {
  const page = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('页面里用到的 vue API 都要在导入表里', () => {
    const source = page()
    const importLine = source.slice(source.indexOf("from 'vue'") - 200, source.indexOf("from 'vue'"))

    for (const api of ['computed', 'nextTick', 'reactive', 'ref', 'watch']) {
      const used = new RegExp(`\\b${api}\\s*\\(`).test(source)
      if (!used) continue
      expect(importLine).toContain(api)
    }
  })

  it('用到的 uni-app 生命周期也要都导入', () => {
    const source = page()
    const importLine = source.slice(
      source.indexOf("from '@dcloudio/uni-app'") - 200,
      source.indexOf("from '@dcloudio/uni-app'"),
    )

    for (const api of ['onLoad', 'onShow', 'onHide', 'onUnload']) {
      const used = new RegExp(`\\b${api}\\s*\\(`).test(source)
      if (!used) continue
      expect(importLine).toContain(api)
    }
  })

/**
 * 「确认页」与「录入卡」的字段顺序必须一致（老板 2026-10-14）。
 *
 * 老板问："确认页是什么意思？是不是疫苗记录板块中的信息编辑，或者是手动新增记录页面？
 *          如果是的话，请改成一致。"
 * —— 确认页是**扫疫苗本之后的识别结果确认界面**（HealthDocumentScan.vue），
 *    不是那两个。不过顺序确实该一致 ✓：
 *      录入卡：名字 → 含哪些疫苗 → 接种日期
 *      确认页：疫苗名 → 含哪些疫苗 → 接种日期
 */
})

describe('识别确认页 ↔ 录入器 · 字段口径一致（老板 2026-10-14 的诉求，2026-10-15 重构后）', () => {
  /*
   * 老板 2026-10-14 问："确认页是什么意思？是不是疫苗记录板块中的信息编辑，
   * 或者是手动新增记录页面？如果是的话，请改成一致。"
   *
   * 2026-10-15 重构把口径收得更死了：
   *   · 识别确认页（`ScanConfirm.vue`）**只有两列：名称 + 日期**（需求 R12）；
   *   · 录入器（`RecordEditor.vue`）**只有两个必填：名称 + 日期**（需求 R6）。
   * 两边的名称都走同一个产品/病种词表（`domain/vaccine/catalog.ts`），
   * 谁都不许自己再写一份。
   */
  const scan = readFileSync(
    resolve(process.cwd(), 'src/components/vaccine/ScanConfirm.vue'),
    'utf-8',
  );
  const editor = readFileSync(
    resolve(process.cwd(), 'src/components/vaccine/RecordEditor.vue'),
    'utf-8',
  );

  it('🔴 确认页只有名称 + 日期两列（品牌、批号、下次到期日一律不要）', () => {
    const template = scan
      .slice(scan.indexOf('<template>'), scan.indexOf('</template>'))
      // 注释里写着“不要这些字段”，那不算界面上有它们
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(template).toContain('疫苗名称');
    expect(template).toContain('mode="date"');
    // 两列之外的字段不再出现在确认页的**界面**上
    expect(template.includes('品牌')).toBe(false);
    expect(template.includes('批号')).toBe(false);
    expect(template.includes('下次到期')).toBe(false);
  });

  it('🔴 录入器与确认页共用同一份名称/病种口径（不各写一份）', () => {
    for (const source of [scan, editor]) {
      // 病种词表只有 domain/vaccine/catalog.ts 那一份
      expect(source.includes("value: 'cdv'")).toBe(false);
    }
    expect(editor).toContain("from '../../domain/vaccine/catalog'");
    // 名称栏都能"从产品库选"（原型 D 屏那一行）
    expect(editor).toContain('从产品库选');
  });
})
