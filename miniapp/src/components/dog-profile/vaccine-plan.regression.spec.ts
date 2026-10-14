import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 疫苗计划（2026-10-01，第四期）。
 *
 * 老板第 15–18 条：
 *   15. 按免疫程序提醒还需要打哪些、什么时候打
 *   16. 首选 WSAVA、结合国内法规；**引导顾客自己决策**
 *   17. 顾客计划与我们不一致时提醒
 *   18. 提醒只在小程序内
 */
describe('疫苗计划 · 界面', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
  }

  it('第 15 条：给出"下一步"与完整计划，每步带时间窗与依据', () => {
    const section = readSection()

    expect(section).toContain('kind-card')
    expect(section).toContain('step.windowStart')
    expect(section).toContain('step.windowEnd')
    expect(section).toContain('basisRestOf(card.steps[0])')
  })

  /**
   * 第 16 条原样是"给顾客三个按钮自己选（按建议/推迟/不做）"。
   *
   * 2026-10-06 老板实测："目前这 3 个按钮，我选中之后没有任何反应。"
   * （后端是好的 —— 生产实测 PUT 200 落库成功，只是界面只变了个很不明显的
   * 样式，列表里那几项连一句说明都没有。）老板的方案是重构成两个按钮：
   *   「记录疫苗接种信息」→ 直接走新增记录流程
   *   「忽略」→ 弹窗确认后把这一步从计划里去掉
   */
  it('第 16 条（2026-10-06 改版）：每一步两个按钮 —— 记录疫苗接种信息 / 忽略', () => {
    const section = readSection()

    // 文案 2026-10-06 简化：老板说"可以简化为记录接种信息"
    expect(section).toContain('记录接种信息')
    expect(section).toContain('>忽略<')
    // 已完成的步骤不给按钮（否则"已经打完了还给记录/忽略"很奇怪）
    // 2026-10-12：列表里只有"未完成"的卡 ✓，所以动作按钮不必再加 v-if ✓
    expect(section).toContain('class="step-actions"')
    // 2026-10-12 老板：点了要**在这张卡下面**展开录入窗口 ✓（不再直接开草稿 ✗）
    expect(section).toContain('@tap.stop="recordCard(card)"')
    expect(section).toContain('@tap.stop="ignoreCard(card)"')
    // 老的三个按钮彻底下线
    expect(section).not.toContain("label: '按建议'")
    expect(section).not.toContain("label: '推迟'")
    expect(section).not.toContain('DECISION_OPTIONS')
  })

  it('「记录疫苗接种信息」把这一步的分类一起带过去（不让顾客再选一次）', () => {
    const section = readSection()

    expect(section).toContain('function recordStep(step: PlanStep)')
  })

  it('「忽略」先弹窗确认，再落一个 SKIP 决定；并且给得回来', () => {
    const section = readSection()

    expect(section).toContain('uni.showModal({')
    expect(section).toContain("void decide(step.key, 'SKIP')")
    // 忽略不是"删了就找不回来"
    expect(section).toContain('已忽略 {{ ignoredCount }} 项 · 点这里恢复')
    expect(section).toContain('function restoreIgnored()')
  })

  it('第 17 条：不一致的地方单独成块提醒，且说明"只是提醒"', () => {
    const section = readSection()

    expect(section).toContain('plan.conflicts')
    expect(section).toContain('你的记录与建议不一致')
    expect(section).toContain('这只是提醒，不是结论')
  })

  it('第 18 条：提醒只在小程序内，不碰订阅消息', () => {
    const section = readSection()

    expect(section).not.toContain('requestSubscribeMessage')
    expect(section).not.toContain('subscribe-reminder')
    expect(section).not.toContain('订阅')
  })

  it('措辞是建议不是命令（老板要求不做诊断、不替顾客拍板）', () => {
    const section = readSection()

    // 2026-10-11 老板定：这个字段改叫「建议接种时间」✓ —— 比"窗口期"更像人话 ✓
    expect(section).toContain('建议接种时间')
    expect(section).toContain('依据')
    expect(section).not.toContain('必须接种')
    expect(section).not.toContain('立刻去打')
  })

  it('计划没开时整块不出现（2026-10-04 改，原来显示"待开放"卡）', () => {
    const section = readSection()

    expect(section).toContain('available === false')
    // 一张写着"疫苗计划待开放"的卡片，告诉顾客一个还不存在、也没说什么时候
    // 会有的功能 —— 只会被读成"坏了"。开了才出现。
    expect(section).not.toContain('疫苗计划待开放')
    expect(section).toContain('planHidden')
    // 根节点条件已升级成 !sectionHidden（它也管"零记录时不渲染"）
    expect(section).toContain('v-if="!sectionHidden"')
  })

  it('每类一张简卡、各自展开；顺序**固定**为核心→钩端→狂犬（老板 2026-10-14）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    // 不再有"整个板块收起/展开"✗，改成**每一类各自展开**✓
    expect(source).toContain('const expandedKind = ref(')
    expect(source).toContain('function toggleKind(')
    /*
     * ⚠️ 顺序改成**固定**（老板 2026-10-14）：核心 6 周 → 钩端 8 周 → 狂犬 12 周。
     *
     * 原来按 `windowStart` 排 ✗，顺序会随狗的情况变：
     *   幼犬 10 周龄 → 钩端排到核心前面；只打过核心的成年犬 → 核心排到最后。
     * 于是"把合并接种的提示放在核心与钩端两张卡中间"没法稳定实现 ✗。
     * 位次由后端下发（`order`），顺序这条规则只有一处 ✓。
     */
    expect(source).toContain('.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))')
    /*
     * ⚠️ 别顺手把另一处按时间的排序也删了 ✗ ——
     * `visibleSteps` 里那次排序是**中间计算**（决定"同一类里前面还有没做完的，
     * 后面那些就先不显示"），它**必须按时间先后**处理 ✓。
     * 只有 kindCards 的**展示顺序**改成固定 ✓。（我第一版断言写成
     * "全文不许出现 localeCompare"，把这一处也误伤了 ✗。）
     */
    expect(source).toContain('.sort((a, b) => String(a.windowStart).localeCompare(String(b.windowStart)))')
    // 简卡上要有：类别 + 状态 + 建议接种时间 ✓
    expect(source).toContain('kind-card__kind')
    expect(source).toContain('建议接种时间 {{ card.windowStart }}')
  })

  it('收起那一行只报"下一针是什么、什么时候打"，不报假进度', () => {
    const section = readSection()

    // 原来收起那行会写"已完成 N 项" —— 一条都对不上号时那是假进度。
    // 现在收起行只有分类 + 窗口期（老板 2026-10-06 指定的两项）。
    expect(section).not.toContain('已完成 ${done}')
    expect(section).not.toContain('planListHint')
    expect(section).toContain('plan-card__eyebrow')
  })

  it('🔴 底部那句"仍在做专业审核"已经删掉（2026-10-06 老板）', () => {
    const section = readSection()

    // 老板："这句话删除掉…我们现在就按审核通过的标准部署。"
    expect(section).not.toContain('仍在做专业审核')
    expect(section).not.toContain('plan-note')
  })
})

describe('疫苗计划 · 一条接种记录都没有时（2026-10-02 顾客侧开放当天补）', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
  }

  it('零记录时这一块整个不渲染，把话让给记录板块的空态去说', () => {
    const section = readSection()

    // 实测：8 个月、没记过疫苗的狗，页面直接顶着 5 个「已逾期」——
    // 家长明明打过、只是没记，会以为系统算错了
    expect(section).toContain('noRecordAtAll')
    // 2026-10-04 老板第二次提问：计划板块和记录板块的空态说了同一件事。
    // 现在这句话只在记录板块说（那里的空态文案是"档案里还没有接种记录"）。
    expect(section).not.toContain('档案里还没有接种记录')
    // 内容那一层挂 v-if="!noRecordAtAll"，根节点那一层挂 !sectionHidden
    // 2026-10-11 老板改口径：**零记录也要显示计划** ✓（撤掉了内层拦截 ✓）
    expect(section.includes('<template v-if="!noRecordAtAll"')).toBe(false)
  })

  it('判定条件来自后端的 summary.done 与 matchedRecordId，不自己猜', () => {
    const section = readSection()

    expect(section).toContain('plan.value.summary?.done')
    expect(section).toContain('step.matchedRecordId')
  })
})

/**
 * ⚠️ 口径已变（2026-10-11 老板定）：**零记录也要显示计划** ✓
 *
 * 老板拿 3 周龄、一条记录都没有的测试狗问：
 *   "为什么没有显示疫苗计划提醒，下一针应该接种的疫苗呢？"
 * —— 对。计划回答的是"接下来该打什么、什么时候" ✓，与"有没有记录"无关 ✓。
 * 2026-10-04 那版把整块藏掉，是怕零记录的老狗顶着几个"已逾期" ✗ ——
 * 那个问题现在由 noEvidence 的**软措辞**解决 ✓（说"还没记录"，不说"已逾期" ✓）。
 */
describe('疫苗计划 · 零记录也要显示计划（2026-10-11 老板改的口径）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('零记录不再整块藏掉（只保留"接口说没开放"那一种隐藏）', () => {
    const text = source()

    expect(text).toContain('const sectionHidden = computed(() => planHidden.value)')
    // 旧的"零记录整块藏"判据必须不存在了 ✗
    expect(text).not.toContain('loaded.value && noRecordAtAll.value')
  })

  it('措辞仍然按"有没有证据"分软硬（不许对零记录的狗说"已逾期"）', () => {
    const text = source()

    expect(text).toContain('noEvidence')
  })
})


describe('疫苗计划 · 接线', () => {
  it('挂在疫苗书签下，且排在疫苗记录上方', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('ref="vaccinePlanRef"')
    expect(page).toContain(':data-version="vaccineDataVersion"')
    // 记录一变就重算计划（2026-10-05）—— 否则顾客原地录完几条，
    // 计划还停在"没有记录"的状态、整块不显示
    expect(page).toContain('@records-changed="onVaccineRecordsChanged"')
    expect(page).toContain('vaccineDataVersion.value += 1')
    const planIndex = page.indexOf('<VaccinePlanSection')
    const recordsIndex = page.indexOf('<VaccineManagementSection')
    expect(planIndex).toBeGreaterThan(-1)
    expect(planIndex).toBeLessThan(recordsIndex)
  })

  it('API 层四个接口都在（计划 / 程序表 / 设决定 / 清决定）', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('/dogs/${dogId}/vaccine-plan?audience=')
    expect(api).toContain('/dogs/${dogId}/vaccine-plan/schedule')
    expect(api).toContain('/vaccine-plan/decisions/')
    expect(api).toContain('method: \'PUT\'')
    expect(api).toContain('method: \'DELETE\'')
  })
})

/**
 * 两条新的排期规则（2026-10-05 老板加）。
 */
describe('疫苗计划 · 新增的两条排期规则', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
  }

  it('「别同一天打」那段提示**已按老板要求删掉**（2026-10-13）', () => {
    const section = readSection()

    /*
     * 老板 2026-10-13 第 2 条："不再提示，相同时间窗口期，不同类的疫苗不同天打，
     * 前后错开 2~3 天的这段文案。"
     *
     * 两处都删干净了：
     *   · 卡片上那条 spacingNote 的展示
     *   · 联苗提示结尾的"如果分开打两种苗，请错开 2~3 天"
     * 展示用的样式也跟着删（不留孤儿样式 —— 老板当天就从页面上看出
     * "说明字段没删干净"，就是这类残留）。
     */
    expect(section).not.toContain('spacing-note__text')
    expect(section).not.toContain('错开 2~3 天')
  })

  it('🔴 板块叫「接种计划」，右边那行小字已删（老板 2026-10-13）', () => {
    const section = readSection()

    // 标题（和下面的「接种记录」对称）
    expect(section).toContain('<text class="plan-head__title">接种计划</text>')
    expect(section).not.toContain('>疫苗接种计划<')

    /*
     * 右边那行小字（"每一类只提醒下一针；从近到远"）是**内部说明**，
     * 老板要求删除 —— 文案和样式一起删（上一轮就是漏了样式，
     * 页面上留了一根孤零零的横线，老板一眼看出来了）。
     */
    const template = section
      .slice(section.indexOf('<template>'), section.indexOf('</template>'))
      .replace(/<!--[\s\S]*?-->/g, '')
    expect(template).not.toContain('每一类只提醒下一针')
    expect(section).not.toContain('plan-head__hint')
  })

  it('🔴 窗口要"封口"：负 margin 必须抵消父容器的 gap（两者要一致）', () => {
    const text = readSection()
    // `.health-section` 的共享样式（gap 定义在这儿）
    const shell = readFileSync(resolve(process.cwd(), 'src/styles/health-section.scss'), 'utf-8');

    /*
     * ⚠️⚠️ 2026-10-14 花了很久才找到的根因，值得钉死：
     *
     * 头部与两行之间**一直有一条白缝**，窗口左右两条边在那里断开 ✗。
     * 试过 `margin-top: 0`、`margin: 0 !important`、给头部 `margin-bottom: 0`
     * —— 全都没用 ✗，因为那条缝**不是 margin**：
     *
     *     `.health-section { display:flex; flex-direction:column; gap:24rpx }`
     *
     * 头部和两张卡都是它的子元素，被 **gap** 撑开 —— gap 不是 margin ✗。
     * ⇒ 只能用**负 margin 把 gap 拉回来** ✓。
     *
     * 判据：两边的数值必须一致。哪天有人改了 gap 而忘了这里，窗口就又裂开。
     */
    // 两处都要抵消：第二张卡（接第一张卡）、说明块（接第二张卡）
    expect((text.match(/margin-top: -24rpx !important;/g) || []).length).toBeGreaterThanOrEqual(2);
    // 第一张卡上面是别的卡，间距该留着，不许也抵消
    expect(text).toContain('margin-top: 0 !important;');
    // 父容器的 gap 也得是 24rpx（改了一处必须改另一处）
    expect(shell).toContain('gap: 24rpx;');
  })

  it('🔴 合并窗口必须与狂犬卡**一眼分得开**（老板 2026-10-14 第二轮）', () => {
    const text = readSection()

    /*
     * 老板："视觉上很难将提醒、核心疫苗和钩端螺旋体这三个板块视作同一个窗口，
     *        也并未与狂犬疫苗计划板块有明显的视觉上的区别。
     *        我觉得你这块要么是有 bug，要么就是在视觉 UI 这个层面上太保守了。"
     *
     * 根因：组内的卡和外面那张狂犬卡**用了同一套样式**
     *      （白底 + 淡边 + 圆角 + 阴影）→ 当然看着一模一样 ✗。
     *
     * ⇒ 现在的判据（缺一条就会退回"看不出是一组"）：
     *   ① 窗口有**明显的绿边**（不是淡淡的分组线）
     *   ② 头部底色**比内容深一档**，读起来像标题区
     *   ③ 组内两行**不再是白卡**：去白底、去阴影、去圆角
     *   ④ 窗口里展开的内容也跟着绿底（否则会露出一块白）
     */
    expect(text).toContain('border: 4rpx solid #7fb08f;')
    expect(text).toContain('background: #dcefe4;')
    // 组内两行不是卡片
    expect(text).toContain('background: #e9f5ee;')
    expect(text).toContain('box-shadow: none;')
    // 展开内容跟着绿底
    expect(text).toContain('.kind-card.kind-card--combo-first .kind-card__body,')
    expect(text).toContain('background: #e9f5ee;')
  })

  it('🔴 合并框的样式必须**压得住 .kind-card**（否则框根本连不起来）', () => {
    const text = readSection()

    /*
     * ⚠️⚠️ 2026-10-14 踩过的坑，值得单独钉一条：
     *
     * 只写 `.kind-card--combo-first`（一个类）时，它和 `.kind-card` **权重相同**，
     * 而 `.kind-card` 在样式表里定义得**更靠后** → "去掉上边框、去掉圆角"全部失效 ✗
     * → 界面上仍是**三个独立的圆角块**，框没连起来 ✗
     * （我在模拟器里截图确认过：框顶一行、两张卡各自一个完整的圆角框。）
     *
     * ⇒ 必须写成两个类把权重顶上去 ✓；这段也放在样式表末尾 ✓（双保险）。
     */
    expect(text).toContain('.kind-card.kind-card--combo-first')
    expect(text).toContain('.kind-card.kind-card--combo-second')
    // 单类写法会再次被覆盖
    expect(/\n\.kind-card--combo-first \{/.test(text)).toBe(false)

    // 框顶要"开口"：不留底边框、圆角只在上方
    expect(text).toContain('border-bottom: none;')
    expect(text).toContain('border-radius: 16rpx 16rpx 0 0;')
    // 第一张卡去掉上边框与圆角、第二张卡收下圆角
    expect(text).toContain("border-radius: 0 0 16rpx 16rpx;")
  })

  it('🔴 产品名后面**一律**补"等产品"，不看有没有截断（老板 2026-10-14）', () => {
    const text = readSection()

    /*
     * 老板两轮的意思：
     *   ① "如果有 3 条的约束的话，那文案可以在产品名后面加一个'等疫苗'"
     *   ② "如果符合条件的恰好 3 只，也需要加，因为我们**不能假设
     *      产品库中的产品是完整的**"
     *
     * ⇒ 所以是**无条件**加 ✓，不再看"后端有没有截断"
     *   （曾经按 hasMore 判断过，老板否了 —— 那等于假设我们库里是全集 ✗）。
     */
    expect(text).toContain('}}等产品</text');
    // ⚠️ 只查 combo 相关的 hasMore —— 组件里另有 hasMoreBasis（依据文字能不能展开），
    //    那是另一件事，别误伤。
    expect(text.includes('combo!.hasMore')).toBe(false);
    expect(text.includes('hasMore: boolean')).toBe(false);
  })

  it('🔴 "常见疫苗"已改叫"常见产品"（老板 2026-10-14）', () => {
    const text = readSection()
    expect(text).toContain('>常见产品<')
    expect(text.includes('>常见疫苗<')).toBe(false)
  })

  it('🔴 说明块不许写 width（写了右边框会被裁到屏幕外）', () => {
    const text = readSection()

    /*
     * 2026-10-14 踩过：给说明块加 `width: 100%` +
     * `box-sizing: border-box`，实测**右边框跑到屏幕外**（扫像素确认）。
     * 去掉 width 后，父容器是 flex column、align-items 默认 stretch，
     * 它会像卡片一样自动撑满 ✓。
     */
    const foot = text.slice(text.indexOf('.combo-group__foot {'));
    // ⚠️ 先剥掉注释 —— 注释里正好在讲"曾经写过 width"，
    //    不剥就会把说明文字当成真代码（第一次就是这么误报的）。
    const raw = foot.slice(0, foot.indexOf('}'));
    const body = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body.includes('width:')).toBe(false);
    // 三段拼的边框方向：上边开口、下边收口
    expect(body).toContain('border-top: none;');
    expect(body).toContain('border-radius: 0 0 16rpx 16rpx;');
  })

  it('🔴 合并窗口：说明在**最下方**，且说"以上两类"', () => {
    const text = readSection()

    /*
     * 老板 2026-10-14 第二轮：
     * "将合并窗口顶部的提醒板块改到窗口的最下方。同时将文案中的
     *  包含以下两类疫苗中的以下改为以上。"
     *
     * 位置与措辞是**配套**的：移到下方之后，"以上两类疫苗"正好指上面那两张卡 ——
     * 这时候还说"以下"就指空了。
     *
     * 走过的三版都不对，记在这儿：
     *   ① 各自卡里各说一遍 → 角度不同，顾客要来回对照才拼得出意思
     *   ② 两张卡中间插一条 → 视觉上自成一格，顾客不会往两边联想
     *   ③ 放在窗口顶部 → 老板要移到最下方
     */
    expect(text).toContain('combo-group__foot')
    expect(text).toContain('combo-group__products')
    expect(text).toContain("card.comboRole === 'second'")
    expect(text).toContain('同时包含以上两类疫苗，建议在共同窗口期（')
    // 位置与措辞必须配套
    expect(text.includes('同时包含以下两类疫苗')).toBe(false)
    expect(text.includes('class="combo-group__head"')).toBe(false)
    // 框是三段拼的：第一行收上口、第二行做中间段、说明块在下边收口
    expect(text).toContain('comboCardClass(card)')
    expect(text).toContain("'kind-card--combo-first'")
    expect(text).toContain("'kind-card--combo-second'")
  })

  it('计划列表每一步按老板 2026-10-06 的字段清单显示，不多不少', () => {
    const section = readSection()

    // 状态 / 疫苗种类 / 接种窗口期 / 接种时间 / 推荐疫苗 / 依据
    // （2026-10-07 起整个 step 传进去 —— 口气要按"这一类"判断）
    expect(section).toContain('statusLabel(card.steps[0])')
    expect(section).toContain('card.title')
    expect(section).toContain('card.windowStart')
    expect(section).toContain('card.steps[0].matchedRecordDate')
    expect(section).toContain('card.products')
    expect(section).toContain('basisRestOf(card.steps[0])')
  })

  it('已记录/已接种的步骤不再推荐产品', () => {
    const section = readSection()

    // 老板："推荐疫苗（如果已记录或者已接种，就不需要推荐了。）"
    expect(section).toContain('if (step.matchedRecordId) return []')
  })

  it('时间顺序交给鱼骨图布局算（2026-10-09 改版）', () => {
    const section = readSection()

    /*
     * 老板 2026-10-06 定的是"列表按窗口期由近到远"；2026-10-09 改成竖版鱼骨图之后，
     * **背骨本身就是时间轴**（过去 → 今天 → 下一针），所以顺序不再在组件里排，
     * 一律交给 utils/vaccine-fishbone.ts（纯函数，单测在 vaccine-fishbone.spec.ts）。
     */
    expect(section).toContain('buildFishboneRows(visibleSteps.value')
    expect(section).toContain('fishboneNodes')
  })

  it('被忽略的步骤从计划里去掉（展示层过滤，库里那条决定留着好恢复）', () => {
    const section = readSection()

    expect(section).toContain("plan.value.decisions[step.key] !== 'SKIP'")
    expect(section).toContain('ignoredCount')
  })

  it('同品牌优先的结果直接用后端的（前端不自己排）', () => {
    const section = readSection()

    // 推荐顺序（同品牌优先、批签发排序、核心苗要覆盖四病）全在后端算，
    // 前端只显示 —— 否则两边迟早不一致
    expect(section).toContain('commonProducts')
    expect(section).not.toContain('coversCoreSeries')
    expect(section).not.toContain('VACCINE_PRODUCTS')
  })
})

/**
 * 计划和提醒要**跟着记录实时变**（2026-10-06 老板报的问题 1 和 6）。
 *
 * 原话：
 *   1. "如果我把疫苗记录全部删空，依然还会显示疫苗的提醒和计划。
 *       只有在切换到其他的标签，再切回疫苗标签的时候，显示内容才会为空。"
 *   6. "这次在录入疫苗接种记录之后，疫苗的计划和提醒板块又没有显示出来。"
 *
 * 两条是同一个机理的两面：板块停在上一次加载的结果上。
 * 一个该出现却没出现，一个该消失却没消失。
 */
describe('疫苗计划 · 跟着记录实时刷新（2026-10-06）', () => {
  it('同一条狗刷新时不许先抹掉 loaded —— 那会让整块先消失再出现', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    // sectionHidden = planHidden || (loaded && noRecordAtAll)
    // 刷新一开始就 loaded=false 的话，块会闪一下；
    // 而换狗时**必须**重置，否则新狗顶着上一条狗的计划。
    expect(section).toContain('const loadedDogId = ref(')
    expect(section).toContain('if (loadedDogId.value !== props.dogId) {')
    expect(section).not.toContain('  loaded.value = false\n  loadError.value = \'\'')
  })

  it('拉记录失败也要通知计划板块（否则删空后拉失败会一直挂着旧的）', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

    // catch 里原来只 showToast，不通知 —— 计划那边毫无察觉
    const loadAt = section.indexOf('async function loadRecords')
    const catchBlock = section.slice(
      section.indexOf('} catch (error: any) {', loadAt),
      section.indexOf('} finally {', loadAt),
    )
    expect(catchBlock).toContain('notifyRecordsChanged()')
    // 文案 2026-10-08 审计第 6 块改成"能行动的话"（原来只有"加载疫苗记录失败"）
    expect(catchBlock).toContain('接种记录没加载出来，下拉刷新一下试试')
  })

  it('"一条记录都没有"由后端按记录条数算，前端只负责照做', () => {
    const backend = readFileSync(
      resolve(process.cwd(), '../backend/src/domain/health/immunization-schedule.ts'),
      'utf-8',
    )

    // 后端口径：records.length === 0 —— 删空之后它必须是 true，
    // 计划板块才会整块藏掉。前端不重算这个判断。
    expect(backend).toContain('const noRecordAtAll = input.records.length === 0;')
  })
})

/**
 * 记录变了要**直接调组件方法**重算（2026-10-06 实测出来的）。
 *
 * 光靠 `:data-version` 传下去实测不生效：用微信官方自动化驱动模拟器
 * 删光记录之后，书签红点灭掉了（说明通知到了页面），
 * 计划板块却原地挂着删掉那条记录算出来的计划 ——
 * 正是老板报的"删空了还显示计划和提醒，切走再切回才空"。
 */
describe('疫苗计划 · 记录一变就重算（2026-10-06 实测修复）', () => {
  function readPage() {
    return readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )
  }

  it('🔴 页面拿到计划板块的 ref，并在记录变化时直接调 reload', () => {
    const page = readPage()

    expect(page).toContain('const vaccinePlanRef = ref<{ reload?: () => void } | null>(null)')
    expect(page).toContain('ref="vaccinePlanRef"')
    expect(page).toContain('vaccinePlanRef.value?.reload?.()')
  })

  it('reload 由组件 defineExpose 暴露出来', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    // 2026-10-12：这一行现在多暴露了一个 collapseAll ✓（点记录接种信息后收起卡片 ✓）
    expect(section).toContain('reload: () => load()')
  })

  it('reload 必须排在"红点也跟着更新"同一条链上（两件事一起发生）', () => {
    const page = readPage()

    const handler = page.slice(
      page.indexOf('function onVaccineRecordsChanged()'),
      page.indexOf('}', page.indexOf('vaccinePlanRef.value?.reload?.()')),
    )
    expect(handler).toContain('loadVaccineDot()')
    expect(handler).toContain('vaccinePlanRef.value?.reload?.()')
  })
})

/**
 * 接种计划的显示口径（2026-10-06 老板实测七问）。
 */
describe('接种计划 · 显示口径（2026-10-06）', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('不再有"接种计划"小标题（收起态那一行已经写着"下一针"）', () => {
    const source = readSection()

    expect(source).not.toContain('plan-steps__title')
    expect(source).not.toContain('由近到远）</text>')
  })

  it('🔴 已完成的步骤不显示接种窗口期（那扇窗早过了）', () => {
    const source = readSection()

    // 2026-10-11 改版后，列表里**根本不列已完成的步骤** ✓（只有未完成的才出卡 ✓）
    expect(source).toContain("visibleSteps.value\n    .filter((step) => step.status !== 'DONE')")
  })

  it('🔴 已完成的步骤不给动作按钮', () => {
    const source = readSection()

    expect(source).toContain('class="step-actions"')
  })

  it('🔴 历史按**实际接种日**排在背骨上方，待做的落在今天及之后', () => {
    const source = readSection()

    /*
     * 老列表的读法是"未完成在前、已完成沉底"（2026-10-06）；
     * 鱼骨图的读法是**时间**：发生过的事在上面、今天在中间、下一针在下面。
     * 顺序规则本身在 vaccine-fishbone.spec.ts 里逐条钉着，这里只确认组件用了它。
     */
    expect(source).not.toContain('const pendingRank = (step: PlanStep)')
    expect(source).toContain('const fishboneLayout = computed(')
  })

  /**
   * 老板："狂犬疫苗第 4 次显示已逾期，但为什么待安排的狂犬疫苗却显示是第 5 次呢？
   * 如果第 4 次已经逾期了，那不是第 4 次就是应该是待安排的吗？"
   */
  it('🔴 同一类里前面没做完，就不显示后面那些（不许跳步）', () => {
    const source = readSection()

    expect(source).toContain('const seenPending = new Set<string>()')
    expect(source).toContain('blocked.add(step.key)')
  })
})


/**
 * 「下一针」变了就轻轻闪一下（2026-10-08 老板审计第 4 块）
 *
 * 家长改完一条记录之后，计划会重算 —— 但界面上看不出来。
 * 闪一下是为了回答"我刚才那下改动，让计划前进了吗"；
 * 只在**真的换了**的时候闪，第一次加载不闪。
 */
describe('计划 · 「下一针」变了闪一下（2026-10-08）', () => {
  const section = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('只在 key 真的变了、而且不是第一次加载时闪', () => {
    const source = section()

    expect(source).toContain('function highlightNextStepIfChanged()')
    expect(source).toContain("if (lastNextStepKey.value && key && key !== lastNextStepKey.value)")
    expect(source).toContain('plan-card__head--flash')
  })
})

/**
 * 竖版鱼骨图（2026-10-09 老板定）
 *
 * 老板："我希望重构一下疫苗板块的提醒和计划的UI。我们能否将该板块设计成鱼骨图？"
 * 后续确认：**竖着画**（时间自上而下）、每条骨上**历史 + 唯一一条下一针**；
 * 并且"如果鱼骨图可以提供足够的信息，记录板块顶部那条提醒也可以不要"。
 *
 * 布局顺序/折叠/今天的位置由 utils/vaccine-fishbone.spec.ts 逐条钉着，
 * 这里只守"这一屏该有的东西都在"。
 */
describe('接种计划 · 每类一张简卡（2026-10-11 老板改版，取代鱼骨图）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('不再有鱼头/背骨；改成"类别 + 状态 + 建议接种时间"的简卡列表', () => {
    const text = source()
    const tpl = text.slice(text.indexOf('<template>'), text.indexOf('</template>'))

    expect(tpl).not.toContain('fishbone__head')
    expect(tpl).not.toContain('fishbone__rail')
    expect(text).toContain('class="kind-card"')
    expect(text).toContain('kind-card__badge')
    expect(text).toContain('class="kind-card__toggle"')
  })

  it('点简卡各自展开；展开后是这一针的细节与动作', () => {
    const text = source()

    expect(text).toContain('@tap="toggleKind(card.key)"')
    expect(text).toContain('v-if="expandedKind === card.key"')
    expect(text).toContain('class="step-actions"')
  })

  it('展开内容里保留：哪一针 / 常见的有 / 依据 / 动作，以及安全提示', () => {
    const text = source()

    expect(text).toContain('免疫流程')
    expect(text).toContain('常见的有')
    expect(text).toContain('依据')
    expect(text).toContain('plan.conflicts')
  })
})

/**
 * ⚠️ 钉死（2026-10-11）：**零记录时计划板块里还藏着一道 v-if** ✗
 *
 * 老板在 测27~测30（零记录、2~5 周龄）上看到"没有任何疫苗接种计划"✗。
 * 外层 `sectionHidden` 改了 ✓，但模板里还有 `<template v-if="!noRecordAtAll">` ✗
 * → 零记录时里面**一个节点都不渲染** ✗。
 */
describe('疫苗计划 · 零记录不许再藏第二道（2026-10-11）', () => {
  it('模板里没有 v-if="!noRecordAtAll" 这种内层拦截', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )
    const tpl = source.slice(source.indexOf('<template>'), source.indexOf('</template>'))

    // 只看**属性**写法（注释里提到它没关系 ✓）
    expect(tpl.includes('<template v-if="!noRecordAtAll"')).toBe(false)
  })
})

/**
 * ⚠️ 合并的唯一理由：**有一支苗同时覆盖这几类**（老板 2026-10-12 第 1 条）
 *
 * 老板："我们合并核心疫苗和钩端螺旋体，是因为在同一个产品中覆盖这两类。
 *        你说的三类合并依据是什么呢？为什么要合并三类疫苗呢？
 *        只是因为狗狗没有注射，它们在同一个窗口期，我们就合并吗？不是这样的。"
 * —— 上一版只按"窗口有交集"就合并 ✗（零记录的老狗三项被并成一张卡 ✗，
 *    而现实里没有一支苗同时覆盖核心+钩端+狂犬 ✗）。
 */
describe('计划卡 · 拆开成两类，但互相提示可以选联苗（老板 2026-10-12 最终方案）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('一类一张卡（不再合并成一张 ✗）', () => {
    const text = source()

    expect(text).toContain('key: step.kind,')

    expect(text.includes("target.title = target.steps.map")).toBe(false)
  })

  it('两张卡互相提示：可以选含两类的联苗，也可以分开打', () => {
    const text = source()

    /*
     * ⚠️ 现在是**方案 B：分组框**（老板 2026-10-14 选定）——
     * 用一个框把"能一起打的两针"圈起来，说明只放在**框顶一行**。
     *
     * 走过的两版都不对，记在这儿：
     *   ① 各自卡里各说一遍 → 角度还不同，顾客要来回对照才拼得出意思
     *   ② 两张卡中间插一条 → 它在视觉上自成一格，顾客不会往两边联想
     *      （老板："用户很难通过中间这个板块联想到……这两个板块之间有什么关系"）
     */
    expect(text).toContain('combo-group__head')
    expect(text).toContain('combo-group__products')
    expect(text).toContain("card.comboRole === 'first'")
    /*
     * ⚠️ 老板 2026-10-13：**不要再提"错开 2~3 天"** ——
     * 联苗提示里那半句、以及卡片上那条 spacingNote 展示，两处都已删。
     */
    expect(text).not.toContain('请错开 2~3 天')
    expect(text).not.toContain('错开 2~3 天')
    /*
     * ⚠️ 判定搬到**后端**了（老板 2026-10-14）。
     *
     * 原来前端算的是"两张卡各自的推荐列表有没有交集" ✗ —— 会漏报：
     *   核心第 1 针在 6 周龄**故意不推**含钩端的苗（钩端要 8 周龄才起效），
     *   于是两张卡没有交集 ✗，可等到两窗口重合那段（8 周龄后）
     *   卫佳捌其实两边都够龄了 ✓。
     * 现在判据是"**重合窗口的周龄上，有没有一支苗同时覆盖两类且都够龄**" ✓，
     * 由后端算好下发（那套规则只有一份 ✓），前端只管渲染。
     */
    expect(text).toContain('card.combo')
    expect(text.includes('SIBLING_WINDOW_DAYS')).toBe(false)
    // 前端不再自己算（免得又出现两套规则）
    expect(text.includes('overlapOf(')).toBe(false)
    // 交集那几天要写出来 ✓
    expect(text).toContain('两针都合适的日期')
  })
})

/**
 * 窗口已过：改说「尽快补种」，不再把过去的日期当计划摆着（老板 2026-10-12 第 1、2 问）
 *
 * 老板："并没有『窗口已过，建议尽快补』的提示"✗
 *      "我记得我们之前说过，疫苗计划中不应该有过去时间窗口的计划。"
 * —— 原来那句话只在**窗口结束超过 90 天**时才出现 ✗（测49 的核心窗口
 *    2026-09-13 结束，到 10-12 才 29 天 ✗ → 什么都没说 ✓，
 *    而卡片上摆着一个已经过去的日期区间 ✗）。
 */
describe('计划卡 · 窗口已过的显示口径（2026-10-12）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('窗口一过就说「尽快补种」，并把原窗口放进括号', () => {
    const text = source()

    expect(text).toContain('function isWindowPassed(')
    expect(text).toContain('建议接种时间：尽快补种（原窗口')
  })

  it('判断口径是"结束日 < 今天"，不再是"超过 90 天"', () => {
    const text = source()

    expect(text).toContain('return end < todayDateText()')
  })
})

/**
 * ⚠️ 「都已完成」必须**加载成功之后**才能说（老板 2026-10-12 截图）
 *
 * 老板："怎么会在计划里面显示，所有的免疫程序都已经完成了呢？"
 * —— 接口明明返回 3 条待办 ✗。原因是空态判断只看了 kindCards 是否为空 ✗，
 *    而**数据还没到**时它也是空的 ✓ → 页面就先替系统下了结论 ✗。
 */
describe('计划卡 · 不许在数据到达前说"都已完成"（2026-10-12）', () => {
  it('加载中 → 说"正在读取"；只有 loaded 且确实为空才说"都已完成"', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    expect(source).toContain('正在读取接种计划')
    expect(source).toContain('v-else-if="loaded && kindCards.length === 0"')
  })
})

/**
 * ⚠️ 计划请求不许打转（老板 2026-10-12 实测）
 *
 * 症状：计划板块一直停在"正在读取接种计划…"✗
 * 证据：生产日志里同一个请求**每 1~2 秒重发一次**（每次 200 ✓）。
 * 原因：重复触发 + 每次触发都把 loaded 置回 false ✗ → 永远落不了定 ✗。
 * 修法：只监听狗狗本身 ✓ + 同一条狗在飞的时候不重复发 ✓。
 */
describe('计划卡 · 请求不打转（2026-10-12）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('只监听 props.dogId（不再监听数组 ✗）', () => {
    const text = source()

    expect(text).toContain('watch(() => props.dogId, load, { immediate: true })')
    // 只看**代码**写法（注释里引用了旧写法 ✓ 不算 ✗）
    expect(text.includes('watch(() => [props.dogId')).toBe(false)
  })

  it('同一条狗正在加载时不重复发请求', () => {
    const text = source()

    expect(text).toContain('if (loadingDogId === props.dogId)')
    expect(text).toContain('loadingDogId = props.dogId')
  })
})

/**
 * ⚠️ 计划请求不许"同一秒发一串"（老板 2026-10-12 实测）
 *
 * 证据：生产日志里 15:42:24 这一秒内**一次来了 5 条**计划请求 ✗
 * （每条都 200 ✓，返回约 1979 字节 ✓）——
 * 说明页面里同时活着好几个计划板块实例 ✓，单实例的"在飞守卫"挡不住它们 ✗。
 * 修法：模块级**短缓存**（按狗 20 秒 ✓），第二个及以后的实例直接用缓存 ✓。
 */
describe('计划卡 · 同一只狗的并发请求要被兜住（2026-10-12）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('有按狗的短缓存，且命中时直接套用响应（不再发请求）', () => {
    const text = source()

    expect(text).toContain('const planCache = new Map')
    expect(text).toContain('PLAN_CACHE_TTL_MS')
    expect(text).toContain('applyPlanResponse(cached.data)')
  })

  it('成功的响应会写进缓存', () => {
    expect(source()).toContain('planCache.set(props.dogId, { at: Date.now(), data: res.data })')
  })
})

/**
 * ⚠️ 两条硬教训（2026-10-12 老板截图）
 *
 * ① 卡片上出现「applyPlanResponse is not defined」✗ ——
 *    我把函数**用上了却忘了定义** ✗（替换锚点没匹配，静默失败 ✓），
 *    构建居然还过了 ✗ → 只有真机上才炸出来 ✓。
 * ② 那句话是**技术报错原文** ✗，甩给顾客毫无意义 ✓。
 */
describe('计划卡 · 加载失败只说人话 + 用到的函数必须有定义（2026-10-12）', () => {
  const source = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

  it('applyPlanResponse 有定义（不是只被调用过）', () => {
    const text = source()

    expect(text).toContain('function applyPlanResponse(')
    expect(text).toContain('applyPlanResponse(res.data)')
  })

  it('加载失败时界面不出现 error.message 原文', () => {
    const text = source()

    expect(text).toContain("loadError.value = '请稍后重试'")
    expect(text.includes('loadError.value = error?.message')).toBe(false)
  })
})

/**
 * ⚠️ 计划板块里不许出现"记录板块才有的函数"（2026-10-12 真机定位）
 *
 * 我在 isWindowPassed 里写了 getTodayDateString() ✗ ——
 * 那是**记录板块**里的别名 ✓，计划板块没有它 ✗ →
 * 渲染抛错 ✗ → 计划永远停在"正在读取接种计划…"✗，
 * 而错误只躺在控制台里 ✓（界面上完全看不出来 ✗）。
 * 定位方式：在小程序里钩住 wx.request + console.error ✓（这次就是靠它抓到的 ✓）。
 */
describe('计划卡 · 不许引用记录板块的函数（2026-10-12）', () => {
  it('日期比较用本组件里的 todayDateText()', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    expect(source).toContain('return end < todayDateText()')
    // 只看**调用写法**（注释里引用了错误写法 ✓ 不算 ✗）
    expect(source.includes('return end < getTodayDateString')).toBe(false)
  })
})

/**
 * ⚠️ dogApi 导入不许再被误删（2026-10-12）
 *
 * 撤回"精简录入窗"时我把 `import { dogApi }` 一起删掉了 ✗ ——
 * 可 load() 取计划数据正需要它 ✓ → 计划直接报错 ✓
 * （老板截图："接种计划没加载出来 请稍后重试"✓），
 * 而构建与测试全过 ✗、只有真机才炸 ✗。
 */
describe('计划卡 · dogApi 导入必须在（2026-10-12）', () => {
  it('用了 dogApi，就必须有它的导入', () => {
    const text = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccinePlanSection.vue'),
      'utf-8',
    )

    expect(text).toContain('dogApi.vaccinePlan(')
    expect(text).toContain("import { dogApi } from '../../api/dogs'")
  })
})
