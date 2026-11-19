import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_FINANCE_ACCOUNT,
  FINANCE_ACCOUNTS,
  FINANCE_ACCOUNT_STORAGE_KEY,
  getLastAccount,
  setLastAccount,
} from '../../utils/finance-account'

/**
 * 财务账户 + 类别字典的 UI 回归（2026-11-19 账户化 / 可编辑类别）。
 *
 * 盯四件事：
 * 1. 五个账户的口径与后端一致，且「记住上次用的」真的读写 `finance:lastAccount`；
 * 2. 类别选择器「输入即建」：新名字能建、已有名字不重复建、只列启用类别；
 * 3. 类别管理页存在（改名 / 合并到 / 停用，系统类别不给停用）；
 * 4. 用账户的地方都真的落了这个字段，别只做了一半 UI。
 */
const read = (path: string) => readFileSync(join(__dirname, path), 'utf8')

const accountUtil = read('../../utils/finance-account.ts')
const accountPicker = read('../../components/finance/AccountPicker.vue')
const categoryPicker = read('../../components/finance/CategoryPicker.vue')
const categoriesPage = read('./categories.vue')
const billsPage = read('./bills.vue')
const manualEntry = read('./manual-entry.vue')
const entriesPage = read('./entries.vue')
const confirmPage = read('../staff-assisted-order/confirm.vue')
const orderDetail = read('../staff-orders/detail.vue')
const api = read('../../api/staff-finance.ts')
const pagesJson = read('../../pages.json')

const originalUni = (globalThis as { uni?: unknown }).uni

/** 内存版 uni.storage，用来真正执行 getLastAccount / setLastAccount */
function installFakeUni() {
  const store = new Map<string, unknown>()
  ;(globalThis as any).uni = {
    getStorageSync: (key: string) => (store.has(key) ? store.get(key) : ''),
    setStorageSync: (key: string, value: unknown) => {
      store.set(key, value)
    },
  }
  return store
}

describe('财务账户', () => {
  it('五个账户与后端一致，缺省「我的微信」', () => {
    expect(FINANCE_ACCOUNTS.map((option) => option.code)).toEqual([
      'MERCHANT',
      'PERSONAL_WECHAT',
      'PERSONAL_ALIPAY',
      'PERSONAL_BANK',
      'CASH',
    ])
    expect(FINANCE_ACCOUNTS.map((option) => option.label)).toEqual([
      '微信商户号',
      '我的微信',
      '我的支付宝',
      '我的银行卡',
      '现金',
    ])
    expect(DEFAULT_FINANCE_ACCOUNT).toBe('PERSONAL_WECHAT')
  })

  it('记住上次用的账户：读写 finance:lastAccount，脏值回落默认', () => {
    const store = installFakeUni()
    // 什么都没存 → 默认账户
    expect(getLastAccount()).toBe('PERSONAL_WECHAT')

    setLastAccount('PERSONAL_ALIPAY')
    expect(store.get(FINANCE_ACCOUNT_STORAGE_KEY)).toBe('PERSONAL_ALIPAY')
    expect(FINANCE_ACCOUNT_STORAGE_KEY).toBe('finance:lastAccount')
    expect(getLastAccount()).toBe('PERSONAL_ALIPAY')

    // 固定费用模板要的缺省是银行卡
    expect(getLastAccount('PERSONAL_BANK')).toBe('PERSONAL_ALIPAY')

    // 手改 storage 成非法 code：不抛错，回落 fallback
    store.set(FINANCE_ACCOUNT_STORAGE_KEY, 'NOT_AN_ACCOUNT')
    expect(getLastAccount()).toBe('PERSONAL_WECHAT')
    expect(getLastAccount('PERSONAL_BANK')).toBe('PERSONAL_BANK')

    // 非法值不写库
    setLastAccount('NOT_AN_ACCOUNT')
    expect(store.get(FINANCE_ACCOUNT_STORAGE_KEY)).toBe('NOT_AN_ACCOUNT')

    // 没有 uni（单测/极端环境）也不炸
    delete (globalThis as { uni?: unknown }).uni
    expect(getLastAccount()).toBe('PERSONAL_WECHAT')
    expect(getLastAccount('PERSONAL_BANK')).toBe('PERSONAL_BANK')
    expect(() => setLastAccount('CASH')).not.toThrow()
  })

  it('账户选择器：五个 chips、选中深绿、默认记住上次', () => {
    expect(accountPicker).toContain('FINANCE_ACCOUNTS')
    expect(accountPicker).toContain('setLastAccount')
    expect(accountPicker).toContain('remember')
    // 选中态 = 深绿底米白字（员工端 UI 规范的分段筛选）
    expect(accountPicker).toContain('$staff-brand')
    expect(accountPicker).toContain('$staff-cream')
    expect(accountPicker).toContain('min-height: 88rpx')
    // 筛选场景「全部账户」+ 关掉记忆
    expect(accountPicker).toContain('全部账户')
    expect(accountPicker).toContain('props.remember')
  })

  it('五处用账户的地方都带上了选择器', () => {
    // 1. 记一笔（支出和收入都记账户）
    expect(manualEntry).toContain('AccountPicker')
    expect(manualEntry).toContain('从哪个账户出')
    expect(manualEntry).toContain('getLastAccount()')
    // 2. 固定费用模板表单 + 3. 标记已付弹层
    expect(billsPage).toContain('AccountPicker')
    expect(billsPage).toContain('payerAccount: formPayerAccount.value')
    expect(billsPage).toContain('payerAccount: payPayerAccount.value')
    // 4. 代客下单线下收款
    expect(confirmPage).toContain('AccountPicker')
    expect(confirmPage).toContain('收到哪个账户')
    expect(confirmPage).toContain('paymentAccount')
    // 5. 订单详情登记线下退款
    expect(orderDetail).toContain('AccountPicker')
    expect(orderDetail).toContain('退到哪个账户')
    expect(orderDetail).toContain('offlineRefundAccount')
  })

  it('代客收款与线下退款都把账户真的提交了', () => {
    // 代客下单：账户是 body 顶层 paymentAccount（已收款时才带）
    const confirmSubmit = confirmPage.match(/async function submit[\s\S]*?\n\}/)?.[0] || ''
    expect(confirmSubmit).toContain('paymentChannel')
    expect(confirmSubmit).toContain(
      'paymentAccount: collected.value ? paymentAccount.value : undefined',
    )
    // 线下退款：payerAccount 跟着退款金额一起提交
    const refundSubmit =
      orderDetail.match(/async function submitOfflineRefund[\s\S]*?\n\}/)?.[0] || ''
    expect(refundSubmit).toContain('registerOrderOfflineRefund')
    expect(refundSubmit).toContain('payerAccount: offlineRefundAccount.value')
    // 注释里不能再写「后端还没有字段」
    expect(confirmPage).not.toContain('本期只选不传')
    expect(orderDetail).not.toContain('本期只选不传')
  })

  it('API 类型补上 paymentAccount / payerAccount，字段名与后端一致', () => {
    const assistedApi = read('../../api/staffAssistedOrder.ts')
    expect(assistedApi).toContain('paymentAccount?: FinanceAccountCode')
    expect(assistedApi).toContain('FinanceAccountCode')

    const ordersApi = read('../../api/orders.ts')
    const refundPayload =
      ordersApi.match(
        /export interface RegisterOrderOfflineRefundPayload[\s\S]*?\n\}/,
      )?.[0] || ''
    expect(refundPayload).toContain('payerAccount?: FinanceAccountCode')
  })
})

describe('类别字典', () => {
  it('类别选择器：已选显示类别名，点开才出现输入与候选', () => {
    expect(categoryPicker).toContain('selectedName')
    expect(categoryPicker).toContain('选择')
    expect(categoryPicker).toContain('keyword')
    expect(categoryPicker).toContain('filteredOptions')
    expect(categoryPicker).toContain('输入类别名，没有就新建')
  })

  it('输入即建：新名字才出现「＋ 新建」，点了直接建并选中', () => {
    expect(categoryPicker).toContain('＋ 新建「{{ trimmedKeyword }}」')
    expect(categoryPicker).toContain('canCreate')
    expect(categoryPicker).toContain('createCategory')
    expect(categoryPicker).toContain("emit('update:modelValue', id)")
    // 重名判断忽略大小写与首尾空格，避免建出「设备 / 设备工具」
    expect(categoryPicker).toContain('toLowerCase()')
  })

  it('只列启用类别，系统类别带「系统」小标', () => {
    // listCategories() 默认只返回启用类别；管理页才传 includeInactive
    expect(categoryPicker).toContain('staffFinanceApi.listCategories()')
    expect(api).toContain('listCategories(includeInactive = false)')
    expect(api).toContain("includeInactive: 'true'")
    expect(categoryPicker).toContain('option.isSystem')
    expect(categoryPicker).toContain('>系统<')
  })

  it('选择器排除 selectable === false 的类别（「其它」），历史已选仍显示名字', () => {
    // 候选来自过滤后的 selectableOptions，而不是全量 options
    const filterBlock =
      categoryPicker.match(
        /const selectableOptions = computed\([\s\S]*?\n\}\)/,
      )?.[0] || ''
    expect(filterBlock).toContain('option.selectable !== false')
    const filteredBlock =
      categoryPicker.match(/const filteredOptions = computed\([\s\S]*?\n\}\)/)?.[0] ||
      ''
    expect(filteredBlock).toContain('selectableOptions.value')
    // 已选名字按 id 在全部类别里查：历史记录选过「其它」也要显示名字
    const selectedBlock =
      categoryPicker.match(/const selectedName = computed\([\s\S]*?\n\}\)/)?.[0] ||
      ''
    expect(selectedBlock).toContain('options.value.find')
    // API 类型补上 selectable，与后端 listCategories 返回项一致
    expect(api).toMatch(/selectable: boolean/)
  })

  it('API 补齐类别五个方法，路径与后端 categories 路由一致', () => {
    expect(api).toContain('listCategories')
    expect(api).toContain('createCategory')
    expect(api).toContain('renameCategory')
    expect(api).toContain('mergeCategory')
    expect(api).toContain('deactivateCategory')
    expect(api).toContain("url: '/admin/finance/categories'")
    expect(api).toContain('url: `/admin/finance/categories/${id}`')
    expect(api).toContain('url: `/admin/finance/categories/${id}/merge`')
    expect(api).toContain('url: `/admin/finance/categories/${id}/deactivate`')
    // 合并传 targetId（后端 DTO 字段名）
    expect(api).toContain('targetId')
  })

  it('类别管理页：改名 / 合并到 / 停用，系统类别不给停用', () => {
    expect(categoriesPage).toContain('费用类别')
    expect(categoriesPage).toContain('listCategories(true)')
    expect(categoriesPage).toContain('usageCount')
    expect(categoriesPage).toContain('改名')
    expect(categoriesPage).toContain('合并到')
    expect(categoriesPage).toContain('停用')
    expect(categoriesPage).toContain('renameCategory')
    expect(categoriesPage).toContain('mergeCategory')
    expect(categoriesPage).toContain('deactivateCategory')
    // 系统类别（isSystem）不显示停用按钮
    expect(categoriesPage).toContain(
      'v-if="!isSystemCategory(category) && category.isActive"',
    )
    // 改名用弹窗输入
    expect(categoriesPage).toContain('editable: true')
    expect(categoriesPage).toContain('placeholderText')
    // 系统/停用标记
    expect(categoriesPage).toContain('tag--system')
    expect(categoriesPage).toContain('tag--off')
    expect(categoriesPage).toContain('已停用')
  })

  it('系统类别和「其它」只允许改名：不出现「合并到」「停用」', () => {
    // 统一的判定：isSystem，或后端标记 selectable === false（「其它」）
    expect(categoriesPage).toContain('function isSystemCategory')
    expect(categoriesPage).toContain('category.selectable === false')
    expect(categoriesPage).toContain('v-if="isSystemCategory(category)"')

    // 「合并到」只对非系统类别出现
    const mergeCondition =
      categoriesPage.match(
        /v-if="([^"]+)"\s+class="action"\s+@tap="openMerge\(category\)"/,
      )?.[1] || ''
    expect(mergeCondition).toBe('!isSystemCategory(category)')

    // 「停用」同样排除系统类别
    const deactivateCondition =
      categoriesPage.match(
        /v-if="([^"]+)"\s+class="action action--quiet"\s+@tap="confirmDeactivate\(category\)"/,
      )?.[1] || ''
    expect(deactivateCondition).toBe(
      '!isSystemCategory(category) && category.isActive',
    )

    // 系统类别反过来也不能当合并目标（后端对源/目标都拒绝）
    const targetsBlock =
      categoriesPage.match(/const mergeTargets = computed\([\s\S]*?\n\)/)?.[0] || ''
    expect(targetsBlock).toContain('!isSystemCategory(option)')
  })

  it('pages.json 注册 categories，标题「费用类别」深绿', () => {
    expect(pagesJson).toContain('"root": "pages/staff-finance"')
    expect(pagesJson).toContain('"path": "categories"')
    expect(pagesJson).toContain('"navigationBarTitleText": "费用类别"')
    const style =
      pagesJson.match(
        /"path": "categories"[\s\S]*?"navigationBarBackgroundColor": "(#[0-9a-fA-F]{6})"/,
      )?.[1] || ''
    expect(style.toLowerCase()).toBe('#1e3a2f')
  })

  it('记一笔与固定费用都改成类别字典，不再写死枚举', () => {
    for (const page of [manualEntry, billsPage]) {
      expect(page).toContain('CategoryPicker')
      expect(page).toContain('categoryId')
    }
    // 明细页类别筛选也按类别 id（收入类别没有 id，不混进来）
    expect(entriesPage).toContain('item.categoryId')
    expect(manualEntry).not.toContain('EQUIPMENT')
    expect(billsPage).not.toContain('CATEGORY_OPTIONS')
  })
})

afterAll(() => {
  ;(globalThis as { uni?: unknown }).uni = originalUni
})
