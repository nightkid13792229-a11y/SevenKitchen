import { describe, expect, it } from 'vitest'
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
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )
  }

  it('第 4 条：支持四类文档', () => {
    const scan = readScan()

    expect(scan).toContain("'ALLERGY_REPORT' | 'CHECKUP_REPORT' | 'VACCINE_BOOK' | 'MEDICAL_RECORD'")
  })

  it('第 5 条：识别后只确认一次，且明确告诉顾客"确认后自动填入表单"', () => {
    const scan = readScan()

    expect(scan).toContain('识别到以下内容，确认后自动填入表单')
    expect(scan).toContain('确认，填入表单')
    // 只有一次确认，没有逐条勾选
    expect(scan).toContain('@tap="accept"')
    expect(scan).not.toContain('逐条确认')
  })

  it('第 5 条：识别的结果只填表、不直接保存（顾客还能改、还能不存）', () => {
    const scan = readScan()

    // 组件只 emit，不调用任何保存接口
    expect(scan).toContain("emit('scanned'")
    expect(scan).not.toContain('createHealthRecord')
    expect(scan).not.toContain('saveRecord')
    // 识别把握不再给顾客看（2026-10-02 老板定）；只有"低"时给一句能行动的话
    // （注释里提到这四个字没关系，这里卡的是**渲染出来的那句话**）
    expect(scan).not.toContain('识别把握：')
    expect(scan).toContain('填完请对着原件核一遍')
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

    expect(scan).toContain('识别把握')
    // 不出现任何诊断性措辞
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
    expect(scan).toContain("sizeType: ['compressed']")
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
  return readFileSync(
    resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
    'utf-8',
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

  it('疫苗本挂在「疫苗」板块', () => {
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

    expect(vaccine).toContain('<HealthDocumentScan')
    expect(vaccine).toContain('document-type="VACCINE_BOOK"')
    expect(vaccine).toContain('拍疫苗本')
  })

  it('过敏报告那条老路没被动过', () => {
    const allergy = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/AllergyQuickAddSection.vue'),
      'utf-8',
    )

    // 仍然调用同一个识别接口；不传 documentType 即走缺省的过敏报告
    expect(allergy).toContain('extractHealthReport')
  })

  it('API 层把 documentType 与 drafts 暴露出来', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

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

    expect(scan).toContain("const draftsByType = new Map<string, Record<string, any>[]>()")
    expect(scan).toContain('draftsByType.set(imageType, bucket)')
    expect(scan).toContain('for (const [type, list] of draftsByType.entries())')
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
    const utils = readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8')
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
    const utils = readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8')

    expect(utils).toContain('shortPrimary')
    expect(utils).toContain("'含化验数据'")
  })
})
