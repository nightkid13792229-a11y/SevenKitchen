import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf-8')

/**
 * 去掉注释后的源码。
 *
 * 断言"某句文案已经不存在"时**必须用它**，不能用原始源码 ——
 * 注释里为了说明"删掉了什么"往往会把那句话原样写进去，于是断言误伤自己
 * （2026-10-05 一天之内踩了三次，所以固化成公共辅助）。
 */
const stripComments = (src: string) =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

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
    // 未登录空态与无档案空态是互斥的两个分支（选狗器已并入 Banner，
    // 所以"有档案"这一支不再由 picker 表达，而是由空态条件排除）
    expect(submit).toContain('v-if="needLogin"')
    expect(submit).toContain('v-else-if="dogOptions.length === 0"')
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

  it('Banner 那一行小字是派生的，不可能和狗狗信息卡不一致', () => {
    // 2026-10-04：选狗器并入 Banner，原来"选择器文字 vs 品种行"两处打架的隐患
    // 变成"Banner 小字 vs 信息卡"——守住的仍然是「同一份数据只派生一次」
    expect(submit).toContain('const dogHeroLine = computed(')
    expect(submit).toContain('{{ dogHeroLine }}')
    // 品种必须与后端同一套口径解析（自定义品种优先），不在这里另写一份兜底
    expect(submit).toContain('resolveDogBreedName(')
    // 不能再直接用 dogOptions 里拼好的那份 label
    expect(submit).not.toContain('{{selectedDog.label}}')
  })

  it('品种行读的就是同一个字段', () => {
    // Banner 小字 = 品种 · 月龄 · 体重，三项都来自同一个 selectedDog
    expect(submit).toContain('calculateDogAgeText(dog.birthday)')
    expect(submit).toContain('formatHeroWeight(dog.currentWeightKg)')
    expect(submit).toContain('dogHeroLine')
    // 信息卡里删掉了重复的"品种 / 当前体重"两行，不再各写一份格式化
    expect(submit).not.toContain("{{selectedDog.breedName || '未知品种'}}")
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

  it('选中狗狗后从档案带出过敏与口味偏好', () => {
    expect(page).toContain('loadDogArchiveInfo')
    expect(page).toContain('/custom-recipe/dogs/${dogId}/health-summary')
    // 后端这个汇总接口前端此前**从未调用过**
    expect(page).toContain('formData.value.allergies = Array.isArray(data.allergies)')
    expect(page).toContain('formData.value.preferredIngredients = splitFoodText(data.preferredFoods)')
    expect(page).toContain('formData.value.dislikedIngredients = splitFoodText(data.pickyFoods)')
    // 读不到档案不能挡住下单
    expect(page).toContain('healthSummary.value = null')
    /**
     * 2026-10-04 老板要求删掉「疾病史」块 = 定制页不再录入疾病史，
     * 所以档案汇总里的 medicalConditions 也不再往表单里带。
     * 字段本身查询接口还会返回，只是这里不再采信（否则会跟着写回档案）。
     */
    expect(page).not.toContain('formData.value.medicalConditions')
  })

  it('带出的内容要告诉顾客"这是从档案来的"', () => {
    expect(page).toContain('healthPrefillHint')
    expect(page).toContain('preferencePrefillHint')
    expect(page).toContain('已从档案带出')
  })

  it('只读参考块随「健康管理」板块一起删除（含体检/体重/疫苗）', () => {
    // 2026-10-04 老板要求删掉「档案里已有的记录（供参考，不会改动）」整块。
    // 这些记录在健康管理页仍然看得到，定制页不再重复一份 —— 删除的是展示，
    // 不是数据能力（health-summary 接口照旧调用，过敏与口味仍从它带出）。
    expect(page).not.toContain('healthReferenceRows')
    expect(page).not.toContain('供参考，不会改动')
  })

  it('体况结论就是对客展示的方向，不再让顾客自选', () => {
    expect(page).toContain('bcsAdviceText')
    expect(page).toContain('我们建议：减重')
    // 2026-10-04 老板要求：删掉句尾那句"这只是建议，最终由你决定。"
    expect(page).not.toContain('这只是建议，最终由你决定')
    // 现在方向由系统定，这句话同时也就是提交给营养师的方向，
    // 页面上不能再出现可点的三个方向选项
    expect(page).not.toContain('weightManagementOptions')
    expect(page).not.toContain('@tap="selectWeightGoal')
  })

  it('体重管理卡片不再展示目标热量（2026-10-05 只保留最上方的提醒）', () => {
    /**
     * 演进：先是不显示克数（2026-10-04），
     * 后按老板要求把"你的目标 / 每天需要约 X kcal"整块删掉（2026-10-05），
     * 只留体况结论 + 去计划页的入口。
     */
    expect(page).not.toContain('goalTargetSummary')
    // 用去注释后的源码断言"文案已消失"（注释里提到它不算）
    expect(stripComments(page)).not.toContain('每天需要约')
    expect(page).not.toContain('约 ${Math.round(grams)} 克')
  })

  it('计划进行中时带出计划', () => {
    // 阶段 D1：计划才是顾客当下真正在执行的方案，定制页必须看得见
    expect(page).toContain('selectedPlan')
    expect(page).toContain('loadSelectedPlan')
    expect(page).toContain('weightGoalPlanApi.current')
    expect(page).toContain('进行中')
    expect(page).toContain('下面的每日能量已经按这个计划算好了')
  })

  it('页面不再有「需要健康管理」勾选，也不再由它改写顾客的目标', () => {
    // 原先写的是 targetGoal: enableHealthManagement ? 'HEALTH_SUPPORT' : targetGoal
    expect(page).not.toContain("'HEALTH_SUPPORT'")
    expect(page).not.toContain('enableHealthManagement')
    expect(page).not.toContain('toggleHealthManagement')
    // 目标字段仍然要传给后端（现在由系统按「计划 > 体况」推导）
    expect(page).toContain('targetGoal')
  })
})

describe('custom recipe page · 结构与知情同意', () => {
  const page = read(`${PAGE_DIR}/index.vue`)

  it('页面顺序：体重管理 → 过敏信息 → 饮食偏好 → 备注（可选）', () => {
    const goalIndex = page.indexOf('体重管理')
    const allergyIndex = page.indexOf('过敏信息')
    const preferenceIndex = page.indexOf('饮食偏好（可选）')
    const notesIndex = page.indexOf('备注（可选）')

    expect(goalIndex).toBeGreaterThan(-1)
    // 2026-10-04：原「1 选择狗狗」取消，其余步骤依次前移，
    // 过敏信息独立成第 2 步（原来嵌在健康管理勾选里）
    expect(allergyIndex).toBeGreaterThan(goalIndex)
    expect(preferenceIndex).toBeGreaterThan(allergyIndex)
    // 备注独立成第 4 步，并且排在饮食偏好之后
    expect(notesIndex).toBeGreaterThan(preferenceIndex)
    /**
     * 2026-10-05 老板要求：交付/抵扣整块删掉（确认页已有），
     * 所以它不再参与页面顺序。
     */
    expect(page).not.toContain('delivery-section')
  })

  it('「其他需求」不再留在体重管理卡片里', () => {
    const goalSection = page.slice(
      page.indexOf('体重管理'),
      page.indexOf('饮食偏好（可选）'),
    )

    expect(goalSection).not.toContain('其它需求')
    expect(page).toContain('备注（可选）')
    // 2026-10-05：那句"不会改变价格或热量计算"的提示按老板要求删掉了
    expect(page).not.toContain('不会改变价格或热量计算')
  })

  it('饮食偏好两项都标了"可选"（2026-10-05 改为爱吃 / 忌口）', () => {
    expect(page).toContain('爱吃的食材（可选）')
    expect(page).toContain('忌口的食材（可选）')
    expect(page).toContain('饮食偏好（可选）')
  })

  it('补上了附件上传入口（此前字段有、界面没有）', () => {
    expect(page).toContain('pickAttachment')
    expect(page).toContain('uploadHealthAttachment')
    expect(page).toContain('formData.value.attachmentUrls')
    /**
     * 2026-10-05 老板要求：删掉"上传资料（可选）"独立标题并进按钮文案、
     * 提示精简成"每次最多 N 张"、去掉"还没有上传资料"空态。
     * 同时取图只走相册（不弹"拍照/相册"选择器）。
     */
    expect(page).toContain("'上传资料（可选）'")
    expect(page).not.toContain('+ 上传照片')
    expect(page).not.toContain('还没有上传资料')
    expect(page).not.toContain('检测报告、化验单拍清楚即可')
    expect(page).toContain('每次最多 {{ maxAttachmentCount }} 张')
    expect(page).toMatch(/count: 1,[\s\S]{0,200}sourceType: \['album'\]/)
  })
})

/**
 * 过敏一定要存档 + 知情同意块彻底下线（2026-10-04 老板拍板）
 *
 * 老板原话口径：过敏信息"一定要存档"，所以 syncToHealthProfile 恒为 true，
 * 不再受任何勾选控制（后端写入是只增不删，不会删掉档案里已有的记录）。
 *
 * 知情同意块（原决策 9）是在老板被告知"这是你自己定的决策"之后，
 * 仍决定彻底去掉的 —— 所以这里不仅断言界面没有，也断言**相关字段与拦截
 * 一并删干净**，避免哪天又有人"顺手"加回一句告知文案。
 */
describe('定制页 · 过敏存档与知情同意下线', () => {
  const page = read(`${PAGE_DIR}/index.vue`)

  it('syncToHealthProfile 恒为 true，不再受任何勾选控制', () => {
    const submitSource =
      page.match(/const submitData = \{[\s\S]*?\n    \};/)?.[0] || ''

    expect(submitSource).not.toBe('')
    expect(submitSource).toContain('syncToHealthProfile: true')
    // 不得再出现"要写回先看同意 / 先看有没有勾健康管理"这类条件
    expect(submitSource).not.toContain('healthInfoConsent')
    expect(submitSource).not.toContain('enableHealthManagement')
    // 表单初值也是恒 true（提交前就有值，不会被中途改掉）
    expect(page).toMatch(/syncToHealthProfile: true,/)
  })

  it('needsHealthManagement 按"这一单有没有填过敏"推导', () => {
    expect(page).toContain('needsHealthManagement: formData.value.allergies.length > 0')
    // 疾病史已不再录入，不能拿它当依据
    expect(page).not.toContain('medicalConditions')
  })

  it('同意块与相关字段已彻底不存在', () => {
    for (const gone of [
      'consent-section',
      'toggleConsent',
      'healthInfoConsent',
      'willWriteBackToProfile',
      '我同意把本次填写的过敏、疾病信息记入狗狗的健康档案',
      '请先勾选同意',
    ]) {
      expect(page).not.toContain(gone)
    }
  })

  it('canSubmit 里没有同意判断，但仍按门槛判定', () => {
    const canSubmitSource =
      page.match(/const canSubmit = computed\(\(\) => \{[\s\S]*?\n\}\);/)?.[0] || ''

    expect(canSubmitSource).not.toBe('')
    expect(canSubmitSource).toContain('gateBlocked')
    expect(canSubmitSource).not.toContain('healthInfoConsent')
    expect(canSubmitSource).not.toContain('willWriteBackToProfile')
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

/**
 * 定制页首屏加载态（2026-10-04）
 *
 * 真实缺陷：狗狗档案是异步读的，请求还没回来页面就落到了"还没有狗狗档案"空态。
 * 一位明明有 3 只狗的顾客会被这句误报引导去重复建档。
 * 加载态、未登录态、空态必须是三个互斥的分支。
 */
describe('custom recipe first paint · 首屏加载态', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('请求未回来之前显示"正在读取"，不显示"还没有狗狗档案"', () => {
    expect(submit).toContain('dogsLoading')
    expect(submit).toContain('正在读取狗狗档案')
    // 三个分支互斥且顺序正确：未登录 → 加载中 → 空态。
    // 2026-10-04：选狗器搬进 Banner 之后，这一组状态卡里不再有 picker 分支，
    // 所以判据从"未登录 → 有档案 → 加载中 → 空态"变成上面这三支。
    // 空态用带 </text> 的实际元素定位，避免命中注释里提到的同一句话。
    const needLoginIndex = submit.indexOf('v-if="needLogin"')
    const loadingIndex = submit.indexOf('v-else-if="dogsLoading"')
    const emptyIndex = submit.indexOf('还没有狗狗档案</text>')

    expect(needLoginIndex).toBeGreaterThan(-1)
    expect(loadingIndex).toBeGreaterThan(needLoginIndex)
    // 空态文案排在加载分支之后（v-else-if 分支）
    expect(emptyIndex).toBeGreaterThan(loadingIndex)
    // Banner 里的选狗器也必须在（三种状态卡之外的唯一选狗入口）
    expect(submit).toContain('v-if="dogOptions.length > 1"')
  })

  it('初始就是加载态，且无论成功失败都会退出加载态', () => {
    expect(submit).toMatch(/const dogsLoading = ref\(true\)/)
    const loadDogsSource =
      submit.match(/const loadDogs = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''
    expect(loadDogsSource).not.toBe('')
    expect(loadDogsSource).toContain('finally')
    expect(loadDogsSource).toContain('dogsLoading.value = false')
  })
})

/**
 * 排期口径（2026-10-04 拍板）：顾客不选日期
 *
 * 后端自动排"最近可接单的工作日"（当天约满/节假日顺延），并把 scheduledDate、
 * estimatedDeliveryDate 返回。前端此前把"预约日期"当成顾客选的日子展示 ——
 * 于是出现"约满 → 让我选其他日期，但页面根本没有日期可选"的死路。
 */
describe('custom recipe scheduling · 系统自动排期', () => {
  /** 只看模板部分：注释里说明历史问题时仍会提到"预约日期" */
  const templateOf = (source: string) => source.slice(0, source.indexOf('<script'))

  it('三个页面的模板里都不再出现"预约"这一栏', () => {
    for (const file of ['index.vue', 'success.vue', 'orders.vue', 'order-detail.vue']) {
      expect(templateOf(read(`${PAGE_DIR}/${file}`))).not.toContain('预约')
    }
  })

  it('提交成功页把"预计交付"放到最显眼处，日期只认后端返回的值', () => {
    const success = read(`${PAGE_DIR}/success.vue`)

    expect(success).toContain('estimatedDeliveryDate')
    expect(success).toContain('delivery-card')
    expect(success).toContain('预计交付')
    // 前端不得自己造日期
    expect(success).not.toContain('scheduledDateText')
    expect(success).not.toContain('2025年1月23日')
  })

  it('订单列表与详情都显示后端排好的预计交付日', () => {
    const orders = read(`${PAGE_DIR}/orders.vue`)
    const detail = read(`${PAGE_DIR}/order-detail.vue`)

    for (const source of [orders, detail]) {
      expect(source).toContain('estimatedDeliveryDate')
      expect(source).toContain('排期中')
    }
  })

  it('提交页不再自己造排期日，载荷里不含 scheduledDate', () => {
    const submit = read(`${PAGE_DIR}/index.vue`)

    // 工作日数仍然只能来自 GET /custom-recipe-config
    expect(submit).toContain("url: '/custom-recipe-config'")
    expect(submit).toContain('deliveryWorkDays')
    /**
     * 2026-10-04 老板要求把交付小字精简成一句（原句里的"确切日期以订单为准"删掉）：
     * 上面那一行已经给了参考日期，小字只讲排期规则。原来锁"以订单为准"这句话的
     * 断言随之去掉，改锁精简后的原文 + 提交载荷里确实没有日期字段。
     *
     * 文案按代码里的原文定位，不按注释 —— 注释里会提到"原来那句写了什么"。
     *
     * 2026-10-05 更新：交付/抵扣整块已删，前端**不再自己估算交付日**
     * （那个估算不含节假日，国庆期间与后端权威日期打架）。
     */
    expect(submit).not.toContain('const deliveryNote')
    expect(submit).not.toContain('estimateDeliveryDate')
    // 前端不再把"当天"当成顾客选的预约日期塞给后端（CreateOrderDTO 已不采信该字段）
    expect(submit).not.toContain('getTodayDateString')
    expect(submit).not.toContain('scheduledDate:')
  })
})

/**
 * 下一步还要付款 + 支付时限（2026-10-04）
 *
 * 真实问题：提交前只讲交付与抵扣，按钮写"提交定制订单 ¥300"，
 * 顾客很容易以为点下去钱就付掉了；付不掉也不知道多久会被自动取消。
 */
describe('custom recipe payment copy · 下一步付款与时限', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('按钮讲清"下一步：支付"，金额仍来自后台配置', () => {
    expect(submit).toContain('下一步：支付')
    expect(submit).toContain('submitButtonText')
    // 旧按钮文案（容易被理解成已付款）必须消失
    expect(submit).not.toContain('提交定制订单 {{ feeLabel }}')
    expect(submit).toContain('feeAmount')
  })

  it('提交按钮下面不再写支付时限；也不重复一块"下一步：支付"', () => {
    /**
     * 2026-10-04 老板要求：删掉 pay-next-info 整块（底部固定栏已有金额与按钮）。
     * 2026-10-05 老板又要求：连「请在 30 分钟内完成支付，超时订单会自动取消」
     * 这句也删掉 —— 提交按钮下面保持干净，时限由成功页/待付款提醒去讲。
     */
    expect(submit).not.toContain('pay-next-info')
    expect(submit).not.toContain('提交后请在提交成功页')
    expect(submit).not.toContain('paymentHint')
    expect(submit).not.toContain('完成支付，超时订单会自动取消')
  })

  it('支付时限来自后端（公开配置），前端不写死分钟数', () => {
    const pages = ['index.vue', 'success.vue', 'orders.vue', 'order-detail.vue']
    for (const file of pages) {
      const source = read(`${PAGE_DIR}/${file}`)
      expect(source).toContain('paymentTimeoutMinutes')
      expect(source).toContain("url: '/custom-recipe-config'")
      // 不许把 30 分钟这类数值抄进页面
      expect(source).not.toContain('30 分钟')
      expect(source).not.toContain('paymentTimeoutMinutes = 30')
    }
  })

  it('三个"能看到待付款单"的页面都告知时限；订单对象优先用 paymentDeadlineAt', () => {
    for (const file of ['success.vue', 'orders.vue', 'order-detail.vue']) {
      const source = read(`${PAGE_DIR}/${file}`)
      expect(source).toContain('buildPaymentTimeoutHint')
      expect(source).toContain('paymentDeadlineAt')
    }

    const shared = read('src/utils/custom-recipe-order.ts')
    expect(shared).toContain('超时订单会自动取消')
    // 两个口径都没有时不许猜：返回空串，页面不显示时限文案
    expect(shared).toContain('resolvePaymentDeadlineAt')
  })
})

/**
 * 防连点 / 防重复提交（2026-10-04）
 *
 * 真实缺陷：submitting 原先在 `await requestCustomRecipeOrderSubscription()`
 * **之后**才置位。订阅授权会弹微信系统弹窗，顾客等得不耐烦再点一次，
 * 两次都会越过那道判断各下一单 —— 两张待付款订单。
 */
describe('custom recipe duplicate submit guard · 防连点', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('submitting 必须在订阅弹窗（第一个 await）之前置位', () => {
    const submitSource =
      submit.match(/const submitOrder = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''

    expect(submitSource).not.toBe('')

    // 带分号定位真正的代码行：注释里也会提到这两个名字
    const flagIndex = submitSource.indexOf('submitting.value = true;')
    const firstAwaitIndex = submitSource.indexOf(
      'await requestCustomRecipeOrderSubscription();',
    )

    expect(flagIndex).toBeGreaterThan(-1)
    expect(firstAwaitIndex).toBeGreaterThan(-1)
    expect(flagIndex).toBeLessThan(firstAwaitIndex)
  })

  it('按钮 disabled 带上 submitting，双击在界面层就被挡住', () => {
    expect(submit).toMatch(/:disabled="!canSubmit \|\| submitting"/)
  })

  it('失败要复位 submitting，否则改完内容再也提交不了', () => {
    const submitSource =
      submit.match(/const submitOrder = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''

    expect(submitSource).toContain('finally')
    expect(submitSource).toContain('submitting.value = false')
  })

  it('成功后用 redirectTo 作废表单，返回键不可能再交一单', () => {
    const submitSource =
      submit.match(/const submitOrder = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''

    expect(submitSource).toContain('uni.redirectTo({')
    expect(submitSource).not.toContain('uni.navigateTo({')
  })
})

/**
 * 待付款单提醒（2026-10-04 新增）
 *
 * 口径是**不限制下单张数**（顾客养多只狗可以分别定制），
 * 所以这是提醒、不是阻断 —— 绝不能做成"先付完才能再下单"。
 */
describe('custom recipe pending payment reminder · 待付款提醒', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)

  it('进页面就查有没有待付款的单', () => {
    expect(submit).toContain("url: '/custom-recipe/my-orders'")
    expect(submit).toContain("status: 'PENDING_PAYMENT'")
    expect(submit).toContain('loadPendingOrder')
    expect(submit).toContain('pendingOrder')
  })

  it('提示写明"还剩多久"，并给出继续支付/查看订单两个入口', () => {
    expect(submit).toContain('你有一张待付款的定制单')
    expect(submit).toContain('pendingOrderRemainingText')
    expect(submit).toContain('继续支付')
    expect(submit).toContain('viewPendingOrder')
    expect(submit).toContain('runCustomRecipePayment(')
  })

  it('只提醒不阻断：提交条件里没有"有待付款单就不许下单"', () => {
    const canSubmitSource =
      submit.match(/const canSubmit = computed\(\(\) => \{[\s\S]*?\n\}\);/)?.[0] || ''

    expect(canSubmitSource).not.toBe('')
    expect(canSubmitSource).not.toContain('pendingOrder')
    // 页面也要讲清"张数不限"，否则顾客不敢再下单
    expect(submit).toContain('定制张数不限')
  })
})

/**
 * 换狗必须隔离医疗数据（2026-10-04，数据安全问题）
 *
 * 真实缺陷：切换狗狗时用新狗档案覆盖 allergies / medicalConditions，
 * 但档案读取失败时只清了 healthSummary —— 于是**上一只狗的过敏与疾病留在新狗的
 * 单子上**，勾了"记入健康档案"还会被写回新狗的档案。医疗信息串狗可能直接导致喂错。
 */
describe('custom recipe dog switch isolation · 换狗隔离医疗数据', () => {
  const submit = read(`${PAGE_DIR}/index.vue`)
  const archiveSource =
    submit.match(/const loadDogArchiveInfo = async \(dogId: string\) => \{[\s\S]*?\n\};/)?.[0] ||
    ''

  it('先清空再填充：清空必须发生在任何 await 之前', () => {
    expect(archiveSource).not.toBe('')

    const clearAllergies = archiveSource.indexOf('formData.value.allergies = []')
    // 疾病史不再录入（2026-10-04 老板要求删掉那一块），所以这里只清过敏
    const firstAwait = archiveSource.indexOf('await ')

    expect(clearAllergies).toBeGreaterThan(-1)
    expect(firstAwait).toBeGreaterThan(-1)
    expect(clearAllergies).toBeLessThan(firstAwait)
  })

  it('读取失败时保持为空，绝不把上一只狗的数据留在表单里', () => {
    // 读失败分支里不允许再出现任何"沿用旧值"的赋值
    const catchSource = archiveSource.match(/catch \(error\) \{[\s\S]*?\n  \}/)?.[0] || ''
    expect(catchSource).not.toBe('')
    expect(catchSource).not.toContain('allergies')
    // 摘要也要清掉，否则"已从档案带出 N 项过敏"会和空表单自相矛盾
    expect(catchSource).toContain('healthSummary.value = null')
  })

  it('慢响应保护：等待期间换了狗就丢弃这份档案', () => {
    expect(archiveSource).toContain('formData.value.dogId !== dogId')
  })

  it('扫描出来的报告列表与候选过敏原也要跟着换狗清掉', () => {
    expect(archiveSource).toContain('allergyReports.value = []')
    // 组件重新挂载，内部候选不会被带到新狗身上
    expect(submit).toMatch(/:key="formData\.dogId"/)
  })
})

/**
 * 已取消 + 退款进度（2026-10-04）
 *
 * 后端枚举里有 CANCELLED，小程序两页都没接：列表直接把英文枚举名显示给顾客，
 * 详情降级成"定制订单"。顾客自助取消后发起的原路退款，顾客也完全看不到结果。
 */
describe('custom recipe cancelled & refund · 已取消与退款', () => {
  const shared = read('src/utils/custom-recipe-order.ts')
  const orders = read(`${PAGE_DIR}/orders.vue`)
  const detail = read(`${PAGE_DIR}/order-detail.vue`)

  it('状态/目标/日期金额文案只有一份，三个页面共用', () => {
    for (const file of ['success.vue', 'orders.vue', 'order-detail.vue']) {
      const source = read(`${PAGE_DIR}/${file}`)
      expect(source).toContain("from '@/utils/custom-recipe-order'")
      // 不许再各抄一份状态表（漏掉 CANCELLED 的根因）
      expect(source).not.toContain("PENDING_PAYMENT: '待付款'")
      expect(source).not.toContain('const GOAL_TEXT')
    }
    expect(shared).toContain('export const CUSTOM_RECIPE_STATUS_TEXT')
    expect(shared).toContain('export const CUSTOM_RECIPE_GOAL_TEXT')
  })

  it('「已取消」在列表与详情都有文案，且与后台口径一致', () => {
    expect(shared).toContain("CANCELLED: '已取消'")
    expect(orders).toContain('customRecipeStatusText')
    expect(detail).toContain('customRecipeStatusText')
    // PAID 以后台口径为准：「已付款」，不再替后端承诺"等待制作"
    expect(shared).toContain("PAID: '已付款'")
    expect(shared).not.toContain('等待制作')
  })

  it('未知状态兜底成中文，绝不漏英文枚举给顾客', () => {
    expect(shared).toContain('状态待确认')
    expect(orders).not.toMatch(/textMap\[status\] \|\| status/)
  })

  it('列表的「已取消」有对应样式档位', () => {
    expect(shared).toContain("CANCELLED: 'cancelled'")
    expect(orders).toContain('.status-badge.cancelled')
  })

  it('已取消的单展示退款进度（退款中 / 已退款 ¥XX / 退款失败）', () => {
    for (const source of [orders, detail]) {
      expect(source).toContain('describeCustomRecipeRefund')
      expect(source).toContain('refundStatus')
      expect(source).toContain('refundAmount')
    }

    expect(shared).toContain('退款中')
    expect(shared).toContain('已退款')
    expect(shared).toContain('退款未成功，请联系客服')
    // 退款失败要有独立样式档位，不能被当成普通文案
    expect(detail).toContain('refund-card--failed')
  })

  it('退款状态认不出来时不显示（退款进度不能靠猜）', () => {
    expect(shared).toContain('return null')
    expect(orders).toMatch(/describeCustomRecipeRefund\(order\)\?\.text \|\| ''/)
  })

  it('自助取消时当场告知退款结果，退款失败不能只提示"已发起"', () => {
    // 取消接口的响应里就带 refundStatus，不能等顾客几天后自己翻订单
    expect(detail).toContain('res?.data?.refundStatus')
    expect(detail).toContain('已取消，但退款未成功，请联系客服')
  })
})

/**
 * 登录态过期（2026-10-04）
 *
 * 真实问题：订单列表与订单详情把 401 当成"网络错误"，顾客会去查自己的 WiFi，
 * 排查方向完全错了。要提示"登录已过期，请重新登录"并给出登录入口。
 */
describe('custom recipe auth expired · 登录态过期', () => {
  it('订单列表区分"登录已过期"与"网络错误"', () => {
    const orders = read(`${PAGE_DIR}/orders.vue`)

    expect(orders).toContain('isAuthError')
    expect(orders).toContain('Authentication required')
    expect(orders).toContain('登录已过期，请重新登录')
    expect(orders).toContain('needLogin')
    expect(orders).toContain('@tap="goToLogin"')
    expect(orders).toContain('/pages/login/index?redirect=')
  })

  it('订单详情同样区分，并带上回本页的 redirect', () => {
    const detail = read(`${PAGE_DIR}/order-detail.vue`)

    expect(detail).toContain('isAuthError')
    expect(detail).toContain('登录已过期，请重新登录')
    expect(detail).toContain('needLogin')
    expect(detail).toContain('/pages/login/index?redirect=')
    expect(detail).toContain('/pages/custom-recipe/order-detail?orderId=')
  })

  it('未登录时不再白打一次必然 401 的请求', () => {
    const orders = read(`${PAGE_DIR}/orders.vue`)
    const detail = read(`${PAGE_DIR}/order-detail.vue`)

    expect(orders).toMatch(/if \(!getToken\(\)\)/)
    expect(detail).toMatch(/if \(!getToken\(\)\)/)
  })
})

/**
 * 首页游客点定制卡（2026-10-04）
 *
 * 真实缺陷：登录时不带 redirect，登录完落回首页，顾客刚点的"去定制"白点了。
 */
describe('home custom recipe entry · 游客登录后回到定制页', () => {
  const home = read('src/pages/home/index.vue')

  it('checkLoginAndNavigate 把目标页带进登录链接', () => {
    expect(home).toContain('checkLoginAndNavigate')
    expect(home).toContain('/pages/login/index?redirect=')
    // 登录成功后必须回到顾客刚点的地方
    expect(home).toMatch(/goToLogin\(url\)/)
    expect(home).toContain("checkLoginAndNavigate('/pages/custom-recipe/index')")
  })

  it('goToLogin 只认字符串参数，模板直接绑定时不会被事件对象污染', () => {
    expect(home).toMatch(/const goToLogin = \(redirect\?: unknown\) => \{/)
    expect(home).toContain("typeof redirect === 'string'")
  })
})

/**
 * 方向改成"系统定 + 只读展示"（老板 2026-10-04 拍板）。
 *
 * 原先：上面横幅写着"减重计划进行中、还差 0.8kg"，下面又让顾客选一次方向，
 * 可以选出"增重"这种自相矛盾的组合，而两个值都会交给营养师；
 * 而且顾客还能在自己没有计划时随手选一个与体况相反的方向。
 *
 * 现在三个单选框整组删掉，方向由系统按「计划 > 体况」定：
 *   ① 计划进行中 → 减重计划给 LOSE_WEIGHT，增重计划给 GAIN_WEIGHT
 *   ② 维持期 → MAINTAIN
 *   ③ 没有计划 → BCS ≥ 6 减重、≤ 3 增重、其余维持
 *      （与后端 resolveSuggestedPlan 同一套判据：6/7/9 减重、1/2/3 增重、4-5 不建议）
 */
describe('定制页 · 体重管理引导进计划页', () => {
  const page = read(`${PAGE_DIR}/index.vue`)

  it('不再有减重/维持/增重三个单选', () => {
    expect(page).not.toContain('weightManagementOptions')
    expect(page).not.toContain('@tap="selectWeightGoal')
    expect(page).not.toContain('radio-group')
    expect(page).not.toContain('radio-item')
    // 顾客选不了方向，原来那套"锁住不让点"的界面逻辑也一并删掉
    expect(page).not.toContain('isGoalLockedByPlan')
    expect(page).not.toContain('planGoalLockText')
  })

  it('有按钮跳体重管理计划页，参数名用该页真正接收的 dogId', () => {
    expect(page).toContain('goToWeightGoalPlan')
    expect(page).toContain('planEntryButtonText')
    expect(page).toContain('/pages/weight-goal-plan/index?')
    expect(page).toContain('dogId=${encodeURIComponent(dogId)}')
    // 该页 onLoad 读的就是 options.dogId（见 weight-goal-plan/index.vue）
    const planPage = read('src/pages/weight-goal-plan/index.vue')
    expect(planPage).toContain('options?.dogId')
  })

  it('有计划时带 mode=adjust，避免撞上"已经有一个进行中的计划"', () => {
    /**
     * 该页 mode 不传就是 create；有计划的狗再走 create，
     * 后端 createPlan 会直接抛「这只狗狗已经有一个进行中的计划了」——
     * 顾客点了「查看体重管理计划」只会看到一句报错。
     */
    expect(page).toContain("query.push('mode=adjust')")
    const goSource =
      page.match(/const goToWeightGoalPlan = \([\s\S]*?\n\};/)?.[0] || ''
    expect(goSource).not.toBe('')
    expect(goSource).toContain('hasOpenPlan.value')
    // 该页只认 'adjust' 这一个 mode 值
    expect(read('src/pages/weight-goal-plan/index.vue')).toContain(
      "options?.mode === 'adjust' ? 'adjust' : 'create'",
    )
  })

  it('按钮文案区分"有计划"与"没有计划"', () => {
    expect(page).toContain('查看体重管理计划')
    expect(page).toContain('去制定体重管理计划')
    // 有计划才说"查看"，没计划才说"去制定"。
    // 后端 getCurrentPlan 只回 ACTIVE / PAUSED / MAINTENANCE 三种，
    // 已暂停的计划也算"还在"，说"去制定"会让顾客以为计划没了。
    const openPlanSource =
      page.match(/const hasOpenPlan = computed\(\(\) => \{[\s\S]*?\n\}\);/)?.[0] || ''
    expect(openPlanSource).not.toBe('')
    expect(openPlanSource).toContain("'ACTIVE'")
    expect(openPlanSource).toContain("'PAUSED'")
    expect(openPlanSource).toContain("'MAINTENANCE'")
    expect(page).toMatch(
      /planEntryButtonText = computed\(\(\) =>\s*hasOpenPlan\.value/,
    )
  })

  it('方向按「计划 > 顾客选的方向」推导', () => {
    expect(page).toContain('function resolveTargetGoal')
    expect(page).toContain('syncGoalWithPlan')

    const resolveSource =
      page.match(/function resolveTargetGoal\(\): string \{[\s\S]*?\n\}/)?.[0] || ''
    expect(resolveSource).not.toBe('')

    // ① 计划进行中：减重计划 / 增重计划（计划优先，顾客选的那个不生效）
    expect(resolveSource).toContain("plan.direction === 'LOSS' ? 'LOSE_WEIGHT' : 'GAIN_WEIGHT'")
    // ② 维持期
    expect(resolveSource).toContain("plan.status === 'MAINTENANCE'")
    // ③ 没有计划：按顾客自己选的方向（2026-10-05 第三批改成三选一）
    expect(resolveSource).toContain("weightGoalChoice.value === 'LOSS'")
    expect(resolveSource).toContain("weightGoalChoice.value === 'GAIN'")
    expect(resolveSource).toContain("weightGoalChoice.value === 'MAINTAIN'")
    // 计划判断在前：有计划的狗必须听计划的
    expect(resolveSource.indexOf('const plan = selectedPlan.value')).toBeLessThan(
      resolveSource.indexOf("weightGoalChoice.value === 'LOSS'"),
    )
  })

  it('计划读到/读不到、换狗、补确认体况之后都要重算方向', () => {
    // 换狗时先按新狗体况定一次，计划读回来再对齐（避免页面短暂显示上一只狗的方向）
    const onDogChangeSource =
      page.match(/const onDogChange = \(e: any\) => \{[\s\S]*?\n\};/)?.[0] || ''
    expect(onDogChangeSource).not.toBe('')
    expect(onDogChangeSource).toContain('syncGoalWithPlan()')

    // 补确认改过体况，方向必须跟着变
    const confirmSource =
      page.match(/const confirmGate = async \(\) => \{[\s\S]*?\n\};/)?.[0] || ''
    expect(confirmSource).not.toBe('')
    expect(confirmSource).toContain('syncGoalWithPlan()')

    // 计划请求失败也要落回体况那一层，不能把方向留成空
    const planSource =
      page.match(/async function loadSelectedPlan\(dogId: string\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(planSource).not.toBe('')
    expect(planSource).toContain('syncGoalWithPlan()')
  })

  it('给顾客看的文案不含专业术语（体况评分 / 理想体重 / BCS）', () => {
    /**
     * 老板 2026-10-04 的要求：面向普通狗家长，尽量不用专业术语。
     *
     * 这里**逐个锁定给顾客看的新原文**，而不是断言整份源码不含某些词 ——
     * 源码注释里出现领域术语是正常的（这条测试第一版就误伤了自己的注释）。
     */
    const customerFacingCopy = [
      '查看体重管理计划',
      '去制定体重管理计划',
    ]

    for (const copy of customerFacingCopy) {
      expect(page).toContain(copy)
      expect(copy).not.toContain('体况')
      expect(copy).not.toContain('理想体重')
      expect(copy).not.toContain('BCS')
    }
  })
})

/**
 * 过敏快速选择改成 toggle（2026-10-04）。
 *
 * 改前标签只能"加"：点错了得跑到下面的过敏列表里找到那一条再点「删除」，
 * 同一个标签要管两处；而且下面还挂着一句"点一下就加，不用打字："的提示，
 * 标签本身看不出能不能取消。
 */
describe('定制页 · 过敏快速选择是开关', () => {
  const page = read(`${PAGE_DIR}/index.vue`)

  /**
   * 去掉 HTML 与 JS 注释后的源码。
   *
   * 这一组要断言的是"页面上真的没有这些东西了"。源码注释里出现历史背景
   * （"原先嵌在「需要健康管理」勾选里"、"2026-09-28 修复……"）是好事，
   * 不该被当成还在页面上；所以先把注释剔掉再断言。
   */
  const liveSource = page
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n')

  it('再点一下取消：同一个函数既加也删', () => {
    expect(page).toContain('const toggleAllergenByName = (name: string) => {')
    expect(page).toContain('@tap="toggleAllergenByName(name)"')
    // 手输走 addAllergenByName（手输的那条档案里没有，不该一点就把已有记录删掉）
    expect(page).toContain('const addAllergenByName = (name: string) => {')

    const toggleSource =
      page.match(/const toggleAllergenByName = \(name: string\) => \{[\s\S]*?\n\};/)?.[0] || ''
    expect(toggleSource).not.toBe('')
    // 已选中 → splice 掉
    expect(toggleSource).toContain('formData.value.allergies.splice(index, 1)')
    // 未选中 → push 进去
    expect(toggleSource).toContain('formData.value.allergies.push(value)')
    // 选中态只认一个判据，不会出现"看着选中其实没选中"
    expect(page).toContain('isAllergenAdded(name)')
  })

  it('删掉"点一下就加，不用打字"这句提示', () => {
    expect(page).not.toContain('点一下就加')
    expect(page).not.toContain('allergen-quick-add__hint')
  })

  it('过敏信息常驻显示，不需要先勾选才能出现', () => {
    // 界面上与代码里都不能再有这个勾选（注释里提历史背景不算）
    expect(liveSource).not.toContain('enableHealthManagement')
    expect(liveSource).not.toContain('需要健康管理')
    expect(liveSource).not.toContain('toggleHealthManagement')
    // 过敏板块的标题与手输、扫描、已传报告都在
    expect(page).toContain('过敏信息')
    expect(page).toContain('addAllergen')
    expect(page).toContain('<AllergyScanBlock')
    expect(page).toContain('已上传的检测报告')
  })

  it('疾病史与只读参考块彻底不在定制页', () => {
    for (const gone of [
      '疾病史',
      'addCondition',
      'removeCondition',
      'medicalConditions',
      'healthReferenceRows',
      '档案里已有的记录',
      '这里的增删只影响',
    ]) {
      expect(liveSource).not.toContain(gone)
    }
  })
})

/**
 * Banner 融入狗狗选择器（2026-10-04 老板要求）。
 *
 * 原来的 page-header（"专属食谱定制"标题块）与「1 选择狗狗」卡片合成了
 * 一个身份 Banner：参考健康管理页的 hero-card，头像 + 名字 + 「切换 ▼」，
 * 多只狗时整块用 <picker> 包住。
 */
describe('定制页 · Banner 融入选狗器', () => {
  const page = read(`${PAGE_DIR}/index.vue`)
  const template = page.slice(0, page.indexOf('<script'))

  it('用 hero-card 替换了原来的标题块', () => {
    expect(template).toContain('class="hero-card"')
    expect(page).toContain('.hero-card__avatar')
    expect(page).toContain('.hero-card__identity-inner')
    // 旧标题块彻底删掉（不只是隐藏）
    expect(template).not.toContain('page-header')
    expect(template).not.toContain('page-title')
    expect(template).not.toContain('专属食谱定制')
  })

  it('多只狗时整块身份区用 picker 包住，点"切换 ▼"能换狗', () => {
    expect(template).toMatch(/<picker[\s\S]*?mode="selector"[\s\S]*?<\/picker>/)
    expect(template).toContain(':range="dogOptions"')
    expect(template).toContain('range-key="name"')
    expect(template).toContain(':value="dogPickerIndex"')
    expect(template).toContain('@change="onDogChange"')
    expect(template).toContain('切换 ▼')
    expect(page).toContain('const dogPickerIndex = computed(')
  })

  it('Banner 里带一行 品种 · 月龄 · 体重，并含三项档案事实', () => {
    expect(template).toContain('{{ dogHeroLine }}')
    expect(page).toContain('const dogHeroLine = computed(')
    // 2026-10-05 老板要求：删掉定位文案，并把生命阶段/体况评分/活动量挪进 Banner
    expect(template).not.toContain('告诉我们它的情况，我们来单独设计一道')
    expect(template).toContain('hero-card__facts')
    expect(template).toContain('生命阶段')
    expect(template).toContain('体况评分')
    expect(template).toContain('活动量')
    // 头像与健康管理页同一套兜底（没上传就用默认头像）
    expect(page).toContain('resolveDogAvatarSrc')
    expect(template).toContain(':src="dogAvatarSrc"')
  })

  it('未登录 / 正在读取 / 没有档案三个状态卡都还在 Banner 下方', () => {
    const heroIndex = template.indexOf('class="hero-card"')
    const needLoginIndex = template.indexOf('v-if="needLogin"')
    const loadingIndex = template.indexOf('v-else-if="dogsLoading"')
    const emptyIndex = template.indexOf('v-else-if="dogOptions.length === 0"')

    expect(heroIndex).toBeGreaterThan(-1)
    expect(needLoginIndex).toBeGreaterThan(heroIndex)
    expect(loadingIndex).toBeGreaterThan(needLoginIndex)
    expect(emptyIndex).toBeGreaterThan(loadingIndex)
    // 三个状态卡各自的下一步动作也都在（去登录 / 创建档案）
    expect(template).toContain('@tap="goToLogin"')
    expect(template).toContain('@tap="goToCreateDog"')
  })
})

/**
 * 交付文案精简 + 删掉重复的支付块（2026-10-04 老板要求）。
 */
describe('定制页 · 交付说明与支付块', () => {
  const page = read(`${PAGE_DIR}/index.vue`)

  it('交付与抵扣整块已删（改由确认页展示）', () => {
    /**
     * 2026-10-05 老板决定：定制页不再显示"预计交付 + 成品抵扣"。
     * 两个理由：① 提交前那个日期是前端估的、不含节假日，会与后端权威日期打架；
     * ② 确认页（提交成功页）本来就完整显示这两项。
     */
    expect(page).not.toContain('deliveryHint')
    expect(page).not.toContain('deliveryNote')
    expect(page).not.toContain('creditHint')
    // 文案断言要用去注释后的源码（删块说明的注释里会提到这两项）
    expect(stripComments(page)).not.toContain('预计交付')
    expect(stripComments(page)).not.toContain('成品抵扣')
    // 确认页确实还在展示这两项（否则顾客就再也看不到了）
    const success = read(`${PAGE_DIR}/success.vue`)
    expect(success).toContain('预计交付')
    expect(success).toContain('成品抵扣额度')
  })

  it('pay-next-info 整块已删，底部固定栏保留', () => {
    expect(page).not.toContain('pay-next-info')
    expect(page).not.toContain('pay-next-title')
    expect(page).not.toContain('pay-next-desc')
    expect(page).not.toContain('提交后请在提交成功页')
    // 底部固定栏的按钮仍在（文案已改为"确认定制"）
    expect(page).toContain('submitButtonText')
  })
})

/**
 * 定制页第二轮精简（老板 2026-10-05，附体验版截图 14 条）。
 *
 * 这一组把"删了什么、改成了什么"逐条钉住 —— 删文案最容易在后续迭代里
 * 被人顺手加回来，所以删除项也要有断言。
 */
describe('定制页 · 第二轮精简（2026-10-05）', () => {
  const page = read(`${PAGE_DIR}/index.vue`)
  /**
   * 去掉注释后的源码。
   *
   * 断言"某句文案已经不存在"时**不能用原始源码** —— 注释里为了说明"删掉了什么"
   * 往往会把那句话写进去，于是断言误伤自己（这个坑今天踩了三次）。
   */
  const stripComments = (src: string) =>
    src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  const code = stripComments(page)
  const template = code.slice(0, code.indexOf('<script setup'))

  it('第一步标题改为「体重管理」，且不再有重复的分组标题', () => {
    expect(template).toMatch(/step-number">1<\/text>\s*<text class="title-text">体重管理<\/text>/)
    expect(code).not.toContain('定制目标')
    expect(code).not.toContain('group-title')
  })

  it('体重管理卡片只保留最上方的提醒 + 计划入口', () => {
    // 用真实标记定位（去注释后就没有"第一步：…"这类锚点了）
    const section = template.slice(
      template.indexOf('<text class="title-text">体重管理</text>'),
      template.indexOf('<text class="title-text">过敏信息</text>'),
    )
    expect(section).toContain('bcsAdviceText')
    expect(section).toContain('plan-entry-btn')
    // "你的目标 / 每天需要约 X kcal"那一整块按老板要求删掉
    expect(section).not.toContain('goalTargetSummary')
    expect(section).not.toContain('每天需要约')
  })

  it('过敏板块：删掉"它不能吃的东西"标题与档案空态提示', () => {
    expect(code).not.toContain('它不能吃的东西')
    expect(code).not.toContain('档案里还没有过敏记录')
    expect(template).toContain('过敏信息')
  })

  it('过敏快速选择：选中不加勾、也不在下方重复列一遍', () => {
    expect(code).not.toContain("isAllergenAdded(name) ? ' ✓' : ''")
    expect(code).toContain('const customAllergens = computed(')
    expect(template).toContain('customAllergens')
    expect(template).not.toContain('v-for="(allergen, index) in formData.allergies"')
    expect(code).not.toContain('暂无过敏信息')
  })

  it('检测报告按钮：无标题说明、文案改为上传过敏检测报告、只走相册', () => {
    const scan = read('src/components/custom-recipe/AllergyScanBlock.vue')
    expect(scan).not.toContain('有检测报告？拍一下自动读')
    expect(scan).not.toContain('过敏原检测报告即可')
    expect(scan).toContain("'上传过敏检测报告'")
    expect(scan).toMatch(/sourceType: \['album'\]/)
    expect(scan).not.toContain("'camera'")
  })

  it('成品抵扣说明已随整块移出定制页（第 12 项与第 14 项冲突，以第 14 项为准）', () => {
    /**
     * 老板 2026-10-05 先要求改抵扣文案（第 12 项），随后又问"整块能不能删"（第 14 项）
     * 并选定**整块删掉**。所以定制页不再有这句文案，
     * 抵扣由确认页展示（那里有额度 + 完整说明）。
     */
    expect(page).not.toContain('可用作抵扣该食谱的鲜食成品费用')
    expect(read(`${PAGE_DIR}/success.vue`)).toContain('成品抵扣额度')
  })

  it('提交按钮改为「确认定制」（它不做支付，只下单+订阅授权+跳下一步）', () => {
    expect(code).toContain("const submitButtonText = '确认定制'")
    expect(code).not.toContain('下一步：支付')
    // 支付确实在后面那一步：提交里不能出现 requestPayment
    const submit = code.slice(code.indexOf('const submitOrder'))
    expect(submit.slice(0, submit.indexOf('uni.redirectTo'))).not.toContain('requestPayment')
  })
})

/**
 * 2026-10-05 第二批（老板看截图提的 6 条）。
 *
 * 这一批都是"页面上看着不对"的问题，所以断言尽量落在**真实标记与顺序**上，
 * 而不是某句话在不在源码里 —— 顺序错了（按钮跑回顶部）也算没改对。
 */
describe('定制页 · 2026-10-05 第二批（6 条）', () => {
  const page = read(`${PAGE_DIR}/index.vue`)
  const code = stripComments(page)
  const template = code.slice(0, code.indexOf('<script setup'))

  it('① Banner 与「1 体重管理」之间不再有空白卡：状态区按内容出现', () => {
    /**
     * 根因：那张卡原先常驻渲染，而它下面五个分支（计划横幅 / 门槛卡 / 未登录 /
     * 读取中 / 无档案）在"已登录 + 有档案 + 门槛已确认 + 没有计划"这个最常见的
     * 正常状态下一条都不成立，于是只剩内边距与白底 —— 就是老板看到的那片白。
     */
    expect(template).toContain('v-if="showStatusSection"')
    expect(code).toContain('const showStatusSection = computed(')

    const section = code
      .match(/const showStatusSection = computed\([\s\S]*?\n\);/)?.[0]
      ?.replace(/\s+/g, ' ')
    expect(section).toBeTruthy()
    // 五类内容一个都不能漏，否则对应的状态卡会永远不显示
    for (const condition of [
      'selectedPlan.value',
      'gateBlocked.value',
      'needLogin.value',
      'dogsLoading.value',
      'dogOptions.value.length === 0',
    ]) {
      expect(section).toContain(condition)
    }
  })

  it('② 第一步改成三个方向（减重 / 维持 / 增重），未选不能提交', () => {
    /**
     * 2026-10-05 第三批：老板把上一版的「需要 / 不需要」两个按钮
     * 改成三个方向按钮，方向从此由顾客自己选。
     */
    expect(template).toContain('想帮它减重、维持，还是增重？')
    expect(template).toContain('v-for="option in weightGoalOptions"')
    expect(template).toContain('@tap="chooseWeightGoal(option.value)"')
    expect(code).toContain("{ value: 'LOSS', label: '减重' }")
    expect(code).toContain("{ value: 'MAINTAIN', label: '维持' }")
    expect(code).toContain("{ value: 'GAIN', label: '增重' }")
    // 顺序：体况建议 → 三选一 → 计划入口（有计划时那个"查看计划"按钮不算，
    // 它属于"方向已由计划定"的另一条分支）
    expect(template.indexOf('advice-line')).toBeLessThan(template.indexOf('goal-ask'))
    expect(template.indexOf('goal-ask')).toBeLessThan(
      template.indexOf('@tap="openWeightGoalPlan()"'),
    )

    // 未选不能提交（灰按钮的原因要说清）
    expect(code).toContain('const weightGoalChoice = ref<WeightGoalChoice | null>(null)')
    expect(code).toContain('请先选择：减重、维持还是增重')
    // 上一版那两个按钮与"我还是想…"整段已删
    expect(code).not.toContain('answerWeightManagement')
    expect(code).not.toContain('我还是想减重')
    expect(code).not.toContain('还是想给它定个目标')
  })

  it('② 选「维持」不显示计划入口；选减重/增重 → 带着方向进计划页', () => {
    /**
     * 2026-10-05 老板改口径：维持时**不显示**这个按钮（原来是个点不了的灰按钮），
     * 也不写"选维持就不需要制定增减重计划了"那句解释。
     */
    expect(template).toContain('v-if="showPlanEntryButton"')
    expect(code).not.toContain('planEntryHintText')
    expect(code).not.toContain('选「维持」就不需要制定增减重计划了')
    expect(code).not.toContain('plan-entry-btn--disabled')

    const shown = code.match(/const showPlanEntryButton = computed\([\s\S]*?\n\}\);/)?.[0] || ''
    expect(shown).not.toBe('')
    expect(shown).toContain("weightGoalChoice.value === 'LOSS'")
    expect(shown).toContain("weightGoalChoice.value === 'GAIN'")
    // 有计划时入口照旧在（点进去是改目标）
    expect(shown).toContain('if (hasOpenPlan.value) return true;')

    const open = code.match(/function openWeightGoalPlan\(\)[\s\S]*?\n\}/)?.[0] || ''
    expect(open).toContain('if (!showPlanEntryButton.value) return;')
    expect(open).toContain('goToWeightGoalPlan(weightGoalChoice.value)')

    // 文案居中：没计划时它是 <view>，默认左对齐会把文案甩到最左边
    const style = code.match(/\.plan-entry-btn \{[\s\S]*?\n\}/)?.[0] || ''
    expect(style).toContain('text-align: center;')
  })

  it('② 体况与方向打架时挡住：偏胖不给选增重、偏瘦不给选减重', () => {
    /**
     * 老板没要求这一条，但必须挡：方向会原样交给营养师，
     * 给偏胖的狗出增重食谱、给偏瘦的狗出减重食谱都是反的。
     * 与计划页后端"只在系统本来没建议时才听顾客"同一套口径。
     */
    const blocked =
      code.match(/const blockedWeightGoalChoice = computed<WeightGoalChoice \| ''>\([\s\S]*?\n\}\);/)?.[0] ||
      ''
    expect(blocked).not.toBe('')
    expect(blocked).toContain("if (bcs >= BCS_LOSS_THRESHOLD) return 'GAIN';")
    expect(blocked).toContain("if (bcs <= BCS_GAIN_THRESHOLD) return 'LOSS';")

    // 点被挡掉的那一项要说明原因（不静默失败）
    const choose = code.match(/function chooseWeightGoal\(value: WeightGoalChoice\)[\s\S]*?\n\}/)?.[0] || ''
    expect(choose).toContain('uni.showToast')
    expect(choose).toContain('blockedWeightGoalReason.value')
    // 被挡的那一项在界面上就是"不可选"的样子
    expect(template).toContain("'goal-ask__option--off'")
  })

  it('② 答完方向立刻重算交给营养师的目标', () => {
    const choose = code.match(/function chooseWeightGoal\(value: WeightGoalChoice\)[\s\S]*?\n\}/)?.[0] || ''
    expect(choose).toContain('syncGoalWithPlan()')
    // 没计划时按顾客选的方向给，有计划时仍以计划为准
    const resolve = code.match(/function resolveTargetGoal\(\): string \{[\s\S]*?\n\}/)?.[0] || ''
    expect(resolve).toContain("return 'LOSE_WEIGHT';")
    expect(resolve).toContain("return 'GAIN_WEIGHT';")
    expect(resolve).toContain('return BCS_MAINTAIN_GOAL;')
    expect(resolve).toContain("return '';")
  })

  it('③ 「+ 添加」夹在快选标签与手动清单之间', () => {
    const quickStart = template.indexOf('allergen-quick-add')
    const addRow = template.indexOf('allergen-add-row')
    const customList = template.indexOf('customAllergens.length > 0')

    expect(quickStart).toBeGreaterThan(-1)
    expect(addRow).toBeGreaterThan(quickStart)
    expect(customList).toBeGreaterThan(addRow)
    // 顶部那行空标题栏（health-header）已经没有内容，整块删掉
    expect(template).not.toContain('health-header')
  })

  it('⑥ 「上传资料」改小，并与张数说明并排', () => {
    const header = template.slice(
      template.indexOf('attachment-header'),
      template.indexOf('attachment-list'),
    )
    // 张数说明与入口在同一个 flex 行里
    expect(header).toContain('attachment-hint')
    expect(header).toContain('attachment-add')
    expect(header).not.toContain('attachment-hint"></text>')
    // 小圆角按钮（不再是独占一行的金色文字）
    const style = code.match(/\.attachment-add \{[\s\S]*?\n\}/)?.[0] || ''
    expect(style).toContain('padding: 6rpx 18rpx')
    expect(style).toContain('border-radius: 999rpx')
    expect(style).toContain('font-size: 23rpx')
  })

  it('⑥ 过敏检测报告入口也一并改小（原来比「确认定制」还显眼）', () => {
    const scan = read('src/components/custom-recipe/AllergyScanBlock.vue')
    const style = scan.match(/\.allergy-scan__button \{[\s\S]*?\n\}/)?.[0] || ''
    expect(style).toContain('height: 60rpx')
    expect(style).toContain('border-radius: 999rpx')
    expect(style).not.toContain('height: 72rpx')
    // 不被 flex 拉满整行；同一行右侧跟"一键清除所有过敏原"
    expect(scan).toMatch(/\.allergy-scan__head \{[^}]*align-items: center/)
    expect(scan).toContain('一键清除所有过敏原')
  })
})

/**
 * 2026-10-05 第三批（老板第二次看体验版提的 4 条）。
 *
 * 这一批有一半是"流程上自相矛盾"的问题（按钮能点、点进去说不需要；
 * 报告传了两张只显示一份；最严重的过敏原反而没读出来），
 * 所以断言落在**规则与顺序**上，而不只是文案在不在。
 */
describe('定制页 · 2026-10-05 第三批（4 条）', () => {
  const page = read(`${PAGE_DIR}/index.vue`)
  const code = stripComments(page)
  const template = code.slice(0, code.indexOf('<script setup'))

  it('① 狗狗一选定就先给出体况评分与建议（不等顾客先答什么）', () => {
    /**
     * 2026-10-05 第三批第 2 条：狗狗一选定，体况评分与我们的建议就要摆出来。
     * 所以建议那行在 v-if="hasSelectedDog" 的板块里**不挂在任何问答分支下**，
     * 位置也在三选一之前。
     */
    const section = template.slice(
      template.indexOf('<text class="title-text">体重管理</text>'),
      template.indexOf('<text class="title-text">过敏信息</text>'),
    )
    expect(section).toContain('bcsAdviceText')
    expect(section.indexOf('advice-line')).toBeLessThan(section.indexOf('goal-ask'))
    // 那句话里必须有体况评分本身（老板要"把他的体况评分和我们的建议给出来"）
    const advice = code.match(/const bcsAdviceText = computed\([\s\S]*?\n\}\);/)?.[0] || ''
    expect(advice).toContain('体况评分')
    expect(advice).toContain('我们建议')
    // 建议那一行的显示条件只有"这句话有没有内容"——
    // 不挂"有没有计划""选没选方向"，狗狗一选定就能看到
    expect(section).toContain('<view v-if="bcsAdviceText" class="advice-line">')
  })

  it('① 没有选定狗狗时，四个板块与提交按钮都不展示', () => {
    const sections = [
      '<text class="title-text">体重管理</text>',
      '<text class="title-text">过敏信息</text>',
      '<text class="title-text">饮食偏好（可选）</text>',
      '<text class="title-text">备注（可选）</text>',
    ]
    for (const title of sections) {
      const index = template.indexOf(title)
      expect(index).toBeGreaterThan(-1)
      // 往前找最近的 section 容器，它的开标签必须带 v-if="hasSelectedDog"
      const openTag = template.lastIndexOf('class="section"', index)
      expect(openTag).toBeGreaterThan(-1)
      const tagStart = template.lastIndexOf('<view', openTag)
      expect(template.slice(tagStart, openTag)).toContain('v-if="hasSelectedDog"')
    }
    // 提交按钮同理：没有狗可提交，留着只会点出一句"请选择狗狗"
    const submitTag = template.lastIndexOf('<view', template.indexOf('class="submit-section"'))
    expect(template.slice(submitTag, template.indexOf('class="submit-section"'))).toContain(
      'v-if="hasSelectedDog"',
    )
    expect(code).toContain('const hasSelectedDog = computed(')
  })

  it('① 方向真的带到计划页，并由该页原样传给后端', () => {
    const go = code.match(/const goToWeightGoalPlan = \([\s\S]*?\n\};/)?.[0] || ''
    expect(go).toContain('direction=${direction}')
    const planPage = read('src/pages/weight-goal-plan/index.vue')
    expect(planPage).toContain('requestedDirection.value')
    expect(planPage).toContain("options?.direction")
  })

  it('② 第二步标题就是「过敏信息」（老板后来要求去掉「（可选）」）', () => {
    expect(template).toMatch(/title-text">过敏信息<\/text>/)
    expect(template).not.toContain('过敏信息（可选）')
  })

  it('③ 先问「小家伙是否对部分食物过敏？」，答没有就跳过整块录入', () => {
    expect(template).toContain('小家伙是否对部分食物过敏？')
    expect(template).toContain('@tap="answerFoodAllergy(true)"')
    expect(template).toContain('@tap="answerFoodAllergy(false)"')
    // 录入界面整块收在"有过敏"分支里（快选、手输、扫描、已上传报告）
    const editor = template.slice(
      template.indexOf('v-if="hasFoodAllergy === true"'),
      template.indexOf('v-else-if="hasFoodAllergy === false"'),
    )
    expect(editor).toContain('allergen-quick-add')
    expect(editor).toContain('addAllergen')
    expect(editor).toContain('<AllergyScanBlock')
    expect(editor).toContain('allergyReports')
    // 没作答不能提交（否则"跳过"这件事只做了一半）
    expect(code).toContain('const hasFoodAllergy = ref<boolean | null>(null)')
    expect(code).toContain('请先回答：小家伙是否对部分食物过敏')
  })

  it('③ 答"没有"不抹掉档案里的过敏；也不再多写一句说明', () => {
    // 2026-10-05 老板：答"没有"下面那句说明删掉，不再多话
    expect(code).not.toContain('noFoodAllergyNote')
    expect(template).not.toContain('不再新增过敏信息')
    // 档案里有过敏时默认答"有"（让家长再答一遍是多余的）
    expect(code).toContain('if (formData.value.allergies.length > 0) {')
    expect(code).toContain('hasFoodAllergy.value = true;')
    // 换狗要重新问（上一只狗的答案不能替新狗作答）
    expect(code).toContain('hasFoodAllergy.value = null;')
  })

  it('④ 已上传报告给"小预览窗口"，删除要弹窗确认', () => {
    expect(template).toContain('{{ allergyReports.length }} 份 / {{ allergyReportPageCount }} 张')
    // 预览窗口：报告原件的缩略图，点了看大图
    expect(template).toContain('allergy-reports__thumb')
    expect(template).toContain('@tap="previewAllergyReport(report)"')
    // 删除走弹窗确认，并写明"过敏信息不受影响"（后端语义就是保留过敏记录）
    const remove = code.match(/function removeAllergyReport\([\s\S]*?\n\}/)?.[0] || ''
    expect(remove).toContain('uni.showModal')
    expect(remove).toContain('已经记下的过敏信息不受影响')
    expect(remove).toContain('dogApi.allergyReports.remove')
    expect(template).toContain('allergyReportPageText(report)')

    const count = code.match(/const allergyReportPageCount = computed\([\s\S]*?\n\);/)?.[0] || ''
    expect(count).toContain('report.attachments')
    // 每份报告后面要能看到结论条数（家长用它核对识别全不全）
    const text = code.match(/function allergyReportPageText[\s\S]*?\n\}/)?.[0] || ''
    expect(text).toContain('resultCount')
  })
})

/**
 * 2026-10-05 第四批（老板第三次看体验版提的 3 条）。
 *
 * 这一批把第一步重做了：狗狗一选定先给体况与建议，然后由顾客**自己选**
 * 减重 / 维持 / 增重（取代上一版的"需要 / 不需要"）。
 */
describe('定制页 · 2026-10-05 第四批（3 条）', () => {
  const page = read(`${PAGE_DIR}/index.vue`)
  const code = stripComments(page)
  const template = code.slice(0, code.indexOf('<script setup'))

  it('① 没选狗狗时四个板块收起（不要额外的说明文案）', () => {
    // 四个板块 + 提交按钮都要 v-if="hasSelectedDog"
    expect(template.match(/v-if="hasSelectedDog"/g)?.length || 0).toBeGreaterThanOrEqual(5)
    // 2026-10-05 老板：不要那块"先选一下要给哪只狗狗定制"的说明 ——
    // Banner 上的选择器本身就是明确的引导
    expect(template).not.toContain('先选一下要给哪只狗狗定制')
    expect(code).not.toContain('pick-dog-hint')
  })

  it('② 体况评分与建议在狗狗一选定时就给出', () => {
    const section = template.slice(
      template.indexOf('<text class="title-text">体重管理</text>'),
      template.indexOf('<text class="title-text">过敏信息</text>'),
    )
    expect(section).toContain('<view v-if="bcsAdviceText" class="advice-line">')
    // 建议排在三个方向按钮之前
    expect(section.indexOf('advice-line')).toBeLessThan(section.indexOf('goal-ask'))
  })

  it('③ 三个方向取代"需要 / 不需要"，维持置灰、减重/增重进对应路径', () => {
    expect(template).not.toContain('需要给它做体重管理吗？')
    expect(template).toContain('想帮它减重、维持，还是增重？')
    expect(code).toContain("label: '减重'")
    expect(code).toContain("label: '维持'")
    expect(code).toContain("label: '增重'")
    // 上一版那行"还是想给它定个目标…"整段删掉（方向已经由顾客自己选）
    expect(code).not.toContain('还是想给它定个目标')
    expect(code).not.toContain('plan-manual')

    // 维持 → 不显示；减重/增重 → 显示并带方向进计划页
    const shown = code.match(/const showPlanEntryButton = computed\([\s\S]*?\n\}\);/)?.[0] || ''
    expect(shown).toContain("weightGoalChoice.value === 'LOSS'")
    expect(shown).toContain("weightGoalChoice.value === 'GAIN'")
    const open = code.match(/function openWeightGoalPlan\(\)[\s\S]*?\n\}/)?.[0] || ''
    expect(open).toContain('goToWeightGoalPlan(weightGoalChoice.value)')
  })
})

/**
 * 2026-10-05 第五批补丁：报告缩略图没出现（老板实测反馈）。
 *
 * 根因在服务端：识别侧新增了 STRONG_POSITIVE，而报告接口的 DTO 白名单没跟上，
 * 带强阳性的报告**保存时被 400 挡下** —— 报告没存成，缩略图自然一直没有。
 * 这里锁前端这一侧的两件事：失败要说话、有历史报告时不能把界面藏起来。
 */
describe('定制页 · 报告缩略图相关（第五批补丁）', () => {
  const page = read(`${PAGE_DIR}/index.vue`)
  const block = read('src/components/custom-recipe/AllergyScanBlock.vue')

  it('报告保存失败不再静默：要提示家长"原件没存下来"', () => {
    expect(block).not.toContain('// 报告存不下不影响这一单 —— 名字照样加进过敏信息\n    } catch {')
    expect(block).toContain('报告原件没存下来，过敏信息已记上')
  })

  it('有历史报告时默认答"有过敏"，别把预览一起藏起来', () => {
    expect(page).toContain('allergyReports.value.length > 0 && hasFoodAllergy.value === null')
    // 只在未作答时兜底，不覆盖家长自己选过的答案
    expect(page).toContain('hasFoodAllergy.value = true;')
  })
})
