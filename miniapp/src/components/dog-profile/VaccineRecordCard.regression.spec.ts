import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 一条接种记录的**编辑卡**（`VaccineRecordCard.vue`）。
 *
 * ── 这些断言原来住在 VaccineManagementSection.regression.spec.ts 里 ──────────
 *
 * 2026-10-12 第一步：老板批准把"一条记录的编辑卡"从 2629 行的记录板块里
 * **抽成独立组件** ✓（三步重构的第一步，行为完全不变 ✓）。
 * 卡片本身（名字 / 状态 / 日期 / 病种 / 产品库 / 保存 / 删除 / 展开）连同
 * 它自己的样式一起搬到了新文件 —— 所以**盯着它的断言也跟着搬** ✓，
 * 否则测试会去"记录板块"里找一个已经不住在那儿的函数 ✗。
 *
 * 搬过来的时候**一条断言的判据都没放松** ✓ —— 只是换了读哪个文件 ✓。
 * 留在原文件里的那些（列表、空态、扫描、自动保存、草稿、附件、回执）
 * 仍然盯着 VaccineManagementSection.vue ✓。
 */

const readCard = () =>
  readFileSync(
    resolve(process.cwd(), 'src/components/dog-profile/VaccineRecordCard.vue'),
    'utf-8',
  )

const readSection = () =>
  readFileSync(
    resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
    'utf-8',
  )

describe('编辑卡 · 抽出来之后仍然只做"这一张卡"的事', () => {
  it('卡片自己管的事：确认结果 / 病种选择器 / 匹配中（不再回父组件要）', () => {
    const source = readCard()

    // 2026-10-06 老板："点击下方的确认按钮，也没有任何反应，只是屏幕闪烁了一下。"
    // 结果要留在**这张卡**上，所以它属于卡片自己的状态
    expect(source).toContain('const confirmResult = ref<{ ok: boolean; text: string } | null>(null)')
    expect(source).toContain('function setConfirmResult(')
    expect(source).toContain('function clearConfirmResult(')
    expect(source).toContain('const kindPickerOpen = ref(false)')
    // 这一张卡的匹配请求在飞（父组件不再需要知道是哪一行在匹配）
    expect(source).toContain('const matchingHere = ref(false)')
  })

  it('接口与父组件约定一致：props / emits 都写明了', () => {
    const source = readCard()

    // 先定义清楚再搬 ✓（老板的接手指南就是这么要求的）
    for (const prop of [
      'record: VaccineRecord',
      'index: number',
      'draft: VaccineDraft',
      // 2026-10-12：改成"默认展开、按需收起"（见下面那条守卫）
      'toggleLabel?: string',
    ]) {
      expect(source).toContain(prop)
    }
    expect(source).toContain("(event: 'update', index: number, field: keyof VaccineDraft, value: string): void")
    expect(source).toContain("(event: 'remove', index: number): void")
    expect(source).toContain("(event: 'toggle', index: number): void")
    expect(source).toContain("(event: 'save', index: number): void")
  })

  it('🔴 选产品时「先报名字、再设归类」——顺序反了会清掉刚设好的归类', () => {
    const source = readCard()

    /*
     * 老板 2026-10-13 第 6 条问的："选择了产品库中的某一个产品之后，
     * 疫苗名称字段下方会出现一个确认按钮……为什么会出现一个确认按钮呢？"
     *
     * 根因是**顺序**：报名字变更会让父组件把"之前判出来的归类"作废（正确行为），
     * 而产品的归类是数据库里核过的、确定的 —— 必须放在作废**之后**设。
     * 反过来写：刚设好的归类立刻被自己清掉 → 界面以为"还没归类" → 冒出「确认」。
     */
    const body = source.slice(source.indexOf('function applyCatalogProduct'))
    const nameAt = body.indexOf("updateField('vaccineName'")
    const kindsAt = body.indexOf("draft.value.kinds = [...product.kinds]")

    expect(nameAt).toBeGreaterThan(-1)
    expect(kindsAt).toBeGreaterThan(-1)
    expect(nameAt).toBeLessThan(kindsAt)
  })

  it('🔴 名称字段永远只有**一个**输入框（老板 2026-10-13 第 1、3 条）', () => {
    const source = readCard()

    /*
     * 老板连着两次点这个问题：
     *   · "疫苗名称字段和手动录入产品名称两个字段，是否不能同时出现呢？"
     *   · "是否可以将手动输入的按钮，放到疫苗名称字段的输入框中？"
     *
     * 做法：**把三者合成一个** —— 框里直接打字就是手动输入，
     * "从产品库选"是框里的一个入口。于是名称这个位置永远只有一个控件，
     * 也不再需要单独的「手动输入」按钮。
     */
    expect(source).toContain('class="field-name"')
    expect(source).toContain('class="field-input field-name__input"')
    expect(source).toContain('class="field-name__pick"')

    // 那套"选择器 + 手动输入链接 + 手填框"的三件套必须已经不在
    expect(source).not.toContain('vaccine-manual-link')
    expect(source).not.toContain('function showManualInputLink(')
    expect(source).not.toContain('function enterManualNameMode(')
    expect(source).not.toContain('manualNameMode')
  })

  it('🔴 第 7 条：只有「主动从产品库挑的」才锁成分，识别出来的要留纠错口子', () => {
    const source = readCard()

    /*
     * 老板 2026-10-13 的两句话合起来才是完整规则：
     *   · "从产品库选的 → 固定只读"
     *   · "识别出来的都允许改，需要给用户一个纠错的机会"
     *
     * ⇒ 判据必须是"**这一次是不是主动挑的**"，
     *   **不能**是"名字能不能在产品库里认出来" —— 那样识别命中的也会被锁死，
     *   顾客就没有纠错的机会了。
     */
    expect(source).toContain('const componentsLocked = ref(false)')
    expect(source).toContain('<text v-if="!componentsLocked" class="vaccine-kind__edit">修改</text>')
    /*
     * ⚠️ 锁住时**什么说明都不写**（老板 2026-10-13 第 2 条：
     * "不要把一些内部提醒文案也打到页面上"）—— 只是不出现「修改」而已。
     */
    expect(source).not.toContain('vaccine-kind__locked')
    expect(source).not.toContain('成分由产品库确定')

    // 主动挑的 → 锁；点「手动输入」→ 解锁
    expect(source).toContain('componentsLocked.value = true')
    expect(source).toContain('componentsLocked.value = false')

    // ⚠️ 判据**不能**回到"按名字认"那版（识别出来就改不了了）
    expect(source).not.toContain('const componentsFromCatalog = computed(')
    expect(source).not.toContain('componentsFromCatalog')
  })

  it('🔴 收起必须"按需"：默认展开，只有明确传 collapse 才收', () => {
    const source = readCard()

    /*
     * 2026-10-12 老板连着两次截图报「输入项不全」/「窗口很简陋」，
     * 根因都是**布尔 prop 传不进去**：
     *   · `expanded` 是 `type: Boolean` 且没默认值 → 小程序里强制成 false ✗
     *   · 想用 `:expanded="false"` 纠正 → 一样被当成"没传"丢掉 ✗
     * ⇒ 反过来设计：默认展开（不传值），只有"要收起"的那一处传**字符串** 'collapse' ✗→✓
     */
    expect(source).toContain('collapseFlag?: string')
    /*
     * ⚠️ 身子**永远画出来**，收起时用 class **藏** —— 不再用 v-if 决定"画不画" ✗。
     * 这条 props 通道对布尔不可靠（false 被丢、Boolean 又强制成 false），
     * 用 v-if 时"本该展开"的卡片会收着（老板三次截图报的输入项不全）。
     */
    expect(source).toContain('<view class="vaccine-card__body"')
    expect(source).toContain("'vaccine-card__body--hidden': collapseFlag")
    expect(source).toContain('.vaccine-card__body--hidden {')
  })

  it('🔴 展开与收起由 props.expanded 决定，不再自己数下标', () => {
    const source = readCard()

    // 抽卡片之前是 `expandedIndex === index` —— 那是**列表级**的状态 ✓，
    // 留在父组件 ✓；卡片只认"我这条展开着没有" ✓
    expect(source).toContain('{{ toggleLabel }}')
    expect(source).toContain("'vaccine-card__body--hidden': collapseFlag")
    expect(source).not.toContain('expandedIndex')
  })
})

describe('疫苗管理的卡片 · 「状态」不再让顾客选（2026-10-04 老板提问后改）', () => {
  it('状态选择器没了，但老记录的值照旧显示', () => {
    const source = readCard()

    // 老板："用户如果手动记录了疫苗信息的话，就意味着这一针已经打了呀，
    // 为什么还会让用户选择接种状态呢？" —— 对。一条接种记录记的就是
    // 已经发生的事，没有第二种可能。
    // 另外查过后端：**没有任何逻辑读这个字段**，它此前纯粹是个显示标签。
    expect(source).not.toContain('const STATUS_OPTIONS')
    expect(source).not.toContain('statusPickList')
    // 状态选择器没了（产品库那个 selector 是选疫苗名的，不是选状态的）
    expect(source).not.toContain('statusValueAt')
    expect(source).not.toContain('statusIndex')

    // 但老记录存着别的值时，卡片上要照旧显示出来，不能变空白
    expect(source).toContain('const STATUS_LABELS')
    expect(source).toContain("OVERDUE: '已逾期'")
    expect(source).toContain("SCHEDULED: '已预约'")
    expect(source).toContain('function statusLabel')
  })
})

describe('编辑卡 · 顾客勾的是**病种**，分类由后台判定（2026-10-06 老板改）', () => {
  it('给顾客看的是病种，不是内部类别', () => {
    const source = readCard()

    // 老板："在用户需要确认和手动修改的分类中，我们不应该把分类呈现给用户看……
    // 我们需要把它拆开，拆成每一个疫苗种类让顾客选择，
    // 至于分类的判定则交由后台来完成。"
    expect(source).toContain('含哪些病种')
    expect(source).toContain('componentOptions')
    expect(source).toContain('toggleComponent(option.value)')
    // 界面上不许再出现"核心疫苗/钩端螺旋体"这种内部类别让顾客选
    expect(source).not.toContain("label: '核心疫苗'")
  })

  it('系统认不出来时**如实承认**，并让顾客照本子勾病种', () => {
    const source = readCard()

    // 2026-10-12 老板：那句说明 Banner 直接删掉 ✗，「可多选」挪进字段名括弧 ✓
    expect(source).toContain('含哪些疫苗（可多选）')
    expect(source.includes('这一针含哪些病种？')).toBe(false)
    // 2026-10-12 老板：那段小字也删掉 ✗（"可多选"已进字段名 ✓）
    expect(source.includes('照疫苗本上的成分表勾')).toBe(false)
    // 勾不上任何病种时要有出路（驱虫药这种本来就不是疫苗）
    expect(source).toContain('都不是 / 不确定')
    expect(source).toContain('function toggleNoneOfThem()')
  })

  it('多选要能用：点一下不收起选择器', () => {
    const source = readCard()

    // 收起就没法再点第二个病了
    expect(source).toContain('function closeKindPicker()')
    // 2026-10-12 老板：不要「选好了」按钮 ✗（点字段名那一行即可展开/收起 ✓）
    // 只看**用法**（函数本身还留着，不算 ✗）
    expect(source.includes('@tap="closeKindPicker(')).toBe(false)
    // 提示里得写明可多选（组合苗要勾好几个病种）
    expect(source).toContain('可多选')
  })

  it('组合苗的多分类仍然成立（从产品库选时自动带出）', () => {
    const source = readCard()

    // 单选只针对"顾客手动指定"这一条路；
    // 选产品时分类按真实成分带出来（卫佳捌 = 核心 + 钩端），不能被单选逻辑吃掉
    expect(source).toContain('draft.value.kinds = [...product.kinds]')
  })
})

describe('编辑卡 · 录入只留两条路：选产品库 / 手填（2026-10-05 简化）', () => {
  it('两个入口，各管一件事', () => {
    const source = readCard()

    // 老板："为什么还会显示狂犬疫苗、犬二联这种疫苗名称的选择器？
    // 这个疫苗名称字段，它的作用是什么呢？"
    // 原来有三个控件做同一件事（12 个预设标签 + 产品库 + 输入框）。
    // 现在两条，职责清楚：
    expect(source).toContain('function applyCatalogProduct')
    expect(source).toContain('catalogProducts')
    expect(source).toContain("updateField('vaccineName', $event.detail.value)")
    // 预设标签下线 —— 它们的唯一价值是"带着归类"，而现在打字也自动判
    expect(source).not.toContain('applyNamePreset')
    expect(source).not.toContain('presetNames')
  })
})

describe('编辑卡 · 名称写完点「确认」才匹配产品与分类（2026-10-05 老板的规格）', () => {
  it('不边打字边判，点「确认」才问后端', () => {
    const source = readCard()

    // 老板："顾客手动的输入产品名称。**点击确认之后**，再来完成 AI 的匹配。
    // 包括产品匹配和分类匹配。"
    // 不边打字边判 —— 一来一回问后端会卡手，而且顾客往往写到一半就被判错。
    expect(source).toContain('function confirmVaccineName')
    expect(source).toContain('@tap="confirmVaccineName()"')
    expect(source).toContain('dogApi.classifyVaccineName')
    expect(source).not.toContain('scheduleClassify')
    expect(source).not.toContain('CLASSIFY_DELAY_MS')
    // 匹配期间要有反馈
    expect(source).toContain('matchingHere')
    expect(source).toContain('匹配中…')
  })
})

describe('编辑卡 · 名称那一行（2026-10-06 第二批）', () => {
  it('🔴 产品名比对前先归一化，® 和空格不影响认不认得出', () => {
    const source = readCard()
    // 2026-10-12：这套规则**只有一份**了 ✓（原来卡片和板块各抄了一份 ✗）——
    // 抽到 vaccine-record-types.ts ✓，两边都用它 ✓
    const shared = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )

    expect(shared).toContain('export function normalizeProductName(')
    // 与后端 normalizeProductText 同一套规则，缺一不可
    expect(shared).toContain(".replace(/[®™©]/g, '')")
    expect(shared).toContain('export function findCatalogProduct<')
    // 卡片必须**真的在用它**（不是又抄一份 ✗）
    expect(source).toContain('findCatalogProduct(')
    expect(source).not.toContain('function normalizeProductName(')
    // 名称认不认得出，必须走归一化比对，不能退回"一模一样才认"
    expect(source).toContain('function isNameRecognized(')
    expect(source).not.toContain('catalogProducts.value.some((item) => item.name === name)')
  })

  it('🔴 认得出：框里显示的是库里的**规范名**', () => {
    const source = readCard()

    /*
     * 老板 2026-10-13 第 1、3 条之后，名称就是一个输入框 ——
     * "显示规范名"这件事发生在**选产品**那一刻：把库里的名字写进草稿。
     */
    expect(source).toContain('draft.value.vaccineName = product.name')
    // 输入框绑的就是它
    expect(source).toContain(':value="draft.vaccineName"')
  })

  it('🔴 认不出：不给「从产品库选」入口（库里根本没有他要的那支）', () => {
    const source = readCard()

    // 老板 2026-10-06 定的，别被后来的改动带跑
    expect(source).toContain(
      "v-if=\"catalogProducts.length > 0 && nameFieldMode(draft.vaccineName) !== 'unknown'\"",
    )
    // 名字只出现一次：就是输入框自己的值
    expect(source).toContain(':value="draft.vaccineName"')
    // 旧的"名称行直接显示原文"的写法（会和输入框重复）已经下线
    expect(source).not.toContain("return String(name || '').trim()")
  })

  it('🔴 页面文案全部是**顾客视角**，不出现"系统内部怎么运作"的说明', () => {
    const source = readCard()

    /*
     * 老板 2026-10-13 第 2 条原话：
     *   "我们现在改的是小程序前端的页面，并且这个页面是给所有用户使用的……
     *    但是我发现你总是喜欢把一些内部提醒文案也打到页面上。"
     *
     * ⚠️ 只看**模板里去掉注释之后**的文字 ✓ ——
     *    源码注释里写"系统会……"是给开发看的 ✓，不算打到页面上 ✓
     *    （第一版守卫没排除注释，误报了三条 ✗）。
     */
    const template = source.slice(source.indexOf('<template>'), source.indexOf('</template>'))
    const visible = template.replace(/<!--[\s\S]*?-->/g, '')

    const INTERNAL = [
      '分类已按产品库自动判定',
      '成分由产品库确定',
      '不用再确认',
      '系统会',
      '后端会',
      '我们按它的成分归类',
    ]
    const leaked = INTERNAL.filter((text) => visible.includes(text))
    expect(leaked).toEqual([])
  })

  it('🔴 配方说明紧跟名称字段，且**不重复产品名**（老板第 3 条）', () => {
    const source = readCard()

    // 说明里只说成分，不再写"已选择：某某产品"
    expect(source).not.toContain('已选择：')
    expect(source).toContain('`含「${(product.components || [])')

    // 位置：紧跟在名称字段那一块后面（在"接种日期"之前）
    const nameAt = source.indexOf('class="field-name"')
    const recipeAt = source.indexOf('field-hint--recipe')
    const dateAt = source.indexOf('>接种日期<')
    expect(nameAt).toBeGreaterThan(-1)
    expect(recipeAt).toBeGreaterThan(nameAt)
    expect(dateAt).toBeGreaterThan(recipeAt)
  })

  it('🔴 「保存」和「取消」在**同一行**（老板第 4 条）', () => {
    const source = readCard()

    // 两个按钮都在动作条这个 flex 容器里
    const actionsAt = source.indexOf('class="vaccine-card__actions"')
    const saveAt = source.indexOf('class="vaccine-card__save"')
    const cancelAt = source.indexOf('class="vaccine-card__cancel"')
    expect(actionsAt).toBeGreaterThan(-1)
    expect(saveAt).toBeGreaterThan(actionsAt)
    expect(cancelAt).toBeGreaterThan(saveAt)

    // ⚠️ 它原来画在卡片**外面**（计划板块里），那样排不到一行
    expect(source).toContain("'vaccine-card__save--busy': saving")
    expect(source).toContain('{{ cancelLabel }}')
  })

  it('🔴 配方说明**只显示一次**（老板第 1 条：展现了两次）', () => {
    const source = readCard()

    /*
     * 老板 2026-10-13："疫苗的配方说明展现了两次。"
     * 根因：新加了一份"紧跟名称字段"的说明，但**旧的显示块没删**
     * （它在「确认」按钮附近，类名 vaccine-confirm-result）。
     */
    const shown = (source.match(/\{\{ confirmResult\.text \}\}/g) || []).length
    expect(shown).toBe(1)

    // 旧那块已经下线（只看模板：脚本注释里会提到它为什么被删）
    const template = source.slice(source.indexOf('<template>'), source.indexOf('</template>'))
    expect(template).not.toContain('vaccine-confirm-result')
  })

  it('🔴 从产品库选的：整个「含哪些疫苗」字段不显示（老板第 2 条）', () => {
    const source = readCard()

    /*
     * 老板："如果是从产品库中选择，为什么还有含有哪些疫苗这个字段呢？
     *       相当于疫苗的配方展现了三次。"
     * 产品库成分是核过的、也改不了 —— 名称下面那行说明已经讲清楚了。
     * 手输 / 识别出来的照旧显示（要能勾、能纠错）。
     */
    expect(source).toContain('<view v-if="!componentsLocked" class="field-group">')
    expect(source).toContain('<text class="field-label">含哪些疫苗（可多选）</text>')
  })

  it('🔴 保存只等"存"这一步，刷新放后台（老板第 3 条：为什么这么慢）', () => {
    const source = readCard()
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

    /*
     * 老板："点击保存后，过了 2~3 秒才保存成功，这是为什么呢？为什么这么慢？"
     * 原因：串行等三个网络往返（存 → 拉列表 → 通知计划重算）。
     * 顾客只需要等"存"这一步。
     */
    expect(section).toContain('void loadRecords().then(() => notifyRecordsChanged())')
    // 老的"await loadRecords() 才收工"必须已经不在保存路径上
    expect(section).not.toContain(`await loadRecords()

    if (newId) {`)
    void source
  })

  it('🔴 名称输入框**始终**在（不再按状态显示/隐藏）', () => {
    const source = readCard()

    /*
     * 老板 2026-10-13 第 1 条："疫苗名称字段和手动录入产品名称两个字段，
     * 是否不能同时出现呢？" —— 根子就是"按状态显示/隐藏"这套切换逻辑。
     * 现在框**始终**在 ✓，认得出来只是在框里显示规范名 ✓。
     */
    expect(source).toContain('class="field-input field-name__input"')
    // 那套"什么时候显示手填框"的判定已经不需要了
    expect(source).not.toContain('function showManualNameInput(')
  })

  it('🔴 确认的结果留在卡片上，不再是"闪一下就没"', () => {
    const source = readCard()

    // 老板："点击下方的确认按钮，也没有任何反应，只是屏幕闪烁了一下。"
    expect(source).toContain('const confirmResult = ref<')
    /*
     * ⚠️ 老板 2026-10-13："疫苗的配方说明展现了两次" ——
     * 结果那行字现在**只在名称字段下面显示一处**（类名也换成 field-hint--recipe）✓。
     * 位置变了，"留在卡片上、不再闪一下就没"这条**要求没变** ✓。
     */
    expect(source).toContain('field-hint--recipe')
    expect((source.match(/\{\{ confirmResult\.text \}\}/g) || []).length).toBe(1)
    expect(source).toContain('setConfirmResult(')
    // 成功和认不出两种结果都要说清楚
    expect(source).toContain('已确认：')
    expect(source).toContain('产品库和 AI 都没认出这支苗')
  })
})

describe('编辑卡 · 规范产品名 / 三种状态（2026-10-06）', () => {
  it('🔴 点「确认」时也用后端给的规范名，并把名字对齐', () => {
    const source = readCard()

    expect(source).toContain("const canonicalName = String(res.data.productName || '')")
    expect(source).toContain('draft.value.vaccineName = canonicalName')
    // 后端没给才退回前端这份比对
    expect(source).toContain('canonicalName ? { name: canonicalName } : findCatalogProduct(props.catalogProducts, name)')
  })

  it('三种状态：还没写 / 库里有 / 库里没有', () => {
    const source = readCard()

    expect(source).toContain(
      "function nameFieldMode(name: string): 'empty' | 'recognized' | 'unknown'",
    )
    expect(source).toContain("if (!String(name || '').trim()) return 'empty'")
    expect(source).toContain("return isNameRecognized(name) ? 'recognized' : 'unknown'")
  })

  it('🔴 库里没有的产品：不给"从产品库挑一支"的入口', () => {
    const source = readCard()

    // 老板："对于宠派纯这类产品库中没有的产品……也不让用户可以点击
    // 从产品库中挑选产品的弹窗呢？因为这没有意义嘛，对吧？"
    expect(source).toContain(
      "v-if=\"catalogProducts.length > 0 && nameFieldMode(draft.vaccineName) !== 'unknown'\"",
    )
  })

  it('库里没有时要说清楚，并且名字仍然能写', () => {
    const source = readCard()

    expect(source).toContain('产品库里没有这支苗。')
    expect(source).toContain("nameFieldMode(draft.vaccineName) === 'unknown'")
  })

  /**
   * 老板："我看在卫佳8的记录下，疫苗名称下面还需要点确认按钮，它才会弹
   * 已确认卫佳8归为核心疫苗加钩端螺旋体的提醒。是需要点点击确认按钮才会
   * 归类吗？还是说不需要点其实已经归类了？"
   * —— 早就归类了。所以别再摆一个按钮让人以为"必须点一下"。
   */
  it('🔴 分类已经有了、名字也认得 → 不再显示「确认」按钮', () => {
    const source = readCard()

    expect(source).toContain('function showConfirmButton(): boolean')
    expect(source).toContain('if (draft.value.kinds.length === 0) return true')
    expect(source).toContain("return nameFieldMode(draft.value.vaccineName) === 'unknown'")
    expect(source).toContain('v-if="showConfirmButton()"')
    // 取而代之说明一句
    // ⚠️ 老板 2026-10-13 第 2 条：这句内部说明已删（不要再打回页面）
    expect(source).not.toContain('分类已按产品库自动判定')
  })

  /**
   * 老板："我在分类中点击选项，没有反应。但是点击选好了之后。
   * 依然会显示出刚刚已经点击的那几类。"
   *
   * 状态一直是对的（所以"选好了"之后看得到），看不见的是**高亮** ——
   * 因为选中态的样式写在了基础态**前面**，两个选择器优先级一样，后写的赢，
   * 基础类的白底深字把选中态整个盖掉了。样式顺序问题只能靠顺序修。
   */
  it('🔴 选中态样式必须写在基础态之后（否则高亮永远被盖掉）', () => {
    const source = readCard()

    const baseAt = source.indexOf('.vaccine-name-tag {')
    const activeAt = source.indexOf('.vaccine-name-tag--active {')
    expect(baseAt).toBeGreaterThan(-1)
    expect(activeAt).toBeGreaterThan(-1)
    expect(activeAt).toBeGreaterThan(baseAt)
  })

  it('🔴 没读全时的候选产品：点一下就用那一支', () => {
    const source = readCard()

    // 老板："如果不能完全有把握的识别出来，能不能诚实的告诉用户呢？"
    expect(source).toContain('这行字可能没读全')
    expect(source).toContain('(record.nameSuggestions || []).length > 0')
    expect(source).toContain('@tap="applySuggestedProduct(suggestion)"')
    expect(source).toContain('function applySuggestedProduct(name: string)')
    expect(source).toContain('applyCatalogProduct(at)')
    expect(source).toContain('props.record.nameSuggestions = []')
    // 点「确认」时也刷新候选（认出来了就清空）
    expect(source).toContain('if (Array.isArray(res.data.nameSuggestions))')
    expect(source).toContain('props.record.nameSuggestions = res.data.nameSuggestions.map(String)')
    // 识别草稿那边的形状在共用类型里（卡片和记录板块读同一份）
    expect(readSection()).toContain('nameSuggestions: Array.isArray(draft.nameSuggestions)')
    const types = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/vaccine-record-types.ts'),
      'utf-8',
    )
    expect(types).toContain('nameSuggestions?: string[]')
  })

  it('展开后的字段顺序跟确认页一致：名字 → 日期 → 病种', () => {
    const source = readCard()

    const name = source.indexOf('<text class="field-label">疫苗名称</text>')
    const date = source.indexOf('<text class="field-label">接种日期</text>')
    // 2026-10-12 文案改了 ✓：含哪些病种 → 含哪些疫苗（可多选）
    const components = source.indexOf('<text class="field-label">含哪些疫苗（可多选）</text>')

    expect(name).toBeGreaterThan(0)
    expect(date).toBeGreaterThan(name)
    expect(components).toBeGreaterThan(date)
  })
})

describe('编辑卡 · 待核对（2026-10-09 安全默认值）', () => {
  it('卡片上有「待核对」徽标 + 说明 + 一键核对', () => {
    const source = readCard()

    expect(source).toContain('class="vaccine-card__pending"')
    expect(source).toContain('这一针先没算进接种计划')
    expect(source).toContain('我已对照本子核对')
    expect(source).toContain('function confirmVerified()')
  })

  it('按原因说不同的话（2026-10-09 老板实测）', () => {
    const source = readCard()

    // 老板："02 号和 04 号照片中，我发现模型可能会把疫苗的生产日期或者其他日期
    //        识别成注射日期。并且 04 号照片中，还会识别出不存在的日期。"
    expect(source).toContain("dateReview === 'missing'")
    expect(source).toContain('本子上好像没写注射日期')
    expect(source).toContain("dateReview === 'differs'")
    expect(source).toContain('日期我们和复核读得不一样')
    // 其它原因照旧说名字（不把所有情况都说成日期）
    expect(source).toContain('可能把贴纸认成了另一支苗')
  })
})
