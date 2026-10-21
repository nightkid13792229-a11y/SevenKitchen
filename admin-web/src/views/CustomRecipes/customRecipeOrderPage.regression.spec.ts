import { describe, expect, it } from 'vitest'
/**
 * ⚠️ 用 Vite 的 `?raw` 读源码，**不要用 `node:fs`**。
 *
 * 这个坑我第 14 轮踩过一次：用 node:fs 时 `npm test` 全绿、
 * 而 `npm run build` 直接失败（构建的 tsconfig 里没有 node 类型）。
 * 这一轮加守卫时**又踩了一次** —— 所以把这句话写在文件头上。
 */
import orderListSource from './OrderList.vue?raw'
// 用 Vite 的 `?raw` 读源码：admin-web 的 vitest 是 node 环境（没有 jsdom），
// Element Plus 页面挂不起来，所以接线用"读源码断言"锁住，
// 真正的算法（过敏比对、倒计时）放在 utils 里由单测真跑。
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'
import orderList from '@/views/CustomRecipes/OrderList.vue?raw'
import config from '@/views/CustomRecipes/Config.vue?raw'
import customRecipeApiSource from '@/api/customRecipe.ts?raw'

/** 剥注释后再断言「已移除」——注释里可能还引用旧 UI（本项目栽过多次） */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/**
 * 定制单后台改造的接线回归。
 *
 * 2026-10-21 起：手工创建与「开始制作」按钮已移除，健康/饲喂明细收口到
 * 设计器侧栏；这里锁住一键交付、退款时效、状态字典、角色与报错，
 * 以及新的订单抽屉行为（复制、脱敏、年龄、PAID→IN_PROGRESS）。
 */
describe('一键交付与重新交付（第 1、2 条）', () => {
  it('已付款/制作中/已交付都出现交付区，状态判断走白名单', () => {
    expect(orderDetail).toContain('<div class="recipe-creation-section" v-if="canDeliver">')
    expect(orderDetail).toContain('const canDeliver = computed(() => canDeliverCustomRecipe(order.value?.status));')
  })

  it('候选食谱走新接口，页面自己不发请求', () => {
    expect(orderDetail).toContain('customRecipeApi.listRecipeCandidates(props.orderId)')
    expect(orderDetail).toContain('<h3>{{ isRedelivery ? \'重新交付食谱\' : \'从已设计好的食谱交付\' }}</h3>')
  })

  it('候选列表展示名称 / 版本 / 更新时间 / 当前已挂', () => {
    expect(orderDetail).toContain('{{ candidate.name }}')
    expect(orderDetail).toContain('v{{ candidate.version }} · 更新于 {{ formatDateTime(candidate.updatedAt) }}')
    expect(orderDetail).toContain('v-if="candidate.linkedToThisOrder"')
    expect(orderDetail).toContain('当前已挂')
  })

  it('点交付调用 deliver-recipe，并在成功后刷新详情', () => {
    expect(orderDetail).toContain('await customRecipeApi.deliverRecipe(orderId, candidate.recipeId);')
    expect(orderDetail).toContain('await loadOrderDetail();')
    expect(orderDetail).toContain('await loadRecipeCandidates();')
    expect(orderDetail).toContain("emit('refresh');")
  })

  it('候选为空时给出可执行的空态，并保留「在设计器中设计」入口', () => {
    expect(orderDetail).toContain('description="这只狗还没有已发布的定制食谱，请先在设计器里设计并发布"')
    expect(orderDetail).toContain('@click="openInDesigner"')
    expect(orderDetail).toContain('在设计器中设计')
  })

  it('重新交付要二次确认，并写清"替换 + 再次通知"（口径 4）', () => {
    expect(orderDetail).toContain('将用所选食谱《${candidate.name}》替换订单 ${orderId} 当前交付的食谱，并再次给顾客发送通知。')
    expect(orderDetail).toContain("confirmButtonText: '确认重新交付'")
    expect(orderDetail).toContain("{{ isRedelivery ? '重新交付' : '交付到订单' }}")
  })

  it('重新交付默认不预选，换食谱必须是有意识的选择', () => {
    expect(orderDetail).toContain('selectedCandidateId.value = isRedelivery.value')
  })
})

describe('手工创建食谱已收口（2026-10-21）', () => {
  const cleanDetail = stripComments(orderDetail)

  it('手工创建 UI、校验与提交处理全部移除', () => {
    for (const token of [
      '手工创建定制食谱',
      'recipeFormRules',
      'submitRecipe',
      'resetRecipeForm',
      'handleCoverUpload',
      'createRecipe(order.value!.orderId',
      '提交食谱并交付',
    ]) {
      expect(cleanDetail).not.toContain(token)
    }
  })

  it('「开始制作」按钮与处理函数移除（打开设计器即开始制作）', () => {
    expect(cleanDetail).not.toContain('@click="startProcessing"')
    expect(cleanDetail).not.toContain('const startProcessing')
    expect(cleanDetail).not.toContain('已开始制作')
  })

  it('交付仍收敛到设计器里已发布的候选食谱，不退回手工表单', () => {
    expect(cleanDetail).toContain('customRecipeApi.listRecipeCandidates(props.orderId)')
    expect(cleanDetail).toContain('customRecipeApi.deliverRecipe')
    expect(cleanDetail).toContain('customRecipeApi.deliverBatch')
  })
})

describe('设计资料收口：订单抽屉不展开健康明细（2026-10-21）', () => {
  const cleanDetail = stripComments(orderDetail)

  it('★ 保留「下单后档案有更新」提醒，并放在设计资料区里', () => {
    const design = cleanDetail.indexOf('设计资料')
    const alert = cleanDetail.indexOf('下单后档案有更新，请按最新信息设计')
    const notes = cleanDetail.indexOf('订单备注')
    expect(design).toBeGreaterThan(-1)
    expect(alert).toBeGreaterThan(design)
    expect(notes).toBeGreaterThan(alert)
    expect(cleanDetail).toContain('profileUpdateDetail')
    expect(cleanDetail).toContain('v-if="allergyComparison.changed || medicalComparison.changed"')
  })

  it('★ 只留紧凑摘要与设计器 / 健康档案入口', () => {
    expect(cleanDetail).toContain('designSummary')
    expect(cleanDetail).toContain('有过敏记录')
    expect(cleanDetail).toContain('请在设计器查看')
    expect(cleanDetail).toContain('打开食谱设计器')
    expect(cleanDetail).toContain('查看健康档案')
    expect(cleanDetail).toContain('@click="openHealthProfile"')
  })

  it('★ 详细医疗 / 饲喂 / 饮食字段不再铺进订单抽屉', () => {
    for (const token of [
      '过敏（档案最新）',
      '过敏回答（下单时填写）',
      '过敏文本（下单时填写）',
      '本单上传的检测报告（随单草稿）',
      '档案同步',
      '过敏史（下单时填写）',
      '疾病史（档案最新）',
      '疾病史（下单时填写）',
      '现在主要喂什么',
      '最近肠胃情况',
      '喜欢的食材',
      '不吃的食材',
      'order.dog?.allergyRecords',
      'medicalComparison.profileConditions',
    ]) {
      expect(cleanDetail).not.toContain(token)
    }
  })

  it('过敏 / 疾病仍用两端比对，差异说清楚（提醒不能变成一句空话）', () => {
    expect(cleanDetail).toContain('compareDogProfileAllergies(order.value?.dog, order.value?.allergies)')
    expect(cleanDetail).toContain('compareDogProfileMedicalConditions(')
    expect(cleanDetail).toContain('档案里有、下单时没写')
    expect(cleanDetail).toContain('下单时写了、档案里没有')
  })
})

describe('订单抽屉的复制、脱敏与年龄（2026-10-21）', () => {
  const cleanDetail = stripComments(orderDetail)

  it('★ 订单号与手机旁有复制按钮，Clipboard API 失败时有兜底', () => {
    expect(cleanDetail).toContain('@click="copyOrderNo"')
    expect(cleanDetail).toContain('@click="copyPhone"')
    expect(cleanDetail).toContain('navigator.clipboard')
    expect(cleanDetail).toContain('fallbackCopyText')
    expect(cleanDetail).toContain("document.execCommand('copy')")
  })

  it('★ openid 脱敏展示，联系客户弹窗也不回显完整值', () => {
    expect(cleanDetail).toContain('maskOpenid')
    expect(cleanDetail).toContain('maskOpenid(order.customer?.wechatOpenid)')
    expect(cleanDetail).toContain('maskOpenid(wechat)')
    expect(cleanDetail).not.toContain('{{ order.customer?.wechatOpenid')
  })

  it('★ 未满一岁显示月份，满一岁显示年 + 月', () => {
    expect(cleanDetail).toContain('if (months < 12) return `${months}个月`')
    expect(cleanDetail).toContain('`${years}岁${restMonths}个月`')
  })
})

describe('未付款禁止进入设计器；PAID 单先转制作中（2026-10-21）', () => {
  const cleanDetail = stripComments(orderDetail)
  const start = cleanDetail.indexOf('const openInDesigner')
  const end = cleanDetail.indexOf('/** 设计资料明细', start)
  const block = cleanDetail.slice(start, end > start ? end : start + 3000)

  it('按钮在未付款 / 已取消时禁用，并说明原因', () => {
    expect(cleanDetail).toContain(':disabled="!canStartDesign || openingDesigner"')
    expect(cleanDetail).toContain(':loading="openingDesigner"')
    expect(cleanDetail).toContain("!['PENDING_PAYMENT', 'CANCELLED'].includes(status)")
    expect(cleanDetail).toContain('订单未付款，付款后才能开始设计')
  })

  it('★ PAID 单先 await 改 IN_PROGRESS，成功后才打开设计器', () => {
    expect(block).toContain("if (order.value?.status === 'PAID')")
    expect(block).toContain("await customRecipeApi.updateStatus(orderId, 'IN_PROGRESS')")
    expect(block.indexOf('await customRecipeApi.updateStatus')).toBeLessThan(
      block.indexOf('window.open(url'),
    )
  })

  it('★ 改状态失败就报错、不打开设计器，并解除 loading', () => {
    expect(block).toContain("toastApiError(error, '转入制作失败'")
    expect(block).toContain('openingDesigner.value = false')
    // catch 里不能继续 window.open
    const catchStart = block.indexOf('} catch (error) {')
    const catchBlock = block.slice(catchStart, block.indexOf('} finally', catchStart))
    expect(catchBlock).not.toContain('window.open')
  })

  it('★ 防重复点击：进行中直接 return，并禁用按钮', () => {
    expect(block).toContain('if (openingDesigner.value) return')
    expect(cleanDetail).toContain(':disabled="!canStartDesign || openingDesigner"')
  })
})

describe('退款与时效信息（第 5 条）', () => {
  it('退款状态 / 金额 / 到账时间都有，且未成功时提示核查', () => {
    expect(orderDetail).toContain('Boolean(order.value?.refundStatus)')
    expect(orderDetail).toContain('getCustomRecipeRefundStatusText(order.value?.refundStatus)')
    expect(orderDetail).toContain('Number(order.refundAmount)')
    expect(orderDetail).toContain('formatDateTime(order.refundedAt)')
    expect(orderDetail).toContain('退款尚未确认成功，请到微信商户平台核实后再答复顾客。')
  })

  it('支付流水号、取消原因与取消时间都展示', () => {
    expect(orderDetail).toContain('order.paymentTransactionId')
    expect(orderDetail).toContain('order.cancelledAt')
    expect(orderDetail).toContain('order.cancellationReason')
    expect(orderDetail).toContain('order.inProgressAt')
  })

  it('详情页的预计交付带倒计时/超期高亮', () => {
    expect(orderDetail).toContain('getEstimatedDeliveryInfo(order.value?.estimatedDeliveryDate, order.value?.status)')
    expect(orderDetail).toContain('v-if="deliveryInfo.overdue"')
  })

  it('列表页有「预计交付」列与超期标记', () => {
    expect(orderList).toContain('<el-table-column label="预计交付" width="160">')
    expect(orderList).toContain('getEstimatedDeliveryInfo(order.estimatedDeliveryDate, order.status)')
    expect(orderList).toContain(":class=\"{ 'overdue-text': getDeliveryInfo(row).overdue }\"")
  })
})

describe('状态文案只有一份字典（第 6 条）', () => {
  it('★ 详情页与列表页都从**选项字典**取状态文案', () => {
    /**
     * 2026-10-16（批次 3.3）把口径又推了一步：
     *
     * 原先两个页面共用的是 `constants/customRecipeOrder.ts` 里那份**本地**字典 ——
     * 它解决了"两个页面各写一份"，但**没解决后端加枚举时前端要跟上**。
     * 而这件事真的又发生了一次：后端加 `COMPLETED` 时这份本地字典没跟上，
     * 顾客在小程序点「确认收到」之后，**后台显示的是英文 `COMPLETED`**。
     *
     * 现在中文只存在于后端的选项字典里，两个页面都来取。
     * 这条守卫因此比原来更强：**不只是"只有一份"，而是"那一份在后端"**。
     */
    for (const source of [orderDetail, orderList]) {
      expect(source).toContain('useOptionSet')
      expect(source).toContain('CUSTOM_RECIPE_STATUS_SET')
    }
    expect(orderDetail).toContain('statusLabel(order.value?.status)')
    expect(orderList).toContain('statusLabel(row.status)')
  })

  it('★ 两个页面都不再自己维护状态 map（防"改一处漏一处"复发）', () => {
    expect(orderDetail).not.toContain("PENDING_PAYMENT: '待付款'")
    expect(orderList).not.toContain("PENDING_PAYMENT: '待付款'")
    // 不许再从本地常量表取状态文案（退款文案那部分仍可用本地常量）
    expect(orderDetail).not.toContain('getCustomRecipeStatusText')
    expect(orderList).not.toContain('getCustomRecipeStatusText')
  })

  it('★ 列表页的状态筛选选项也来自字典（加一档不用改前端）', () => {
    // 此前是写死的六行 el-option
    expect(orderList).not.toContain('<el-option label="待付款" value="PENDING_PAYMENT">')
    expect(orderList).toContain('v-for="item in statusItems"')
  })
})

describe('敏感按钮按角色显示（口径 2，第 7 条）', () => {
  it('交付 / 取消都由 isAdmin 控制，非管理员看到说明', () => {
    expect(orderDetail).toContain('const isAdmin = useIsAdmin();')
    expect(orderDetail).toContain("{{ ADMIN_ONLY_TIP }}：交付食谱（含重新交付）会给顾客发通知，只有管理员能做")
    /**
     * 2026-10-21（代客订单 Task 5）：取消按钮的条件从模板里的字面量
     * 收成 `canCancelOrder` —— 线下收款单必须排除（否则会误调微信退款），
     * 判定放在计算属性里，模板只绑定结果。
     */
    expect(orderDetail).toContain('v-if="canCancelOrder"')
    expect(orderDetail).toContain(
      'isAdmin.value &&',
    )
  })

  it('设置页入口对客服置灰并写明原因，而不是让人点了吃 403', () => {
    expect(orderList).toContain('const isAdmin = useIsAdmin();')
    expect(orderList).toContain(':content="`${ADMIN_ONLY_TIP}：食谱定制设置`"')
    expect(config).toContain('const isAdmin = useIsAdmin();')
    expect(config).toContain('只允许管理员修改，当前账号只能查看')
    expect(config).toContain(':disabled="!isAdmin"')
  })
})

describe('报错要具体（第 8 条）', () => {
  it('三个页面都取后端返回的原因，不再只有"操作失败"', () => {
    expect(orderDetail).toContain("toastApiError(error, '交付失败', (message) => ElMessage.error(message))")
    expect(orderDetail).toContain("toastApiError(error, '加载订单详情失败', (message) => ElMessage.error(message))")
    expect(orderList).toContain("toastApiError(error, '加载订单列表失败', (message) => ElMessage.error(message))")
    expect(config).toContain("getApiErrorMessage(error, '保存失败，请重试')")
    expect(config).toContain("toastApiError(error, '保存失败，请重试', (message) => ElMessage.error(message))")
    expect(orderDetail).not.toContain("ElMessage.error('操作失败')")
    expect(orderDetail).not.toContain("ElMessage.error('提交失败')")
  })

  it('用户点"取消"不算失败：取消提示交给 toastApiError 内部判断，不弹红色报错', () => {
    expect(orderDetail).not.toContain("if (error !== 'cancel')")
    expect(orderList).not.toContain("if (error !== 'cancel')")
  })
})

describe('接口调用统一收在 api 层（铁律 2）', () => {
  it('三个页面都不再自己拼 /admin/custom-recipe 路径', () => {
    expect(orderDetail).not.toContain("'/admin/custom-recipe'")
    expect(orderList).not.toContain("'/admin/custom-recipe'")
    expect(config).not.toContain("'/admin/custom-recipe'")
  })

  it('新接口都在 api/customRecipe.ts 里声明', () => {
    expect(customRecipeApiSource).toContain('const BASE = \'/admin/custom-recipe\'')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/recipe-candidates`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/deliver-recipe`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/create-recipe`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/confirm-payment`')
  })
})

/**
 * 后台订单列表按钮必须来自后端契约（2026-10-16 批次 5.6）
 *
 * ## 事故经过（同一类 bug 在三个地方各出现一次）
 *
 * · 顾客端列表：`status === 'DELIVERED'` 决定「查看定制食谱」
 *   → 订单变已完成，**顾客找不到自己的食谱**
 * · 后台详情：`status === 'DELIVERED'` 决定"已交付食谱"区块
 *   → 顾客确认收货后，**老板看不到交付的是哪份**
 * · 后台列表：同一个判断决定「查看食谱」按钮 → 同样消失
 *
 * 三次都是同一个成因：**判定散在前端，改一处漏一处**。
 * 所以这里钉死：后台列表也只做 code → 处理函数的映射。
 */
describe('后台订单列表按钮来自后端契约', () => {
  const raw = orderListSource;
  /** ⚠️ 先剥注释 —— 说明注释里引用了被删掉的旧判断（本项目栽过 6 次） */
  const source = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('★ 不再用写死的状态判断决定按钮', () => {
    const start = source.indexOf('操作');
    const end = source.indexOf('</el-table-column>', start);
    const block = source.slice(start, end > 0 ? end : start + 2000);
    expect(block).not.toContain("row.status === 'PENDING_PAYMENT'");
    expect(block).not.toContain("row.status === 'PAID'");
    expect(block).not.toContain("row.status === 'DELIVERED'");
  });

  it('★ 按钮从 renderable.actions 渲染', () => {
    expect(source).toContain('rowActions(row)');
    expect(source).toContain('action.code');
    expect(source).toContain('action.label');
    expect(source).toContain('action.enabled');
  });

  it('★ 前端只做 code → 处理函数的映射', () => {
    for (const code of ['CONFIRM_PAYMENT', 'ACCEPT_ORDER', 'DELIVER']) {
      expect(source).toContain(`case '${code}'`);
    }
  });
});
