import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf-8')

const PAGE_DIR = 'src/pages/custom-recipe'

/**
 * 食谱定制顾客端回归测试
 *
 * 背景（2026-09-25）：这条链路此前是"断电"状态 —— 页面写好了但没登记路由、
 * 接口缺 /api/v1 前缀、返回结构判断写成了 code === 200（后端是 0）、
 * 成功页日期写死、订单详情的跳转目标页面从未存在。
 * 这组测试把修复后的关键约定锁住，避免再次静默失效。
 */
describe('custom recipe customer flow', () => {
  it('registers every custom recipe page in pages.json', () => {
    const pagesJson = read('src/pages.json')

    expect(pagesJson).toContain('pages/custom-recipe/index')
    expect(pagesJson).toContain('pages/custom-recipe/success')
    expect(pagesJson).toContain('pages/custom-recipe/orders')
    expect(pagesJson).toContain('pages/custom-recipe/order-detail')
  })

  it('ships an order detail page so the list entry is not a dead link', () => {
    expect(existsSync(resolve(process.cwd(), `${PAGE_DIR}/order-detail.vue`))).toBe(
      true,
    )

    const orders = read(`${PAGE_DIR}/orders.vue`)
    expect(orders).toContain('/pages/custom-recipe/order-detail?orderId=')
  })

  it('calls the custom recipe APIs through the shared request client', () => {
    const submit = read(`${PAGE_DIR}/index.vue`)
    const orders = read(`${PAGE_DIR}/orders.vue`)
    const detail = read(`${PAGE_DIR}/order-detail.vue`)
    const success = read(`${PAGE_DIR}/success.vue`)

    for (const source of [submit, orders, detail, success]) {
      expect(source).toContain("from '@/utils/api'")
      expect(source).toContain('request(')
      // 不得再绕过统一封装直接 uni.request（会绕过 {code,message,data} 解包）
      expect(source).not.toContain('uni.request(')
    }
  })

  it('never treats response code 200 as success', () => {
    // 全站统一响应结构的成功码是 0；写成 200 会导致"下单成功却提示失败"
    for (const file of ['index.vue', 'orders.vue', 'order-detail.vue', 'success.vue']) {
      const source = read(`${PAGE_DIR}/${file}`)
      expect(source).not.toContain('code === 200')
      expect(source).not.toContain('code === 0 ||')
    }
  })

  it('keeps the fee and credit amount driven by the backend config', () => {
    const submit = read(`${PAGE_DIR}/index.vue`)

    expect(submit).toContain("url: '/custom-recipe-config'")
    expect(submit).toContain('feeAmount')
    expect(submit).toContain('creditAmount')
    expect(submit).toContain('deliveryWorkDays')
    // 定制费不得再写死在页面里
    expect(submit).not.toContain('提交定制订单 ¥299')
  })

  it('does not hardcode delivery dates on the success page', () => {
    const success = read(`${PAGE_DIR}/success.vue`)

    expect(success).not.toContain('2025年1月23日')
    expect(success).not.toContain('2025年1月28日')
    expect(success).toContain('estimatedDeliveryDate')
  })

  it('guards against duplicate submissions of the paid order', () => {
    const submit = read(`${PAGE_DIR}/index.vue`)

    expect(submit).toContain('submitting.value')
  })

  it('exposes my custom recipe orders from the me page', () => {
    const me = read('src/pages/me/index.vue')

    expect(me).toContain('我的定制订单')
    expect(me).toContain('@tap="goToCustomRecipeOrders"')
    expect(me).toContain('/pages/custom-recipe/orders')
  })

  // ==================== 微信支付接入（2026-09-25） ====================

  it('offers WeChat pay on every surface where a pending order can be paid', () => {
    // 提交成功页、订单详情页、订单列表 —— 三处都要能直接付款，少任何一处都会让顾客
    // 卡在"找不到付款入口"
    for (const file of ['success.vue', 'order-detail.vue', 'orders.vue']) {
      const source = read(`${PAGE_DIR}/${file}`)
      expect(source).toContain("from '@/utils/custom-recipe-payment'")
      expect(source).toContain('runCustomRecipePayment(')
    }
  })

  it('keeps the manual customer-service fallback when online pay is unavailable', () => {
    // 支付通道没配好时必须能降级为人工收款，否则订单收不到钱
    const success = read(`${PAGE_DIR}/success.vue`)
    const orders = read(`${PAGE_DIR}/orders.vue`)
    const detail = read(`${PAGE_DIR}/order-detail.vue`)

    for (const source of [success, orders, detail]) {
      expect(source).toContain("'MANUAL'")
    }

    /**
     * 2026-09-28：兜底入口从"让顾客加个人微信号"改成**企业微信客服**
     * （小程序已接入，后台 corp_id / open_kfid 均已配置）。
     * 降级能力本身必须保留，只是通道换了。
     */
    expect(success).toContain('CustomerServiceInlineButton')
    expect(success).toContain('请联系客服完成付款')
    // 订单列表页联系客服也走同一条通道
    expect(orders).toContain('openCustomerServiceChat')
  })

  it('treats a closed order as closed instead of pushing manual payment', () => {
    // 超时自动关单后，不能再引导顾客"加客服转账"
    const payment = read('src/utils/custom-recipe-payment.ts')

    expect(payment).toContain("'CLOSED'")
    expect(payment).toContain('已关闭')
    expect(payment).toContain('超过支付时间')
  })

  it('runs payment through the shared request client', () => {
    const payment = read('src/utils/custom-recipe-payment.ts')

    expect(payment).toContain("from './api'")
    expect(payment).toContain('/custom-recipe/orders/')
    expect(payment).toContain('/pay')
    expect(payment).toContain('/sync-payment')
    // 支付成功后必须主动补查一次，防止回调丢失
    expect(payment).toContain('syncCustomRecipePayment(orderId)')
  })
})

/**
 * 未登录 vs 没有狗狗档案（2026-09-27）
 *
 * 背景：App 是游客模式，不会自动登录。未登录的顾客点进食谱定制页时，
 * 读档案的请求拿到 401，页面却落到了"还没有狗狗档案"这个空态——
 * 于是同时弹出"请先登录"和"网络错误，请检查后端服务"两条互相打架的提示，
 * 还把顾客引向"创建狗狗档案"这条错路（建完才发现还得先登录）。
 * 这里把"两种空态必须分开表达"的约定锁住。
 */
describe('custom recipe auth gate', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('checks login state before requesting the dog list', () => {
    expect(submit).toContain('getToken')
    // 未登录时不发 /dogs：否则必然 401，既弹错提示又会落到错误的空态
    expect(submit).toMatch(/if\s*\(!getToken\(\)\)/)
  })

  it('asks a guest to log in instead of telling them they have no dog profile', () => {
    expect(submit).toContain('needLogin')
    expect(submit).toContain('请先登录')
    expect(submit).toContain('goToLogin')
    // 未登录空态与无档案空态是互斥的两个分支
    expect(submit).toContain('v-if="needLogin"')
    expect(submit).toContain('v-else-if="dogOptions.length > 0"')
    // 沿用全站统一的登录跳转约定，登录后回到本页
    expect(submit).toContain('/pages/login/index?redirect=')
    expect(submit).toContain("'/pages/custom-recipe/index'")
  })

  it('does not report a login failure as a network error', () => {
    // 401 被当成"网络错误"会让顾客去查自己的网络，排查方向完全错了
    expect(submit).toContain('isAuthError')
    expect(submit).toContain('Authentication required')
    // 错误提示由本页按原因自己给，避免统一封装再弹一条重复/矛盾的 toast
    expect(submit).toContain('suppressErrorToast: true')
  })

  it('does not invite a guest to submit an order', () => {
    // 未登录时提交按钮必然是灰的，此时的提示不能是"请选择狗狗和定制目标"
    expect(submit).toContain("title = '请先登录'")
    expect(submit).toContain('needLogin.value')
  })
})

/**
 * 档案摘要里的活动量显示（2026-09-27）
 *
 * 定制页会显示所选狗狗的活动量，但映射表只覆盖了 LOW/NORMAL/HIGH ——
 * 生产里还有 RESTING（静养，245 只）与 WORKING（工作犬，4 只），
 * 这两档的顾客会看到英文 "RESTING" / "WORKING"，完全看不懂。
 */
describe('custom recipe activity level labels', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('五个活动量档位都有中文文案', () => {
    for (const level of ['RESTING', 'LOW', 'NORMAL', 'HIGH', 'WORKING']) {
      expect(submit).toContain(`${level}:`)
    }
  })

  it('不再把原始英文枚举当作兜底展示', () => {
    // 兜底改成「未评估」，避免任何未知值直接漏成英文给顾客看
    const labelFn = submit.match(/const getActivityLabel = \([\s\S]*?\n\};/)?.[0] || ''
    expect(labelFn).not.toBe('')
    expect(labelFn).not.toContain('return map[level] || level')
    expect(labelFn).toContain('未评估')
  })
})

/**
 * 定制门槛：按「顾客确认过」判定 + 就地补确认（2026-09-27，决策 1 + U3）
 *
 * 体况评分、活动量、每日餐数在表单里都有兜底值 —— "有值"不代表顾客选过
 * （生产 4544 只狗里 3466 只体况评分等于默认值 5）。
 * 因此门槛必须看确认状态，否则永远拦不住任何人。
 *
 * 老档案不追溯：不主动打扰，只在顾客真的要定制时（此刻数据必须准确）要求补确认。
 */
describe('custom recipe profile gate', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('三项确认状态共同决定门槛', () => {
    expect(submit).toContain('bcsScoreConfirmed')
    expect(submit).toContain('activityLevelConfirmed')
    expect(submit).toContain('mealsPerDayConfirmed')
    expect(submit).toContain('gateBlocked')
    expect(submit).toContain('gateUnconfirmed')
  })

  it('未确认时挡住提交，并就地给出补确认入口', () => {
    expect(submit).toContain('开始定制前，请确认这几项')
    expect(submit).toContain('确认并继续')
    expect(submit).toContain('confirmGate')
    // canSubmit 必须把门槛算进去
    const canSubmitSource =
      submit.match(/const canSubmit = computed\(\(\) => \{[\s\S]*?\n\}\);/)?.[0] || ''
    expect(canSubmitSource).toContain('gateBlocked')
  })

  it('补确认时才带上确认标记（这就是门槛的判据）', () => {
    const confirmSource =
      submit.match(/const confirmGate = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''
    expect(confirmSource).not.toBe('')
    expect(confirmSource).toContain('bcsScoreConfirmed: true')
    expect(confirmSource).toContain('activityLevelConfirmed: true')
    expect(confirmSource).toContain('mealsPerDayConfirmed: true')
  })

  it('补确认成功后门槛立刻通过，不必退出重进', () => {
    const confirmSource =
      submit.match(/const confirmGate = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''

    expect(confirmSource).toContain('selectedDog.value = {')
  })

  it('餐数按老板定稿文案说明后果', () => {
    expect(submit).toContain('每日餐数影响制作单的生成，请确认')
    // 不得写成"影响价格"
    expect(submit).not.toMatch(/<text[^>]*>[^<]*影响价格/)
  })
})

/**
 * 品种名不能因为确认门槛而变成"未知品种"（2026-09-28）
 *
 * 真实缺陷：顾客点「确认并继续」后，页面把 `PUT /dogs/:id` 的响应整体合并进
 * 选中的狗，而那份响应当时漏回了 `breedName`（null）——
 * 于是品种行显示"未知品种"，而同一屏顶部的选择器还写着"面包 - 柯基"
 * （选择器用的是列表阶段拼好的字符串）。同一屏自相矛盾。
 *
 * 三层都锁住：服务端补齐字段（见 backend 的 dogs.controller.breed-name.spec.ts）、
 * 选择器文字改为派生、确认时只合并这次真正改动的字段。
 */
describe('custom recipe breed display', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('选择器显示的文字是派生的，不可能和品种行不一致', () => {
    expect(submit).toContain('const selectedDogLabel = computed(')
    expect(submit).toContain('{{selectedDogLabel}}')
    // 不能再直接用 dogOptions 里拼好的那份 label
    expect(submit).not.toContain('{{selectedDog.label}}')
  })

  it('品种行读的就是同一个字段', () => {
    expect(submit).toContain("{{selectedDog.breedName || '未知品种'}}")
  })

  it('补充列表项时不让接口字段覆盖 value / label', () => {
    const optionsSource =
      submit.match(/dogOptions\.value = dogs\.map\(\(dog: any\) => \(\{[\s\S]*?\}\)\);/)?.[0] || ''

    expect(optionsSource).not.toBe('')
    // 展开必须在前面，否则接口哪天回了同名字段就会把选择器弄坏
    expect(optionsSource.indexOf('...dog')).toBeLessThan(optionsSource.indexOf('value: dog.id'))
  })

  it('确认门槛时只合并这次真的改动的字段，不整体覆盖', () => {
    const confirmSource =
      submit.match(/const confirmGate = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''

    expect(confirmSource).not.toBe('')
    // 整体合并会把响应里缺失/为 null 的字段（当年就是 breedName）抹到页面上
    expect(confirmSource).not.toMatch(/\.\.\.updated,/)
    expect(confirmSource).toContain('bcsScore: updated.bcsScore')
    expect(confirmSource).toContain('activityLevel: updated.activityLevel')
    expect(confirmSource).toContain('mealsPerDay: updated.mealsPerDay')
    // 门槛只碰这三项 + 三项确认
    expect(confirmSource).toContain('bcsScoreConfirmed: true')
    expect(confirmSource).toContain('activityLevelConfirmed: true')
    expect(confirmSource).toContain('mealsPerDayConfirmed: true')
  })
})

/**
 * 定制页改造（2026-09-28 老板验收后确认的 6 条）
 *
 * 这一组对应老板逐条确认的决定：
 *   1. 带出档案已有信息（决策 3）
 *   2. 减重/增重以顾客选的为准，体况只给建议（B1）
 *   3. 选中目标后要给出具体的热量与克数（老板问题 1）
 *   4. 其他需求独立成模块、放到饮食偏好之后
 *   5. 饮食偏好标"可选"并从档案带出
 *   6. 写回健康档案要补知情同意（决策 9）+ 只增不删声明（决策 6）
 */
describe('custom recipe page · 档案带出与目标口径', () => {
  const page = read(`${PAGE_DIR}/index.vue`)

  it('选中狗狗后从档案带出过敏、疾病与口味偏好', () => {
    expect(page).toContain('loadDogArchiveInfo')
    expect(page).toContain('/custom-recipe/dogs/${dogId}/health-summary')
    // 后端这个汇总接口前端此前**从未调用过**
    expect(page).toContain('formData.value.allergies = Array.isArray(data.allergies)')
    expect(page).toContain('formData.value.medicalConditions = Array.isArray(data.medicalConditions)')
    expect(page).toContain('formData.value.preferredIngredients = splitFoodText(data.preferredFoods)')
    expect(page).toContain('formData.value.dislikedIngredients = splitFoodText(data.pickyFoods)')
    // 读不到档案不能挡住下单
    expect(page).toContain('healthSummary.value = null')
  })

  it('带出的内容要告诉顾客"这是从档案来的"', () => {
    expect(page).toContain('healthPrefillHint')
    expect(page).toContain('preferencePrefillHint')
    expect(page).toContain('已从档案带出')
  })

  it('档案里的体检/体重/疫苗作为只读参考展示', () => {
    expect(page).toContain('healthReferenceRows')
    expect(page).toContain('最近体重')
    expect(page).toContain('最近体检')
    expect(page).toContain('最近疫苗')
    expect(page).toContain('供参考，不会改动')
  })

  it('体况只给建议，不替顾客定目标', () => {
    expect(page).toContain('bcsAdviceText')
    expect(page).toContain('我们建议：减重')
    expect(page).toContain('这只是建议，最终由你决定')
  })

  it('选中目标后给出具体热量与克数', () => {
    expect(page).toContain('goalTargetSummary')
    expect(page).toContain('finalFoodKcal')
    expect(page).toContain('kcal${gramsText}')
    // 阶段 D2：克数改用估算值 —— 原先读的 dailyIntakeG 只在选了食谱后才有值，
    // 定制页因此一直显示「约 0 克」
    expect(page).toContain('estimatedDailyIntakeG')
    expect(page).toContain('约 ${Math.round(grams)} 克')
  })

  it('计划进行中时带出计划，并说明克数已按计划算', () => {
    // 阶段 D1：计划才是顾客当下真正在执行的方案，定制页必须看得见
    expect(page).toContain('selectedPlan')
    expect(page).toContain('loadSelectedPlan')
    expect(page).toContain('weightGoalPlanApi.current')
    expect(page).toContain('进行中')
    expect(page).toContain('下面的克数已经按这个计划算好了')
    // 文案要区分「按计划」与「按体况」，否则顾客不知道这个数字怎么来的
    expect(page).toContain('sourceText')
  })

  it('勾了健康管理不再覆盖顾客选的减重/增重目标', () => {
    // 原先写的是 targetGoal: enableHealthManagement ? 'HEALTH_SUPPORT' : targetGoal
    expect(page).not.toContain("'HEALTH_SUPPORT'")
    expect(page).toContain('needsHealthManagement: formData.value.enableHealthManagement')
    expect(page).toContain('targetGoal')
  })
})

describe('custom recipe page · 结构与知情同意', () => {
  const page = read(`${PAGE_DIR}/index.vue`)

  it('页面顺序：定制目标 → 饮食偏好 → 备注（可选）→ 交付说明', () => {
    const goalIndex = page.indexOf('定制目标')
    const preferenceIndex = page.indexOf('饮食偏好（可选）')
    const notesIndex = page.indexOf('备注（可选）')
    const deliveryIndex = page.indexOf('class="section delivery-section"')

    expect(goalIndex).toBeGreaterThan(-1)
    expect(preferenceIndex).toBeGreaterThan(goalIndex)
    // 备注独立成第 4 步，并且排在饮食偏好之后
    expect(notesIndex).toBeGreaterThan(preferenceIndex)
    expect(deliveryIndex).toBeGreaterThan(notesIndex)
  })

  it('「其他需求」不再留在定制目标卡片里', () => {
    const goalSection = page.slice(
      page.indexOf('定制目标'),
      page.indexOf('饮食偏好（可选）'),
    )

    expect(goalSection).not.toContain('其它需求')
    expect(page).toContain('备注（可选）')
    // 它只是给营养师看的备注，要讲清楚不参与计算
    expect(page).toContain('不会改变价格或热量计算')
  })

  it('饮食偏好两项都标了"可选"', () => {
    expect(page).toContain('喜欢的食材（可选）')
    expect(page).toContain('不吃的食材（可选）')
    expect(page).toContain('饮食偏好（可选）')
  })

  it('写回档案前必须明确同意（决策 9）', () => {
    expect(page).toContain('healthInfoConsent')
    expect(page).toContain('我同意把本次填写的过敏、疾病信息记入狗狗的健康档案')
    // 不同意就不能提交
    expect(page).toMatch(
      /willWriteBackToProfile\.value\s*&&\s*!formData\.value\.healthInfoConsent/,
    )
    // 而且不同意就不写回档案
    expect(page).toContain('formData.value.enableHealthManagement && formData.value.healthInfoConsent')
  })

  it('明确写清"只增不删"（决策 6）', () => {
    expect(page).toContain('不会删除你档案里已有的记录')
    expect(page).toContain('这里的增删只影响')
  })

  it('补上了附件上传入口（此前字段有、界面没有）', () => {
    expect(page).toContain('pickAttachment')
    expect(page).toContain('uploadHealthAttachment')
    expect(page).toContain('formData.value.attachmentUrls')
    expect(page).toContain('上传图片或 PDF')
  })
})

/**
 * 定制门槛的体况栏改用 4 个动作题（2026-09-29，阶段 C6）
 *
 * 真实缺陷：阶段 C1 把建档页的体况从「9 选 1」改成 4 个动作题，理由是
 * 「顾客看不懂 9 选 1，所以生产库 99.98% 从未确认过」。但定制页的门槛
 * 仍然挂着 1-9 分的下拉选择器 —— 而定制页恰恰是老档案**第一次真正被问到
 * 体况**的地方（老档案不追溯，进定制页才要求补确认）。
 * 等于把 C1 刚废掉的老问题又端到顾客面前。
 */
describe('custom recipe BCS gate · 与建档页统一为动作题（阶段 C6）', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('不再出现 1-9 分的体况选择器', () => {
    expect(submit).not.toContain('gateBcsOptions')
    expect(submit).not.toContain('onGateBcsChange')
    expect(submit).not.toContain('gateBcsIndex')
    // 九档自估文案不得再出现在任何地方
    expect(submit).not.toContain('严重肥胖')
    expect(submit).not.toContain('理想偏瘦')
  })

  it('复用与建档页同一套动作题库', () => {
    for (const fn of [
      'BCS_QUESTIONS',
      'resolveBcsFromAnswers',
      'getBcsLabel',
    ]) {
      expect(submit).toContain(fn)
    }
    expect(submit).toContain("from '@/utils/bcs-questionnaire'")
  })

  it('必答的两道「摸」题没答完就不让确认', () => {
    expect(submit).toContain('gateBcsPending')
    expect(submit).toMatch(/:disabled="gateSaving \|\| gateBcsPending"/)
  })

  it('提交的体况分来自动作答案，不是顾客自估', () => {
    const confirmSource =
      submit.match(/const confirmGate = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''

    expect(confirmSource).not.toBe('')
    expect(confirmSource).toContain('gateBcsResult.value.bcs')
    expect(confirmSource).not.toContain('gateDraft.value.bcsScore')
  })

  it('已经确认过的狗不重复问', () => {
    expect(submit).toContain('gateBcsAlreadyConfirmed')
    expect(submit).toMatch(/v-if="gateBcsAlreadyConfirmed"/)
  })

  it('换狗时清空上一只的答案', () => {
    const syncSource =
      submit.match(/function syncGateDraftFromDog\([\s\S]*?\n\}/)?.[0] || ''

    expect(syncSource).not.toBe('')
    expect(syncSource).toContain('gateBcsAnswers.value = {}')
  })

  it('提醒文案与逐题小字已删，全板块只留一个轻量 Banner', () => {
    expect(submit).not.toContain('长毛狗狗看不出来')
    expect(submit).not.toContain('question.hint')
    expect(submit).not.toContain('gateSpecialBreedHint')
    expect(submit).toContain('回答以下问题，确认狗狗的体态健康！')
  })

  it('单一动作题，且应用犬种分数下限', () => {
    expect(submit).not.toContain('skippable')
    expect(submit).not.toContain('BCS_SKIP')
    expect(submit).not.toContain('看不出来')
    expect(submit).not.toContain('isLongHaired')
    expect(submit).not.toContain('resolveQuestions')
    // 下限来自狗的档案接口（后端数据库里的犬种表）
    expect(submit).toContain('applyBcsScoreMap')
    expect(submit).toContain('bcsScoreMap')
    expect(submit).toContain('gateEffectiveBcs')
  })

  it('门槛仍然按「顾客确认过」判定，不看有没有值', () => {
    expect(submit).toContain('gateUnconfirmed')
    expect(submit).toContain('gateBlocked')
  })
})
